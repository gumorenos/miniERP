import { sql } from "drizzle-orm";
import { type Db } from "../db/client";

export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function nextOrderNumber(transaction: DbTransaction, businessId: string) {
  const result = await transaction.execute(sql`
    INSERT INTO order_number_counters (business_id, last_number)
    VALUES (${businessId}::uuid, 1)
    ON CONFLICT (business_id)
    DO UPDATE SET last_number = order_number_counters.last_number + 1
    RETURNING last_number
  `);
  const lastNumber = Number(result.rows[0]?.last_number);
  if (!Number.isSafeInteger(lastNumber) || lastNumber <= 0) {
    throw new Error("No se pudo reservar el número de pedido");
  }
  return `P-${String(lastNumber).padStart(5, "0")}`;
}
