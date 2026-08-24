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
import { roundMoney, toNumber } from "../domain/money";
import { orderStatuses, paymentMethods, sizes, type OrderStatus } from "../domain/types";
import { seedDevelopment } from "../db/seed";
import { authenticateToken, createSession, revokeSession, verifyPassword } from "./auth";
import { confirmCaptureDraft, createCaptureDraft, listCaptureDrafts, rejectCaptureDraft } from "./capture";
import { nextOrderNumber } from "./order-number";
import { weightedAverageCost } from "./stock-cost";
import { AppError } from "./errors";
import type { DbTransaction } from "./order-number";

type AppContext = {
  Variables: {
    user: { id: string; businessId: string; email: string; name: string };
    authToken: string;
  };
};

const isoDate = () => new Date().toISOString().slice(0, 10);
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

function sessionToken(request: Request) {
  const bearer = bearerToken(request.headers.get("authorization") ?? undefined);
  if (bearer) return bearer;
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.match(/(?:^|;\s*)minierp_session=([^;]+)/)?.[1] ?? "";
}

function sessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `minierp_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
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
    return c.json({ token: session.token, expiresAt: session.expiresAt, user: authUser }, 200, {
      "set-cookie": sessionCookie(session.token, session.expiresAt),
      "cache-control": "private, no-store"
    });
  });

  app.use("/api/*", async (c, next) => {
    const token = sessionToken(c.req.raw);
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

  app.post("/api/capture/drafts", async (c) => createCaptureDraft(c.req.raw, c.get("user")));
  app.get("/api/capture/drafts", async (c) => listCaptureDrafts(c.get("user")));
  app.post("/api/capture/drafts/:id/confirm", async (c) => confirmCaptureDraft(c.req.raw, c.get("user"), c.req.param("id")));
  app.post("/api/capture/drafts/:id/reject", async (c) => rejectCaptureDraft(c.get("user"), c.req.param("id")));

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
    const fabricCost = product.defaultFabricMaterialId ? (await weightedAverageCost(product.defaultFabricMaterialId)) * toNumber(product.defaultFabricQtyMeters) : 0;
    const closureCost = product.defaultClosureMaterialId ? (await weightedAverageCost(product.defaultClosureMaterialId)) * toNumber(product.defaultClosureQty) : 0;
    const packagingCost = product.defaultPackagingMaterialId ? (await weightedAverageCost(product.defaultPackagingMaterialId)) * toNumber(product.defaultPackagingQty) : 0;

    const result = await db.transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, user.businessId);
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
          estimatedMaterialCost: fabricCost + closureCost > 0 ? String(roundMoney(fabricCost + closureCost)) : null,
          estimatedOwnLaborCost: product.defaultOwnLaborCost,
          estimatedPackagingCost: packagingCost > 0 ? String(roundMoney(packagingCost)) : null,
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
    const orderId = c.req.param("id");
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, user.businessId))).for("update").limit(1);
      if (!order) throw new AppError("Pedido no encontrado", 404, "ORDER_NOT_FOUND");
      if (order.status === "CUT") return;
      assertOrderTransition(order.status as OrderStatus, "CUT");
      const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
      if (!item || !item.fabricMaterialId) throw new AppError("El pedido no tiene tela configurada", 422, "FABRIC_NOT_CONFIGURED");
      const qty = body.actualFabricQty ?? toNumber(item.plannedFabricQty);
      const existing = await tx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.orderItemId, item.id), eq(stockMovements.type, "ORDER_CONSUMPTION"))).limit(1);
      if (!existing.length) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${item.fabricMaterialId}))`);
        await tx.insert(stockMovements).values({
          businessId: user.businessId,
          materialId: item.fabricMaterialId,
          type: "ORDER_CONSUMPTION",
          quantitySigned: String(-qty),
          orderItemId: item.id,
          notes: `Corte de pedido ${order.orderNumber}`
        });
        await tx.update(orderItems).set({ actualFabricQty: String(qty), actualMaterialCost: body.actualMaterialCost == null ? item.estimatedMaterialCost : String(body.actualMaterialCost) }).where(eq(orderItems.id, item.id));
      }
      await setOrderStatus(tx, order.id, order.status as OrderStatus, "CUT", existing.length ? "Corte ya registrado; no se desconto stock otra vez" : "Corte registrado");
    });
    return c.json(await loadOrder(user.businessId, orderId));
  });

  app.post("/api/orders/:id/send-embroidery", async (c) => {
    const user = c.get("user");
    const body = sendEmbroiderySchema.parse(await c.req.json());
    const orderId = c.req.param("id");
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.businessId, user.businessId))).for("update").limit(1);
      if (!order) throw new AppError("Pedido no encontrado", 404, "ORDER_NOT_FOUND");
      assertOrderTransition(order.status as OrderStatus, "AT_EMBROIDERER");
      const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).limit(1);
      if (!item) throw new AppError("Pedido sin item", 422, "ORDER_ITEM_NOT_FOUND");
      const existing = await tx.select({ id: embroideryJobs.id }).from(embroideryJobs).where(and(eq(embroideryJobs.orderItemId, item.id), eq(embroideryJobs.status, "SENT"))).limit(1);
      if (existing.length) throw new AppError("El pedido ya tiene un bordado pendiente", 409, "EMBROIDERY_ALREADY_SENT");
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
      await setOrderStatus(tx, order.id, order.status as OrderStatus, "AT_EMBROIDERER", "Enviado al bordador");
    });
    return c.json(await loadOrder(user.businessId, orderId));
  });

  app.post("/api/embroidery-jobs/:id/receive", async (c) => {
    const user = c.get("user");
    const body = receiveEmbroiderySchema.parse(await c.req.json());
    let orderId = "";
    await db.transaction(async (tx) => {
      const [job] = await tx.select().from(embroideryJobs).where(and(eq(embroideryJobs.id, c.req.param("id")), eq(embroideryJobs.businessId, user.businessId))).for("update").limit(1);
      if (!job) throw new AppError("Trabajo de bordado no encontrado", 404, "EMBROIDERY_JOB_NOT_FOUND");
      if (job.status !== "SENT") throw new AppError("El trabajo de bordado ya fue recibido o cerrado", 409, "EMBROIDERY_ALREADY_RECEIVED");
      const [item] = await tx.select().from(orderItems).where(eq(orderItems.id, job.orderItemId)).limit(1);
      if (!item) throw new AppError("El trabajo de bordado no tiene pedido asociado", 409, "EMBROIDERY_ORDER_MISSING");
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, item.orderId), eq(orders.businessId, user.businessId))).for("update").limit(1);
      if (!order) throw new AppError("Pedido no encontrado", 404, "ORDER_NOT_FOUND");
      assertOrderTransition(order.status as OrderStatus, "EMBROIDERY_RECEIVED");
      await tx.update(embroideryJobs).set({ status: "RECEIVED", actualCost: String(body.actualCost), receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(), notes: body.notes ?? job.notes }).where(eq(embroideryJobs.id, job.id));
      await setOrderStatus(tx, order.id, order.status as OrderStatus, "EMBROIDERY_RECEIVED", "Bordado recibido");
      orderId = order.id;
    });
    return c.json(await loadOrder(user.businessId, orderId));
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

async function requireOrder(businessId: string, id: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.businessId, businessId))).limit(1);
  if (!order) throw new AppError("Pedido no encontrado", 404, "ORDER_NOT_FOUND");
  assertKnownOrderStatus(order.status);
  return order;
}

async function transitionOrder(orderId: string, from: OrderStatus, to: OrderStatus, note?: string | null) {
  assertOrderTransition(from, to);
  if (from === to) return;
  await db.transaction(async (tx) => setOrderStatus(tx, orderId, from, to, note));
}

async function setOrderStatus(tx: DbTransaction, orderId: string, from: OrderStatus, to: OrderStatus, note?: string | null) {
  assertOrderTransition(from, to);
  if (from === to) return;
  const [current] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
  if (!current) throw new AppError("Pedido no encontrado", 404, "ORDER_NOT_FOUND");
  if (current.status !== from) throw new AppError("El pedido cambió mientras se procesaba la operación. Intenta nuevamente.", 409, "ORDER_STATE_CHANGED");
  const patch: Partial<typeof orders.$inferInsert> = {
    status: to,
    updatedAt: new Date()
  };
  if (to === "DELIVERED") patch.deliveredAt = new Date();
  if (to === "CLOSED") patch.closedAt = new Date();
  const updated = await tx.update(orders).set(patch).where(and(eq(orders.id, orderId), eq(orders.status, from))).returning({ id: orders.id });
  if (!updated.length) throw new AppError("El pedido cambió mientras se procesaba la operación. Intenta nuevamente.", 409, "ORDER_STATE_CHANGED");
  await tx.insert(orderStatusHistory).values({ orderId, fromStatus: from, toStatus: to, note: note ?? null });
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
      estimatedMaterialCost: toNumber(item.estimatedMaterialCost),
      actualMaterialCost: item.actualMaterialCost == null ? null : toNumber(item.actualMaterialCost),
      estimatedOwnLaborCost: toNumber(item.estimatedOwnLaborCost),
      actualOwnLaborCost: item.actualOwnLaborCost == null ? null : toNumber(item.actualOwnLaborCost),
      estimatedPackagingCost: toNumber(item.estimatedPackagingCost),
      actualPackagingCost: item.actualPackagingCost == null ? null : toNumber(item.actualPackagingCost),
      otherEstimatedDirectCost: toNumber(item.otherEstimatedDirectCost),
      otherActualDirectCost: item.otherActualDirectCost == null ? null : toNumber(item.otherActualDirectCost),
      estimatedEmbroideryCost: jobs.reduce((sum, job) => sum + toNumber(job.estimatedCost), 0),
      actualEmbroideryCost: jobs.some((job) => job.actualCost != null) ? jobs.reduce((sum, job) => sum + toNumber(job.actualCost), 0) : null
    };
  });
  const financials = calculateOrderFinancials({
    agreedTotalPrice: toNumber(order.agreedTotalPrice),
    payments: paymentRows.map((payment) => toNumber(payment.amount)),
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
      acc.sales += toNumber(order.agreedTotalPrice);
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
      sales: roundMoney(totals.sales),
      collected: roundMoney(totals.collected),
      receivable: roundMoney(totals.receivable),
      margin: roundMoney(totals.margin)
    }
  };
}

export const app = publicApp();
