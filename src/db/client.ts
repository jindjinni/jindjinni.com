import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local dev: a plain file on disk (./local.db) -- zero setup, nothing to
// install or provision. Production: point DATABASE_URL at a hosted libSQL
// database (Turso is the standard host: free tier, serverless-friendly, no
// connection-pooling headaches on Vercel) or swap this file for a Postgres
// client (postgres.js) + drizzle-orm/postgres-js if you'd rather run on
// Supabase/Neon -- the schema.ts models are written in plain Drizzle and
// port over with only this file changing.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
