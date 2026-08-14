import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { sessions } from "../db/auth-schema";
import { users } from "../db/schema";
import { app } from "./app";
import { authenticateToken, hashPassword, verifyPassword } from "./auth";
import { getAccount, updateAccount } from "./account-settings";
import { handleCatalogMutation, isCatalogMutation } from "./catalog";
import { handleCatalogEdit } from "./catalog-edits";
import { handleCustomerEdit, handleOrderEdit, handlePaymentEdit } from "./edit-mutations";
import { handleOrderCreateWithAdvance } from "./order-create";
import { guardOrderWorkflowMutation } from "./order-transition-guard";
import { handlePaymentCreate } from "./payment-create";

const loginRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256)
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(12).max(128)
});

const customerCreateSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().optional().nullable(),
  instagramHandle: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const loginWindows = new Map<string, { count: number; resetAt: number }>();
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function loginClientKey(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local-or-unknown";
}

function loginAllowed(request: Request) {
  const key = loginClientKey(request);
  const now = Date.now();
  if (loginWindows.size > 5_000) {
    for (const [entryKey, value] of loginWindows) if (value.resetAt <= now) loginWindows.delete(entryKey);
  }
  const current = loginWindows.get(key);
  if (!current || current.resetAt <= now) {
    loginWindows.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOGIN_LIMIT) return false;
  current.count += 1;
  return true;
}

const passwordChangeAllowlist = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/change-password"
]);

async function mutationUser(token: string) {
  const user = await authenticateToken(token);
  if (!user) return { response: json({ error: "No autenticado" }, 401), user: null };
  if (user.mustChangePassword) {
    return { response: json({ error: "Debes cambiar tu contraseña antes de continuar", code: "PASSWORD_CHANGE_REQUIRED" }, 428), user: null };
  }
  return { response: null, user };
}

export async function secureFetch(request: Request) {
  const url = new URL(request.url);
  const token = bearerToken(request);

  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await db.execute(sql`select 1`);
      return json({ ok: true, database: "ok" });
    } catch {
      return json({ ok: false, database: "error" }, 503);
    }
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    if (!loginAllowed(request)) return json({ error: "Demasiados intentos. Intenta nuevamente en un minuto." }, 429);
    const parsed = loginRequestSchema.safeParse(await request.clone().json().catch(() => null));
    if (!parsed.success) return json({ error: "Revisa correo y contraseña" }, 400);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const normalized = new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: parsed.data.email.toLowerCase(), password: parsed.data.password })
    });
    return app.fetch(normalized);
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const user = await authenticateToken(token);
    if (!user) return json({ error: "No autenticado" }, 401);
    return json({ user, mustChangePassword: user.mustChangePassword === true });
  }

  if (url.pathname === "/api/auth/change-password" && request.method === "POST") {
    const user = await authenticateToken(token);
    if (!user) return json({ error: "No autenticado" }, 401);
    const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "La nueva contraseña debe tener al menos 12 caracteres" }, 400);
    const account = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!account) return json({ error: "Usuario no encontrado" }, 404);
    if (await verifyPassword(parsed.data.newPassword, account.passwordHash)) return json({ error: "Elige una contraseña diferente a la temporal" }, 400);
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
      await tx.execute(sql`update users set must_change_password = false where id = ${user.id}`);
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    });
    return json({ ok: true, reauthenticate: true });
  }

  if (url.pathname === "/api/account" && request.method === "GET") {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    return getAccount(auth.user);
  }

  if (url.pathname === "/api/account" && request.method === "PATCH") {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    return updateAccount(request, auth.user);
  }

  if (isCatalogMutation(request)) {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    const edited = await handleCatalogEdit(request.clone(), auth.user);
    if (edited) return edited;
    return handleCatalogMutation(request, auth.user);
  }

  if (url.pathname === "/api/customers" && request.method === "POST") {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    const edited = await handleCustomerEdit(request.clone(), auth.user);
    if (edited) return edited;
    const parsed = customerCreateSchema.safeParse(await request.clone().json().catch(() => null));
    if (!parsed.success) return json({ error: "Ingresa un nombre de al menos 2 caracteres" }, 400);
    return app.fetch(request);
  }

  if (url.pathname === "/api/orders" && request.method === "POST") {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    const edited = await handleOrderEdit(request.clone(), auth.user);
    if (edited) return edited;
    return handleOrderCreateWithAdvance(request.clone(), auth.user);
  }

  const isWorkflowMutation = request.method === "POST" && (
    /^\/api\/orders\/[0-9a-f-]+\/(?:transition|cut|send-embroidery)$/i.test(url.pathname) ||
    /^\/api\/embroidery-jobs\/[0-9a-f-]+\/receive$/i.test(url.pathname)
  );
  if (isWorkflowMutation) {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    const guarded = await guardOrderWorkflowMutation(request.clone(), auth.user);
    if (guarded) return guarded;
    return app.fetch(request);
  }

  const paymentMatch = request.method === "POST" ? url.pathname.match(/^\/api\/orders\/([0-9a-f-]+)\/payments$/i) : null;
  if (paymentMatch) {
    const auth = await mutationUser(token);
    if (auth.response || !auth.user) return auth.response!;
    const edited = await handlePaymentEdit(request.clone(), auth.user, paymentMatch[1]);
    if (edited) return edited;
    return handlePaymentCreate(request.clone(), auth.user, paymentMatch[1]);
  }

  if (url.pathname.startsWith("/api/") && !passwordChangeAllowlist.has(url.pathname) && token) {
    const user = await authenticateToken(token);
    if (user?.mustChangePassword) return json({ error: "Debes cambiar tu contraseña antes de continuar", code: "PASSWORD_CHANGE_REQUIRED" }, 428);
  }

  return app.fetch(request);
}
