import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  captureChannels,
  isCaptureChannel,
  isCapturePaymentMethod,
  isCaptureSize,
  normalizeCaptureText,
  parseCaptureMessage,
  type CapturePayload
} from "../domain/capture";
import { paymentMethods, sizes } from "../domain/types";
import { db } from "../db/client";
import { captureDrafts, customers, productSizePrices, products, materials, suppliers } from "../db/schema";
import type { AuthUser } from "./auth";
import { createOrderRecord, loadOrder, parseOrderCreatePayload, prepareOrderCreate } from "./order-create";
import { type DbTransaction } from "./order-number";
import { createCapturedExpense, createCapturedPurchase, createCapturedStockAdjustment } from "./capture-operations";

const channelSchema = z.enum(captureChannels);
const draftSchema = z.object({
  channel: channelSchema.default("INTERNAL"),
  sourceMessageId: z.string().trim().max(200).optional().nullable(),
  rawText: z.string().trim().min(2).max(4000)
});
const payloadSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: z.string().trim().max(160).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  productId: z.string().uuid().optional(),
  productName: z.string().trim().max(160).optional(),
  materialId: z.string().uuid().optional(),
  materialName: z.string().trim().max(160).optional(),
  supplierId: z.string().uuid().optional(),
  supplierName: z.string().trim().max(160).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  size: z.enum(sizes).optional(),
  color: z.string().trim().max(120).optional(),
  quantity: z.coerce.number().optional(),
  unitCost: z.coerce.number().nonnegative().optional(),
  agreedTotalPrice: z.coerce.number().positive().optional(),
  advanceAmount: z.coerce.number().nonnegative().optional(),
  advanceMethod: z.enum(paymentMethods).optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  promisedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  category: z.string().trim().max(40).optional(),
  orderId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(240).optional(),
  amount: z.coerce.number().positive().optional(),
  deliveryText: z.string().trim().max(80).optional()
});

type CaptureDraftRow = typeof captureDrafts.$inferSelect;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function readJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeDraft(row: CaptureDraftRow) {
  return {
    id: row.id,
    channel: row.channel,
    sourceMessageId: row.sourceMessageId,
    rawText: row.rawText,
    intent: row.intent,
    status: row.status,
    payload: readJson<CapturePayload>(row.payloadJson, {}),
    missingFields: readJson<string[]>(row.missingFieldsJson, []),
    ambiguousFields: readJson<string[]>(row.ambiguousFieldsJson, []),
    parserVersion: row.parserVersion,
    confirmedOrderId: row.confirmedOrderId,
    confirmedEntityType: row.confirmedEntityType,
    confirmedEntityId: row.confirmedEntityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    confirmedAt: row.confirmedAt,
    rejectedAt: row.rejectedAt
  };
}

async function activeCatalog(businessId: string) {
  const [customerRows, productRows, materialRows, supplierRows, archivedRows] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(eq(customers.businessId, businessId)).orderBy(asc(customers.name)),
    db.select({ id: products.id, name: products.name }).from(products).where(and(eq(products.businessId, businessId), eq(products.active, true))).orderBy(asc(products.name)),
    db.select({ id: materials.id, name: materials.name }).from(materials).where(and(eq(materials.businessId, businessId), eq(materials.active, true))).orderBy(asc(materials.name)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(and(eq(suppliers.businessId, businessId), eq(suppliers.active, true))).orderBy(asc(suppliers.name)),
    db.execute(sql`select entity_type, entity_id from deleted_records where business_id=${businessId}::uuid and entity_type in ('CUSTOMER','PRODUCT','MATERIAL','SUPPLIER')`)
  ]);
  const archived = new Set(archivedRows.rows.map((row) => String(row.entity_type) + ":" + String(row.entity_id)));
  return {
    customers: customerRows.filter((row) => !archived.has("CUSTOMER:" + row.id)),
    products: productRows.filter((row) => !archived.has("PRODUCT:" + row.id)),
    materials: materialRows.filter((row) => !archived.has("MATERIAL:" + row.id)),
    suppliers: supplierRows.filter((row) => !archived.has("SUPPLIER:" + row.id))
  };
}

async function getDraft(businessId: string, id: string) {
  const [row] = await db.select().from(captureDrafts).where(and(eq(captureDrafts.businessId, businessId), eq(captureDrafts.id, id))).limit(1);
  return row ?? null;
}

async function lockDraft(transaction: DbTransaction, businessId: string, id: string) {
  const [row] = await transaction.select().from(captureDrafts)
    .where(and(eq(captureDrafts.businessId, businessId), eq(captureDrafts.id, id)))
    .for("update")
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

function resolveByName<T extends { id: string; name: string }>(name: string | undefined, rows: T[]) {
  if (!name) return { row: undefined, ambiguous: false };
  const normalized = normalizeCaptureText(name);
  const matches = rows.filter((row) => normalizeCaptureText(row.name) === normalized || normalizeCaptureText(row.name).includes(normalized) || normalized.includes(normalizeCaptureText(row.name)));
  if (!matches.length) return { row: undefined, ambiguous: false };
  const longest = Math.max(...matches.map((row) => normalizeCaptureText(row.name).length));
  const top = matches.filter((row) => normalizeCaptureText(row.name).length === longest);
  return { row: top.length === 1 ? top[0] : undefined, ambiguous: top.length > 1 };
}

async function orderPayload(payload: CapturePayload, businessId: string) {
  const catalog = await activeCatalog(businessId);
  const customer = payload.customerId
    ? catalog.customers.find((row) => row.id === payload.customerId)
    : resolveByName(payload.customerName, catalog.customers).row;
  const product = payload.productId
    ? catalog.products.find((row) => row.id === payload.productId)
    : resolveByName(payload.productName, catalog.products).row;
  if (!customer) return { error: "Selecciona un cliente válido para confirmar el borrador.", status: 400 as const };
  if (!product) return { error: "Selecciona un producto válido para confirmar el borrador.", status: 400 as const };
  if (!isCaptureSize(payload.size)) return { error: "Selecciona una talla antes de confirmar el borrador.", status: 400 as const };
  if (!payload.color?.trim()) return { error: "Indica un color antes de confirmar el borrador.", status: 400 as const };

  const [productRow] = await db.select().from(products).where(and(eq(products.id, product.id), eq(products.businessId, businessId))).limit(1);
  if (!productRow) return { error: "El producto ya no está disponible.", status: 409 as const };
  const [sizePrice] = await db.select().from(productSizePrices).where(and(eq(productSizePrices.productId, product.id), eq(productSizePrices.size, payload.size))).limit(1);
  const suggestedPrice = Number(sizePrice?.fixedPrice ?? productRow.baseSalePrice) + Number(sizePrice?.priceAdjustment ?? 0);
  const agreedTotalPrice = payload.agreedTotalPrice ?? suggestedPrice;
  if (!Number.isFinite(agreedTotalPrice) || agreedTotalPrice <= 0) return { error: "Indica un precio mayor a cero antes de confirmar.", status: 400 as const };
  const advanceAmount = payload.advanceAmount ?? 0;
  if (advanceAmount > agreedTotalPrice) return { error: "El adelanto no puede superar el precio del pedido.", status: 400 as const };
  const advanceMethod = payload.advanceMethod && isCapturePaymentMethod(payload.advanceMethod) ? payload.advanceMethod : "YAPE";

  return {
    payload: {
      customerId: customer.id,
      productId: product.id,
      size: payload.size,
      color: payload.color.trim(),
      quantity: payload.quantity ?? 1,
      agreedTotalPrice,
      promisedDeliveryDate: payload.promisedDeliveryDate ?? null,
      advanceAmount,
      advanceMethod,
      advancePaidAt: null,
      notes: payload.description ?? null
    }
  };
}

async function operationPayload(payload: CapturePayload, intent: string, businessId: string) {
  const catalog = await activeCatalog(businessId);
  if (intent === "NEW_PURCHASE") {
    const material = payload.materialId
      ? catalog.materials.find((row) => row.id === payload.materialId)
      : resolveByName(payload.materialName, catalog.materials).row;
    if (!material) return { error: "Selecciona un material válido antes de confirmar la compra.", status: 400 as const };
    const supplier = payload.supplierId
      ? catalog.suppliers.find((row) => row.id === payload.supplierId)
      : resolveByName(payload.supplierName, catalog.suppliers).row;
    if (payload.supplierId && !supplier) return { error: "Selecciona un proveedor válido o deja el campo vacío.", status: 400 as const };
    const quantity = Number(payload.quantity);
    const totalCost = payload.amount == null && payload.unitCost != null ? quantity * Number(payload.unitCost) : Number(payload.amount);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Indica una cantidad mayor a cero para la compra.", status: 400 as const };
    if (!Number.isFinite(totalCost) || totalCost <= 0) return { error: "Indica un costo total mayor a cero para la compra.", status: 400 as const };
    return {
      kind: "PURCHASE" as const,
      input: {
        materialId: material.id,
        quantity,
        totalCost,
        purchaseDate: payload.operationDate ?? null,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? payload.supplierName ?? null,
        paymentMethod: payload.paymentMethod ?? null,
        notes: payload.description ?? null
      }
    };
  }

  if (intent === "NEW_EXPENSE") {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Indica un importe mayor a cero para el gasto.", status: 400 as const };
    if (!payload.description?.trim()) return { error: "Describe el gasto antes de confirmar.", status: 400 as const };
    return {
      kind: "EXPENSE" as const,
      input: {
        expenseDate: payload.operationDate ?? null,
        category: payload.category ?? "OTHER",
        description: payload.description,
        amount,
        paymentMethod: payload.paymentMethod ?? null,
        orderId: payload.orderId ?? null,
        notes: null
      }
    };
  }

  const material = payload.materialId
    ? catalog.materials.find((row) => row.id === payload.materialId)
    : resolveByName(payload.materialName, catalog.materials).row;
  if (!material) return { error: "Selecciona un material válido antes de confirmar el ajuste.", status: 400 as const };
  const quantity = Number(payload.quantity);
  if (!Number.isFinite(quantity) || Math.abs(quantity) <= 0.0001) return { error: "Indica un ajuste distinto de cero.", status: 400 as const };
  if (!payload.description?.trim()) return { error: "Indica el motivo del ajuste antes de confirmar.", status: 400 as const };
  return {
    kind: "STOCK_ADJUSTMENT" as const,
    input: {
      materialId: material.id,
      quantity,
      unitCost: payload.unitCost ?? null,
      notes: payload.description
    }
  };
}

export async function createCaptureDraft(request: Request, user: AuthUser) {
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Escribe un mensaje de al menos 2 caracteres." }, 400);
  const body = parsed.data;
  const channel = body.channel;
  if (!isCaptureChannel(channel)) return json({ error: "Canal de captura inválido." }, 400);

  if (body.sourceMessageId) {
    const [existing] = await db.select().from(captureDrafts).where(and(
      eq(captureDrafts.businessId, user.businessId),
      eq(captureDrafts.channel, channel),
      eq(captureDrafts.sourceMessageId, body.sourceMessageId)
    )).limit(1);
    if (existing) return json({ duplicate: true, draft: serializeDraft(existing) });
  }

  const catalog = await activeCatalog(user.businessId);
  const parsedMessage = parseCaptureMessage(body.rawText, catalog);
  let created: CaptureDraftRow | undefined;
  try {
    [created] = await db.insert(captureDrafts).values({
      businessId: user.businessId,
      createdByUserId: user.id,
      channel,
      sourceMessageId: body.sourceMessageId || null,
      rawText: body.rawText,
      intent: parsedMessage.intent,
      status: "PENDING",
      payloadJson: JSON.stringify(parsedMessage.payload),
      missingFieldsJson: JSON.stringify(parsedMessage.missingFields),
      ambiguousFieldsJson: JSON.stringify(parsedMessage.ambiguousFields),
      parserVersion: parsedMessage.parserVersion
    }).returning();
  } catch (error) {
    if (!body.sourceMessageId || !isUniqueViolation(error)) throw error;
    const [existing] = await db.select().from(captureDrafts).where(and(
      eq(captureDrafts.businessId, user.businessId),
      eq(captureDrafts.channel, channel),
      eq(captureDrafts.sourceMessageId, body.sourceMessageId)
    )).limit(1);
    if (!existing) throw error;
    return json({ duplicate: true, draft: serializeDraft(existing) });
  }
  if (!created) throw new Error("No se pudo crear el borrador");
  return json({ duplicate: false, draft: serializeDraft(created) }, 201);
}

export async function listCaptureDrafts(user: AuthUser) {
  const rows = await db.select().from(captureDrafts)
    .where(eq(captureDrafts.businessId, user.businessId))
    .orderBy(desc(captureDrafts.createdAt))
    .limit(30);
  return json({ rows: rows.map(serializeDraft) });
}

export async function confirmCaptureDraft(request: Request, user: AuthUser, id: string) {
  const draft = await getDraft(user.businessId, id);
  if (!draft) return json({ error: "Borrador no encontrado." }, 404);
  if (draft.status !== "PENDING") {
    if (draft.status === "CONFIRMED" && draft.confirmedOrderId) {
      const order = await loadOrder(user.businessId, draft.confirmedOrderId);
      if (order) return json({ duplicate: true, draft: serializeDraft(draft), order });
    }
    return json({ error: "Este borrador ya fue procesado.", code: "CAPTURE_DRAFT_PROCESSED" }, 409);
  }
  const body = await request.json().catch(() => null) as { payload?: unknown } | null;
  const payload = payloadSchema.safeParse(body?.payload ?? readJson<CapturePayload>(draft.payloadJson, {}));
  if (!payload.success) return json({ error: "Revisa los datos del borrador antes de confirmar." }, 400);

  if (draft.intent === "NEW_ORDER") {
    const prepared = await orderPayload(payload.data, user.businessId);
    if ("error" in prepared) return json({ error: prepared.error }, prepared.status);
    const orderInput = parseOrderCreatePayload(prepared.payload);
    if (!orderInput.success) return json({ error: "Revisa los datos del pedido antes de confirmar." }, 400);
    const preparedOrder = await prepareOrderCreate(orderInput.data, user);
    if ("error" in preparedOrder) return json({ error: preparedOrder.error }, preparedOrder.status);
    const result = await db.transaction(async (tx) => {
      const locked = await lockDraft(tx, user.businessId, id);
      if (!locked) return { kind: "missing" as const };
      if (locked.status !== "PENDING") return { kind: "processed" as const, draft: locked };
      const orderId = await createOrderRecord(tx, user, preparedOrder);
      const [updated] = await tx.update(captureDrafts).set({
        status: "CONFIRMED",
        payloadJson: JSON.stringify({ ...payload.data, ...prepared.payload }),
        missingFieldsJson: "[]",
        ambiguousFieldsJson: "[]",
        confirmedOrderId: orderId,
        confirmedEntityType: "ORDER",
        confirmedEntityId: orderId,
        confirmedAt: new Date(),
        updatedAt: new Date()
      }).where(and(eq(captureDrafts.id, id), eq(captureDrafts.businessId, user.businessId), eq(captureDrafts.status, "PENDING"))).returning();
      if (!updated) throw new Error("No se pudo confirmar el borrador");
      return { kind: "confirmed" as const, draft: updated, orderId };
    });
    if (result.kind === "missing") return json({ error: "Borrador no encontrado." }, 404);
    if (result.kind === "processed") {
      if (result.draft.status === "CONFIRMED" && result.draft.confirmedOrderId) {
        const order = await loadOrder(user.businessId, result.draft.confirmedOrderId);
        if (order) return json({ duplicate: true, draft: serializeDraft(result.draft), order });
      }
      return json({ error: "Este borrador ya fue procesado.", code: "CAPTURE_DRAFT_PROCESSED" }, 409);
    }
    const order = await loadOrder(user.businessId, result.orderId);
    return json({ draft: serializeDraft(result.draft), order }, 201);
  }

  if (draft.intent === "NEW_CUSTOMER") {
    const name = payload.data.name?.trim();
    if (!name) return json({ error: "Indica el nombre del cliente antes de confirmar." }, 400);
    const result = await db.transaction(async (tx) => {
      const locked = await lockDraft(tx, user.businessId, id);
      if (!locked) return { kind: "missing" as const };
      if (locked.status !== "PENDING") return { kind: "processed" as const, draft: locked };
      const [customer] = await tx.insert(customers).values({
        businessId: user.businessId,
        name,
        phone: payload.data.phone?.trim() || null
      }).returning();
      const [updated] = await tx.update(captureDrafts).set({
        status: "CONFIRMED",
        payloadJson: JSON.stringify(payload.data),
        missingFieldsJson: "[]",
        ambiguousFieldsJson: "[]",
        confirmedEntityType: "CUSTOMER",
        confirmedEntityId: customer.id,
        confirmedAt: new Date(),
        updatedAt: new Date()
      }).where(and(eq(captureDrafts.id, id), eq(captureDrafts.businessId, user.businessId), eq(captureDrafts.status, "PENDING"))).returning();
      if (!updated) throw new Error("No se pudo confirmar el borrador");
      return { kind: "confirmed" as const, draft: updated, customer };
    });
    if (result.kind === "missing") return json({ error: "Borrador no encontrado." }, 404);
    if (result.kind === "processed") return json({ error: "Este borrador ya fue procesado.", code: "CAPTURE_DRAFT_PROCESSED" }, 409);
    return json({ draft: serializeDraft(result.draft), customer: result.customer }, 201);
  }

  if (["NEW_PURCHASE", "NEW_EXPENSE", "STOCK_ADJUSTMENT"].includes(draft.intent)) {
    const prepared = await operationPayload(payload.data, draft.intent, user.businessId);
    if ("error" in prepared) return json({ error: prepared.error }, prepared.status);
    const result = await db.transaction(async (tx) => {
      const locked = await lockDraft(tx, user.businessId, id);
      if (!locked) return { kind: "missing" as const };
      if (locked.status !== "PENDING") return { kind: "processed" as const, draft: locked };

      const operation = prepared.kind === "PURCHASE"
        ? await createCapturedPurchase(tx, user.businessId, prepared.input)
        : prepared.kind === "EXPENSE"
          ? await createCapturedExpense(tx, user.businessId, prepared.input)
          : await createCapturedStockAdjustment(tx, user.businessId, prepared.input);
      if (!operation.ok) return { kind: "failure" as const, error: operation.error, status: operation.status };

      const [updated] = await tx.update(captureDrafts).set({
        status: "CONFIRMED",
        payloadJson: JSON.stringify(payload.data),
        missingFieldsJson: "[]",
        ambiguousFieldsJson: "[]",
        confirmedEntityType: operation.entityType,
        confirmedEntityId: operation.entityId,
        confirmedAt: new Date(),
        updatedAt: new Date()
      }).where(and(eq(captureDrafts.id, id), eq(captureDrafts.businessId, user.businessId), eq(captureDrafts.status, "PENDING"))).returning();
      if (!updated) throw new Error("No se pudo confirmar el borrador");
      return { kind: "confirmed" as const, draft: updated, operation };
    });
    if (result.kind === "missing") return json({ error: "Borrador no encontrado." }, 404);
    if (result.kind === "failure") return json({ error: result.error }, result.status);
    if (result.kind === "processed") return json({ error: "Este borrador ya fue procesado.", code: "CAPTURE_DRAFT_PROCESSED" }, 409);
    return json({ draft: serializeDraft(result.draft), confirmed: result.operation }, 201);
  }

  return json({ error: "Esta captura ya reconoce la intención, pero todavía no confirma ese tipo de operación." }, 422);
}

export async function rejectCaptureDraft(user: AuthUser, id: string) {
  const [updated] = await db.update(captureDrafts).set({ status: "REJECTED", rejectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(captureDrafts.id, id), eq(captureDrafts.businessId, user.businessId), eq(captureDrafts.status, "PENDING")))
    .returning();
  if (!updated) {
    const draft = await getDraft(user.businessId, id);
    if (!draft) return json({ error: "Borrador no encontrado." }, 404);
    return json({ error: "Este borrador ya fue procesado.", code: "CAPTURE_DRAFT_PROCESSED" }, 409);
  }
  return json({ draft: serializeDraft(updated) });
}
