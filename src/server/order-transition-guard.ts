import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { embroideryJobs, embroideryProviders, orderItems, orders } from "../db/schema";
import { canTransitionOrder } from "../domain/order";
import { orderStatuses, type OrderStatus } from "../domain/types";
import type { AuthUser } from "./auth";

const transitionSchema = z.object({ status: z.enum(orderStatuses), note: z.string().optional().nullable() });
const sendSchema = z.object({ providerId: z.string().uuid() }).passthrough();

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function orderById(businessId: string, orderId: string) {
  const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, businessId))).limit(1);
  return order ?? null;
}

async function orderForEmbroideryJob(businessId: string, jobId: string) {
  const [job] = await db.select({ orderItemId: embroideryJobs.orderItemId, status: embroideryJobs.status }).from(embroideryJobs).where(and(eq(embroideryJobs.id, jobId), eq(embroideryJobs.businessId, businessId))).limit(1);
  if (!job) return { order: null, error: json({ error: "Trabajo de bordado no encontrado" }, 404) };
  if (job.status !== "SENT") return { order: null, error: json({ error: "El trabajo de bordado ya fue recibido o cerrado" }, 409) };
  const [item] = await db.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, job.orderItemId)).limit(1);
  if (!item) return { order: null, error: json({ error: "El trabajo de bordado no tiene pedido asociado" }, 409) };
  const order = await orderById(businessId, item.orderId);
  if (!order) return { order: null, error: json({ error: "Pedido no encontrado" }, 404) };
  return { order, error: null };
}

export async function guardOrderWorkflowMutation(request: Request, user: AuthUser): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const path = new URL(request.url).pathname;
  let order: { id: string; status: string } | null = null;
  let target: OrderStatus | null = null;

  const transitionMatch = path.match(/^\/api\/orders\/([0-9a-f-]+)\/transition$/i);
  if (transitionMatch) {
    const parsed = transitionSchema.safeParse(await request.clone().json().catch(() => null));
    if (!parsed.success) return json({ error: "Estado de pedido inválido" }, 400);
    if (parsed.data.status === "ASSEMBLY") return json({ error: "Usa la acción Iniciar confección para registrar el consumo de cierre" }, 409);
    if (parsed.data.status === "READY_FOR_DELIVERY") return json({ error: "Usa la acción Listo para entregar para registrar el consumo de empaque" }, 409);
    order = await orderById(user.businessId, transitionMatch[1]);
    target = parsed.data.status;
  }

  const cutMatch = path.match(/^\/api\/orders\/([0-9a-f-]+)\/cut$/i);
  if (cutMatch) { order = await orderById(user.businessId, cutMatch[1]); target = "CUT"; }

  const sendMatch = path.match(/^\/api\/orders\/([0-9a-f-]+)\/send-embroidery$/i);
  if (sendMatch) {
    const parsed = sendSchema.safeParse(await request.clone().json().catch(() => null));
    if (!parsed.success) return json({ error: "Bordador inválido" }, 400);
    const [provider] = await db.select({ id: embroideryProviders.id }).from(embroideryProviders).where(and(eq(embroideryProviders.id, parsed.data.providerId), eq(embroideryProviders.businessId, user.businessId), eq(embroideryProviders.active, true))).limit(1);
    if (!provider) return json({ error: "El bordador no pertenece a este negocio o fue borrado" }, 400);
    const archivedProvider = await db.execute(sql`select 1 from deleted_records where business_id=${user.businessId}::uuid and entity_type='PROVIDER' and entity_id=${parsed.data.providerId}::uuid limit 1`);
    if (archivedProvider.rows.length) return json({ error: "El bordador fue borrado" }, 409);
    order = await orderById(user.businessId, sendMatch[1]);
    if (order) {
      const [item] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
      if (item) {
        const existing = await db.select({ id: embroideryJobs.id }).from(embroideryJobs).where(and(eq(embroideryJobs.orderItemId, item.id), eq(embroideryJobs.status, "SENT"))).limit(1);
        if (existing.length) return json({ error: "El pedido ya tiene un bordado pendiente" }, 409);
      }
    }
    target = "AT_EMBROIDERER";
  }

  const receiveMatch = path.match(/^\/api\/embroidery-jobs\/([0-9a-f-]+)\/receive$/i);
  if (receiveMatch) {
    const resolved = await orderForEmbroideryJob(user.businessId, receiveMatch[1]);
    if (resolved.error) return resolved.error;
    order = resolved.order;
    target = "EMBROIDERY_RECEIVED";
  }

  if (!target) return null;
  if (!order) return json({ error: "Pedido no encontrado" }, 404);
  const from = order.status as OrderStatus;
  if (!canTransitionOrder(from, target)) return json({ error: `No se puede cambiar el pedido de ${from} a ${target}` }, 409);
  return null;
}
