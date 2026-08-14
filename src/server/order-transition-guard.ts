import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { embroideryJobs, orderItems, orders } from "../db/schema";
import { canTransitionOrder } from "../domain/order";
import { orderStatuses, type OrderStatus } from "../domain/types";
import type { AuthUser } from "./auth";

const transitionSchema = z.object({
  status: z.enum(orderStatuses),
  note: z.string().optional().nullable()
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function orderById(businessId: string, orderId: string) {
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.businessId, businessId)))
    .limit(1);
  return order ?? null;
}

async function orderForEmbroideryJob(businessId: string, jobId: string) {
  const [job] = await db
    .select({ orderItemId: embroideryJobs.orderItemId })
    .from(embroideryJobs)
    .where(and(eq(embroideryJobs.id, jobId), eq(embroideryJobs.businessId, businessId)))
    .limit(1);
  if (!job) return { order: null, error: json({ error: "Trabajo de bordado no encontrado" }, 404) };

  const [item] = await db
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.id, job.orderItemId))
    .limit(1);
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
    order = await orderById(user.businessId, transitionMatch[1]);
    target = parsed.data.status;
  }

  const cutMatch = path.match(/^\/api\/orders\/([0-9a-f-]+)\/cut$/i);
  if (cutMatch) {
    order = await orderById(user.businessId, cutMatch[1]);
    target = "CUT";
  }

  const sendMatch = path.match(/^\/api\/orders\/([0-9a-f-]+)\/send-embroidery$/i);
  if (sendMatch) {
    order = await orderById(user.businessId, sendMatch[1]);
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
  if (!canTransitionOrder(from, target)) {
    return json({ error: `No se puede cambiar el pedido de ${from} a ${target}` }, 409);
  }

  return null;
}
