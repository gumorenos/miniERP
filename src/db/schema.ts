import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ...timestamps
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps
});

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone"),
  instagramHandle: text("instagram_handle"),
  notes: text("notes"),
  ...timestamps
});

export const materials = pgTable("materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  color: text("color"),
  minimumStock: numeric("minimum_stock", { precision: 12, scale: 3 }),
  active: boolean("active").default(true).notNull(),
  ...timestamps
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  baseSalePrice: numeric("base_sale_price", { precision: 12, scale: 2 }).notNull(),
  leadTimeDays: integer("lead_time_days").default(25).notNull(),
  defaultFabricMaterialId: uuid("default_fabric_material_id").references(() => materials.id),
  defaultFabricQtyMeters: numeric("default_fabric_qty_meters", { precision: 12, scale: 3 }),
  defaultClosureMaterialId: uuid("default_closure_material_id").references(() => materials.id),
  defaultClosureQty: numeric("default_closure_qty", { precision: 12, scale: 3 }),
  defaultEmbroideryCost: numeric("default_embroidery_cost", { precision: 12, scale: 2 }),
  defaultOwnLaborCost: numeric("default_own_labor_cost", { precision: 12, scale: 2 }),
  defaultPackagingMaterialId: uuid("default_packaging_material_id").references(() => materials.id),
  defaultPackagingQty: numeric("default_packaging_qty", { precision: 12, scale: 3 }),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  ...timestamps
});

export const productSizePrices = pgTable(
  "product_size_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    priceAdjustment: numeric("price_adjustment", { precision: 12, scale: 2 }).default("0").notNull(),
    fixedPrice: numeric("fixed_price", { precision: 12, scale: 2 }),
    fabricQtyMeters: numeric("fabric_qty_meters", { precision: 12, scale: 3 })
  },
  (table) => [unique().on(table.productId, table.size)]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    orderNumber: text("order_number").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    orderDate: date("order_date").notNull(),
    promisedDeliveryDate: date("promised_delivery_date"),
    fulfillmentType: text("fulfillment_type").notNull(),
    status: text("status").notNull(),
    agreedTotalPrice: numeric("agreed_total_price", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [unique().on(table.businessId, table.orderNumber), index("orders_business_status_idx").on(table.businessId, table.status)]
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  size: text("size").notNull(),
  color: text("color").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  agreedUnitPrice: numeric("agreed_unit_price", { precision: 12, scale: 2 }).notNull(),
  fabricMaterialId: uuid("fabric_material_id").references(() => materials.id),
  plannedFabricQty: numeric("planned_fabric_qty", { precision: 12, scale: 3 }),
  actualFabricQty: numeric("actual_fabric_qty", { precision: 12, scale: 3 }),
  closureMaterialId: uuid("closure_material_id").references(() => materials.id),
  plannedClosureQty: numeric("planned_closure_qty", { precision: 12, scale: 3 }),
  packagingMaterialId: uuid("packaging_material_id").references(() => materials.id),
  plannedPackagingQty: numeric("planned_packaging_qty", { precision: 12, scale: 3 }),
  estimatedMaterialCost: numeric("estimated_material_cost", { precision: 12, scale: 2 }),
  actualMaterialCost: numeric("actual_material_cost", { precision: 12, scale: 2 }),
  estimatedOwnLaborCost: numeric("estimated_own_labor_cost", { precision: 12, scale: 2 }),
  actualOwnLaborCost: numeric("actual_own_labor_cost", { precision: 12, scale: 2 }),
  estimatedPackagingCost: numeric("estimated_packaging_cost", { precision: 12, scale: 2 }),
  actualPackagingCost: numeric("actual_packaging_cost", { precision: 12, scale: 2 }),
  otherEstimatedDirectCost: numeric("other_estimated_direct_cost", { precision: 12, scale: 2 }),
  otherActualDirectCost: numeric("other_actual_direct_cost", { precision: 12, scale: 2 })
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  note: text("note")
});

export const purchases = pgTable("purchases", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  purchaseDate: date("purchase_date").notNull(),
  supplierName: text("supplier_name"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const purchaseLines = pgTable("purchase_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  materialId: uuid("material_id").notNull().references(() => materials.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull()
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    materialId: uuid("material_id").notNull().references(() => materials.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    type: text("type").notNull(),
    quantitySigned: numeric("quantity_signed", { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
    purchaseLineId: uuid("purchase_line_id").references(() => purchaseLines.id),
    orderItemId: uuid("order_item_id").references(() => orderItems.id),
    notes: text("notes")
  },
  (table) => [
    uniqueIndex("one_cut_consumption_per_item").on(table.orderItemId).where(sql`${table.type} = 'ORDER_CONSUMPTION' AND ${table.orderItemId} IS NOT NULL`),
    uniqueIndex("one_closure_consumption_per_item").on(table.orderItemId).where(sql`${table.type} = 'ORDER_CLOSURE_CONSUMPTION' AND ${table.orderItemId} IS NOT NULL`),
    uniqueIndex("one_packaging_consumption_per_item").on(table.orderItemId).where(sql`${table.type} = 'ORDER_PACKAGING_CONSUMPTION' AND ${table.orderItemId} IS NOT NULL`)
  ]
);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: text("method").notNull(),
  notes: text("notes")
});

export const embroideryProviders = pgTable("embroidery_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone"),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
  ...timestamps
});

export const embroideryJobs = pgTable("embroidery_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").notNull().references(() => embroideryProviders.id),
  status: text("status").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  expectedReturnDate: date("expected_return_date"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 12, scale: 2 }),
  notes: text("notes")
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull().references(() => businesses.id),
  expenseDate: date("expense_date").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  orderId: uuid("order_id").references(() => orders.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const orderRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  payments: many(payments),
  history: many(orderStatusHistory)
}));

export const orderItemRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  embroideryJobs: many(embroideryJobs)
}));
