import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses, products } from "./schema";

export const finishedStockMovements = pgTable("finished_stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  size: text("size").notNull(),
  color: text("color").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  type: text("type").notNull(),
  quantitySigned: integer("quantity_signed").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  notes: text("notes")
});
