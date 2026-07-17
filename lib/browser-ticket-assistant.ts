import type { FeatureExtractionPipelineType } from "@huggingface/transformers";
import {
  buildRelayAiPlaceholderResponse,
  type RelayAiContext,
} from "@/lib/relay-ai";

type TicketIntent =
  | "status"
  | "ready"
  | "ordered"
  | "assignment"
  | "delivery"
  | "collection"
  | "purchase"
  | "machine"
  | "request"
  | "history"
  | "latest";

const INTENTS: Array<{ intent: TicketIntent; examples: string }> = [
  { intent: "status", examples: "What is the current status? Where is my request in the process?" },
  { intent: "ready", examples: "Is the part ready? Can I collect it now? Has the job been completed?" },
  { intent: "ordered", examples: "Has the part been ordered? When was the order placed?" },
  { intent: "assignment", examples: "Who is handling this ticket? Which operator is it assigned to?" },
  { intent: "delivery", examples: "When will it arrive? What is the expected delivery date or lead time?" },
  { intent: "collection", examples: "Where do I collect it? Which bin is it in? What is the collection location?" },
  { intent: "purchase", examples: "What is the purchase order number? Who is the supplier?" },
  { intent: "machine", examples: "Which machine and job is this request for? What is the machine reference?" },
  { intent: "request", examples: "What part did I request? Show the request description and details." },
  { intent: "history", examples: "What happened on this ticket? Summarise the ticket history and progress." },
  { intent: "latest", examples: "What is the latest update or message? Has anything changed recently?" },
];

let extractorPromise: Promise<FeatureExtractionPipelineType> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers")
      .then(({ pipeline }) =>
        pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          dtype: "q8",
        }),
      )
      .catch((error) => {
        extractorPromise = null;
        throw error;
      });
  }

  return extractorPromise;
}

function dotProduct(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

async function detectTicketIntent(question: string) {
  const extractor = await getExtractor();
  const embeddings = await extractor(
    [question, ...INTENTS.map((item) => item.examples)],
    { pooling: "mean", normalize: true },
  );
  const vectors = embeddings.tolist() as number[][];
  const questionVector = vectors[0];

  if (!questionVector) {
    return null;
  }

  return INTENTS.reduce<{ intent: TicketIntent; score: number } | null>(
    (best, item, index) => {
      const intentVector = vectors[index + 1];
      const score = intentVector ? dotProduct(questionVector, intentVector) : 0;
      return !best || score > best.score ? { intent: item.intent, score } : best;
    },
    null,
  );
}

function valueOrNotRecorded(value: string | null | undefined) {
  return value?.trim() || "not recorded";
}

function answerForIntent(intent: TicketIntent, context: RelayAiContext) {
  const status = context.status || "UNKNOWN";
  const latest = valueOrNotRecorded(context.latestUpdate);
  const assigned = context.assignedTo?.trim() || "the Stores queue";

  switch (intent) {
    case "status":
      return `Ticket ${context.ticketId} is currently ${status}. It is assigned to ${assigned}. Latest update: ${latest}.`;
    case "ready":
      if (status === "READY" || status === "COMPLETED") {
        return `This ticket is ${status}. Collection bin: ${valueOrNotRecorded(context.binLocation)}.`;
      }
      return `This ticket is not marked READY. Its current status is ${status}. Latest update: ${latest}.`;
    case "ordered":
      if (["ORDERED", "READY", "COMPLETED"].includes(status)) {
        return `The request has reached ${status}. Ordered date: ${valueOrNotRecorded(context.orderedAt)}. PO: ${valueOrNotRecorded(context.purchaseOrderNumber)}. Supplier: ${valueOrNotRecorded(context.supplierName)}.`;
      }
      return `The ticket is ${status}, so the recorded data does not confirm that it has been ordered.`;
    case "assignment":
      return `This ticket is assigned to ${assigned}.`;
    case "delivery":
      return `Expected delivery: ${valueOrNotRecorded(context.expectedDeliveryDate)}. Current status: ${status}.`;
    case "collection":
      if (status !== "READY" && status !== "COMPLETED") {
        return `This ticket is ${status} and is not yet marked ready for collection.`;
      }
      return `Collection bin: ${valueOrNotRecorded(context.binLocation)}. The ticket is ${status}.`;
    case "purchase":
      return `PO number: ${valueOrNotRecorded(context.purchaseOrderNumber)}. Supplier: ${valueOrNotRecorded(context.supplierName)}.`;
    case "machine":
      return `Machine reference: ${valueOrNotRecorded(context.machineReference)}. Job number: ${valueOrNotRecorded(context.jobNumber)}.`;
    case "request":
      return `Request: ${valueOrNotRecorded(context.requestSummary)}. Details: ${valueOrNotRecorded(context.requestDetails)}.`;
    case "history": {
      const history = context.history
        .slice(0, 5)
        .map((entry) => [entry.status, entry.comment].filter(Boolean).join(": "))
        .filter(Boolean)
        .join(" | ");
      return history
        ? `Ticket history: ${history}. Current status: ${status}.`
        : `No detailed history is recorded. Current status: ${status}. Latest update: ${latest}.`;
    }
    case "latest":
      return `Latest update: ${latest}. Current status: ${status}.`;
  }
}

export async function answerTicketQuestionInBrowser(
  question: string,
  context: RelayAiContext,
) {
  try {
    const match = await detectTicketIntent(question.trim());
    if (match && match.score >= 0.25) {
      return answerForIntent(match.intent, context);
    }
  } catch (error) {
    console.warn("RELAY browser assistant model unavailable; using local rules", error);
  }

  return buildRelayAiPlaceholderResponse(question, context);
}
