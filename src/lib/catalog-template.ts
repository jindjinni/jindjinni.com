// The platform's shared DEFAULT catalog.
//
// One company (the platform owner's own) publishes a snapshot of its products,
// brands, NDCs, conditions, month ranges, starter recalls and receipt wording.
// Every company that signs up afterwards gets its OWN COPY of the latest
// snapshot, which it can then edit, reprice or remove freely. Prices are never
// part of the snapshot (every product arrives at $0) and nothing is shared
// live: after the copy, each company's rows are theirs alone.
//
// Safety rails: the snapshot is built only from the publishing company's
// catalog tables (no customers, quotations, receiving history, recall lot
// lists or prices), and publishing is refused if the wording contains the
// publisher's own company name / email / phone.
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  businessProfiles,
  organizations,
  platformCatalogTemplates,
  purchasingCategories,
  purchasingConditions,
  purchasingExpirationRanges,
  purchasingProductConditions,
  purchasingProductMultipliers,
  purchasingProducts,
  purchasingReceiptSettings,
  receivingRecalls,
} from "@/db/schema";
import {
  defaultPurchasingCategoryRows,
  defaultPurchasingConditionRows,
  defaultPurchasingExpirationRangeRows,
  newId,
} from "@/lib/ids";
import { seedPurchasingProductCatalogForOrg } from "@/lib/purchasing-catalog-seed";
import { setupDefaultRecalls } from "@/lib/receiving-recall-service";

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

export type TemplateRange = { label: string; minMonths: number | null; maxMonths: number | null; defaultMultiplier: number; active: boolean };
export type TemplateProduct = {
  name: string;
  category: string | null;
  productCode: string | null;
  ndc: string | null;
  notes: string | null;
  noExpiration: boolean;
  active: boolean;
  /** Condition names this product carries. */
  conditions: string[];
  /** Month ranges this product allows, by index into `ranges`, with its own multiplier. */
  ranges: { r: number; multiplier: number }[];
  /** Template version that first contained this product (drives "Get new products"). */
  v: number;
};
export type TemplateRecall = {
  name: string;
  manufacturer: string;
  keywords: string;
  numberHint: string | null;
  lookupUrl: string | null;
  lookupLabel: string | null;
  noticeUrl: string | null;
  active: boolean;
  v: number;
};
export type TemplateReceipt = {
  bannerText: string | null;
  shippingSuffix: string | null;
  disclaimerIntro: string | null;
  disclaimerReturnPolicy: string | null;
  disclaimerDamageSummary: string | null;
  conditionHeading: string | null;
  conditionBullets: string | null;
  paymentTimingText: string | null;
  paymentTimingSubtext: string | null;
  footerThankYou: string | null;
};
export type CatalogTemplateData = {
  categories: { name: string; active: boolean }[];
  conditions: { name: string; multiplier: number; active: boolean }[];
  ranges: TemplateRange[];
  products: TemplateProduct[];
  recalls: TemplateRecall[];
  receipt: TemplateReceipt | null;
};
export type LoadedTemplate = {
  version: number;
  publishedAt: string;
  publishedByEmail: string | null;
  data: CatalogTemplateData;
};

export const rangeKey = (r: { label: string; minMonths: number | null; maxMonths: number | null }) =>
  `${r.label.trim().toLowerCase()}|${r.minMonths ?? ""}|${r.maxMonths ?? ""}`;
const lc = (s: string) => s.trim().toLowerCase();

/** Platform admins are listed in the PLATFORM_ADMIN_EMAILS environment variable (comma separated). */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

function chunk<T>(rows: T[], size = 80): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Reading the latest published snapshot
// ---------------------------------------------------------------------------

export async function getLatestTemplate(): Promise<LoadedTemplate | null> {
  const [row] = await db
    .select()
    .from(platformCatalogTemplates)
    .orderBy(sql`${platformCatalogTemplates.version} desc`)
    .limit(1);
  if (!row) return null;
  try {
    const data = JSON.parse(row.payload) as CatalogTemplateData;
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.categories)) return null;
    return {
      version: row.version,
      publishedAt: row.publishedAt,
      publishedByEmail: row.publishedByEmail,
      data: {
        categories: data.categories,
        conditions: data.conditions ?? [],
        ranges: data.ranges ?? [],
        products: data.products,
        recalls: data.recalls ?? [],
        receipt: data.receipt ?? null,
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export type PublishResult =
  | { ok: true; version: number; counts: { products: number; categories: number; conditions: number; ranges: number; recalls: number } }
  | { ok: false; error: string };

/** Everything that is free text in the snapshot, so it can be checked for the publisher's own details. */
function textsToCheck(d: CatalogTemplateData): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const p of d.products) {
    if (p.notes) out.push({ where: `the notes on "${p.name}"`, text: p.notes });
    if (p.productCode) out.push({ where: `the product code of "${p.name}"`, text: p.productCode });
  }
  for (const r of d.recalls) {
    out.push({ where: `the recall "${r.name}"`, text: [r.name, r.manufacturer, r.numberHint, r.lookupLabel].filter(Boolean).join(" ") });
  }
  if (d.receipt) {
    for (const [k, v] of Object.entries(d.receipt)) if (v) out.push({ where: `the receipt wording (${k})`, text: String(v) });
  }
  return out;
}

export async function buildTemplateFromOrg(organizationId: string): Promise<CatalogTemplateData> {
  const [cats, conds, ranges, prods, links, mults, recalls, [receipt]] = await Promise.all([
    db.select().from(purchasingCategories).where(eq(purchasingCategories.organizationId, organizationId)).orderBy(purchasingCategories.sortOrder),
    db.select().from(purchasingConditions).where(eq(purchasingConditions.organizationId, organizationId)).orderBy(purchasingConditions.sortOrder),
    db.select().from(purchasingExpirationRanges).where(eq(purchasingExpirationRanges.organizationId, organizationId)).orderBy(purchasingExpirationRanges.sortOrder),
    db.select().from(purchasingProducts).where(and(eq(purchasingProducts.organizationId, organizationId), isNull(purchasingProducts.archivedAt))),
    db.select().from(purchasingProductConditions).where(eq(purchasingProductConditions.organizationId, organizationId)),
    db.select().from(purchasingProductMultipliers).where(eq(purchasingProductMultipliers.organizationId, organizationId)),
    db.select().from(receivingRecalls).where(eq(receivingRecalls.organizationId, organizationId)),
    db.select().from(purchasingReceiptSettings).where(eq(purchasingReceiptSettings.organizationId, organizationId)).limit(1),
  ]);

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const condName = new Map(conds.map((c) => [c.id, c.name]));
  const rangeIndex = new Map(ranges.map((r, i) => [r.id, i]));
  const prev = await getLatestTemplate();
  const prevV = new Map((prev?.data.products ?? []).map((p) => [lc(p.name), p.v]));
  const prevRecallV = new Map((prev?.data.recalls ?? []).map((r) => [lc(r.name), r.v]));
  const nextVersion = (prev?.version ?? 0) + 1;

  const linksBy = new Map<string, string[]>();
  for (const l of links) {
    const n = condName.get(l.conditionId);
    if (!n) continue;
    linksBy.set(l.productId, [...(linksBy.get(l.productId) ?? []), n]);
  }
  const multsBy = new Map<string, { r: number; multiplier: number }[]>();
  for (const m of mults) {
    const r = rangeIndex.get(m.expirationRangeId);
    if (r === undefined) continue;
    multsBy.set(m.productId, [...(multsBy.get(m.productId) ?? []), { r, multiplier: m.multiplier }]);
  }

  return {
    categories: cats.map((c) => ({ name: c.name, active: c.active })),
    conditions: conds.map((c) => ({ name: c.name, multiplier: c.multiplier, active: c.active })),
    ranges: ranges.map((r) => ({ label: r.label, minMonths: r.minMonths, maxMonths: r.maxMonths, defaultMultiplier: r.defaultMultiplier, active: r.active })),
    products: prods
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        name: p.name,
        category: p.categoryId ? (catName.get(p.categoryId) ?? null) : null,
        productCode: p.productCode,
        ndc: p.ndc,
        notes: p.notes,
        noExpiration: p.noExpiration,
        active: p.active,
        conditions: linksBy.get(p.id) ?? [],
        ranges: multsBy.get(p.id) ?? [],
        v: prevV.get(lc(p.name)) ?? nextVersion,
      })),
    // Starter recalls only: the manufacturer lookup pages and keywords, never a lot / serial list.
    recalls: recalls.map((r) => ({
      name: r.name,
      manufacturer: r.manufacturer,
      keywords: r.keywords,
      numberHint: r.numberHint,
      lookupUrl: r.lookupUrl,
      lookupLabel: r.lookupLabel,
      noticeUrl: r.noticeUrl,
      active: r.active,
      v: prevRecallV.get(lc(r.name)) ?? nextVersion,
    })),
    receipt: receipt
      ? {
          bannerText: receipt.bannerText,
          shippingSuffix: receipt.shippingSuffix,
          disclaimerIntro: receipt.disclaimerIntro,
          disclaimerReturnPolicy: receipt.disclaimerReturnPolicy,
          disclaimerDamageSummary: receipt.disclaimerDamageSummary,
          conditionHeading: receipt.conditionHeading,
          conditionBullets: receipt.conditionBullets,
          paymentTimingText: receipt.paymentTimingText,
          paymentTimingSubtext: receipt.paymentTimingSubtext,
          footerThankYou: receipt.footerThankYou,
        }
      : null,
  };
}

export async function publishTemplateFromOrg(organizationId: string, publisherEmail: string | null): Promise<PublishResult> {
  const data = await buildTemplateFromOrg(organizationId);
  if (data.products.length === 0) return { ok: false, error: "Your catalog has no products yet, so there is nothing to publish." };

  // Don't let the publisher's own details leak into every new company's defaults.
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const [bp] = await db
    .select({ email: businessProfiles.businessEmail, phone: businessProfiles.businessPhone })
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, organizationId))
    .limit(1);
  const needles = [org?.name, bp?.email].filter((x): x is string => !!x && x.trim().length >= 4).map(lc);
  const phoneDigits = (bp?.phone ?? "").replace(/\D/g, "");
  for (const { where, text } of textsToCheck(data)) {
    const hay = lc(text);
    const hit = needles.find((n) => hay.includes(n)) ?? (phoneDigits.length >= 7 && text.replace(/\D/g, "").includes(phoneDigits) ? "your phone number" : undefined);
    if (hit) {
      return { ok: false, error: `Not published: ${where} mentions ${hit === "your phone number" ? hit : `"${hit}"`}. Take your own company details out of it first -- this catalog is copied to every new company.` };
    }
  }

  const [last] = await db.select({ v: platformCatalogTemplates.version }).from(platformCatalogTemplates).orderBy(sql`${platformCatalogTemplates.version} desc`).limit(1);
  const version = (last?.v ?? 0) + 1;
  await db.insert(platformCatalogTemplates).values({
    id: newId("tpl"),
    version,
    payload: JSON.stringify(data),
    publishedByEmail: publisherEmail,
    publishedFromOrganizationId: organizationId,
  });
  // The publisher already has everything in this version.
  await db.update(organizations).set({ catalogTemplateVersion: version }).where(eq(organizations.id, organizationId));
  return {
    ok: true,
    version,
    counts: { products: data.products.length, categories: data.categories.length, conditions: data.conditions.length, ranges: data.ranges.length, recalls: data.recalls.length },
  };
}

// ---------------------------------------------------------------------------
// Applying a snapshot to ONE company (always scoped to that company's id)
// ---------------------------------------------------------------------------

/** Inserts a whole snapshot into a brand-new, empty company. Prices are always 0. */
async function insertTemplateForNewOrg(organizationId: string, t: LoadedTemplate): Promise<void> {
  const d = t.data;

  const catRows = d.categories.map((c, sortOrder) => ({ id: newId("pcat"), organizationId, name: c.name, sortOrder, active: c.active }));
  for (const rows of chunk(catRows)) await db.insert(purchasingCategories).values(rows);
  const catId = new Map(catRows.map((c) => [lc(c.name), c.id]));

  const condRows = d.conditions.map((c, sortOrder) => ({ id: newId("pcond"), organizationId, name: c.name, multiplier: c.multiplier, sortOrder, active: c.active }));
  for (const rows of chunk(condRows)) await db.insert(purchasingConditions).values(rows);
  const condId = new Map(condRows.map((c) => [lc(c.name), c.id]));

  const rangeRows = d.ranges.map((r, sortOrder) => ({
    id: newId("prange"),
    organizationId,
    label: r.label,
    minMonths: r.minMonths,
    maxMonths: r.maxMonths,
    defaultMultiplier: r.defaultMultiplier,
    sortOrder,
    active: r.active,
  }));
  for (const rows of chunk(rangeRows)) await db.insert(purchasingExpirationRanges).values(rows);

  await insertProducts(organizationId, d.products, { catId, condId, rangeId: (i) => rangeRows[i]?.id });

  for (const r of d.recalls) await insertRecall(organizationId, r);

  if (d.receipt) {
    await db.insert(purchasingReceiptSettings).values({ id: newId("preceiptset"), organizationId, ...d.receipt });
  }
}

async function insertRecall(organizationId: string, r: TemplateRecall) {
  await db.insert(receivingRecalls).values({
    id: newId("rcl"),
    organizationId,
    name: r.name,
    manufacturer: r.manufacturer,
    keywords: r.keywords,
    numberHint: r.numberHint,
    lookupUrl: r.lookupUrl,
    lookupLabel: r.lookupLabel,
    noticeUrl: r.noticeUrl,
    active: r.active,
  });
}

async function insertProducts(
  organizationId: string,
  products: TemplateProduct[],
  maps: { catId: Map<string, string>; condId: Map<string, string>; rangeId: (templateIndex: number) => string | undefined },
) {
  const prodRows: (typeof purchasingProducts.$inferInsert)[] = [];
  const linkRows: (typeof purchasingProductConditions.$inferInsert)[] = [];
  const multRows: (typeof purchasingProductMultipliers.$inferInsert)[] = [];
  for (const p of products) {
    const id = newId("pprod");
    prodRows.push({
      id,
      organizationId,
      categoryId: p.category ? (maps.catId.get(lc(p.category)) ?? null) : null,
      name: p.name,
      productCode: p.productCode,
      ndc: p.ndc,
      standardPrice: 0, // every company sets its own prices
      notes: p.notes,
      noExpiration: p.noExpiration,
      active: p.active,
    });
    const seen = new Set<string>();
    for (const cn of p.conditions) {
      const cid = maps.condId.get(lc(cn));
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      linkRows.push({ id: newId("pprodcond"), organizationId, productId: id, conditionId: cid });
    }
    const seenR = new Set<string>();
    for (const m of p.ranges) {
      const rid = maps.rangeId(m.r);
      if (!rid || seenR.has(rid)) continue;
      seenR.add(rid);
      multRows.push({ id: newId("pmult"), organizationId, productId: id, expirationRangeId: rid, multiplier: m.multiplier });
    }
  }
  for (const rows of chunk(prodRows)) await db.insert(purchasingProducts).values(rows);
  for (const rows of chunk(linkRows)) await db.insert(purchasingProductConditions).values(rows);
  for (const rows of chunk(multRows)) await db.insert(purchasingProductMultipliers).values(rows);
}

async function count(table: typeof purchasingCategories | typeof purchasingConditions | typeof purchasingExpirationRanges, organizationId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(table).where(eq(table.organizationId, organizationId));
  return Number(r?.n ?? 0);
}

/**
 * Sets up a brand-new company's Purchasing catalog: a copy of the platform's
 * latest published default catalog, or -- when none is published yet (or it
 * can't be read) -- the built-in starter lists and product catalog. Never
 * throws: signing up must not fail because of the catalog.
 */
export async function setupNewOrgCatalog(organizationId: string): Promise<{ source: "template" | "built-in"; version: number | null }> {
  let source: "template" | "built-in" = "built-in";
  let version: number | null = null;
  try {
    const t = await getLatestTemplate();
    if (t) {
      await insertTemplateForNewOrg(organizationId, t);
      await db.update(organizations).set({ catalogTemplateVersion: t.version }).where(eq(organizations.id, organizationId));
      source = "template";
      version = t.version;
    }
  } catch (err) {
    console.error("[catalog-template] could not copy the default catalog, using the built-in one", err);
  }

  try {
    // Anything the copy didn't fill (or all of it, when there's no template) gets the built-in starter lists.
    if ((await count(purchasingCategories, organizationId)) === 0) await db.insert(purchasingCategories).values(defaultPurchasingCategoryRows(organizationId));
    if ((await count(purchasingConditions, organizationId)) === 0) await db.insert(purchasingConditions).values(defaultPurchasingConditionRows(organizationId));
    if ((await count(purchasingExpirationRanges, organizationId)) === 0) await db.insert(purchasingExpirationRanges).values(defaultPurchasingExpirationRangeRows(organizationId));
    if (source === "built-in") {
      await seedPurchasingProductCatalogForOrg(organizationId);
      await setupDefaultRecalls(organizationId);
    }
  } catch (err) {
    console.error("[catalog-template] could not finish the built-in catalog", err);
  }
  return { source, version };
}

// ---------------------------------------------------------------------------
// "Get new products" for a company that already exists
// ---------------------------------------------------------------------------

export type NewProductsPlan = {
  hasTemplate: boolean;
  latestVersion: number | null;
  /** Products added to the default catalog since this company last received it, that it doesn't already have. */
  products: TemplateProduct[];
  recalls: TemplateRecall[];
};

export async function planNewProducts(organizationId: string): Promise<NewProductsPlan> {
  const t = await getLatestTemplate();
  if (!t) return { hasTemplate: false, latestVersion: null, products: [], recalls: [] };
  const [org] = await db.select({ v: organizations.catalogTemplateVersion }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const have = org?.v ?? 0;

  const existing = await db.select({ name: purchasingProducts.name }).from(purchasingProducts).where(eq(purchasingProducts.organizationId, organizationId));
  const names = new Set(existing.map((p) => lc(p.name)));
  const existingRecalls = await db.select({ name: receivingRecalls.name }).from(receivingRecalls).where(eq(receivingRecalls.organizationId, organizationId));
  const recallNames = new Set(existingRecalls.map((r) => lc(r.name)));

  return {
    hasTemplate: true,
    latestVersion: t.version,
    // A company that has never received a version (v = 0) is offered everything it doesn't have by name;
    // after that, only what was added later -- so products it removed on purpose don't keep coming back.
    products: t.data.products.filter((p) => p.v > have && !names.has(lc(p.name))),
    recalls: t.data.recalls.filter((r) => r.v > have && !recallNames.has(lc(r.name))),
  };
}

export type AddNewProductsResult = { addedProducts: number; addedRecalls: number; upToDate: boolean };

export async function addNewProductsForOrg(organizationId: string): Promise<AddNewProductsResult> {
  const t = await getLatestTemplate();
  const plan = await planNewProducts(organizationId);
  if (!t || !plan.hasTemplate) return { addedProducts: 0, addedRecalls: 0, upToDate: true };

  if (plan.products.length > 0) {
    // Brands this company already has are reused by name; a missing brand is added.
    const cats = await db.select({ id: purchasingCategories.id, name: purchasingCategories.name }).from(purchasingCategories).where(eq(purchasingCategories.organizationId, organizationId));
    const catId = new Map(cats.map((c) => [lc(c.name), c.id]));
    let sort = cats.length;
    for (const name of new Set(plan.products.map((p) => p.category).filter((c): c is string => !!c))) {
      if (catId.has(lc(name))) continue;
      const id = newId("pcat");
      await db.insert(purchasingCategories).values({ id, organizationId, name, sortOrder: sort++ });
      catId.set(lc(name), id);
    }
    // Conditions and month ranges the company already has are linked by name / range; ones it removed stay removed.
    const conds = await db.select({ id: purchasingConditions.id, name: purchasingConditions.name }).from(purchasingConditions).where(eq(purchasingConditions.organizationId, organizationId));
    const condId = new Map(conds.map((c) => [lc(c.name), c.id]));
    const ranges = await db.select().from(purchasingExpirationRanges).where(eq(purchasingExpirationRanges.organizationId, organizationId));
    const rangeByKey = new Map(ranges.map((r) => [rangeKey(r), r.id]));
    const rangeId = (i: number) => {
      const tr = t.data.ranges[i];
      return tr ? rangeByKey.get(rangeKey(tr)) : undefined;
    };
    await insertProducts(organizationId, plan.products, { catId, condId, rangeId });
  }
  for (const r of plan.recalls) await insertRecall(organizationId, r);

  await db.update(organizations).set({ catalogTemplateVersion: t.version }).where(eq(organizations.id, organizationId));
  return { addedProducts: plan.products.length, addedRecalls: plan.recalls.length, upToDate: plan.products.length === 0 && plan.recalls.length === 0 };
}
