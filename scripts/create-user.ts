import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { businesses, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth";

async function main() {
  const email = process.env.APP_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.APP_USER_PASSWORD;
  const businessName = process.env.APP_BUSINESS_NAME?.trim();

  if (!email || !password || !businessName) {
    throw new Error("APP_USER_EMAIL, APP_USER_PASSWORD and APP_BUSINESS_NAME are required");
  }
  if (password.length < 12) {
    throw new Error("APP_USER_PASSWORD must contain at least 12 characters");
  }

  const passwordHash = await hashPassword(password);
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existing) {
    await db.update(users).set({ passwordHash, active: true, updatedAt: new Date() }).where(eq(users.id, existing.id));
    console.log(`User ${email} password updated`);
    return;
  }

  await db.transaction(async (tx) => {
    const [business] = await tx.insert(businesses).values({ name: businessName }).returning();
    await tx.insert(users).values({ businessId: business.id, name: businessName, email, passwordHash, active: true });
  });
  console.log(`User ${email} created`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
