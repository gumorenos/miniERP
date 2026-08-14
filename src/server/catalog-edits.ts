import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { materials, productSizePrices, products, stockMovements } from "../db/schema";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";

const materialCategories = ["FABRIC", "CLOSURE", "THREAD", "PACKAGING", "OTHER"] as const;
const materialUnits = ["METER", "EACH", "SPOOL", "UNIT"] as const;
const productTypes = ["DRESS", "SKIRT", "JACKET", "PANTS", "SHORTS", "OTHER"] as const;
const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).optional();

const productEditSchema = z.object({
  action: z.literal("update"), id: z.string().uuid(), name: z.string().trim().min(2).max(120), type: z.enum(productTypes),
  baseSalePrice: z.coerce.number().positive(), leadTimeDays: z.coerce.number().int().min(0).max(365),
  defaultFabricMaterialId: nullableUuid, defaultFabricQtyMeters: z.coerce.number().positive().optional().nullable(),
  defaultClosureMaterialId: nullableUuid, defaultClosureQty: z.coerce.number().positive().optional().nullable(),
  defaultPackagingMaterialId: nullableUuid, defaultPackagingQty: z.coerce.number().positive().optional().nullable(),
  defaultEmbroideryCost: z.coerce.number().nonnegative().optional().nullable(), defaultOwnLaborCost: z.coerce.number().nonnegative().optional().nullable(),
  xlAdjustment: z.coerce.number().nonnegative().default(0), xxlAdjustment: z.coerce.number().nonnegative().default(0),
  notes: z.string().trim().max(500).optional().nullable()
});

const materialEditSchema = z.object({
  action: z.literal("update"), id: z.string().uuid(), name: z.string().trim().min(2).max(120), category: z.enum(materialCategories), unit: z.enum(materialUnits),
  color: z.string().trim().max(80).optional().nullable(), minimumStock: z.coerce.number().nonnegative().optional().nullable(), notes: z.string().trim().max(500).optional().nullable()
});

function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
async function businessMaterial(businessId: string, id: string, category?: string) {
  if (await isArchived(businessId, "MATERIAL", id)) return null;
  const [row] = await db.select().from(materials).where(and(eq(materials.id, id), eq(materials.businessId, businessId))).limit(1);
  if (!row || (category && row.category !== category)) return null;
  return row;
}
async function currentQuantity(materialId: string) {
  const [row] = await db.select({ qty: sql<string>`coalesce(sum(${stockMovements.quantitySigned}),0)` }).from(stockMovements).where(eq(stockMovements.materialId, materialId));
  return Number(row?.qty ?? 0);
}

export async function handleCatalogEdit(request: Request, user: AuthUser): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const path = new URL(request.url).pathname;
  const raw = await request.json().catch(() => null) as { action?: unknown } | null;
  if (!raw || raw.action !== "update") return null;

  if (path === "/api/products") {
    const parsed = productEditSchema.safeParse(raw);
    if (!parsed.success) return json({ error: "Revisa los datos del producto" }, 400);
    const body = parsed.data;
    if (await isArchived(user.businessId, "PRODUCT", body.id)) return json({ error: "El producto fue borrado" }, 409);
    const [current] = await db.select().from(products).where(and(eq(products.id, body.id), eq(products.businessId, user.businessId))).limit(1);
    if (!current) return json({ error: "Producto no encontrado" }, 404);

    const fabricId = body.defaultFabricMaterialId || null;
    const closureId = body.defaultClosureMaterialId || null;
    const packagingId = body.defaultPackagingMaterialId || null;
    if (fabricId && !(await businessMaterial(user.businessId, fabricId, "FABRIC"))) return json({ error: "La tela seleccionada no pertenece al negocio o fue borrada" }, 400);
    if (closureId && !(await businessMaterial(user.businessId, closureId, "CLOSURE"))) return json({ error: "El cierre seleccionado no pertenece al negocio o fue borrado" }, 400);
    if (packagingId && !(await businessMaterial(user.businessId, packagingId, "PACKAGING"))) return json({ error: "El empaque seleccionado no pertenece al negocio o fue borrado" }, 400);
    if (fabricId && !body.defaultFabricQtyMeters) return json({ error: "Indica cuánta tela usa la prenda" }, 400);

    await db.transaction(async (tx) => {
      await tx.update(products).set({
        name: body.name, type: body.type, baseSalePrice: String(body.baseSalePrice), leadTimeDays: body.leadTimeDays,
        defaultFabricMaterialId: fabricId, defaultFabricQtyMeters: fabricId ? String(body.defaultFabricQtyMeters) : null,
        defaultClosureMaterialId: closureId, defaultClosureQty: closureId ? String(body.defaultClosureQty ?? 1) : null,
        defaultPackagingMaterialId: packagingId, defaultPackagingQty: packagingId ? String(body.defaultPackagingQty ?? 1) : null,
        defaultEmbroideryCost: body.defaultEmbroideryCost == null ? null : String(body.defaultEmbroideryCost),
        defaultOwnLaborCost: body.defaultOwnLaborCost == null ? null : String(body.defaultOwnLaborCost), notes: body.notes || null, updatedAt: new Date()
      }).where(eq(products.id, current.id));
      await tx.update(productSizePrices).set({ priceAdjustment: String(body.xlAdjustment) }).where(and(eq(productSizePrices.productId, current.id), eq(productSizePrices.size, "XL")));
      await tx.update(productSizePrices).set({ priceAdjustment: String(body.xxlAdjustment) }).where(and(eq(productSizePrices.productId, current.id), eq(productSizePrices.size, "XXL")));
    });
    const [updated] = await db.select().from(products).where(eq(products.id, current.id)).limit(1);
    const sizePrices = await db.select().from(productSizePrices).where(eq(productSizePrices.productId, current.id));
    return json({ ...updated, sizePrices });
  }

  if (path === "/api/materials") {
    const parsed = materialEditSchema.safeParse(raw);
    if (!parsed.success) return json({ error: "Revisa los datos del material" }, 400);
    const body = parsed.data;
    if (await isArchived(user.businessId, "MATERIAL", body.id)) return json({ error: "El material fue borrado" }, 409);
    const [current] = await db.select().from(materials).where(and(eq(materials.id, body.id), eq(materials.businessId, user.businessId))).limit(1);
    if (!current) return json({ error: "Material no encontrado" }, 404);
    if (body.category !== current.category || body.unit !== current.unit) {
      const [movement] = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.materialId, current.id)).limit(1);
      if (movement) return json({ error: "La categoría y unidad no pueden cambiar después de registrar movimientos de stock" }, 409);
    }
    const [updated] = await db.update(materials).set({
      name: body.name, category: body.category, unit: body.unit, color: body.color || null,
      minimumStock: body.minimumStock == null ? null : String(body.minimumStock), updatedAt: new Date()
    }).where(eq(materials.id, current.id)).returning();
    return json({ ...updated, currentQuantity: await currentQuantity(current.id) });
  }

  return null;
}