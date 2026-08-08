import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export function databaseUrl() {
  return process.env.DATABASE_URL ?? "postgres://minierp:minierp@localhost:54329/minierp";
}

export const pool = new Pool({ connectionString: databaseUrl() });
export const db = drizzle(pool, { schema });

export type Db = typeof db;

