import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { stockMovements } from "../db/schema";
import { toNumber } from "../domain/money";

export async function weightedAverageCost(materialId: string) {
  const [row] = await db.select({
    totalQty: sql<string>`coalesce(sum(case when ${stockMovements.quantitySigned} > 0 then ${stockMovements.quantitySigned} else 0 end), 0)`,
    totalCost: sql<string>`coalesce(sum(case when ${stockMovements.quantitySigned} > 0 then ${stockMovements.quantitySigned} * coalesce(${stockMovements.unitCost}, 0) else 0 end), 0)`
  }).from(stockMovements).where(eq(stockMovements.materialId, materialId));
  const quantity = toNumber(row?.totalQty);
  return quantity > 0 ? toNumber(row?.totalCost) / quantity : 0;
}
