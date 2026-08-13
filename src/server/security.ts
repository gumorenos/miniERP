import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { sessions } from "../db/auth-schema";
import { users } from "../db/schema";
import { app } from "./app";
import { authenticateToken, hashPassword, verifyPassword } from "./auth";

const changePasswordSchema = z.object({
  newPassword: z.string().min(12).max(128)
});

const customerCreateSchema = z.object({
  name: z.string().trim().min(2),
  phone: z.string().optional().nullable(),
  instagramHandle: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

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

const passwordChangeAllowlist = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/change-password"
]);

export async function secureFetch(request: Request) {
  const url = new URL(request.url);
  const token = bearerToken(request);

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
    if (await verifyPassword(parsed.data.newPassword, account.passwordHash)) {
      return json({ error: "Elige una contraseña diferente a la temporal" }, 400);
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
      await tx.execute(sql`update users set must_change_password = false where id = ${user.id}`);
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    });

    return json({ ok: true, reauthenticate: true });
  }

  if (url.pathname.startsWith("/api/") && !passwordChangeAllowlist.has(url.pathname) && token) {
    const user = await authenticateToken(token);
    if (user?.mustChangePassword) {
      return json({ error: "Debes cambiar tu contraseña antes de continuar", code: "PASSWORD_CHANGE_REQUIRED" }, 428);
    }
  }

  if (url.pathname === "/api/customers" && request.method === "POST" && token) {
    const user = await authenticateToken(token);
    if (user) {
      const parsed = customerCreateSchema.safeParse(await request.clone().json().catch(() => null));
      if (!parsed.success) return json({ error: "Ingresa un nombre de al menos 2 caracteres" }, 400);
    }
  }

  return app.fetch(request);
}
