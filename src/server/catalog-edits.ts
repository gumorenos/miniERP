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

const materialEditSchema = z.object({
  action: z.literal("update"), id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  category: z.enum(materialCategories).optional(), unit: z.enum(materialUnits).optional(),
  color: z.string().trim().max(80).optional().nullable(),
  minimumStock: z.coerce.number().nonnegative().optional().nullable()
});

const productEditSchema = z.object({
  action: z.literal("update"), id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(), type: z.enum(productTypes).optional(),
  baseSalePrice: z.coerce.number().positive().optional(), leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  defaultFabricMaterialId: nullableUuid, defaultFabricQtyMeters: z.coerce.number().positive().optional().nullable(),
  defaultClosureMaterialId: nullableUuid, defaultClosureQty: z.coerce.number().positive().optional().nullable(),
  defaultEmbroideryCost: z.coerce.number().nonnegative().optional().nullable(),
  defaultOwnLaborCost: z.coerce.number().nonnegative().optional().nullable(),
  defaultPackagingMaterialId: nullableUuid, defaultPackagingQty: z.coerce.number().positive().optional().nullable(),
  xlAdjustment: z.coerce.number().nonnegative().optional(), xxlAdjustment: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional().nullable()
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function businessMaterial(businessId: string, id: string, category?: string) {
  if (await isArchived(businessId, "MATERIAL", id)) return null;
  const [row] = await db.select().from(materials).where(and(eq(materials.id, id), eq(materials.businessId, businessId))).limit(1);
  return row && (!category || row.category === category) ? row : null;
}

export async function handleCatalogEdit(request: Request, user: AuthUser): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { action?: unknown }).action !== "update") return null;

  if (path === "/api/materials") {
    const parsed = materialEditSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Revisa los datos del material" }, 400);
    if (await isArchived(user.businessId, "MATERIAL", parsed.data.id)) return json({ error: "El material fue borrado" }, 409);
    const current = await businessMaterial(user.businessId, parsed.data.id);
    if (!current) return json({ error: "Material no encontrado" }, 404);
    if ((parsed.data.category && parsed.data.category !== current.category) || (parsed.data.unit && parsed.data.unit !== current.unit)) {
      const [usage] = await db.select({ count: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.materialId, current.id));
      if (Number(usage?.count ?? 0) > 0) return json({ error: "Categoría y unidad no pueden cambiarse después de registrar stock" }, 409);
    }
    const [updated] = await db.update(materials).set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.unit !== undefined ? { unit: parsed.data.unit } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
      ...(parsed.data.minimumStock !== undefined ? { minimumStock: parsed.data.minimumStock == null ? null : String(parsed.data.minimumStock) } : {}),
      updatedAt: new Date()
    }).where(eq(materials.id, current.id)).returning();
    return json(updated);
  }

  if (path === "/api/products") {
    const parsed = productEditSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Revisa los datos del producto" }, 400);
    if (await isArchived(user.businessId, "PRODUCT", parsed.data.id)) return json({ error: "El producto fue borrado" }, 409);
    const [current] = await db.select().from(products).where(and(eq(products.id, parsed.data.id), eq(products.businessId, user.businessId))).limit(1);
    if (!current) return json({ error: "Producto no encontrado" }, 404);
    const fabricId = parsed.data.defaultFabricMaterialId !== undefined ? parsed.data.defaultFabricMaterialId || null : current.defaultFabricMaterialId;
    const closureId = parsed.data.defaultClosureMaterialId !== undefined ? parsed.data.defaultClosureMaterialId || null : current.defaultClosureMaterialId;
    const packagingId = parsed.data.defaultPackagingMaterialId !== undefined ? parsed.data.defaultPackagingMaterialId || null : current.defaultPackagingMaterialId;
    if (fabricId && !(await businessMaterial(user.businessId, fabricId, "FABRIC"))) return json({ error: "Tela inválida o borrada" }, 400);
    if (closureId && !(await businessMaterial(user.businessId, closureId, "CLOSURE"))) return json({ error: "Cierre inválido o borrado" }, 400);
    if (packagingId && !(await businessMaterial(user.businessId, packagingId, "PACKAGING"))) return json({ error: "Empaque inválido o borrado" }, 400);
    const fabricQty = parsed.data.defaultFabricQtyMeters !== undefined ? parsed.data.defaultFabricQtyMeters : current.defaultFabricQtyMeters == null ? null : Number(current.defaultFabricQtyMeters);
    if (fabricId && !fabricQty) return json({ error: "Indica cuánta tela usa la prenda" }, 400);
    const [updated] = await db.update(products).set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.baseSalePrice !== undefined ? { baseSalePrice: String(parsed.data.baseSalePrice) } : {}),
      ...(parsed.data.leadTimeDays !== undefined ? { leadTimeDays: parsed.data.leadTimeDays } : {}),
      ...(parsed.data.defaultFabricMaterialId !== undefined ? { defaultFabricMaterialId: fabricId } : {}),
      ...(parsed.data.defaultFabricQtyMeters !== undefined ? { defaultFabricQtyMeters: parsed.data.defaultFabricQtyMeters == null ? null : String(parsed.data.defaultFabricQtyMeters) } : {}),
      ...(parsed.data.defaultClosureMaterialId !== undefined ? { defaultClosureMaterialId: closureId } : {}),
      ...(parsed.data.defaultClosureQty !== undefined ? { defaultClosureQty: parsed.data.defaultClosureQty == null ? null : String(parsed.data.defaultClosureQty) } : {}),
      ...(parsed.data.defaultEmbroideryCost !== undefined ? { defaultEmbroideryCost: parsed.data.defaultEmbroideryCost == null ? null : String(parsed.data.defaultEmbroideryCost) } : {}),
      ...(parsed.data.defaultOwnLaborCost !== undefined ? { defaultOwnLaborCost: parsed.data.defaultOwnLaborCost == null ? null : String(parsed.data.defaultOwnLaborCost) } : {}),
      ...(parsed.data.defaultPackagingMaterialId !== undefined ? { defaultPackagingMaterialId: packagingId } : {}),
      ...(parsed.data.defaultPackagingQty !== undefined ? { defaultPackagingQty: parsed.data.defaultPackagingQty == null ? null : String(parsed.data.defaultPackagingQty) } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
      updatedAt: new Date()
    }).where(eq(products.id, current.id)).returning();
    if (parsed.data.xlAdjustment !== undefined) await db.update(productSizePrices).set({ priceAdjustment: String(parsed.data.xlAdjustment) }).where(and(eq(productSizePrices.productId, current.id), eq(productSizePrices.size, "XL")));
    if (parsed.data.xxlAdjustment !== undefined) await db.update(productSizePrices).set({ priceAdjustment: String(parsed.data.xxlAdjustment) }).where(and(eq(productSizePrices.productId, current.id), eq(productSizePrices.size, "XXL")));
    const sizePrices = await db.select().from(productSizePrices).where(eq(productSizePrices.productId, current.id));
    return json({ ...updated, sizePrices });
  }

  return null;
}
