import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { AuthUser } from "./auth";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function listArchivedRecords(user: AuthUser) {
  const result = await db.execute(sql`
    select entity_type, entity_id::text as entity_id
    from deleted_records
    where business_id = ${user.businessId}::uuid
    order by deleted_at desc
  `);
  const records = result.rows.map((row) => ({
    entityType: String((row as { entity_type: string }).entity_type),
    id: String((row as { entity_id: string }).entity_id)
  }));
  return json({ records });
}
