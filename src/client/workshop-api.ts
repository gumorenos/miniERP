import { type Customer, type OrderDetail } from "./api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  if (contentType.includes("application/json")) {
    try { payload = JSON.parse(raw) as { error?: string }; } catch { /* use the status fallback */ }
  }
  if (!response.ok) {
    throw new Error(payload.error ?? (response.status === 409
      ? "No se puede completar porque el registro todavía tiene información relacionada."
      : `No se pudo completar la acción (${response.status}).`));
  }
  return (contentType.includes("application/json") && raw ? JSON.parse(raw) as T : {}) as T;
}

export type ArchiveEntityType = "CUSTOMER" | "PRODUCT" | "MATERIAL" | "ORDER" | "PAYMENT" | "PROVIDER" | "SUPPLIER" | "EMBROIDERY_JOB";

export const workshopApi = {
  updateCustomer: (payload: Record<string, unknown>) => request<Customer>("/api/customers", {
    method: "POST",
    body: JSON.stringify({ action: "update", ...payload })
  }),
  updateOrder: (payload: Record<string, unknown>) => request<{ ok: true; id: string }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ action: "update", ...payload })
  }),
  updatePayment: (orderId: string, payload: Record<string, unknown>) => request<Record<string, unknown>>(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify({ action: "update", ...payload })
  }),
  account: () => request<{ id: string; name: string; email: string }>("/api/account"),
  updateAccount: (payload: { name: string; email: string; currentPassword?: string }) => request<{ id: string; name: string; email: string }>("/api/account", {
    method: "PATCH",
    body: JSON.stringify(payload)
  }),
  archive: (entityType: ArchiveEntityType, id: string) => request<{ ok: true; alreadyArchived?: boolean }>("/api/archive", {
    method: "POST",
    body: JSON.stringify({ entityType, id })
  }),
  archived: () => request<{ records: Array<{ entityType: ArchiveEntityType; id: string }> }>("/api/archive"),
  getOrder: (id: string) => request<OrderDetail>(`/api/orders/${id}`)
};
