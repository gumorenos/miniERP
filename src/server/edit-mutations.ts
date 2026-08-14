import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { customers, orderItems, orders, payments } from "../db/schema";
import { paymentMethods, sizes } from "../domain/types";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const customerEdit = z.object({ action: z.literal("update"), id: z.string().uuid(), name: z.string().trim().min(2).max(160).optional(), phone: z.string().trim().max(80).optional().nullable(), instagramHandle: z.string().trim().max(120).optional().nullable(), notes: z.string().trim().max(1000).optional().nullable() });
const orderEdit = z.object({ action: z.literal("update"), id: z.string().uuid(), customerId: z.string().uuid().optional(), promisedDeliveryDate: z.string().optional().nullable(), size: z.enum(sizes).optional(), color: z.string().trim().min(1).max(120).optional(), agreedTotalPrice: z.coerce.number().positive().optional(), notes: z.string().trim().max(1000).optional().nullable() });
const paymentEdit = z.object({ action: z.literal("update"), paymentId: z.string().uuid(), amount: z.coerce.number().positive().optional(), method: z.enum(paymentMethods).optional(), paidAt: z.string().optional(), notes: z.string().trim().max(500).optional().nullable() });

function paidAtTimestamp(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function handleCustomerEdit(request: Request, user: AuthUser): Promise<Response | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { action?: unknown }).action !== "update") return null;
  const parsed = customerEdit.safeParse(body);
  if (!parsed.success) return json({ error: "Revisa los datos del cliente" }, 400);
  if (await isArchived(user.businessId, "CUSTOMER", parsed.data.id)) return json({ error: "El cliente fue borrado" }, 409);
  const [current] = await db.select().from(customers).where(and(eq(customers.id, parsed.data.id), eq(customers.businessId, user.businessId))).limit(1);
  if (!current) return json({ error: "Cliente no encontrado" }, 404);
  const [updated] = await db.update(customers).set({ ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}), ...(parsed.data.instagramHandle !== undefined ? { instagramHandle: parsed.data.instagramHandle || null } : {}), ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}), updatedAt: new Date() }).where(eq(customers.id, current.id)).returning();
  return json(updated);
}

export async function handleOrderEdit(request: Request, user: AuthUser): Promise<Response | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { action?: unknown }).action !== "update") return null;
  const parsed = orderEdit.safeParse(body);
  if (!parsed.success) return json({ error: "Revisa los datos del pedido" }, 400);
  if (await isArchived(user.businessId, "ORDER", parsed.data.id)) return json({ error: "El pedido fue borrado" }, 409);
  const [current] = await db.select().from(orders).where(and(eq(orders.id, parsed.data.id), eq(orders.businessId, user.businessId))).limit(1);
  if (!current) return json({ error: "Pedido no encontrado" }, 404);
  if (parsed.data.customerId) {
    if (parsed.data.customerId !== current.customerId && await isArchived(user.businessId, "CUSTOMER", parsed.data.customerId)) return json({ error: "El cliente seleccionado fue borrado" }, 409);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, parsed.data.customerId), eq(customers.businessId, user.businessId))).limit(1);
    if (!customer) return json({ error: "Cliente no encontrado" }, 404);
  }
  if (parsed.data.agreedTotalPrice !== undefined) {
    const paymentRows = await db.select({ amount: payments.amount }).from(payments).where(eq(payments.orderId, current.id));
    const paid = paymentRows.reduce((sum, row) => sum + Number(row.amount), 0);
    if (parsed.data.agreedTotalPrice < paid) return json({ error: "El total del pedido no puede ser menor a lo ya pagado" }, 409);
  }
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, current.id)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(orders).set({ ...(parsed.data.customerId !== undefined ? { customerId: parsed.data.customerId } : {}), ...(parsed.data.promisedDeliveryDate !== undefined ? { promisedDeliveryDate: parsed.data.promisedDeliveryDate || null } : {}), ...(parsed.data.agreedTotalPrice !== undefined ? { agreedTotalPrice: String(parsed.data.agreedTotalPrice) } : {}), ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}), updatedAt: new Date() }).where(eq(orders.id, current.id));
    if (item && (parsed.data.size !== undefined || parsed.data.color !== undefined || parsed.data.agreedTotalPrice !== undefined)) {
      await tx.update(orderItems).set({ ...(parsed.data.size !== undefined ? { size: parsed.data.size } : {}), ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}), ...(parsed.data.agreedTotalPrice !== undefined ? { agreedUnitPrice: String(parsed.data.agreedTotalPrice / item.quantity) } : {}) }).where(eq(orderItems.id, item.id));
    }
  });
  return json({ ok: true, id: current.id });
}

export async function handlePaymentEdit(request: Request, user: AuthUser, orderId: string): Promise<Response | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { action?: unknown }).action !== "update") return null;
  const parsed = paymentEdit.safeParse(body);
  if (!parsed.success) return json({ error: "Revisa los datos del pago" }, 400);
  if (await isArchived(user.businessId, "ORDER", orderId)) return json({ error: "El pedido fue borrado" }, 409);
  if (await isArchived(user.businessId, "PAYMENT", parsed.data.paymentId)) return json({ error: "El pago fue borrado" }, 409);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, user.businessId))).limit(1);
  if (!order) return json({ error: "Pedido no encontrado" }, 404);
  const [payment] = await db.select().from(payments).where(and(eq(payments.id, parsed.data.paymentId), eq(payments.orderId, order.id), eq(payments.businessId, user.businessId))).limit(1);
  if (!payment) return json({ error: "Pago no encontrado" }, 404);
  if (parsed.data.amount !== undefined) {
    const rows = await db.select({ id: payments.id, amount: payments.amount }).from(payments).where(eq(payments.orderId, order.id));
    const total = rows.reduce((sum, row) => sum + (row.id === payment.id ? parsed.data.amount! : Number(row.amount)), 0);
    if (total > Number(order.agreedTotalPrice)) return json({ error: "Los pagos no pueden superar el total del pedido" }, 409);
  }
  const paidAt = parsed.data.paidAt !== undefined ? paidAtTimestamp(parsed.data.paidAt) : payment.paidAt;
  if (!paidAt) return json({ error: "Fecha de pago inválida" }, 400);
  const [updated] = await db.update(payments).set({ ...(parsed.data.amount !== undefined ? { amount: String(parsed.data.amount) } : {}), ...(parsed.data.method !== undefined ? { method: parsed.data.method } : {}), ...(parsed.data.paidAt !== undefined ? { paidAt } : {}), ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}) }).where(eq(payments.id, payment.id)).returning();
  return json(updated);
}
