// Address profiles for Shipping: a pharmacy, a wholesale buyer, a seller, a supplier. Typed by hand or brought over from the places
// the company already keeps them (Sales buyers, Purchasing sellers, Purchasing suppliers). A profile is hidden, never deleted.

import { and, asc, eq, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, purchasingSuppliers, salesBuyers, shippingContacts } from "@/db/schema";
import { newId } from "@/lib/ids";
import { cleanAddress, isContactKind, parseUsAddress, type ContactKind } from "@/lib/shipping-address-rules";
import type { Org } from "@/lib/sales-service";

export type Contact = typeof shippingContacts.$inferSelect;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type ContactInput = {
  kind?: string; name?: string; company?: string | null; street1?: string | null; street2?: string | null; city?: string | null; state?: string | null; zip?: string | null;
  phone?: string | null; email?: string | null; isResidential?: boolean; notes?: string | null;
};

export async function listContacts(organizationId: string, opts: { kind?: string; q?: string; hidden?: boolean } = {}): Promise<Contact[]> {
  const conds = [eq(shippingContacts.organizationId, organizationId)];
  conds.push(opts.hidden ? sql`${shippingContacts.hiddenAt} is not null` : isNull(shippingContacts.hiddenAt));
  if (opts.kind && isContactKind(opts.kind)) conds.push(eq(shippingContacts.kind, opts.kind));
  const q = (opts.q ?? "").trim().slice(0, 60).replace(/[%_]/g, "");
  if (q) {
    const p = `%${q}%`;
    conds.push(or(like(shippingContacts.name, p), like(shippingContacts.company, p), like(shippingContacts.city, p), like(shippingContacts.zip, p), like(shippingContacts.email, p))!);
  }
  return db.select().from(shippingContacts).where(and(...conds)).orderBy(asc(shippingContacts.name)).limit(500);
}

export async function getContact(organizationId: string, id: string): Promise<Contact | null> {
  const [c] = await db.select().from(shippingContacts).where(and(eq(shippingContacts.organizationId, organizationId), eq(shippingContacts.id, id))).limit(1);
  return c ?? null;
}

function normalize(input: ContactInput): { ok: true; values: Omit<typeof shippingContacts.$inferInsert, "id" | "organizationId"> } | { ok: false; error: string } {
  const a = cleanAddress({ name: input.name, company: input.company, street1: input.street1, street2: input.street2, city: input.city, state: input.state, zip: input.zip, phone: input.phone, email: input.email });
  if (!a.name && !a.company) return { ok: false, error: "Type a name for this profile." };
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return { ok: false, error: "That email address doesn't look right." };
  const kind: ContactKind = isContactKind(input.kind) ? input.kind : "BUYER";
  return {
    ok: true,
    values: {
      kind, name: a.name || a.company || "", company: a.company ?? null, street1: a.street1 || null, street2: a.street2 ?? null, city: a.city || null, state: a.state || null, zip: a.zip || null,
      country: a.country ?? "US", phone: a.phone ?? null, email: a.email ?? null, isResidential: !!input.isResidential, notes: (input.notes ?? "").trim().slice(0, 500) || null,
    },
  };
}

export async function createContact(org: Org, input: ContactInput): Promise<Result<{ id: string }>> {
  const n = normalize(input);
  if (!n.ok) return n;
  const id = newId("scon");
  await db.insert(shippingContacts).values({ id, organizationId: org.organizationId, ...n.values });
  return { ok: true, id };
}

export async function updateContact(org: Org, id: string, input: ContactInput): Promise<Result> {
  const have = await getContact(org.organizationId, id);
  if (!have) return { ok: false, error: "That profile wasn't found." };
  const n = normalize(input);
  if (!n.ok) return n;
  await db.update(shippingContacts).set({ ...n.values, updatedAt: sql`(current_timestamp)` }).where(and(eq(shippingContacts.id, id), eq(shippingContacts.organizationId, org.organizationId)));
  return { ok: true };
}

export async function setContactHidden(org: Org, id: string, hidden: boolean): Promise<Result> {
  const have = await getContact(org.organizationId, id);
  if (!have) return { ok: false, error: "That profile wasn't found." };
  await db.update(shippingContacts).set({ hiddenAt: hidden ? new Date().toISOString() : null, updatedAt: sql`(current_timestamp)` }).where(and(eq(shippingContacts.id, id), eq(shippingContacts.organizationId, org.organizationId)));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bringing contacts over
// ---------------------------------------------------------------------------

type Candidate = { sourceKind: string; sourceId: string; values: Omit<typeof shippingContacts.$inferInsert, "id" | "organizationId"> };

const blank = (v: string | null | undefined) => (v ?? "").trim() || null;

/** One Sales buyer / Purchasing seller / Purchasing supplier as a profile (the address text is read into its parts where it can be). */
export function candidatesFrom(src: {
  buyers: (typeof salesBuyers.$inferSelect)[];
  sellers: (typeof purchasingCustomers.$inferSelect)[];
  suppliers: (typeof purchasingSuppliers.$inferSelect)[];
}): Candidate[] {
  const out: Candidate[] = [];
  for (const b of src.buyers) {
    const p = parseUsAddress(b.shippingAddress) ?? parseUsAddress(b.billingAddress);
    out.push({
      sourceKind: "sales_buyer", sourceId: b.id,
      values: { kind: "BUYER", name: blank(b.contactName) ?? b.companyName, company: b.companyName, street1: p?.street1 ?? null, street2: p?.street2 ?? null, city: p?.city ?? null, state: p?.state ?? null, zip: p?.zip ?? null, country: "US", phone: blank(b.phone), email: blank(b.email), isResidential: false, notes: p ? null : blank(b.shippingAddress) ?? blank(b.billingAddress) },
    });
  }
  for (const c of src.sellers) {
    out.push({
      sourceKind: "purchasing_customer", sourceId: c.id,
      values: { kind: "SELLER", name: `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`.trim(), company: null, street1: blank(c.addressStreet1), street2: blank(c.addressStreet2), city: blank(c.addressCity), state: blank(c.addressState), zip: blank(c.addressZip), country: c.addressCountry || "US", phone: blank(c.phone), email: blank(c.email), isResidential: c.isResidential, notes: null },
    });
  }
  for (const s of src.suppliers) {
    const p = parseUsAddress(s.address);
    out.push({
      sourceKind: "purchasing_supplier", sourceId: s.id,
      values: { kind: "SUPPLIER", name: blank(s.contactName) ?? s.name, company: s.name, street1: p?.street1 ?? null, street2: p?.street2 ?? null, city: p?.city ?? null, state: p?.state ?? null, zip: p?.zip ?? null, country: "US", phone: blank(s.phone), email: blank(s.email), isResidential: false, notes: p ? null : blank(s.address) },
    });
  }
  return out;
}

async function loadSources(organizationId: string) {
  const [buyers, sellers, suppliers] = await Promise.all([
    db.select().from(salesBuyers).where(and(eq(salesBuyers.organizationId, organizationId), eq(salesBuyers.active, true))),
    db.select().from(purchasingCustomers).where(and(eq(purchasingCustomers.organizationId, organizationId), eq(purchasingCustomers.active, true), isNull(purchasingCustomers.archivedAt))),
    db.select().from(purchasingSuppliers).where(and(eq(purchasingSuppliers.organizationId, organizationId), isNull(purchasingSuppliers.archivedAt))),
  ]);
  return { buyers, sellers, suppliers };
}

/** How many contacts are waiting to be brought over, by where they live. */
export async function importPreview(organizationId: string): Promise<{ sales_buyer: number; purchasing_customer: number; purchasing_supplier: number }> {
  const all = candidatesFrom(await loadSources(organizationId));
  const have = await db.select({ k: shippingContacts.sourceKind, i: shippingContacts.sourceId }).from(shippingContacts).where(eq(shippingContacts.organizationId, organizationId));
  const seen = new Set(have.map((h) => `${h.k}:${h.i}`));
  const left = all.filter((c) => !seen.has(`${c.sourceKind}:${c.sourceId}`));
  return {
    sales_buyer: left.filter((c) => c.sourceKind === "sales_buyer").length,
    purchasing_customer: left.filter((c) => c.sourceKind === "purchasing_customer").length,
    purchasing_supplier: left.filter((c) => c.sourceKind === "purchasing_supplier").length,
  };
}

/** Brings the chosen groups over. Anyone already brought over is skipped, so pressing it twice never duplicates. */
export async function importContacts(org: Org, groups: string[]): Promise<Result<{ added: number }>> {
  const want = new Set<string>(groups.filter((g) => g === "sales_buyer" || g === "purchasing_customer" || g === "purchasing_supplier"));
  if (want.size === 0) return { ok: false, error: "Choose what to bring over." };
  const all = candidatesFrom(await loadSources(org.organizationId)).filter((c) => want.has(c.sourceKind));
  const have = await db.select({ k: shippingContacts.sourceKind, i: shippingContacts.sourceId }).from(shippingContacts).where(eq(shippingContacts.organizationId, org.organizationId));
  const seen = new Set(have.map((h) => `${h.k}:${h.i}`));
  let added = 0;
  for (const c of all) {
    if (seen.has(`${c.sourceKind}:${c.sourceId}`)) continue;
    await db.insert(shippingContacts).values({ id: newId("scon"), organizationId: org.organizationId, sourceKind: c.sourceKind, sourceId: c.sourceId, ...c.values }).onConflictDoNothing();
    added++;
  }
  return { ok: true, added };
}

/** The profile that matches a Sales buyer, made on the spot when it doesn't exist yet (so starting a shipment finds the address). */
export async function contactForSalesBuyer(org: Org, buyerId: string): Promise<Contact | null> {
  const [have] = await db
    .select()
    .from(shippingContacts)
    .where(and(eq(shippingContacts.organizationId, org.organizationId), eq(shippingContacts.sourceKind, "sales_buyer"), eq(shippingContacts.sourceId, buyerId)))
    .limit(1);
  if (have) return have;
  const [b] = await db.select().from(salesBuyers).where(and(eq(salesBuyers.organizationId, org.organizationId), eq(salesBuyers.id, buyerId))).limit(1);
  if (!b) return null;
  const c = candidatesFrom({ buyers: [b], sellers: [], suppliers: [] })[0];
  const id = newId("scon");
  await db.insert(shippingContacts).values({ id, organizationId: org.organizationId, sourceKind: c.sourceKind, sourceId: c.sourceId, ...c.values }).onConflictDoNothing();
  return getContact(org.organizationId, id) ?? null;
}
