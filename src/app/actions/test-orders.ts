"use server";

import { revalidatePath } from "next/cache";
import { and, eq, like, sql } from "drizzle-orm";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { purchasingCustomers, users } from "@/db/schema";
import { isAdmin } from "@/lib/permissions";
import { isPlatformAdminEmail } from "@/lib/catalog-template";
import { TEST_ORDER_COUNT, TEST_PREFIX } from "@/lib/test-orders-data";
import { loadCatalog, prepareTestOrders, removeAllTestOrders, runTestOrder, type PrepareResult, type TestOrderResult } from "@/lib/test-orders-run";

export type TestOrdersState = {
  error?: string;
  loaded?: number;
  prepare?: PrepareResult;
  results?: TestOrderResult[];
  removed?: { orders: number; customers: number };
};

/** Only the platform owner, signed in as an Owner / Admin of the company they are testing in. */
async function requireTester() {
  const org = await requireOrg();
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  if (!isPlatformAdminEmail(u?.email) || !isAdmin(org.role)) throw new Error("Only the platform owner can use the test tool.");
  return org;
}

export async function testOrdersStatus(): Promise<{ count: number }> {
  const org = await requireTester();
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.organizationId, org.organizationId), like(purchasingCustomers.customerReferenceNumber, `${TEST_PREFIX}-%`)));
  return { count: Number(r?.n ?? 0) };
}

/** Step 0: recalls, recall numbers and test prices. */
export async function startTestOrders(): Promise<TestOrdersState> {
  const org = await requireTester();
  try {
    return { prepare: await prepareTestOrders(org) };
  } catch (e) {
    return { error: `Setup failed: ${(e as Error).message}` };
  }
}

/** Creates orders from..from+count-1 (1-based). The screen calls this a few orders at a time so no single request runs long. */
export async function loadTestOrdersChunk(from: number, count: number): Promise<TestOrdersState> {
  const org = await requireTester();
  const cat = await loadCatalog(org);
  const results: TestOrderResult[] = [];
  const first = Math.max(1, Math.floor(from));
  const last = Math.min(TEST_ORDER_COUNT, first + Math.max(1, Math.min(Math.floor(count), 5)) - 1);
  for (let i = first; i <= last; i++) {
    try {
      results.push(await runTestOrder(org, cat, i));
    } catch (e) {
      results.push({
        index: i,
        kind: "?",
        quotationId: null,
        quotationNumber: null,
        customer: "",
        tracking: "",
        lines: [],
        total: null,
        receiving: "",
        recall: "",
        notes: [],
        problems: [`Order ${i} stopped with an error: ${(e as Error).message}`],
      });
    }
  }
  revalidatePath("/dashboard/purchasing");
  revalidatePath("/dashboard/purchasing/quotations");
  revalidatePath("/dashboard/receiving");
  return { results, loaded: last };
}

export async function removeTestOrders(): Promise<TestOrdersState> {
  const org = await requireTester();
  const removed = await removeAllTestOrders(org);
  revalidatePath("/dashboard/purchasing");
  revalidatePath("/dashboard/purchasing/quotations");
  revalidatePath("/dashboard/purchasing/customers");
  revalidatePath("/dashboard/receiving");
  return { removed };
}
