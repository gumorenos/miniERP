import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { customers, embroideryJobs, orderItems, orders, orderStatusHistory, payments, products, stockMovements } from "../db/schema";
import { calculateOrderFinancials, embroideryOverdueDays } from "../domain/order";
import { limaBusinessDate, limaBusinessDateTimestamp } from "../domain/workshop";
import { paymentMethods, sizes } from "../domain/types";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";
import { resolveFabricQty } from "./workshop-size-consumption";

const schema = z.object({
  customerId: z.string().uuid(), productId: z.string().uuid(), size: z.enum(sizes),
  color: z.string().trim().min(1).max(120), quantity: z.coerce.number().int().positive().default(1),
  agreedTotalPrice: z.coerce.number().positive(), promisedDeliveryDate: z.string().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  advanceAmount: z.coerce.number().nonnegative().default(0), advanceMethod: z.enum(paymentMethods).default("YAPE"),
  advancePaidAt: z.string().optional().nullable(), advanceNotes: z.string().trim().max(500).optional().nullable()
});

const numberValue = (value: unknown) => value == null ? 0 : Number(value);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function paymentDate(value?: string | null) {
  if (!value) return limaBusinessDateTimestamp();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function weightedAverageCost(materialId: string) {
  const [row] = await db.select({
    totalQty: sql<string>`coalesce(sum(case when ${stockMovements.quantitySigned} > 0 then ${stockMovements.quantitySigned} else 0 end), 0)`,
    totalCost: sql<string>`coalesce(sum(case when ${stockMovements.quantitySigned} > 0 then ${stockMovements.quantitySigned} * coalesce(${stockMovements.unitCost}, 0) else 0 end), 0)`
  }).from(stockMovements).where(eq(stockMovements.materialId, materialId));
  const qty = numberValue(row?.totalQty);
  return qty > 0 ? numberValue(row?.totalCost) / qty : 0;
}

async function nextOrderNumber(businessId: string) {
  const [row] = await db.select({ maxNumber: sql<number>`coalesce(max(nullif(regexp_replace(${orders.orderNumber}, '[^0-9]', '', 'g'), '')::int), 0)` }).from(orders).where(eq(orders.businessId, businessId));
  return `P-${String(Number(row?.maxNumber ?? 0) + 1).padStart(5, "0")}`;
}

async function loadOrder(businessId: string, id: string) {
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
      estimatedMaterialCost: numberValue(item.estimatedMaterialCost), actualMaterialCost: item.actualMaterialCost == null ? null : numberValue(item.actualMaterialCost),
      estimatedOwnLaborCost: numberValue(item.estimatedOwnLaborCost), actualOwnLaborCost: item.actualOwnLaborCost == null ? null : numberValue(item.actualOwnLaborCost),
      estimatedPackagingCost: numberValue(item.estimatedPackagingCost), actualPackagingCost: item.actualPackagingCost == null ? null : numberValue(item.actualPackagingCost),
      otherEstimatedDirectCost: numberValue(item.otherEstimatedDirectCost), otherActualDirectCost: item.otherActualDirectCost == null ? null : numberValue(item.otherActualDirectCost),
      estimatedEmbroideryCost: itemJobs.reduce((sum, job) => sum + numberValue(job.estimatedCost), 0),
      actualEmbroideryCost: itemJobs.some((job) => job.actualCost != null) ? itemJobs.reduce((sum, job) => sum + numberValue(job.actualCost), 0) : null
    };
  });
  return {
    ...order,
    customer,
    items,
    payments: paymentRows,
    history,
    embroideryJobs: jobs.map((job) => ({ ...job, overdueDays: embroideryOverdueDays(job.expectedReturnDate, job.receivedAt) })),
    financials: calculateOrderFinancials({ agreedTotalPrice: numberValue(order.agreedTotalPrice), payments: paymentRows.map((row) => numberValue(row.amount)), items: costs })
  };
}

export async function handleOrderCreateWithAdvance(request: Request, user: AuthUser): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa cliente, producto, talla, color, precio y adelanto" }, 400);
  const body = parsed.data;
  if (body.advanceAmount > body.agreedTotalPrice) return json({ error: "El adelanto no puede superar el total del pedido" }, 400);
  if (await isArchived(user.businessId, "CUSTOMER", body.customerId)) return json({ error: "El cliente seleccionado fue borrado" }, 409);
  if (await isArchived(user.businessId, "PRODUCT", body.productId)) return json({ error: "El producto seleccionado fue borrado" }, 409);
  const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, body.customerId), eq(customers.businessId, user.businessId))).limit(1);
  if (!customer) return json({ error: "Cliente no encontrado" }, 404);
  const [product] = await db.select().from(products).where(and(eq(products.id, body.productId), eq(products.businessId, user.businessId))).limit(1);
  if (!product) return json({ error: "Producto no encontrado" }, 404);
  const paidAt = body.advanceAmount > 0 ? paymentDate(body.advancePaidAt) : null;
  if (body.advanceAmount > 0 && !paidAt) return json({ error: "Fecha de adelanto inválida" }, 400);

  const plannedFabricQty = product.defaultFabricMaterialId ? await resolveFabricQty(product.id, body.size, product.defaultFabricQtyMeters) : null;
  if (product.defaultFabricMaterialId && plannedFabricQty == null) return json({ error: "Configura el consumo de tela del producto" }, 409);
  const fabricCost = product.defaultFabricMaterialId && plannedFabricQty != null ? (await weightedAverageCost(product.defaultFabricMaterialId)) * plannedFabricQty : 0;
  const closureCost = product.defaultClosureMaterialId ? (await weightedAverageCost(product.defaultClosureMaterialId)) * numberValue(product.defaultClosureQty) : 0;
  const packagingCost = product.defaultPackagingMaterialId ? (await weightedAverageCost(product.defaultPackagingMaterialId)) * numberValue(product.defaultPackagingQty) : 0;
  const orderNumber = await nextOrderNumber(user.businessId);

  const id = await db.transaction(async (tx) => {
    const [order] = await tx.insert(orders).values({
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

    await tx.insert(orderItems).values({
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
    await tx.insert(orderStatusHistory).values({ orderId: order.id, toStatus: "ORDER_RECEIVED", note: "Pedido creado" });
    if (body.advanceAmount > 0 && paidAt) {
      await tx.insert(payments).values({ businessId: user.businessId, orderId: order.id, amount: String(body.advanceAmount), method: body.advanceMethod, paidAt, notes: body.advanceNotes || "Adelanto al crear pedido" });
    }
    return order.id;
  });
  return json(await loadOrder(user.businessId, id), 201);
}
