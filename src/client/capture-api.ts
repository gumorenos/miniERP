import type { CaptureChannel, CaptureIntent, CapturePayload } from "../domain/capture";

export type CaptureDraftEntityAction =
  | { type: "CREATE_CUSTOMER" }
  | { type: "CREATE_PRODUCT"; price?: number }
  | { type: "SELECT_PRODUCT"; optionIndex: number };

export type CaptureDraft = {
  id: string;
  channel: string;
  conversationKey?: string | null;
  sourceMessageId?: string | null;
  rawText: string;
  intent: CaptureIntent;
  status: string;
  payload: CapturePayload;
  missingFields: string[];
  ambiguousFields: string[];
  parserVersion: string;
  confirmedOrderId?: string | null;
  confirmedEntityType?: string | null;
  confirmedEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
};

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...options.headers
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text().catch(() => "");
  let payload: { error?: string } = {};
  if (contentType.includes("application/json") && raw) {
    try { payload = JSON.parse(raw) as { error?: string }; } catch { /* use status fallback */ }
  }
  if (!response.ok) throw new Error(payload.error ?? ("No se pudo completar la captura (" + response.status + ")."));
  return (contentType.includes("application/json") && raw ? JSON.parse(raw) as T : {}) as T;
}

export const captureApi = {
  createDraft: (payload: { rawText: string; channel?: CaptureChannel; conversationKey?: string | null; sourceMessageId?: string | null }) =>
    request<{ duplicate: boolean; draft: CaptureDraft }>("/api/capture/drafts", { method: "POST", body: JSON.stringify({ channel: "INTERNAL", ...payload }) }),
  listDrafts: () => request<{ rows: CaptureDraft[] }>("/api/capture/drafts"),
  confirmDraft: (id: string, payload: CapturePayload) =>
    request<{ draft: CaptureDraft; order?: { id: string; orderNumber: string }; customer?: { id: string; name: string } }>("/api/capture/drafts/" + id + "/confirm", { method: "POST", body: JSON.stringify({ payload }) }),
  resolveEntity: (id: string, action: CaptureDraftEntityAction) =>
    request<{ draft: CaptureDraft; resolution: "CUSTOMER" | "PRODUCT" }>("/api/capture/drafts/" + id + "/entity", { method: "POST", body: JSON.stringify(action) }),
  rejectDraft: (id: string) => request<{ draft: CaptureDraft }>("/api/capture/drafts/" + id + "/reject", { method: "POST", body: JSON.stringify({}) })
};
