import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { customers, embroideryJobs, orderItems, orders, orderStatusHistory, payments, products } from "../db/schema";
import { calculateOrderFinancials, embroideryOverdueDays } from "../domain/order";
import { roundMoney, toNumber } from "../domain/money";
import { limaBusinessDate, limaBusinessDateTimestamp } from "../domain/workshop";
import { paymentMethods, sizes } from "../domain/types";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";
import { nextOrderNumber, type DbTransaction } from "./order-number";
import { weightedAverageCost } from "./stock-cost";
import { resolveFabricQty } from "./workshop-size-consumption";

const schema = z.object({
  customerId: z.string().uuid(), productId: z.string().uuid(), size: z.enum(sizes),
  color: z.string().trim().min(1).max(120), quantity: z.coerce.number().int().positive().default(1),
  agreedTotalPrice: z.coerce.number().positive(), promisedDeliveryDate: z.string().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  advanceAmount: z.coerce.number().nonnegative().default(0), advanceMethod: z.enum(paymentMethods).default("YAPE"),
  advancePaidAt: z.string().optional().nullable(), advanceNotes: z.string().trim().max(500).optional().nullable()
});

export type OrderCreateBody = z.infer<typeof schema>;
export type PreparedOrderCreate = {
  body: OrderCreateBody;
  product: typeof products.$inferSelect;
  plannedFabricQty: number | null;
  fabricCost: number;
  closureCost: number;
  packagingCost: number;
  paidAt: Date | null;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function paymentDate(value?: string | null) {
  if (!value) return limaBusinessDateTimestamp();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function loadOrder(businessId: string, id: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.businessId, businessId))).limit(1);
  if (!order) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const paymentRows = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.paidAt));
  const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.changedAt));
  const jobs = items.length ? await db.select().from(embroideryJobs).where(inArray(embroideryJobs.orderItemId, items.map((item) => item.id))) : [];
  const costs = items.map((item) => {
    const itemJobs = jobs.filter((job) => job.orderItemId === item.id);
    return {
      estimatedMaterialCost: toNumber(item.estimatedMaterialCost), actualMaterialCost: item.actualMaterialCost == null ? null : toNumber(item.actualMaterialCost),
      estimatedOwnLaborCost: toNumber(item.estimatedOwnLaborCost), actualOwnLaborCost: item.actualOwnLaborCost == null ? null : toNumber(item.actualOwnLaborCost),
      estimatedPackagingCost: toNumber(item.estimatedPackagingCost), actualPackagingCost: item.actualPackagingCost == null ? null : toNumber(item.actualPackagingCost),
      otherEstimatedDirectCost: toNumber(item.otherEstimatedDirectCost), otherActualDirectCost: item.otherActualDirectCost == null ? null : toNumber(item.otherActualDirectCost),
      estimatedEmbroideryCost: itemJobs.reduce((sum, job) => sum + toNumber(job.estimatedCost), 0),
      actualEmbroideryCost: itemJobs.some((job) => job.actualCost != null) ? itemJobs.reduce((sum, job) => sum + toNumber(job.actualCost), 0) : null
    };
  });
  return {
    ...order,
    customer,
    items,
    payments: paymentRows,
    history,
    embroideryJobs: jobs.map((job) => ({ ...job, overdueDays: embroideryOverdueDays(job.expectedReturnDate, job.receivedAt) })),
    financials: calculateOrderFinancials({ agreedTotalPrice: toNumber(order.agreedTotalPrice), payments: paymentRows.map((row) => toNumber(row.amount)), items: costs })
  };
}

export function parseOrderCreatePayload(value: unknown) {
  return schema.safeParse(value);
}

export async function prepareOrderCreate(body: OrderCreateBody, user: AuthUser): Promise<PreparedOrderCreate | { error: string; status: number }> {
  if (body.advanceAmount > body.agreedTotalPrice) return { error: "El adelanto no puede superar el total del pedido", status: 400 };
  if (await isArchived(user.businessId, "CUSTOMER", body.customerId)) return { error: "El cliente seleccionado fue borrado", status: 409 };
  if (await isArchived(user.businessId, "PRODUCT", body.productId)) return { error: "El producto seleccionado fue borrado", status: 409 };
  const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, body.customerId), eq(customers.businessId, user.businessId))).limit(1);
  if (!customer) return { error: "Cliente no encontrado", status: 404 };
  const [product] = await db.select().from(products).where(and(eq(products.id, body.productId), eq(products.businessId, user.businessId))).limit(1);
  if (!product) return { error: "Producto no encontrado", status: 404 };
  const paidAt = body.advanceAmount > 0 ? paymentDate(body.advancePaidAt) : null;
  if (body.advanceAmount > 0 && !paidAt) return { error: "Fecha de adelanto inválida", status: 400 };

  const plannedFabricQty = product.defaultFabricMaterialId ? await resolveFabricQty(product.id, body.size, product.defaultFabricQtyMeters) : null;
  if (product.defaultFabricMaterialId && plannedFabricQty == null) return { error: "Configura el consumo de tela del producto", status: 409 };
  const fabricCost = product.defaultFabricMaterialId && plannedFabricQty != null ? (await weightedAverageCost(product.defaultFabricMaterialId)) * plannedFabricQty : 0;
  const closureCost = product.defaultClosureMaterialId ? (await weightedAverageCost(product.defaultClosureMaterialId)) * toNumber(product.defaultClosureQty) : 0;
  const packagingCost = product.defaultPackagingMaterialId ? (await weightedAverageCost(product.defaultPackagingMaterialId)) * toNumber(product.defaultPackagingQty) : 0;
  return { body, product, plannedFabricQty, fabricCost, closureCost, packagingCost, paidAt };
}

export async function createOrderRecord(transaction: DbTransaction, user: AuthUser, prepared: PreparedOrderCreate) {
  const { body, product, plannedFabricQty, fabricCost, closureCost, packagingCost, paidAt } = prepared;
  const orderNumber = await nextOrderNumber(transaction, user.businessId);
  const [order] = await transaction.insert(orders).values({
    businessId: user.businessId,
    orderNumber,
    customerId: body.customerId,
    orderDate: limaBusinessDate(),
    promisedDeliveryDate: body.promisedDeliveryDate || null,
    fulfillmentType: "MADE_TO_ORDER",
    status: "ORDER_RECEIVED",
    agreedTotalPrice: String(body.agreedTotalPrice),
    notes: body.notes || null
  }).returning();

  await transaction.insert(orderItems).values({
    orderId: order.id,
    productId: product.id,
    size: body.size,
    color: body.color,
    quantity: body.quantity,
    agreedUnitPrice: String(body.agreedTotalPrice / body.quantity),
    fabricMaterialId: product.defaultFabricMaterialId,
    plannedFabricQty: plannedFabricQty == null ? null : String(plannedFabricQty),
    closureMaterialId: product.defaultClosureMaterialId,
    plannedClosureQty: product.defaultClosureQty,
    packagingMaterialId: product.defaultPackagingMaterialId,
    plannedPackagingQty: product.defaultPackagingQty,
    estimatedMaterialCost: fabricCost + closureCost > 0 ? String(roundMoney(fabricCost + closureCost)) : null,
    estimatedOwnLaborCost: product.defaultOwnLaborCost,
    estimatedPackagingCost: packagingCost > 0 ? String(roundMoney(packagingCost)) : null,
    otherEstimatedDirectCost: null
  });
  await transaction.insert(orderStatusHistory).values({ orderId: order.id, toStatus: "ORDER_RECEIVED", note: "Pedido creado" });
  if (body.advanceAmount > 0 && paidAt) {
    await transaction.insert(payments).values({ businessId: user.businessId, orderId: order.id, amount: String(body.advanceAmount), method: body.advanceMethod, paidAt, notes: body.advanceNotes || "Adelanto al crear pedido" });
  }
  return order.id;
}

export async function handleOrderCreateWithAdvance(request: Request, user: AuthUser): Promise<Response> {
  const parsed = parseOrderCreatePayload(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa cliente, producto, talla, color, precio y adelanto" }, 400);
  const prepared = await prepareOrderCreate(parsed.data, user);
  if ("error" in prepared) return json({ error: prepared.error }, prepared.status);
  const id = await db.transaction((tx) => createOrderRecord(tx, user, prepared));
  return json(await loadOrder(user.businessId, id), 201);
}
