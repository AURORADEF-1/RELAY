import type { FeatureExtractionPipelineType } from "@huggingface/transformers";
import type { RelayAiContext } from "@/lib/relay-ai";

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
  | "actions"
  | "quote"
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
  { intent: "actions", examples: "What should I do next? Suggest actions to move this ticket forward." },
  { intent: "quote", examples: "Do I need to raise a quote? What should happen with the customer estimate?" },
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

function detectTicketIntentFromWords(question: string): TicketIntent {
  const normalized = normalizeForComparison(question);
  if (/quote|estimate|customer price/.test(normalized)) return "quote";
  if (/what should|next action|what do i do|recommend|suggest/.test(normalized)) return "actions";
  if (/collect|collection|pick up|pickup| bin /.test(` ${normalized} `)) return "collection";
  if (/ready|completed|finished/.test(normalized)) return "ready";
  if (/ordered|placed order/.test(normalized)) return "ordered";
  if (/delivery|arrive|lead time|due date|expected/.test(normalized)) return "delivery";
  if (/supplier|purchase order| po /.test(` ${normalized} `)) return "purchase";
  if (/machine|serial|job number/.test(normalized)) return "machine";
  if (/assigned|owner|handling|who/.test(normalized)) return "assignment";
  if (/history|summary|summarise|summarize|what happened/.test(normalized)) return "history";
  if (/latest|update|changed|recent/.test(normalized)) return "latest";
  if (/request|part|details|description/.test(normalized)) return "request";
  return "status";
}

function valueOrNotRecorded(value: string | null | undefined) {
  return value?.trim() || "not recorded";
}

function normalizeForComparison(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || "";
}

function buildRequestDescription(context: RelayAiContext) {
  const summary = context.requestSummary?.trim() || "";
  const details = context.requestDetails?.trim() || "";
  const normalizedSummary = normalizeForComparison(summary);
  const normalizedDetails = normalizeForComparison(details);

  if (!summary && !details) {
    return "No request description is recorded.";
  }

  if (!summary || normalizedDetails === normalizedSummary) {
    return details || summary;
  }

  if (!details || normalizedSummary.includes(normalizedDetails)) {
    return summary;
  }

  if (normalizedDetails.includes(normalizedSummary)) {
    return details;
  }

  return `${summary}. Additional detail: ${details}`;
}

function uniqueValues(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const trimmed = value?.trim();
    const normalized = normalizeForComparison(trimmed);
    if (!trimmed || !normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function buildMissingInformation(context: RelayAiContext) {
  const status = context.status || "UNKNOWN";
  const missing: string[] = [];

  if (!context.assignedTo?.trim()) missing.push("assigned operator");
  if (!context.jobNumber?.trim()) missing.push("job number");
  if (!context.machineReference?.trim() && !context.isRetailSale) missing.push("machine reference");
  if (["ESTIMATE", "QUOTE", "IN_PROGRESS"].includes(status) && !context.supplierName?.trim()) {
    missing.push("supplier");
  }
  if (["ORDERED", "READY", "COMPLETED"].includes(status)) {
    if (!context.purchaseOrderNumber?.trim()) missing.push("PO number");
    if (!context.supplierName?.trim()) missing.push("supplier");
  }
  if (status === "ORDERED" && !context.expectedDeliveryDate?.trim()) {
    missing.push("expected delivery date");
  }
  if (status === "READY" && !context.binLocation?.trim()) {
    missing.push("collection bin");
  }

  return missing;
}

function buildSuggestedActions(context: RelayAiContext) {
  const status = context.status || "UNKNOWN";
  const isAdmin = context.audience === "admin";
  const isRetail = Boolean(context.isRetailSale);

  if (!isAdmin) {
    switch (status) {
      case "PENDING":
      case "QUERY":
        return ["Check that the request, machine and job details are complete", "Reply to Stores if more information has been requested"];
      case "ESTIMATE":
      case "QUOTE":
        return ["Review the estimate or quote when Stores provides it", "Confirm approval or provide any requested clarification"];
      case "IN_PROGRESS":
        return ["Monitor the latest update", "Contact Stores only if the requirement or urgency changes"];
      case "ORDERED":
        return ["Check the expected delivery date", "Wait for the READY notification before collecting"];
      case "READY":
        return ["Generate the collection QR or code", `Collect from bin ${context.binLocation?.trim() || "shown by Stores"}`];
      case "COMPLETED":
        return ["No operational action is required unless the supplied part is incorrect or must be returned"];
      default:
        return ["Check the latest ticket update", "Contact Stores if clarification is required"];
    }
  }

  switch (status) {
    case "PENDING":
      return [
        "Validate the request against the machine and job details",
        "Assign an owner and decide whether it needs a query, estimate or immediate sourcing",
        ...(isRetail ? ["Obtain supplier cost and availability before preparing the customer quote"] : []),
      ];
    case "ESTIMATE":
      return [
        "Obtain supplier price, availability and lead time",
        isRetail
          ? `Prepare a customer quote for ${context.customerName?.trim() || "the customer"} using the confirmed cost and margin`
          : "Record the estimate and confirm authority to proceed",
        "Move the ticket to QUOTE when the priced proposal is ready",
      ];
    case "QUOTE":
      return [
        isRetail ? "Confirm the customer has received the quote" : "Confirm the requester has received the quote",
        "Record acceptance, rejection or requested changes in the ticket",
        "On approval, move to IN_PROGRESS and begin ordering",
      ];
    case "QUERY":
      return [
        "State exactly which information is missing",
        isRetail ? "Contact the customer and record their response" : "Contact the requester and record their response",
        "Return the ticket to the appropriate estimate, quote or sourcing stage",
      ];
    case "IN_PROGRESS":
      return [
        "Confirm the correct part, supplier, price and availability",
        ...(isRetail ? ["Confirm the customer quote is accepted before committing the order"] : []),
        "When ordered, record the PO, supplier and expected delivery date and move to ORDERED",
      ];
    case "ORDERED":
      return [
        "Monitor the expected delivery date and chase the supplier if overdue",
        "Record material delivery or lead-time changes as ticket updates",
        "On arrival, allocate a bin and move the ticket to READY",
      ];
    case "READY":
      return [
        "Confirm the part is in the recorded collection bin",
        isRetail ? "Notify the customer that collection is ready" : "Notify the requester that collection is ready",
        "Verify collection using the QR or verbal code before completing the ticket",
      ];
    case "COMPLETED":
      return ["No further action is required unless a return, correction or audit note is needed"];
    default:
      return ["Review the ticket data", "Assign an owner and record the next operational update"];
  }
}

function formatActionList(actions: string[]) {
  return actions.map((action, index) => `${index + 1}. ${action}`).join(" ");
}

function addOperationalGuidance(answer: string, context: RelayAiContext) {
  const missing = buildMissingInformation(context);
  const missingText = missing.length > 0
    ? ` Missing information: ${missing.join(", ")}.`
    : " Required workflow information appears to be present for this stage.";
  return `${answer}${missingText} Suggested next actions: ${formatActionList(buildSuggestedActions(context))}`;
}

function answerForIntent(intent: TicketIntent, context: RelayAiContext) {
  const status = context.status || "UNKNOWN";
  const latest = valueOrNotRecorded(context.latestUpdate);
  const assigned = context.assignedTo?.trim() || "the Stores queue";
  const request = buildRequestDescription(context);
  let answer: string;

  switch (intent) {
    case "status":
      answer = `Ticket ${context.ticketId} is currently ${status} and assigned to ${assigned}. Request: ${request}. Latest update: ${latest}.`;
      break;
    case "ready":
      if (status === "READY" || status === "COMPLETED") {
        answer = `This ticket is ${status}. Collection bin: ${valueOrNotRecorded(context.binLocation)}. Ready date: ${valueOrNotRecorded(context.readyAt)}.`;
        break;
      }
      answer = `This ticket is not marked READY. Its current status is ${status}. Latest update: ${latest}.`;
      break;
    case "ordered":
      if (["ORDERED", "READY", "COMPLETED"].includes(status)) {
        answer = `The request has reached ${status}. Ordered date: ${valueOrNotRecorded(context.orderedAt)}. PO: ${valueOrNotRecorded(context.purchaseOrderNumber)}. Supplier: ${valueOrNotRecorded(context.supplierName)}. Expected delivery: ${valueOrNotRecorded(context.expectedDeliveryDate)}.`;
        break;
      }
      answer = `The ticket is ${status}, so the recorded data does not confirm that it has been ordered. Request: ${request}.`;
      break;
    case "assignment":
      answer = `This ticket is assigned to ${assigned}. Current status: ${status}. Latest update: ${latest}.`;
      break;
    case "delivery":
      answer = `Expected delivery: ${valueOrNotRecorded(context.expectedDeliveryDate)}. Supplier: ${valueOrNotRecorded(context.supplierName)}. Current status: ${status}. Latest update: ${latest}.`;
      break;
    case "collection":
      if (status !== "READY" && status !== "COMPLETED") {
        answer = `This ticket is ${status} and is not yet marked ready for collection. Latest update: ${latest}.`;
        break;
      }
      answer = `Collection bin: ${valueOrNotRecorded(context.binLocation)}. The ticket is ${status}. Ready date: ${valueOrNotRecorded(context.readyAt)}.`;
      break;
    case "purchase":
      answer = `PO number: ${valueOrNotRecorded(context.purchaseOrderNumber)}. Supplier: ${valueOrNotRecorded(context.supplierName)}. Order value: ${context.orderAmount == null ? "not recorded" : `£${context.orderAmount.toFixed(2)}`}. Expected delivery: ${valueOrNotRecorded(context.expectedDeliveryDate)}.`;
      break;
    case "machine":
      answer = `Machine reference: ${valueOrNotRecorded(context.machineReference)}. Job number: ${valueOrNotRecorded(context.jobNumber)}. Request: ${request}.`;
      break;
    case "request":
      answer = `Request: ${request}. Current status: ${status}. Assigned to: ${assigned}.`;
      break;
    case "actions":
      answer = `Operational assessment: ticket ${context.ticketId} is ${status}, assigned to ${assigned}. Request: ${request}. Latest update: ${latest}.`;
      break;
    case "quote":
      answer = context.isRetailSale
        ? `This is a retail/customer request for ${context.customerName?.trim() || "the recorded customer"}. Its current stage is ${status}. A customer quote should be based on confirmed supplier cost, availability, lead time and the required margin; the ticket does not calculate or invent those figures.`
        : `This ticket is ${status}. If a quote is required, first confirm supplier cost, availability and lead time, then record the priced proposal and approval before ordering.`;
      break;
    case "history": {
      const history = uniqueValues(context.history
        .slice(0, 5)
        .map((entry) => [entry.status, entry.comment].filter(Boolean).join(": ")))
        .join(" | ");
      answer = history
        ? `Request: ${request}. Ticket history: ${history}. Current status: ${status}. Latest update: ${latest}.`
        : `Request: ${request}. No detailed history is recorded. Current status: ${status}. Latest update: ${latest}.`;
      break;
    }
    case "latest":
      answer = `Latest update: ${latest}. Current status: ${status}. Assigned to: ${assigned}.`;
      break;
  }

  return addOperationalGuidance(answer, context);
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

  return answerForIntent(detectTicketIntentFromWords(question), context);
}
