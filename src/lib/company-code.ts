// Every company gets a short, permanent reference ("JJ-1042") the first time it is needed. It appears on every support ticket and in the
// Companies panel, so the platform owner can tell at a glance -- and say over the phone -- which company is calling.

import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";

export const COMPANY_CODE_PREFIX = "JJ-";
export const FIRST_COMPANY_NUMBER = 1001;

export function isCompanyCode(s: string): boolean {
  return /^JJ-\d{4,}$/.test(s);
}

/** The next number to hand out, given the codes already in use (pure, so it can be tested). */
export function nextCompanyNumber(existing: (string | null | undefined)[]): number {
  let max = FIRST_COMPANY_NUMBER - 1;
  for (const c of existing) {
    const m = /^JJ-(\d+)$/.exec(c ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** The company's code, handing one out first if it has none yet. Safe to call repeatedly and at the same time. */
export async function ensureCompanyCode(organizationId: string): Promise<string> {
  const [row] = await db.select({ code: organizations.companyCode }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (row?.code) return row.code;
  for (let attempt = 0; attempt < 6; attempt++) {
    const used = await db.select({ code: organizations.companyCode }).from(organizations).where(isNotNull(organizations.companyCode));
    const code = `${COMPANY_CODE_PREFIX}${nextCompanyNumber(used.map((u) => u.code))}`;
    try {
      await db.update(organizations).set({ companyCode: code }).where(eq(organizations.id, organizationId));
      const [check] = await db.select({ code: organizations.companyCode }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (check?.code) return check.code;
    } catch {
      // another company took that number a moment ago (unique index) -- try the next one
    }
  }
  throw new Error("Could not hand out a company code.");
}
