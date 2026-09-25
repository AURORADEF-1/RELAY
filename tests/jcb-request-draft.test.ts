import { describe, expect, it } from "vitest";
import type { RequesterOfflineDraft } from "@/lib/requester-offline-submission";
import { restoreLiveLinkRequestDraft } from "@/lib/integrations/jcb/request-draft";
const draft: RequesterOfflineDraft = {
  values: { requesterName: "Fitter", department: "Yard", machineReference: "6", jobNumber: "DRAFT-JOB", requestDetails: "Unsaved parts notes", retailSalesReference: "", customerName: "", customerEmail: "", customerPhone: "", retailDeliveryMethod: "", retailDeliveryAddress: "" },
  isRetailSale: true, locationDraft: { lat: 52, lng: 1, summary: "Old machine location", confirmed: true }, savedAt: "2026-09-24T09:00:00Z",
};
describe("LiveLink prefill when an offline draft finishes loading", () => {
  it("keeps the map machine instead of restoring the old machine or retail mode", () => {
    const restored = restoreLiveLinkRequestDraft(draft, "?machineReference=26312&livelink=JCB-PIN");
    expect(restored.values.machineReference).toBe("26312"); expect(restored.isRetailSale).toBe(false);
    expect(restored.values.jobNumber).toBe("DRAFT-JOB"); expect(restored.values.requestDetails).toBe("Unsaved parts notes");
    expect(restored.locationDraft).toBeNull(); expect(draft.values.machineReference).toBe("6");
  });
  it("keeps an explicitly selected asset when restoring an unrelated saved draft", () => {
    const restored = restoreLiveLinkRequestDraft(draft, "?machineReference=26072&asset=asset-id");
    expect(restored.values.machineReference).toBe("26072");
    expect(restored.values.requestDetails).toBe(draft.values.requestDetails);
    expect(restored.values.jobNumber).toBe(draft.values.jobNumber);
    expect(restored.locationDraft).toBeNull();
    expect(restored.isRetailSale).toBe(false);
    expect(draft.values.machineReference).toBe("6");
  });
  it("ignores incomplete asset links", () => {
    expect(restoreLiveLinkRequestDraft(draft, "?asset=asset-id")).toBe(draft);
  });
  it("leaves normal draft and QR restoration unchanged", () => {
    expect(restoreLiveLinkRequestDraft(draft, "")).toBe(draft);
    expect(restoreLiveLinkRequestDraft(draft, "?machineReference=26312")).toBe(draft);
    expect(restoreLiveLinkRequestDraft(draft, "?livelink=JCB-PIN")).toBe(draft);
  });
  it("preserves confirmed location when the draft already belongs to the selected machine", () => {
    expect(restoreLiveLinkRequestDraft(draft, "?machineReference=6&livelink=JCB-PIN").locationDraft).toEqual(draft.locationDraft);
  });
});
