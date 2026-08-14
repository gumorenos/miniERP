import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { products } from "../db/schema";
import { sizes } from "../domain/types";
import type { AuthUser } from "./auth";
import { isArchived } from "./record-archive";

const quantitiesSchema = z.object({
  productId: z.string().uuid(),
  quantities: z.record(z.enum(sizes), z.union([z.coerce.number().positive(), z.null()])).partial()
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function listSizeConsumption(user: AuthUser) {
  const result = await db.execute(sql`
    select psp.product_id, psp.size, psp.fabric_qty_meters
    from product_size_prices psp
    join products p on p.id = psp.product_id
    where p.business_id = ${user.businessId}::uuid
      and not exists (
        select 1 from deleted_records d
        where d.business_id = p.business_id and d.entity_type = 'PRODUCT' and d.entity_id = p.id
      )
    order by p.name, psp.size
  `);
  return json({
    rows: result.rows.map((row) => ({
      productId: String(row.product_id),
      size: String(row.size),
      fabricQtyMeters: row.fabric_qty_meters == null ? null : Number(row.fabric_qty_meters)
    }))
  });
}

export async function saveSizeConsumption(request: Request, user: AuthUser) {
  const parsed = quantitiesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa el producto y los consumos por talla" }, 400);
  if (await isArchived(user.businessId, "PRODUCT", parsed.data.productId)) return json({ error: "El producto fue borrado" }, 409);
  const [product] = await db.select().from(products).where(and(eq(products.id, parsed.data.productId), eq(products.businessId, user.businessId))).limit(1);
  if (!product) return json({ error: "Producto no encontrado" }, 404);
  if (!product.defaultFabricMaterialId) return json({ error: "Asigna primero una tela habitual al producto" }, 409);

  await db.transaction(async (tx) => {
    for (const size of sizes) {
      if (!(size in parsed.data.quantities)) continue;
      const quantity = parsed.data.quantities[size];
      await tx.execute(sql`
        update product_size_prices
        set fabric_qty_meters = ${quantity == null ? null : String(quantity)}::numeric
        where product_id = ${product.id}::uuid and size = ${size}
      `);
    }
  });
  return listSizeConsumption(user);
}

export async function resolveFabricQty(productId: string, size: string, fallback: string | null) {
  const result = await db.execute(sql`
    select fabric_qty_meters
    from product_size_prices
    where product_id = ${productId}::uuid and size = ${size}
    limit 1
  `);
  const value = result.rows[0]?.fabric_qty_meters;
  return value == null ? (fallback == null ? null : Number(fallback)) : Number(value);
}
