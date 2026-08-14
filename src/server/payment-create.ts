import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { orders, payments } from "../db/schema";
import { paymentMethods } from "../domain/types";
import { limaBusinessDateTimestamp } from "../domain/workshop";
import type { AuthUser } from "./auth";
import { app } from "./app";

const paymentCreateSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(paymentMethods),
  paidAt: z.string().optional(),
  notes: z.string().trim().max(500).optional().nullable()
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function paymentTimestamp(value?: string) {
  if (!value) return limaBusinessDateTimestamp();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function handlePaymentCreate(request: Request, user: AuthUser, orderId: string): Promise<Response> {
  const parsed = paymentCreateSchema.safeParse(await request.clone().json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa monto, método y fecha del pago" }, 400);

  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, user.businessId))).limit(1);
  if (!order) return json({ error: "Pedido no encontrado" }, 404);
  if (order.status === "CANCELLED") return json({ error: "No se pueden registrar pagos en un pedido cancelado" }, 409);

  const current = await db.select({ amount: payments.amount }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.businessId, user.businessId)));
  const totalAfterPayment = current.reduce((sum, row) => sum + Number(row.amount), 0) + parsed.data.amount;
  if (totalAfterPayment > Number(order.agreedTotalPrice)) {
    return json({ error: "Los pagos no pueden superar el total del pedido" }, 409);
  }

  const paidAt = paymentTimestamp(parsed.data.paidAt);
  if (!paidAt) return json({ error: "Fecha de pago inválida" }, 400);

  await db.insert(payments).values({
    businessId: user.businessId,
    orderId: order.id,
    amount: String(parsed.data.amount),
    method: parsed.data.method,
    paidAt,
    notes: parsed.data.notes || null
  });

  const detailRequest = new Request(new URL(`/api/orders/${order.id}`, request.url), {
    method: "GET",
    headers: request.headers
  });
  return app.fetch(detailRequest);
}
