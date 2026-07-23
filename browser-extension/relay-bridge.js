const CONTEXT_MESSAGE_TYPE = "RELAY_PART_LOOKUP_CONTEXT";
const RESULT_MESSAGE_TYPE = "RELAY_PART_LOOKUP_RESULT";
const RESULT_EVENT_NAME = "relay:external-lookup-result";

window.addEventListener("message", (event) => {
  if (
    event.source !== window
    || event.origin !== window.location.origin
    || event.data?.source !== "relay-app"
    || event.data?.type !== CONTEXT_MESSAGE_TYPE
  ) {
    return;
  }

  const payload = event.data.payload;
  if (
    !payload
    || typeof payload.machineReference !== "string"
    || typeof payload.requestDescription !== "string"
  ) {
    return;
  }

  chrome.storage.local.set({
    relayLookupContext: {
      machineReference: payload.machineReference.slice(0, 120),
      make: String(payload.make || "").slice(0, 120),
      model: String(payload.model || "").slice(0, 240),
      serialNumber: String(payload.serialNumber || "").slice(0, 120),
      requestDescription: payload.requestDescription.slice(0, 500),
      capturedAt: new Date().toISOString()
    }
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== RESULT_MESSAGE_TYPE || !message.result) return;

  window.dispatchEvent(new CustomEvent(RESULT_EVENT_NAME, {
    detail: {
      pageTitle: String(message.result.pageTitle || "").slice(0, 160),
      pageUrl: String(message.result.pageUrl || "").slice(0, 2000),
      candidateText: String(message.result.candidateText || "").slice(0, 1500),
      partNumber: String(message.result.partNumber || "").slice(0, 120),
      confidence: String(message.result.confidence || "").slice(0, 80)
    }
  }));
});
