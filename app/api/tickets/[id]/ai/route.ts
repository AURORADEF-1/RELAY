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

  const apiKey = process.env.OPENAI_API_KEY;

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
