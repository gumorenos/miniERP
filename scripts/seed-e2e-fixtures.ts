import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import {
  embroideryProviders,
  materials,
  orders,
  productSizePrices,
  products,
  purchaseLines,
  purchases,
  stockMovements,
  users
} from "../src/db/schema";
import { sizes } from "../src/domain/types";

const REQUIRED_CONFIRMATION = "isolated-qa-db";

async function main() {
  if (process.env.E2E_FIXTURES_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Refusing to create E2E fixtures. Set E2E_FIXTURES_CONFIRM=${REQUIRED_CONFIRMATION} only for an isolated disposable QA database.`
    );
  }

  const email = process.env.APP_USER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("APP_USER_EMAIL is required to locate the QA business");

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error(`QA user ${email} does not exist; run bootstrap-user first`);

  const [existingProducts, existingMaterials, existingOrders] = await Promise.all([
    db.select({ id: products.id }).from(products).where(eq(products.businessId, user.businessId)).limit(1),
    db.select({ id: materials.id }).from(materials).where(eq(materials.businessId, user.businessId)).limit(1),
    db.select({ id: orders.id }).from(orders).where(eq(orders.businessId, user.businessId)).limit(1)
  ]);

  if (existingProducts.length || existingMaterials.length || existingOrders.length) {
    throw new Error("Refusing to seed E2E fixtures into a non-empty business database");
  }

  await db.transaction(async (tx) => {
    const [fabric] = await tx
      .insert(materials)
      .values({
        businessId: user.businessId,
        name: "Tela negra E2E",
        category: "FABRIC",
        unit: "METER",
        color: "Negro",
        minimumStock: "2"
      })
      .returning();
    const [closure] = await tx
      .insert(materials)
      .values({
        businessId: user.businessId,
        name: "Cierre E2E",
        category: "CLOSURE",
        unit: "EACH",
        color: "Negro",
        minimumStock: "5"
      })
      .returning();
    const [bag] = await tx
      .insert(materials)
      .values({
        businessId: user.businessId,
        name: "Bolsa empaque E2E",
        category: "PACKAGING",
        unit: "EACH",
        minimumStock: "10"
      })
      .returning();

    const [purchase] = await tx
      .insert(purchases)
      .values({
        businessId: user.businessId,
        purchaseDate: new Date().toISOString().slice(0, 10),
        totalAmount: "375.00",
        notes: "Fixtures E2E desechables; no usar como datos reales"
      })
      .returning();

    const lines = await tx
      .insert(purchaseLines)
      .values([
        { purchaseId: purchase.id, materialId: fabric.id, quantity: "10", totalCost: "160", unitCost: "16" },
        { purchaseId: purchase.id, materialId: closure.id, quantity: "10", totalCost: "15", unitCost: "1.5" },
        { purchaseId: purchase.id, materialId: bag.id, quantity: "100", totalCost: "200", unitCost: "2" }
      ])
      .returning();

    await tx.insert(stockMovements).values(
      lines.map((line) => ({
        businessId: user.businessId,
        materialId: line.materialId,
        type: "PURCHASE",
        quantitySigned: line.quantity,
        unitCost: line.unitCost,
        purchaseLineId: line.id,
        notes: "Stock E2E"
      }))
    );

    const [product] = await tx
      .insert(products)
      .values({
        businessId: user.businessId,
        name: "Vestido basico E2E",
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
        notes: "Fixture E2E desechable"
      })
      .returning();

    await tx.insert(productSizePrices).values(
      sizes.map((size) => ({ productId: product.id, size, priceAdjustment: "0" }))
    );

    await tx.insert(embroideryProviders).values({
      businessId: user.businessId,
      name: "Bordador E2E",
      notes: "Fixture E2E desechable"
    });
  });

  console.log(`E2E fixtures created for ${email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
