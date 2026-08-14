import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { embroideryJobs, embroideryProviders, orderItems, orders } from "../db/schema";
import { canTransitionOrder } from "../domain/order";
import { orderStatuses, type OrderStatus } from "../domain/types";
import type { AuthUser } from "./auth";

const transitionSchema = z.object({ status: z.enum(orderStatuses), note: z.string().optional().nullable() });
const sendSchema = z.object({ providerId: z.string().uuid() }).passthrough();
const controlledTargets = new Set<OrderStatus>(["CUT", "AT_EMBROIDERER", "EMBROIDERY_RECEIVED", "ASSEMBLY", "READY_FOR_DELIVERY"]);

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

function validateGenericTransition(from: OrderStatus, target: OrderStatus) {
  if (controlledTargets.has(target)) return `La transición a ${target} usa una acción operativa específica`;
  if (target === "MATERIAL_PENDING" && !["ORDER_RECEIVED", "MATERIAL_PENDING"].includes(from)) return `No se puede pasar de ${from} a MATERIAL_PENDING`;
  if (target === "READY_TO_CUT" && !["ORDER_RECEIVED", "MATERIAL_PENDING", "READY_TO_CUT"].includes(from)) return `No se puede pasar de ${from} a READY_TO_CUT`;
  if (target === "DELIVERED" && !["READY_FOR_DELIVERY", "DELIVERED"].includes(from)) return "El pedido debe estar listo para entregar antes de marcarlo entregado";
  if (target === "CLOSED" && !["DELIVERED", "CLOSED"].includes(from)) return "El pedido debe estar entregado antes de cerrarlo";
  return null;
}

export async function guardOrderWorkflowMutation(request: Request, user: AuthUser): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const path = new URL(request.url).pathname;
  let order: { id: string; status: string } | null = null;
  let target: OrderStatus | null = null;
  let genericTransition = false;

  const transitionMatch = path.match(/^\/api\/orders\/([0-9a-f-]+)\/transition$/i);
  if (transitionMatch) {
    const parsed = transitionSchema.safeParse(await request.clone().json().catch(() => null));
    if (!parsed.success) return json({ error: "Estado de pedido inválido" }, 400);
    order = await orderById(user.businessId, transitionMatch[1]);
    target = parsed.data.status;
    genericTransition = true;
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

  if (genericTransition) {
    const reason = validateGenericTransition(from, target);
    if (reason) return json({ error: reason }, 409);
  } else if (target === "CUT" && !["READY_TO_CUT", "CUT"].includes(from)) {
    return json({ error: "El pedido debe estar listo para corte antes de cortar" }, 409);
  } else if (target === "AT_EMBROIDERER" && from !== "CUT") {
    return json({ error: "El pedido debe estar cortado antes de enviarlo al bordador" }, 409);
  } else if (target === "EMBROIDERY_RECEIVED" && from !== "AT_EMBROIDERER") {
    return json({ error: "El pedido no está actualmente con el bordador" }, 409);
  }

  if (!canTransitionOrder(from, target)) return json({ error: `No se puede cambiar el pedido de ${from} a ${target}` }, 409);
  return null;
}
