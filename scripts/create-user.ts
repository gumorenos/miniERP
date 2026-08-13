import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { sessions } from "../src/db/auth-schema";
import { businesses, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth";

async function main() {
  const email = process.env.APP_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.APP_USER_PASSWORD;
  const businessName = process.env.APP_BUSINESS_NAME?.trim();
  const forcePasswordChange = process.env.APP_USER_FORCE_PASSWORD_CHANGE !== "false";

  if (!email || !password || !businessName) {
    throw new Error("APP_USER_EMAIL, APP_USER_PASSWORD and APP_BUSINESS_NAME are required");
  }
  if (password.length < 12) {
    throw new Error("APP_USER_PASSWORD must contain at least 12 characters");
  }

  const passwordHash = await hashPassword(password);
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existing) {
    const revokedAt = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, active: true, updatedAt: revokedAt }).where(eq(users.id, existing.id));
      await tx.execute(sql`update users set must_change_password = ${forcePasswordChange} where id = ${existing.id}`);
      await tx
        .update(sessions)
        .set({ revokedAt })
        .where(and(eq(sessions.userId, existing.id), isNull(sessions.revokedAt)));
    });
    console.log(`User ${email} password updated, existing sessions revoked, force-change=${forcePasswordChange}`);
    return;
  }

  await db.transaction(async (tx) => {
    const [business] = await tx.insert(businesses).values({ name: businessName }).returning();
    const [user] = await tx
      .insert(users)
      .values({ businessId: business.id, name: businessName, email, passwordHash, active: true })
      .returning();
    await tx.execute(sql`update users set must_change_password = ${forcePasswordChange} where id = ${user.id}`);
  });
  console.log(`User ${email} created, force-change=${forcePasswordChange}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
