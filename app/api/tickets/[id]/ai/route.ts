import { NextRequest, NextResponse } from "next/server";
import {
  buildRelayAiInput,
  buildRelayAiInstructions,
  buildRelayAiPlaceholderResponse,
  extractRelayAiResponseText,
  type RelayAiContext,
} from "@/lib/relay-ai";

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

  const apiKey = process.env.OPENAI_API_KEY;

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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        store: false,
        instructions: buildRelayAiInstructions(),
        input: buildRelayAiInput(body.question, body.ticketContext),
      }),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "object" &&
        payload.error !== null &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : "OpenAI request failed.";

      return NextResponse.json({ error: message }, { status: 502 });
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
    console.error("RELAY AI route failed", error);
    return NextResponse.json(
      { error: "Failed to contact the AI service." },
      { status: 502 },
    );
  }

}
