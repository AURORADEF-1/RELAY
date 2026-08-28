const REQUESTER_OFFLINE_DB_NAME = "relay-requester-offline";
const REQUESTER_OFFLINE_DB_VERSION = 1;
const REQUESTER_OFFLINE_DRAFT_STORE = "drafts";
const REQUESTER_OFFLINE_QUEUE_STORE = "submissions";

export type RequesterOfflineLocationDraft = {
  lat: number;
  lng: number;
  summary: string;
  confirmed: boolean;
};

export type RequesterOfflineFormValues = {
  requesterName: string;
  department: "" | "Onsite" | "Yard";
  machineReference: string;
  jobNumber: string;
  requestDetails: string;
  retailSalesReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  retailDeliveryMethod: "" | "collect" | "delivery";
  retailDeliveryAddress: string;
};

export type RequesterOfflineDraft = {
  values: RequesterOfflineFormValues;
  isRetailSale: boolean;
  locationDraft: RequesterOfflineLocationDraft | null;
  savedAt: string;
};

export type RequesterOfflineSubmissionRecord = {
  id: string;
  queuedAt: string;
  updatedAt: string;
  userId: string;
  values: RequesterOfflineFormValues;
  isRetailSale: boolean;
  locationDraft: RequesterOfflineLocationDraft | null;
  queuedPhotos: File[];
  phase: "create-ticket" | "upload-attachments" | "failed";
  ticketId: string | null;
  notified: boolean;
  attempts: number;
  lastError: string | null;
};

export function buildRequesterOfflineNotice(
  queueCount: number,
  isOnline: boolean,
  isSyncing: boolean,
) {
  if (isSyncing) {
    return {
      type: "info" as const,
      message:
        queueCount > 0
          ? `Saving ${queueCount} queued request${queueCount === 1 ? "" : "s"} and syncing them now...`
          : "Checking for saved offline requests...",
    };
  }

  if (!isOnline) {
    return {
      type: "info" as const,
      message:
        queueCount > 0
          ? `${queueCount} request${queueCount === 1 ? "" : "s"} saved locally. RELAY will upload them automatically when signal returns.`
          : "You’re offline right now. Any request you submit will be saved on this device and sent automatically when the connection returns.",
    };
  }

  if (queueCount > 0) {
    return {
      type: "info" as const,
      message:
        `${queueCount} saved request${queueCount === 1 ? "" : "s"} waiting to sync. RELAY will retry automatically in the background.`,
    };
  }

  return null;
}

export function isLikelyRequesterOfflineError(error: unknown, isOnline = true) {
  if (!isOnline) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("networkerror") ||
    lowerMessage.includes("network request failed") ||
    lowerMessage.includes("load failed") ||
    lowerMessage.includes("internet connection appears to be offline") ||
    lowerMessage.includes("fetch")
  );
}

export async function loadRequesterOfflineDraft() {
  const storage = getLocalStorage();
  if (!storage) return null;

  const raw = storage.getItem(REQUESTER_OFFLINE_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RequesterOfflineDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRequesterOfflineDraft(draft: RequesterOfflineDraft) {
  const storage = getLocalStorage();
  if (!storage) return;

  storage.setItem(REQUESTER_OFFLINE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export async function clearRequesterOfflineDraft() {
  const storage = getLocalStorage();
  if (!storage) return;

  storage.removeItem(REQUESTER_OFFLINE_DRAFT_STORAGE_KEY);
}

export async function listRequesterOfflineSubmissions() {
  const records = await readRequesterOfflineStore<RequesterOfflineSubmissionRecord>(
    REQUESTER_OFFLINE_QUEUE_STORE,
  );

  return records.sort((left, right) => {
    const leftAt = Date.parse(left.updatedAt || left.queuedAt || "");
    const rightAt = Date.parse(right.updatedAt || right.queuedAt || "");
    return rightAt - leftAt;
  });
}

export async function countRequesterOfflineSubmissions() {
  const records = await listRequesterOfflineSubmissions();
  return records.filter((record) => record.phase !== "failed").length;
}

export async function upsertRequesterOfflineSubmission(
  submission: RequesterOfflineSubmissionRecord,
) {
  await writeRequesterOfflineStore(REQUESTER_OFFLINE_QUEUE_STORE, submission);
}

export async function deleteRequesterOfflineSubmission(submissionId: string) {
  await deleteRequesterOfflineStore(REQUESTER_OFFLINE_QUEUE_STORE, submissionId);
}

export async function getRequesterOfflineSubmission(
  submissionId: string,
) {
  return readRequesterOfflineStoreItem<RequesterOfflineSubmissionRecord>(
    REQUESTER_OFFLINE_QUEUE_STORE,
    submissionId,
  );
}

export function createRequesterOfflineSubmissionRecord({
  userId,
  values,
  isRetailSale,
  locationDraft,
  queuedPhotos,
}: {
  userId: string;
  values: RequesterOfflineFormValues;
  isRetailSale: boolean;
  locationDraft: RequesterOfflineLocationDraft | null;
  queuedPhotos: File[];
}): RequesterOfflineSubmissionRecord {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    queuedAt: timestamp,
    updatedAt: timestamp,
    userId,
    values,
    isRetailSale,
    locationDraft,
    queuedPhotos,
    phase: "create-ticket",
    ticketId: null,
    notified: false,
    attempts: 0,
    lastError: null,
  };
}

export async function updateRequesterOfflineSubmission(
  submissionId: string,
  patch: Partial<RequesterOfflineSubmissionRecord>,
) {
  const current = await getRequesterOfflineSubmission(submissionId);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await upsertRequesterOfflineSubmission(next);
  return next;
}

async function readRequesterOfflineStoreItem<T>(storeName: string, key: IDBValidKey) {
  const db = await openRequesterOfflineDatabase();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    });
  } finally {
    db.close();
  }
}

async function readRequesterOfflineStore<T>(storeName: string) {
  const db = await openRequesterOfflineDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as T[]) ?? []);
    });
  } finally {
    db.close();
  }
}

async function writeRequesterOfflineStore(storeName: string, value: object) {
  const db = await openRequesterOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(value);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function deleteRequesterOfflineStore(storeName: string, key: IDBValidKey) {
  const db = await openRequesterOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function openRequesterOfflineDatabase() {
  const indexedDb = getIndexedDB();
  if (!indexedDb) {
    throw new Error("IndexedDB is not available in this browser.");
  }

  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDb.open(REQUESTER_OFFLINE_DB_NAME, REQUESTER_OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REQUESTER_OFFLINE_DRAFT_STORE)) {
        db.createObjectStore(REQUESTER_OFFLINE_DRAFT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(REQUESTER_OFFLINE_QUEUE_STORE)) {
        db.createObjectStore(REQUESTER_OFFLINE_QUEUE_STORE, { keyPath: "id" });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getLocalStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getIndexedDB() {
  if (typeof window === "undefined") return null;
  return window.indexedDB ?? null;
}

const REQUESTER_OFFLINE_DRAFT_STORAGE_KEY = "relay:requester-offline-draft:v1";
