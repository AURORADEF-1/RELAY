export type RelayAiContext = {
  ticketId: string;
  status: string;
  assignedTo?: string | null;
  latestUpdate?: string | null;
  requesterName?: string | null;
  department?: string | null;
  machineReference?: string | null;
  jobNumber?: string | null;
  requestSummary?: string | null;
  requestDetails?: string | null;
  history: Array<{
    status?: string | null;
    comment?: string | null;
    createdAt?: string | null;
  }>;
  recentMessages: Array<{
    senderRole: string;
    messageText?: string | null;
    createdAt?: string | null;
  }>;
};

export function buildRelayAiInstructions() {
  return [
    "You are RELAY Assistant for MLP, an internal parts request workflow app.",
    "Answer using only the selected ticket context provided in the user message.",
    "Do not invent status, ordering, readiness, assignment, dates, or stock details.",
    "If the answer is not supported by the provided ticket data, say so clearly.",
    "Keep answers concise and operational.",
    "When helpful, include the current status, latest update, and assigned operator.",
    "If the user asks for history, summarise the request history from the provided context only.",
    'End with a short escalation offer such as "Would you like me to notify an operator?" or "Would you like to chat with Stores?"',
  ].join(" ");
}

export function buildRelayAiInput(
  question: string,
  context: RelayAiContext,
) {
  return [
    "Selected ticket context:",
    JSON.stringify(
      {
        ticketId: context.ticketId,
        status: context.status,
        assignedTo: context.assignedTo ?? null,
        latestUpdate: context.latestUpdate ?? null,
        requesterName: context.requesterName ?? null,
        department: context.department ?? null,
        machineReference: context.machineReference ?? null,
        jobNumber: context.jobNumber ?? null,
        requestSummary: context.requestSummary ?? null,
        requestDetails: context.requestDetails ?? null,
        history: context.history,
        recentMessages: context.recentMessages,
      },
      null,
      2,
    ),
    "",
    `User question: ${question.trim()}`,
  ].join("\n");
}

export function buildRelayAiPlaceholderResponse(
  question: string,
  context: RelayAiContext,
) {
  const normalized = question.trim().toLowerCase();
  const currentStatus = context.status || "UNKNOWN";
  const latestUpdate = context.latestUpdate?.trim() || "No update is recorded yet.";
  const assignedTo = context.assignedTo?.trim() || "Stores queue";
  const historySummary = context.history
    .slice(0, 4)
    .map((entry) => {
      const parts = [entry.status, entry.comment].filter(Boolean);
      return parts.join(": ");
    })
    .filter(Boolean)
    .join(" | ");

  let answer: string;

  if (
    normalized.includes("status") ||
    normalized.includes("where is") ||
    normalized.includes("current")
  ) {
    answer = `The current status for ticket ${context.ticketId} is ${currentStatus}. Latest update: ${latestUpdate}. Assigned to: ${assignedTo}.`;
  } else if (normalized.includes("ordered")) {
    if (["ORDERED", "READY", "COMPLETED"].includes(currentStatus)) {
      answer = `Based on the ticket data, this request has reached ${currentStatus}. Latest update: ${latestUpdate}.`;
    } else {
      answer = `I cannot confirm that this part has been ordered. The current status is ${currentStatus}, and the latest update says: ${latestUpdate}.`;
    }
  } else if (normalized.includes("ready")) {
    if (["READY", "COMPLETED"].includes(currentStatus)) {
      answer = `This request is at ${currentStatus}, so it appears ready or already completed. Latest update: ${latestUpdate}.`;
    } else {
      answer = `This request is not marked READY. The current status is ${currentStatus}. Latest update: ${latestUpdate}.`;
    }
  } else if (
    normalized.includes("history") ||
    normalized.includes("summar") ||
    normalized.includes("what happened")
  ) {
    answer = historySummary
      ? `Request summary: ${context.requestSummary || context.requestDetails || "No request description available."} History: ${historySummary}. Current status: ${currentStatus}.`
      : `I can only see limited history for this ticket. Current status: ${currentStatus}. Latest update: ${latestUpdate}.`;
  } else if (normalized.includes("assigned") || normalized.includes("who")) {
    answer = `This ticket is currently assigned to ${assignedTo}. The current status is ${currentStatus}.`;
  } else {
    answer = `I can only answer from this ticket's RELAY data. Right now I can confirm the current status is ${currentStatus}, assigned to ${assignedTo}, and the latest update is: ${latestUpdate}.`;
  }

  return `${answer} Would you like me to notify an operator or continue the chat with Stores?`;
}

export function extractRelayAiResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: unknown;
      content?: Array<{
        type?: unknown;
        text?: unknown;
      }>;
    }>;
  };

  if (typeof candidate.output_text === "string" && candidate.output_text.trim()) {
    return candidate.output_text.trim();
  }

  const outputText = candidate.output
    ?.flatMap((item) => item.content ?? [])
    .filter(
      (item): item is { type: "output_text"; text: string } =>
        item.type === "output_text" && typeof item.text === "string",
    )
    .map((item) => item.text.trim())
    .filter((item) => item.length > 0)
    .join("\n")
    .trim();

  return outputText || null;
}
