import { NextRequest, NextResponse } from "next/server";
import {
  buildRelayAiPlaceholderResponse,
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

  // TODO: Replace this deterministic placeholder with a production OpenAI call.
  // The future implementation must:
  // 1. Use a server-side API key only.
  // 2. Pass only the selected ticket context below.
  // 3. Refuse to answer beyond the available RELAY ticket data.
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
