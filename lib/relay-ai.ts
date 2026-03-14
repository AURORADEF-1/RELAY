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
