const CONTEXT_MESSAGE_TYPE = "RELAY_PART_LOOKUP_CONTEXT";
const RESULT_MESSAGE_TYPE = "RELAY_PART_LOOKUP_RESULT";
const RESULT_EVENT_NAME = "relay:external-lookup-result";
const ADMIN_NOTIFICATION_MESSAGE = "RELAY_ADMIN_NOTIFICATION";

window.addEventListener("message", (event) => {
  if (
    event.source === window
    && event.origin === window.location.origin
    && event.data?.source === "relay-app"
    && event.data?.type === ADMIN_NOTIFICATION_MESSAGE
  ) {
    const notification = event.data.payload;
    if (
      notification
      && typeof notification.id === "string"
      && typeof notification.title === "string"
    ) {
      void chrome.runtime.sendMessage({
        type: ADMIN_NOTIFICATION_MESSAGE,
        notification: {
          id: notification.id.slice(0, 120),
          type: String(notification.type || "").slice(0, 80),
          title: notification.title.slice(0, 120),
          body: String(notification.body || "").slice(0, 240),
          href: String(notification.href || "").slice(0, 500)
        }
      });
    }
    return;
  }

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
      suggestedPartNumbers: Array.isArray(payload.suggestedPartNumbers)
        ? payload.suggestedPartNumbers
          .map((value) => String(value || "").trim().slice(0, 120))
          .filter(Boolean)
          .slice(0, 5)
        : [],
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
      confidence: String(message.result.confidence || "").slice(0, 80),
      verificationType: message.result.verificationType === "takeuchi_exact_part_number"
        ? "takeuchi_exact_part_number"
        : "external_catalogue_match",
      searchedPartNumber: String(message.result.searchedPartNumber || "").slice(0, 120)
    }
  }));
});
