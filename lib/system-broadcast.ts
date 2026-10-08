export const relayBroadcastKinds = ["update", "maintenance", "notice"] as const;
export const RELAY_SYSTEM_BROADCAST_CHANNEL = "relay-system-notifications";

export type RelayBroadcastKind = (typeof relayBroadcastKinds)[number];

export type RelayBroadcastDraft = {
  kind: RelayBroadcastKind;
  title: string;
  message: string;
};

const defaultBroadcastTitles: Record<RelayBroadcastKind, string> = {
  update: "AssetCare+ update",
  maintenance: "Planned maintenance",
  notice: "AssetCare+ notice",
};

export function normalizeRelayBroadcastDraft(draft: RelayBroadcastDraft) {
  const title = draft.title.trim() || defaultBroadcastTitles[draft.kind];
  const message = draft.message.trim();

  if (!relayBroadcastKinds.includes(draft.kind)) {
    throw new Error("Choose a valid announcement type.");
  }

  if (!message) {
    throw new Error("Enter a message to send across AssetCare+.");
  }

  if (title.length > 120) {
    throw new Error("The announcement title must be 120 characters or fewer.");
  }

  if (message.length > 500) {
    throw new Error("The announcement message must be 500 characters or fewer.");
  }

  return {
    kind: draft.kind,
    title,
    message,
  };
}

export function getRelayBroadcastPreset(kind: RelayBroadcastKind) {
  if (kind === "update") {
    return {
      title: "AssetCare+ update",
      message: "Offline requests are now available. AssetCare+ will save a request on this device and submit it when the connection returns.",
    };
  }

  if (kind === "maintenance") {
    return {
      title: "Planned maintenance",
      message: "AssetCare+ maintenance is planned. Please finish any active work and follow the timing shown in this message.",
    };
  }

  return {
    title: "AssetCare+ notice",
    message: "",
  };
}
