import { eq } from "drizzle-orm";
import { db, pool } from "./client";
import { businesses, embroideryProviders, materials, productSizePrices, products, purchaseLines, purchases, stockMovements, users } from "./schema";
import { sizes } from "../domain/types";
import { hashPassword } from "../server/auth";

export async function seedDevelopment() {
  if (process.env.NODE_ENV === "production") {
    console.log("Skipping demo seed in production");
    return;
  }

  const email = process.env.APP_USER_EMAIL ?? "admin@example.test";
  const password = process.env.APP_USER_PASSWORD ?? "change-me-dev";
  const businessName = process.env.APP_BUSINESS_NAME ?? "Taller demo";
  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existingUser) {
    if (!existingUser.passwordHash.startsWith("scrypt$")) {
      await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, existingUser.id));
      console.log("Demo user password upgraded to scrypt");
    } else {
      console.log("Demo seed already present");
    }
    return;
  }

  const [business] = await db.insert(businesses).values({ name: businessName }).returning();
  await db.insert(users).values({
    businessId: business.id,
    name: "Usuaria demo",
    email,
    passwordHash: await hashPassword(password),
    active: true
  });

  const [fabric] = await db
    .insert(materials)
    .values({ businessId: business.id, name: "Tela negra demo", category: "FABRIC", unit: "METER", color: "Negro", minimumStock: "2" })
    .returning();
  const [closure] = await db
    .insert(materials)
    .values({ businessId: business.id, name: "Cierre demo", category: "CLOSURE", unit: "EACH", color: "Negro", minimumStock: "5" })
    .returning();
  const [bag] = await db
    .insert(materials)
    .values({ businessId: business.id, name: "Bolsa empaque demo", category: "PACKAGING", unit: "EACH", minimumStock: "10" })
    .returning();

  const [purchase] = await db
    .insert(purchases)
    .values({ businessId: business.id, purchaseDate: new Date().toISOString().slice(0, 10), totalAmount: "375.00", notes: "Datos demo de desarrollo" })
    .returning();
  const lines = await db
    .insert(purchaseLines)
    .values([
      { purchaseId: purchase.id, materialId: fabric.id, quantity: "10", totalCost: "160", unitCost: "16" },
      { purchaseId: purchase.id, materialId: closure.id, quantity: "10", totalCost: "15", unitCost: "1.5" },
      { purchaseId: purchase.id, materialId: bag.id, quantity: "100", totalCost: "200", unitCost: "2" }
    ])
    .returning();
  await db.insert(stockMovements).values(
    lines.map((line) => ({
      businessId: business.id,
      materialId: line.materialId,
      type: "PURCHASE",
      quantitySigned: line.quantity,
      unitCost: line.unitCost,
      purchaseLineId: line.id,
      notes: "Stock inicial demo"
    }))
  );

  const [product] = await db
    .insert(products)
    .values({
      businessId: business.id,
      name: "Vestido basico demo",
      type: "DRESS",
      baseSalePrice: "320",
      defaultFabricMaterialId: fabric.id,
      defaultFabricQtyMeters: "1",
      defaultClosureMaterialId: closure.id,
      defaultClosureQty: "1",
      defaultEmbroideryCost: "80",
      defaultOwnLaborCost: "15",
      defaultPackagingMaterialId: bag.id,
      defaultPackagingQty: "1",
      notes: "Dato demo editable; no es regla de negocio"
    })
    .returning();
  await db.insert(productSizePrices).values(sizes.map((size) => ({ productId: product.id, size, priceAdjustment: "0" })));
  await db.insert(embroideryProviders).values({ businessId: business.id, name: "Bordador demo", notes: "Proveedor demo de desarrollo" });
  console.log("Demo seed created");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDevelopment()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
