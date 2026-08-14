import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { users } from "../db/schema";
import { verifyPassword, type AuthUser } from "./auth";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  currentPassword: z.string().optional()
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function getAccount(user: AuthUser) {
  const [account] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.id, user.id), eq(users.businessId, user.businessId)))
    .limit(1);
  if (!account) return json({ error: "Usuario no encontrado" }, 404);
  return json(account);
}

export async function updateAccount(request: Request, user: AuthUser) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Revisa nombre y correo" }, 400);

  const [account] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, user.id), eq(users.businessId, user.businessId)))
    .limit(1);
  if (!account) return json({ error: "Usuario no encontrado" }, 404);

  const nextEmail = parsed.data.email.toLowerCase();
  const changingEmail = nextEmail !== account.email.toLowerCase();
  if (changingEmail) {
    if (!parsed.data.currentPassword || !(await verifyPassword(parsed.data.currentPassword, account.passwordHash))) {
      return json({ error: "Ingresa tu contraseña actual para cambiar el correo" }, 401);
    }
    const [duplicate] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, nextEmail), ne(users.id, account.id)))
      .limit(1);
    if (duplicate) return json({ error: "Ese correo ya está en uso" }, 409);
  }

  const [updated] = await db
    .update(users)
    .set({ name: parsed.data.name, email: nextEmail, updatedAt: new Date() })
    .where(eq(users.id, account.id))
    .returning({ id: users.id, name: users.name, email: users.email });

  return json(updated);
}
