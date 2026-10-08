// A small, shared "too many tries" counter for public forms. It lives in the database (not in memory) because the site runs
// on many short-lived servers at once, so a memory counter would only ever see a fraction of the tries. Keys are hashed so no
// email address or network address is kept in the clear. If the counter itself fails, we let the request through rather than
// lock everyone out (the human check and the per-account lock still apply).

import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const keyOf = (scope: string, who: string) => `${scope}:${hash(who)}`;

type Result = { allowed: boolean; retryAfterSec: number };

async function read(key: string, windowSec: number): Promise<{ count: number; retryAfterSec: number }> {
  const now = Date.now();
  const rows = (await db.all(sql`select count, window_start as windowStart from rate_limits where key = ${key}`)) as { count: number; windowStart: number }[];
  const row = rows[0];
  if (!row || row.windowStart <= now - windowSec * 1000) return { count: 0, retryAfterSec: 0 };
  return { count: Number(row.count), retryAfterSec: Math.max(1, Math.ceil((row.windowStart + windowSec * 1000 - now) / 1000)) };
}

/** Is this person (identified by `who`, such as a network address) still under the limit? Does not count anything. */
export async function rateCheck(scope: string, who: string, max: number, windowSec: number): Promise<Result> {
  try {
    const r = await read(keyOf(scope, who), windowSec);
    return { allowed: r.count < max, retryAfterSec: r.retryAfterSec };
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** Counts one try. Returns whether this try is within the limit. */
export async function rateHit(scope: string, who: string, max: number, windowSec: number): Promise<Result> {
  const key = keyOf(scope, who);
  const now = Date.now();
  try {
    const cutoff = now - windowSec * 1000;
    await db.run(sql`
      insert into rate_limits (key, window_start, count) values (${key}, ${now}, 1)
      on conflict(key) do update set
        count = case when window_start <= ${cutoff} then 1 else count + 1 end,
        window_start = case when window_start <= ${cutoff} then ${now} else window_start end`);
    if (Math.random() < 0.01) await db.run(sql`delete from rate_limits where window_start < ${now - 24 * 3600 * 1000}`);
    const r = await read(key, windowSec);
    return { allowed: r.count <= max, retryAfterSec: r.retryAfterSec };
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}

export function waitMessage(sec: number): string {
  const min = Math.ceil(sec / 60);
  return `Too many tries from your connection. Please wait ${min} minute${min === 1 ? "" : "s"} and try again.`;
}
