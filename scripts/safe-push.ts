// Safe replacement for `drizzle-kit push --force` in the build.
//
// Why this exists: on SQLite/libSQL, drizzle-kit turns "add a NOT NULL column
// to a table that already has rows" into `DELETE FROM <table>` followed by an
// ALTER TABLE -- and `push --force` approves that automatically. On
// 2026-10-04 that wiped the products table (and earlier, quotations) on a
// production deploy. This script computes the SAME plan, looks at it first,
// and refuses to run it if it would delete or drop anything that holds data.
//
// - Safe changes (CREATE TABLE, ADD COLUMN that is nullable or has no NOT NULL
//   problem, CREATE INDEX) are applied exactly as before.
// - A DELETE FROM / DROP TABLE on a table that is EMPTY is fine (nothing to lose).
// - A DELETE FROM / DROP TABLE on a table that has rows, or any DROP COLUMN,
//   stops the build with a clear message. The previous deploy keeps running
//   untouched. To knowingly allow it, set ALLOW_DESTRUCTIVE_SCHEMA=1 for that
//   one deploy.
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { pushSQLiteSchema } from "drizzle-kit/api";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL ?? "file:./local.db";
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client);

const unquote = (s: string) => s.replace(/^[`"[]|[`"\]]$/g, "");

async function rowCount(table: string): Promise<number | null> {
  try {
    const res = await client.execute(`select count(*) as n from "${table.replace(/"/g, '""')}"`);
    return Number(res.rows[0]?.n ?? 0);
  } catch {
    return null; // table does not exist (yet) -- nothing to lose
  }
}

async function main() {
  const plan = await pushSQLiteSchema(schema as unknown as Record<string, unknown>, db);
  const statements = plan.statementsToExecute;

  if (statements.length === 0) {
    console.log("[safe-push] Database already matches the schema. Nothing to do.");
    return;
  }

  console.log(`[safe-push] ${statements.length} statement(s) planned:`);
  for (const s of statements) console.log("  " + s.replace(/\s+/g, " ").slice(0, 220));

  const problems: string[] = [];
  for (const raw of statements) {
    const s = raw.trim();
    let m: RegExpMatchArray | null;

    if ((m = s.match(/^delete\s+from\s+(\S+)/i)) || (m = s.match(/^drop\s+table\s+(?:if\s+exists\s+)?(\S+)/i))) {
      const table = unquote(m[1].replace(/;$/, ""));
      const n = await rowCount(table);
      if (n && n > 0) {
        problems.push(`"${table}" has ${n} row(s) and the plan would ${/^delete/i.test(s) ? "delete them" : "drop the table"}.`);
      }
    } else if (/^alter\s+table\s+\S+\s+drop\s+column/i.test(s)) {
      problems.push(`The plan drops a column: ${s.replace(/\s+/g, " ")}`);
    }
  }

  if (problems.length > 0 && process.env.ALLOW_DESTRUCTIVE_SCHEMA !== "1") {
    console.error("\n[safe-push] STOPPED -- this schema change would destroy existing data:");
    for (const p of problems) console.error("  - " + p);
    console.error(
      "\nNothing was changed. The live site keeps running its previous version.\n" +
        "Fix the schema change (usually: make the new column nullable / give it no NOT NULL),\n" +
        "or, if you really mean it, set ALLOW_DESTRUCTIVE_SCHEMA=1 for this one deploy.",
    );
    process.exit(1);
  }

  if (problems.length > 0) console.warn("[safe-push] ALLOW_DESTRUCTIVE_SCHEMA=1 is set -- applying anyway.");

  await plan.apply();
  console.log("[safe-push] Schema applied.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[safe-push] Failed:", err);
    process.exit(1);
  });
