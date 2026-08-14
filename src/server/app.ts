import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { db } from "../db/client";
import {
  businesses,
  customers,
  embroideryJobs,
  embroideryProviders,
  materials,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  productSizePrices,
  products,
  suppliers,
  stockMovements,
  users
} from "../db/schema";
import { assertKnownOrderStatus, assertOrderTransition, calculateOrderFinancials, embroideryOverdueDays } from "../domain/order";
import { orderStatuses, paymentMethods, sizes, type OrderStatus } from "../domain/types";
import { seedDevelopment } from "../db/seed";
import { authenticateToken, createSession, revokeSession, verifyPassword } from "./auth";

type AppContext = {
  Variables: {
    user: { id: string; businessId: string; email: string; name: string };
    authToken: string;
  };
};

const isoDate = () => new Date().toISOString().slice(0, 10);
const asNumber = (value: unknown) => (value == null ? 0 : Number(value));
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  instagramHandle: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const orderSchema = z.object({
  customerId: z.string().uuid(),
  promisedDeliveryDate: z.string().optional().nullable(),
  productId: z.string().uuid(),
  size: z.enum(sizes),
  color: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
  agreedTotalPrice: z.coerce.number().positive(),
  notes: z.string().optional().nullable()
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(paymentMethods),
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable()
});

const transitionSchema = z.object({
  status: z.enum(orderStatuses),
  note: z.string().optional().nullable()
});

const cutSchema = z.object({
  actualFabricQty: z.coerce.number().positive().optional(),
  actualMaterialCost: z.coerce.number().nonnegative().optional()
});

const sendEmbroiderySchema = z.object({
  providerId: z.string().uuid(),
  expectedReturnDate: z.string(),
  estimatedCost: z.coerce.number().nonnegative(),
  sentAt: z.string().optional(),
  notes: z.string().optional().nullable()
});

const receiveEmbroiderySchema = z.object({
  actualCost: z.coerce.number().nonnegative(),
  receivedAt: z.string().optional(),
  notes: z.string().optional().nullable()
});

function bearerToken(header: string | undefined) {
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function publicApp() {
  const app = new Hono<AppContext>();

  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ ok: true, database: "ok" });
    } catch (error) {
      return c.json({ ok: false, database: "error", error: error instanceof Error ? error.message : "unknown" }, 503);
    }
  });

  app.post("/api/dev/seed", async (c) => {
    if (process.env.NODE_ENV === "production") return c.json({ error: "No encontrado" }, 404);
    await seedDevelopment();
    return c.json({ ok: true });
  });

  app.post("/api/auth/login", async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const user = await db.query.users.findFirst({ where: and(eq(users.email, body.email), eq(users.active, true)) });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return c.json({ error: "Credenciales invalidas" }, 401);
    }
    const authUser = { id: user.id, businessId: user.businessId, email: user.email, name: user.name };
    const session = await createSession(authUser);
    return c.json({ token: session.token, expiresAt: session.expiresAt, user: authUser });
  });

  app.use("/api/*", async (c, next) => {
    const token = bearerToken(c.req.header("authorization"));
    const user = await authenticateToken(token);
    if (!user) return c.json({ error: "No autenticado" }, 401);
    c.set("user", user);
    c.set("authToken", token);
    return next();
  });

  app.post("/api/auth/logout", async (c) => {
    await revokeSession(c.get("authToken"));
    return c.json({ ok: true });
  });

  app.get("/api/bootstrap", async (c) => {
    const user = c.get("user");
    const [business] = await db.select().from(businesses).where(eq(businesses.id, user.businessId));
    const [dashboard, customerList, productList, materialList, providerList, supplierList, orderList] = await Promise.all([
      loadDashboard(user.businessId),
      db.select().from(customers).where(eq(customers.businessId, user.businessId)).orderBy(asc(customers.name)),
      loadProducts(user.businessId),
      loadMaterials(user.businessId),
      db.select().from(embroideryProviders).where(eq(embroideryProviders.businessId, user.businessId)).orderBy(asc(embroideryProviders.name)),
      db.select().from(suppliers).where(eq(suppliers.businessId, user.businessId)).orderBy(asc(suppliers.name)),
      loadOrders(user.businessId)
    ]);
    return c.json({ business, dashboard, customers: customerList, products: productList, materials: materialList, providers: providerList, suppliers: supplierList, orders: orderList, demo: process.env.NODE_ENV !== "production" });
  });

  app.get("/api/customers", async (c) => c.json(await db.select().from(customers).where(eq(customers.businessId, c.get("user").businessId)).orderBy(asc(customers.name))));

  app.post("/api/customers", async (c) => {
    const user = c.get("user");
    const body = customerSchema.parse(await c.req.json());
    const [customer] = await db.insert(customers).values({ businessId: user.businessId, ...body }).returning();
    return c.json(customer, 201);
  });

  app.get("/api/products", async (c) => c.json(await loadProducts(c.get("user").businessId)));
  app.get("/api/materials", async (c) => c.json(await loadMaterials(c.get("user").businessId)));
  app.get("/api/orders", async (c) => c.json(await loadOrders(c.get("user").businessId)));

  app.post("/api/orders", async (c) => {
    const user = c.get("user");
    const body = orderSchema.parse(await c.req.json());
    const product = await db.query.products.findFirst({ where: and(eq(products.id, body.productId), eq(products.businessId, user.businessId)) });
    if (!product) return c.json({ error: "Producto no encontrado" }, 404);
    const priceRow = await db.query.productSizePrices.findFirst({ where: and(eq(productSizePrices.productId, product.id), eq(productSizePrices.size, body.size)) });
    const agreedUnit = body.agreedTotalPrice / body.quantity;
    const orderNumber = await nextOrderNumber(user.businessId);
    const fabricCost = product.defaultFabricMaterialId ? (await weightedAverageCost(product.defaultFabricMaterialId)) * asNumber(product.defaultFabricQtyMeters) : 0;
    const closureCost = product.defaultClosureMaterialId ? (await weightedAverageCost(product.defaultClosureMaterialId)) * asNumber(product.defaultClosureQty) : 0;
    const packagingCost = product.defaultPackagingMaterialId ? (await weightedAverageCost(product.defaultPackagingMaterialId)) * asNumber(product.defaultPackagingQty) : 0;

    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          businessId: user.businessId,
          orderNumber,
          customerId: body.customerId,
          orderDate: isoDate(),
          promisedDeliveryDate: body.promisedDeliveryDate ?? null,
          fulfillmentType: "MADE_TO_ORDER",
          status: "ORDER_RECEIVED",
          agreedTotalPrice: String(body.agreedTotalPrice),
          notes: body.notes ?? null
        })
        .returning();
      const [item] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          productId: product.id,
          size: body.size,
          color: body.color,
          quantity: body.quantity,
          agreedUnitPrice: String(agreedUnit),
          fabricMaterialId: product.defaultFabricMaterialId,
          plannedFabricQty: product.defaultFabricQtyMeters,
          estimatedMaterialCost: fabricCost + closureCost > 0 ? String(money(fabricCost + closureCost)) : null,
          estimatedOwnLaborCost: product.defaultOwnLaborCost,
          estimatedPackagingCost: packagingCost > 0 ? String(money(packagingCost)) : null,
          otherEstimatedDirectCost: null
        })
        .returning();
      await tx.insert(orderStatusHistory).values({ orderId: order.id, toStatus: "ORDER_RECEIVED", note: "Pedido creado" });
      return { ...order, items: [item], configuredSizePrice: priceRow };
    });

    return c.json(await loadOrder(user.businessId, result.id), 201);
  });

  app.get("/api/orders/:id", async (c) => {
    const order = await loadOrder(c.get("user").businessId, c.req.param("id"));
    if (!order) return c.json({ error: "Pedido no encontrado" }, 404);
    return c.json(order);
  });

  app.post("/api/orders/:id/payments", async (c) => {
    const user = c.get("user");
    const body = paymentSchema.parse(await c.req.json());
    const order = await requireOrder(user.businessId, c.req.param("id"));
    await db.insert(payments).values({
      businessId: user.businessId,
      orderId: order.id,
      amount: String(body.amount),
      method: body.method,
      paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
      notes: body.notes ?? null
    });
    return c.json(await loadOrder(user.businessId, order.id), 201);
  });

  app.post("/api/orders/:id/transition", async (c) => {
    const user = c.get("user");
    const body = transitionSchema.parse(await c.req.json());
    const order = await requireOrder(user.businessId, c.req.param("id"));
    await transitionOrder(order.id, order.status as OrderStatus, body.status, body.note);
    return c.json(await loadOrder(user.businessId, order.id));
  });

  app.post("/api/orders/:id/cut", async (c) => {
    const user = c.get("user");
    const body = cutSchema.parse(await c.req.json());
    const order = await requireOrder(user.businessId, c.req.param("id"));
    assertOrderTransition(order.status as OrderStatus, "CUT");
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
    if (!item || !item.fabricMaterialId) return c.json({ error: "El pedido no tiene tela configurada" }, 422);
    const fabricMaterialId = item.fabricMaterialId;
    const qty = body.actualFabricQty ?? asNumber(item.plannedFabricQty);
    const existing = await db.query.stockMovements.findFirst({ where: and(eq(stockMovements.orderItemId, item.id), eq(stockMovements.type, "ORDER_CONSUMPTION")) });
    if (!existing) {
      await db.transaction(async (tx) => {
        await tx.insert(stockMovements).values({
          businessId: user.businessId,
          materialId: fabricMaterialId,
          type: "ORDER_CONSUMPTION",
          quantitySigned: String(-qty),
          orderItemId: item.id,
          notes: `Corte de pedido ${order.orderNumber}`
        });
        await tx.update(orderItems).set({ actualFabricQty: String(qty), actualMaterialCost: body.actualMaterialCost == null ? item.estimatedMaterialCost : String(body.actualMaterialCost) }).where(eq(orderItems.id, item.id));
      });
    }
    await transitionOrder(order.id, order.status as OrderStatus, "CUT", existing ? "Corte ya registrado; no se desconto stock otra vez" : "Corte registrado");
    return c.json(await loadOrder(user.businessId, order.id));
  });

  app.post("/api/orders/:id/send-embroidery", async (c) => {
    const user = c.get("user");
    const body = sendEmbroiderySchema.parse(await c.req.json());
    const order = await requireOrder(user.businessId, c.req.param("id"));
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
    if (!item) return c.json({ error: "Pedido sin item" }, 422);
    await db.transaction(async (tx) => {
      await tx.insert(embroideryJobs).values({
        businessId: user.businessId,
        orderItemId: item.id,
        providerId: body.providerId,
        status: "SENT",
        sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
        expectedReturnDate: body.expectedReturnDate,
        estimatedCost: String(body.estimatedCost),
        notes: body.notes ?? null
      });
    });
    await transitionOrder(order.id, order.status as OrderStatus, "AT_EMBROIDERER", "Enviado al bordador");
    return c.json(await loadOrder(user.businessId, order.id));
  });

  app.post("/api/embroidery-jobs/:id/receive", async (c) => {
    const user = c.get("user");
    const body = receiveEmbroiderySchema.parse(await c.req.json());
    const [job] = await db.select().from(embroideryJobs).where(and(eq(embroideryJobs.id, c.req.param("id")), eq(embroideryJobs.businessId, user.businessId))).limit(1);
    if (!job) return c.json({ error: "Trabajo de bordado no encontrado" }, 404);
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, job.orderItemId)).limit(1);
    const order = item ? await requireOrder(user.businessId, item.orderId) : null;
    await db.update(embroideryJobs).set({ status: "RECEIVED", actualCost: String(body.actualCost), receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(), notes: body.notes ?? job.notes }).where(eq(embroideryJobs.id, job.id));
    if (order) await transitionOrder(order.id, order.status as OrderStatus, "EMBROIDERY_RECEIVED", "Bordado recibido");
    return c.json(order ? await loadOrder(user.businessId, order.id) : { ok: true });
  });

  app.notFound(async (c) => {
    if (c.req.path.startsWith("/api")) return c.json({ error: "No encontrado" }, 404);
    return c.text(await readIndexHtml(), 200, { "content-type": "text/html; charset=utf-8" });
  });

  app.use("*", serveStatic({ root: "./dist/client" }));

  return app;
}

async function readIndexHtml() {
  return readFile(join(process.cwd(), "dist/client/index.html"), "utf8").catch(() => "<div id=\"root\"></div><script type=\"module\" src=\"/src/client/main.tsx\"></script>");
}

async function nextOrderNumber(businessId: string) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.businessId, businessId));
  return `P-${String(count + 1).padStart(5, "0")}`;
}

async function requireOrder(businessId: string, id: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.businessId, businessId))).limit(1);
  if (!order) throw new Error("Pedido no encontrado");
  assertKnownOrderStatus(order.status);
  return order;
}

async function weightedAverageCost(materialId: string) {
  const [row] = await db
    .select({
      totalQty: sql<string>`coalesce(sum(case when ${stockMovements.quantitySigned} > 0 then ${stockMovements.quantitySigned} else 0 end), 0)`,
      totalCost: sql<string>`coalesce(sum(case when ${stockMovements.quantitySigned} > 0 then ${stockMovements.quantitySigned} * coalesce(${stockMovements.unitCost}, 0) else 0 end), 0)`
    })
    .from(stockMovements)
    .where(eq(stockMovements.materialId, materialId));
  const qty = asNumber(row?.totalQty);
  return qty > 0 ? asNumber(row?.totalCost) / qty : 0;
}

async function transitionOrder(orderId: string, from: OrderStatus, to: OrderStatus, note?: string | null) {
  assertOrderTransition(from, to);
  if (from === to) return;
  const patch: Partial<typeof orders.$inferInsert> = {
    status: to,
    updatedAt: new Date()
  };
  if (to === "DELIVERED") patch.deliveredAt = new Date();
  if (to === "CLOSED") patch.closedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(orders).set(patch).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: from, toStatus: to, note: note ?? null });
  });
}

async function loadProducts(businessId: string) {
  const rows = await db.select().from(products).where(eq(products.businessId, businessId)).orderBy(asc(products.name));
  const prices = rows.length ? await db.select().from(productSizePrices).where(inArray(productSizePrices.productId, rows.map((p) => p.id))) : [];
  return rows.map((product) => ({
    ...product,
    sizePrices: prices.filter((price) => price.productId === product.id)
  }));
}

async function loadMaterials(businessId: string) {
  const rows = await db
    .select({
      id: materials.id,
      businessId: materials.businessId,
      name: materials.name,
      category: materials.category,
      unit: materials.unit,
      color: materials.color,
      minimumStock: materials.minimumStock,
      active: materials.active,
      currentQuantity: sql<string>`coalesce(sum(${stockMovements.quantitySigned}), 0)`
    })
    .from(materials)
    .leftJoin(stockMovements, eq(stockMovements.materialId, materials.id))
    .where(eq(materials.businessId, businessId))
    .groupBy(materials.id)
    .orderBy(asc(materials.category), asc(materials.name));
  return rows.map((row) => ({ ...row, currentQuantity: Number(row.currentQuantity) }));
}

async function loadOrders(businessId: string) {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      promisedDeliveryDate: orders.promisedDeliveryDate,
      agreedTotalPrice: orders.agreedTotalPrice,
      customerName: customers.name,
      createdAt: orders.createdAt
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.businessId, businessId))
    .orderBy(desc(orders.createdAt));
  return rows;
}

async function loadOrder(businessId: string, id: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.businessId, businessId))).limit(1);
  if (!order) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const paymentRows = await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.paidAt));
  const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.changedAt));
  const jobRows = itemRows.length
    ? await db.select().from(embroideryJobs).where(inArray(embroideryJobs.orderItemId, itemRows.map((item) => item.id))).orderBy(desc(embroideryJobs.sentAt))
    : [];
  const itemCosts = itemRows.map((item) => {
    const jobs = jobRows.filter((job) => job.orderItemId === item.id);
    return {
      estimatedMaterialCost: asNumber(item.estimatedMaterialCost),
      actualMaterialCost: item.actualMaterialCost == null ? null : asNumber(item.actualMaterialCost),
      estimatedOwnLaborCost: asNumber(item.estimatedOwnLaborCost),
      actualOwnLaborCost: item.actualOwnLaborCost == null ? null : asNumber(item.actualOwnLaborCost),
      estimatedPackagingCost: asNumber(item.estimatedPackagingCost),
      actualPackagingCost: item.actualPackagingCost == null ? null : asNumber(item.actualPackagingCost),
      otherEstimatedDirectCost: asNumber(item.otherEstimatedDirectCost),
      otherActualDirectCost: item.otherActualDirectCost == null ? null : asNumber(item.otherActualDirectCost),
      estimatedEmbroideryCost: jobs.reduce((sum, job) => sum + asNumber(job.estimatedCost), 0),
      actualEmbroideryCost: jobs.some((job) => job.actualCost != null) ? jobs.reduce((sum, job) => sum + asNumber(job.actualCost), 0) : null
    };
  });
  const financials = calculateOrderFinancials({
    agreedTotalPrice: asNumber(order.agreedTotalPrice),
    payments: paymentRows.map((payment) => asNumber(payment.amount)),
    items: itemCosts
  });
  return {
    ...order,
    customer,
    items: itemRows,
    payments: paymentRows,
    history,
    embroideryJobs: jobRows.map((job) => ({ ...job, overdueDays: embroideryOverdueDays(job.expectedReturnDate, job.receivedAt) })),
    financials
  };
}

async function loadDashboard(businessId: string) {
  const orderList = await loadOrders(businessId);
  const fullOrders = await Promise.all(orderList.slice(0, 25).map((order) => loadOrder(businessId, order.id)));
  const jobs = await db.select().from(embroideryJobs).where(and(eq(embroideryJobs.businessId, businessId), eq(embroideryJobs.status, "SENT")));
  const today = new Date();
  const week = new Date(today);
  week.setDate(today.getDate() + 7);
  const activeOrders = fullOrders.filter((order) => order && !["DELIVERED", "CLOSED", "CANCELLED"].includes(order.status));
  const lateOrders = activeOrders.filter((order) => order?.promisedDeliveryDate && new Date(order.promisedDeliveryDate) < today);
  const dueSoon = activeOrders.filter((order) => order?.promisedDeliveryDate && new Date(order.promisedDeliveryDate) <= week);
  const totals = fullOrders.reduce(
    (acc, order) => {
      if (!order) return acc;
      acc.sales += asNumber(order.agreedTotalPrice);
      acc.collected += order.financials.totalPaid;
      acc.receivable += Math.max(0, order.financials.balance);
      acc.margin += order.financials.margin;
      return acc;
    },
    { sales: 0, collected: 0, receivable: 0, margin: 0 }
  );
  return {
    activeOrders: activeOrders.length,
    lateOrders,
    dueSoon,
    atEmbroidery: jobs.length,
    lateEmbroideryJobs: jobs.map((job) => ({ ...job, overdueDays: embroideryOverdueDays(job.expectedReturnDate, job.receivedAt) })).filter((job) => job.overdueDays > 0),
    readyForDelivery: activeOrders.filter((order) => order?.status === "READY_FOR_DELIVERY").length,
    money: {
      sales: money(totals.sales),
      collected: money(totals.collected),
      receivable: money(totals.receivable),
      margin: money(totals.margin)
    }
  };
}

export const app = publicApp();
