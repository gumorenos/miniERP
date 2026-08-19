import { getToken } from "./api";
import type { CaptureChannel, CaptureIntent, CapturePayload } from "../domain/capture";

export type CaptureDraft = {
  id: string;
  channel: string;
  sourceMessageId?: string | null;
  rawText: string;
  intent: CaptureIntent;
  status: string;
  payload: CapturePayload;
  missingFields: string[];
  ambiguousFields: string[];
  parserVersion: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
};

async function request<T>(path: string, options: RequestInit = {}) {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
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
  createDraft: (payload: { rawText: string; channel?: CaptureChannel; sourceMessageId?: string | null }) =>
    request<{ duplicate: boolean; draft: CaptureDraft }>("/api/capture/drafts", { method: "POST", body: JSON.stringify({ channel: "INTERNAL", ...payload }) }),
  listDrafts: () => request<{ rows: CaptureDraft[] }>("/api/capture/drafts"),
  confirmDraft: (id: string, payload: CapturePayload) =>
    request<{ draft: CaptureDraft; order?: { id: string; orderNumber: string }; customer?: { id: string; name: string } }>("/api/capture/drafts/" + id + "/confirm", { method: "POST", body: JSON.stringify({ payload }) }),
  rejectDraft: (id: string) => request<{ draft: CaptureDraft }>("/api/capture/drafts/" + id + "/reject", { method: "POST", body: JSON.stringify({}) })
};
