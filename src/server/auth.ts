import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions } from "../db/auth-schema";
import { users } from "../db/schema";

const KEY_LENGTH = 64;
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 30));

export type AuthUser = {
  id: string;
  businessId: string;
  email: string;
  name: string;
  mustChangePassword?: boolean;
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function passwordChangeRequired(userId: string) {
  const result = await db.execute(sql`select must_change_password from users where id = ${userId} limit 1`);
  const row = result.rows[0] as { must_change_password?: boolean } | undefined;
  return row?.must_change_password === true;
}

export async function createSession(user: AuthUser) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({ userId: user.id, tokenHash: tokenHash(token), expiresAt });
  return { token, expiresAt };
}

export async function authenticateToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      businessId: users.businessId,
      email: users.email,
      name: users.name
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), eq(users.active, true)))
    .limit(1);
  if (!row) return null;
  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
  return {
    id: row.userId,
    businessId: row.businessId,
    email: row.email,
    name: row.name,
    mustChangePassword: await passwordChangeRequired(row.userId)
  };
}

export async function revokeSession(token: string) {
  if (!token) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.tokenHash, tokenHash(token)), isNull(sessions.revokedAt)));
}
