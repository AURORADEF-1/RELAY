import { NextRequest, NextResponse } from "next/server";
import {
  buildRelayAiInput,
  buildRelayAiInstructions,
  buildRelayAiPlaceholderResponse,
  extractRelayAiResponseText,
  type RelayAiContext,
} from "@/lib/relay-ai";
import {
  getRelaySessionUserFromRequest,
  requestCanAccessTicket,
} from "@/lib/security";

type OdinChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function extractOdinResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as OdinChatCompletionPayload;
  const content = candidate.choices?.[0]?.message?.content;

  return typeof content === "string" && content.trim() ? content.trim() : null;
}

async function askOdin(
  question: string,
  ticketContext: RelayAiContext,
  signal: AbortSignal,
) {
  const baseUrl = process.env.RELAY_ODIN_BASE_URL || "http://192.168.1.181:5050";
  const model = process.env.RELAY_ODIN_MODEL || "llama3.2:1b";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RELAY_ODIN_API_KEY || "iodin-local"}`,
    },
    signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildRelayAiInstructions() },
        { role: "user", content: buildRelayAiInput(question, ticketContext) },
      ],
    }),
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error("ODIN local AI request failed.");
  }

  return extractOdinResponseText(payload);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    question?: string;
    ticketContext?: RelayAiContext;
  };

  if (!body.question?.trim()) {
    return NextResponse.json(
      { error: "A ticket-grounded AI question is required." },
      { status: 400 },
    );
  }

  if (!body.ticketContext || body.ticketContext.ticketId !== id) {
    return NextResponse.json(
      { error: "AI context must match the selected ticket." },
      { status: 400 },
    );
  }

  const sessionUser = await getRelaySessionUserFromRequest(request);

  if (!sessionUser) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const canAccessTicket = await requestCanAccessTicket(request, id);

  if (!canAccessTicket) {
    return NextResponse.json({ error: "You do not have access to this ticket." }, { status: 403 });
  }

  const aiProvider = process.env.RELAY_AI_PROVIDER || "openai";
  const apiKey = process.env.OPENAI_API_KEY;

  if (aiProvider === "odin") {
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 90_000);

      const message = await askOdin(
        body.question,
        body.ticketContext,
        abortController.signal,
      ).finally(() => {
        clearTimeout(timeoutId);
      });

      return NextResponse.json({
        message:
          message ||
          buildRelayAiPlaceholderResponse(body.question, body.ticketContext),
        ticketId: id,
        grounded: true,
        source: message ? "odin-local" : "odin-local-placeholder",
      });
    } catch (error) {
      console.error("RELAY ODIN route failed", {
        ticketId: id,
        userId: sessionUser.id,
        message: error instanceof Error ? error.message : "Unknown ODIN route failure",
      });

      return NextResponse.json({
        message: buildRelayAiPlaceholderResponse(
          body.question,
          body.ticketContext,
        ),
        ticketId: id,
        grounded: true,
        source: "odin-unavailable-placeholder",
      });
    }
  }

  // Safeguard: never attempt a paid OpenAI request when the API key is missing.
  if (!apiKey) {
    const message = buildRelayAiPlaceholderResponse(
      body.question,
      body.ticketContext,
    );

    return NextResponse.json({
      message,
      ticketId: id,
      grounded: true,
      source: "relay-ticket-context-placeholder",
    });
  }

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 15_000);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        store: false,
        instructions: buildRelayAiInstructions(),
        input: buildRelayAiInput(body.question, body.ticketContext),
      }),
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      return NextResponse.json(
        { error: "The AI service is unavailable right now." },
        { status: 502 },
      );
    }

    const message =
      extractRelayAiResponseText(payload) ||
      buildRelayAiPlaceholderResponse(body.question, body.ticketContext);

    return NextResponse.json({
      message,
      ticketId: id,
      grounded: true,
      source: "openai-responses",
    });
  } catch (error) {
    console.error("RELAY AI route failed", {
      ticketId: id,
      userId: sessionUser.id,
      message: error instanceof Error ? error.message : "Unknown AI route failure",
    });
    return NextResponse.json(
      { error: "Failed to contact the AI service." },
      { status: 502 },
    );
  }
}
