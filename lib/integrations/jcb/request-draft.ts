import type { RequesterOfflineDraft } from "@/lib/requester-offline-submission";

// Draft storage resolves after initial URL prefill. Keep the explicit map selection
// when restoring that draft, while preserving the user's other unfinished fields.
export function restoreLiveLinkRequestDraft(draft: RequesterOfflineDraft, search: string): RequesterOfflineDraft {
  const query = new URLSearchParams(search);
  const reference = query.get("machineReference")?.trim();
  if ((!query.get("livelink") && !query.get("asset")) || !reference) return draft;
  return {
    ...draft,
    isRetailSale: false,
    locationDraft: draft.values.machineReference.trim() === reference ? draft.locationDraft : null,
    values: { ...draft.values, machineReference: reference },
  };
}
