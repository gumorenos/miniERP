import { and, eq, sql } from "drizzle-orm";
import { materials, expenses, orders, purchaseLines, purchases, stockMovements, suppliers } from "../db/schema";
import { limaBusinessDate } from "../domain/workshop";
import type { DbTransaction } from "./order-number";

export type CapturedPurchaseInput = {
  materialId: string;
  quantity: number;
  totalCost: number;
  purchaseDate?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
};

export type CapturedExpenseInput = {
  expenseDate?: string | null;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  orderId?: string | null;
  notes?: string | null;
};

export type CapturedStockAdjustmentInput = {
  materialId: string;
  quantity: number;
  unitCost?: number | null;
  notes: string;
};

export type CaptureOperationFailure = { ok: false; error: string; status: 400 | 404 | 409 };
export type CaptureOperationSuccess = { ok: true; entityType: "PURCHASE" | "EXPENSE" | "STOCK_MOVEMENT"; entityId: string };
export type CaptureOperationResult = CaptureOperationFailure | CaptureOperationSuccess;

const expenseCategories = new Set(["EMBROIDERY", "TRANSPORT", "PACKAGING", "TOOLS", "SERVICES", "MARKETING", "OTHER"]);

async function archived(tx: DbTransaction, businessId: string, entityType: string, entityId: string) {
  const result = await tx.execute(sql`select 1 from deleted_records where business_id=${businessId}::uuid and entity_type=${entityType} and entity_id=${entityId}::uuid limit 1`);
  return result.rows.length > 0;
}

async function activeMaterial(tx: DbTransaction, businessId: string, materialId: string) {
  if (await archived(tx, businessId, "MATERIAL", materialId)) return null;
  const [material] = await tx.select({ id: materials.id }).from(materials).where(and(
    eq(materials.id, materialId),
    eq(materials.businessId, businessId),
    eq(materials.active, true)
  )).limit(1);
  return material ?? null;
}

async function activeSupplier(tx: DbTransaction, businessId: string, supplierId: string) {
  if (await archived(tx, businessId, "SUPPLIER", supplierId)) return null;
  const [supplier] = await tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(and(
    eq(suppliers.id, supplierId),
    eq(suppliers.businessId, businessId),
    eq(suppliers.active, true)
  )).limit(1);
  return supplier ?? null;
}

export async function createCapturedPurchase(tx: DbTransaction, businessId: string, input: CapturedPurchaseInput): Promise<CaptureOperationResult> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.totalCost) || input.totalCost <= 0) {
    return { ok: false, error: "La compra necesita una cantidad y un costo total mayores a cero.", status: 400 };
  }
  const material = await activeMaterial(tx, businessId, input.materialId);
  if (!material) return { ok: false, error: "El material ya no está disponible.", status: 409 };
  const supplier = input.supplierId ? await activeSupplier(tx, businessId, input.supplierId) : null;
  if (input.supplierId && !supplier) return { ok: false, error: "El proveedor ya no está disponible.", status: 409 };

  const [purchase] = await tx.insert(purchases).values({
    businessId,
    purchaseDate: input.purchaseDate || limaBusinessDate(),
    supplierId: supplier?.id ?? null,
    supplierName: supplier?.name ?? (input.supplierName?.trim() || null),
    totalAmount: String(input.totalCost),
    paymentMethod: input.paymentMethod?.trim() || null,
    notes: input.notes?.trim() || null
  }).returning({ id: purchases.id, supplierName: purchases.supplierName });
  const unitCost = input.totalCost / input.quantity;
  const [line] = await tx.insert(purchaseLines).values({
    purchaseId: purchase.id,
    materialId: material.id,
    quantity: String(input.quantity),
    totalCost: String(input.totalCost),
    unitCost: String(unitCost)
  }).returning({ id: purchaseLines.id });
  await tx.insert(stockMovements).values({
    businessId,
    materialId: material.id,
    type: "PURCHASE",
    quantitySigned: String(input.quantity),
    unitCost: String(unitCost),
    purchaseLineId: line.id,
    notes: purchase.supplierName ? `Compra a ${purchase.supplierName}` : "Compra de material"
  });
  return { ok: true, entityType: "PURCHASE", entityId: purchase.id };
}

export async function createCapturedExpense(tx: DbTransaction, businessId: string, input: CapturedExpenseInput): Promise<CaptureOperationResult> {
  if (!expenseCategories.has(input.category)) return { ok: false, error: "La categoría del gasto no es válida.", status: 400 };
  if (input.description.trim().length < 2 || !Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "El gasto necesita una descripción y un importe mayores a cero.", status: 400 };
  }
  if (input.orderId) {
    const [order] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.id, input.orderId), eq(orders.businessId, businessId))).limit(1);
    if (!order) return { ok: false, error: "El pedido asociado no pertenece al negocio.", status: 400 };
  }
  const [expense] = await tx.insert(expenses).values({
    businessId,
    expenseDate: input.expenseDate || limaBusinessDate(),
    category: input.category,
    description: input.description.trim(),
    amount: String(input.amount),
    paymentMethod: input.paymentMethod?.trim() || null,
    orderId: input.orderId || null,
    notes: input.notes?.trim() || null
  }).returning({ id: expenses.id });
  return { ok: true, entityType: "EXPENSE", entityId: expense.id };
}

export async function createCapturedStockAdjustment(tx: DbTransaction, businessId: string, input: CapturedStockAdjustmentInput): Promise<CaptureOperationResult> {
  if (!Number.isFinite(input.quantity) || Math.abs(input.quantity) <= 0.0001 || input.notes.trim().length < 2) {
    return { ok: false, error: "El ajuste necesita una cantidad distinta de cero y un motivo.", status: 400 };
  }
  const material = await activeMaterial(tx, businessId, input.materialId);
  if (!material) return { ok: false, error: "El material ya no está disponible.", status: 409 };

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${material.id}))`);
  const [current] = await tx.select({ quantity: sql<string>`coalesce(sum(${stockMovements.quantitySigned}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.businessId, businessId), eq(stockMovements.materialId, material.id)));
  const projected = Number(current?.quantity ?? 0) + input.quantity;
  if (projected < -0.0001) return { ok: false, error: "El ajuste dejaría el inventario negativo.", status: 409 };

  const [movement] = await tx.insert(stockMovements).values({
    businessId,
    materialId: material.id,
    type: "MANUAL_ADJUSTMENT",
    quantitySigned: String(input.quantity),
    unitCost: input.unitCost == null ? null : String(input.unitCost),
    notes: input.notes.trim()
  }).returning({ id: stockMovements.id });
  return { ok: true, entityType: "STOCK_MOVEMENT", entityId: movement.id };
}
