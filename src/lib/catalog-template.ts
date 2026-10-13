// The platform's shared DEFAULT catalog.
//
// One company (the platform owner's own) publishes a snapshot of its products,
// brands, NDCs, conditions, month ranges, starter recalls and receipt wording.
// Every company that signs up afterwards gets its OWN COPY of the latest
// snapshot, which it can then edit, reprice or remove freely. Prices are never
// part of the snapshot only in the sense that they are the platform owner's
// chosen STARTING prices: each product arrives at the published price (and the
// bonus tiers come along), and nothing is shared live: after the copy, each
// company's rows are theirs alone to reprice or remove.
//
// Safety rails: the snapshot is built only from the publishing company's
// catalog tables (no customers, quotations, receiving history or recall lot
// lists), and publishing is refused if the wording contains the
// publisher's own company name / email / phone.
import { fillShippingAddressFromProfile } from "@/lib/address-defaults";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  businessProfiles,
  organizations,
  platformCatalogTemplates,
  purchasingBonusTiers,
  purchasingCategories,
  purchasingConditions,
  purchasingExpirationRanges,
  purchasingProductConditions,
  purchasingProductMultipliers,
  purchasingProducts,
  purchasingQuotations,
  purchasingReceiptSettings,
  accountsSettings,
  receivingEmailTemplates,
  receivingRecalls,
} from "@/db/schema";
import {
  defaultPurchasingBonusTierRows,
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
  /** Starting price (what the platform owner charges/pays per unit). Older snapshots have none = 0. */
  price?: number;
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
/** General (not company-specific) settings the platform owner has set up. Absent in older snapshots. */
export type TemplateSettings = {
  /** Accounts -> Payment terms. */
  accounts: { payWithinBusinessDays: number; skipUsHolidays: boolean; timeZone: string } | null;
  /** Receiving Intake Form settings, as the stored JSON text. */
  receivingFormConfig: string | null;
  /** The customer-email wording (Receiving), one per template key. */
  emailTemplates: { templateKey: string; subject: string; body: string }[];
  /** Menus and department colors, as the stored JSON text. */
  sidebarMenus: string | null;
  departmentThemes: string | null;
};
export type TemplateBonusTier = { thresholdAmount: number; bonusAmount: number; description: string | null; active: boolean };
export type CatalogTemplateData = {
  categories: { name: string; active: boolean }[];
  conditions: { name: string; multiplier: number; active: boolean }[];
  ranges: TemplateRange[];
  products: TemplateProduct[];
  recalls: TemplateRecall[];
  receipt: TemplateReceipt | null;
  /** Absent in snapshots published before bonus tiers were included. */
  bonusTiers?: TemplateBonusTier[];
  settings?: TemplateSettings;
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
/** Two ranges can share a label and differ only in their multiplier, so the multiplier is part of the match. */
const rangeKeyM = (r: { label: string; minMonths: number | null; maxMonths: number | null; defaultMultiplier: number }) => `${rangeKey(r)}|${r.defaultMultiplier}`;

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
        bonusTiers: Array.isArray(data.bonusTiers) ? data.bonusTiers : undefined,
        settings: data.settings && typeof data.settings === "object" ? data.settings : undefined,
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
  | { ok: true; version: number; counts: { products: number; categories: number; conditions: number; ranges: number; recalls: number; priced: number; bonusTiers: number } }
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
  for (const t of d.settings?.emailTemplates ?? []) out.push({ where: `the customer email wording (${t.templateKey})`, text: `${t.subject} ${t.body}` });
  return out;
}

export async function buildTemplateFromOrg(organizationId: string): Promise<CatalogTemplateData> {
  const [cats, conds, ranges, prods, links, mults, recalls, [receipt], tiers, [acct], emailTpls, [orgRow]] = await Promise.all([
    db.select().from(purchasingCategories).where(eq(purchasingCategories.organizationId, organizationId)).orderBy(purchasingCategories.sortOrder),
    db.select().from(purchasingConditions).where(eq(purchasingConditions.organizationId, organizationId)).orderBy(purchasingConditions.sortOrder),
    db.select().from(purchasingExpirationRanges).where(eq(purchasingExpirationRanges.organizationId, organizationId)).orderBy(purchasingExpirationRanges.sortOrder),
    db.select().from(purchasingProducts).where(and(eq(purchasingProducts.organizationId, organizationId), isNull(purchasingProducts.archivedAt))),
    db.select().from(purchasingProductConditions).where(eq(purchasingProductConditions.organizationId, organizationId)),
    db.select().from(purchasingProductMultipliers).where(eq(purchasingProductMultipliers.organizationId, organizationId)),
    db.select().from(receivingRecalls).where(eq(receivingRecalls.organizationId, organizationId)),
    db.select().from(purchasingReceiptSettings).where(eq(purchasingReceiptSettings.organizationId, organizationId)).limit(1),
    db.select().from(purchasingBonusTiers).where(eq(purchasingBonusTiers.organizationId, organizationId)).orderBy(purchasingBonusTiers.sortOrder),
    db.select().from(accountsSettings).where(eq(accountsSettings.organizationId, organizationId)).limit(1),
    db.select().from(receivingEmailTemplates).where(eq(receivingEmailTemplates.organizationId, organizationId)),
    db
      .select({ receivingFormConfig: organizations.receivingFormConfig, sidebarMenus: organizations.sidebarMenus, departmentThemes: organizations.departmentThemes })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
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
        price: p.standardPrice,
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
    bonusTiers: tiers.map((t) => ({ thresholdAmount: t.thresholdAmount, bonusAmount: t.bonusAmount, description: t.description, active: t.active })),
    settings: {
      accounts: acct ? { payWithinBusinessDays: acct.payWithinBusinessDays, skipUsHolidays: acct.skipUsHolidays, timeZone: acct.timeZone } : null,
      receivingFormConfig: orgRow?.receivingFormConfig ?? null,
      emailTemplates: emailTpls.map((t) => ({ templateKey: t.templateKey, subject: t.subject, body: t.body })),
      sidebarMenus: orgRow?.sidebarMenus ?? null,
      departmentThemes: orgRow?.departmentThemes ?? null,
    },
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
    counts: {
      products: data.products.length,
      categories: data.categories.length,
      conditions: data.conditions.length,
      ranges: data.ranges.length,
      recalls: data.recalls.length,
      priced: data.products.filter((p) => (p.price ?? 0) > 0).length,
      bonusTiers: data.bonusTiers?.length ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Applying a snapshot to ONE company (always scoped to that company's id)
// ---------------------------------------------------------------------------

/** Inserts a whole snapshot into a brand-new, empty company. Products start at the published prices. */
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
  await insertBonusTiers(organizationId, d.bonusTiers);
  await applySettings(organizationId, d.settings, { overwriteDefaults: false });
}

const BUILT_IN_ACCOUNTS = { payWithinBusinessDays: 3, skipUsHolidays: true, timeZone: "America/New_York" };

/**
 * Copies the general settings into a company. Only fills what the company has not set: a form setting, menu or color
 * theme that is empty, email wording it has no row for, and payment terms that are missing or still the built-in
 * defaults. Returns what it filled.
 */
async function applySettings(
  organizationId: string,
  st: TemplateSettings | undefined,
  _opts: { overwriteDefaults: boolean },
): Promise<string[]> {
  void _opts;
  const filled: string[] = [];
  if (!st) return filled;

  if (st.accounts) {
    const [cur] = await db.select().from(accountsSettings).where(eq(accountsSettings.organizationId, organizationId)).limit(1);
    if (!cur) {
      await db.insert(accountsSettings).values({ organizationId, ...st.accounts });
      filled.push("payment terms");
    } else if (
      cur.payWithinBusinessDays === BUILT_IN_ACCOUNTS.payWithinBusinessDays &&
      cur.skipUsHolidays === BUILT_IN_ACCOUNTS.skipUsHolidays &&
      cur.timeZone === BUILT_IN_ACCOUNTS.timeZone &&
      (st.accounts.payWithinBusinessDays !== cur.payWithinBusinessDays || st.accounts.skipUsHolidays !== cur.skipUsHolidays || st.accounts.timeZone !== cur.timeZone)
    ) {
      await db.update(accountsSettings).set(st.accounts).where(eq(accountsSettings.organizationId, organizationId));
      filled.push("payment terms");
    }
  }

  const [org] = await db
    .select({ receivingFormConfig: organizations.receivingFormConfig, sidebarMenus: organizations.sidebarMenus, departmentThemes: organizations.departmentThemes })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const patch: Partial<{ receivingFormConfig: string; sidebarMenus: string; departmentThemes: string }> = {};
  if (!org?.receivingFormConfig && st.receivingFormConfig) {
    patch.receivingFormConfig = st.receivingFormConfig;
    filled.push("receiving form");
  }
  if (!org?.sidebarMenus && st.sidebarMenus) {
    patch.sidebarMenus = st.sidebarMenus;
    filled.push("menus");
  }
  if (!org?.departmentThemes && st.departmentThemes) {
    patch.departmentThemes = st.departmentThemes;
    filled.push("department colors");
  }
  if (Object.keys(patch).length > 0) await db.update(organizations).set(patch).where(eq(organizations.id, organizationId));

  if (st.emailTemplates.length > 0) {
    const have = new Set(
      (await db.select({ k: receivingEmailTemplates.templateKey }).from(receivingEmailTemplates).where(eq(receivingEmailTemplates.organizationId, organizationId))).map((r) => r.k),
    );
    const add = st.emailTemplates.filter((t) => !have.has(t.templateKey));
    if (add.length > 0) {
      await db.insert(receivingEmailTemplates).values(add.map((t) => ({ organizationId, templateKey: t.templateKey, subject: t.subject, body: t.body })));
      filled.push("customer email wording");
    }
  }
  return filled;
}

/** The published bonus tiers, or the built-in starter tiers when the snapshot has none. */
async function insertBonusTiers(organizationId: string, tiers: TemplateBonusTier[] | undefined) {
  if (tiers && tiers.length > 0) {
    await db.insert(purchasingBonusTiers).values(
      tiers.map((t, sortOrder) => ({
        id: newId("pbonus"),
        organizationId,
        thresholdAmount: t.thresholdAmount,
        bonusAmount: t.bonusAmount,
        description: t.description,
        sortOrder,
        active: t.active,
      })),
    );
    return;
  }
  await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(organizationId));
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
      standardPrice: Number.isFinite(p.price) && (p.price ?? 0) > 0 ? (p.price as number) : 0, // the published starting price; the company can change it
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
    const [hasTiers] = await db.select({ id: purchasingBonusTiers.id }).from(purchasingBonusTiers).where(eq(purchasingBonusTiers.organizationId, organizationId)).limit(1);
    if (!hasTiers) await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(organizationId));
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
    const rangeByKey = new Map(ranges.map((r) => [rangeKeyM(r), r.id]));
    const rangeId = (i: number) => {
      const tr = t.data.ranges[i];
      return tr ? rangeByKey.get(rangeKeyM(tr)) : undefined;
    };
    await insertProducts(organizationId, plan.products, { catId, condId, rangeId });
  }
  for (const r of plan.recalls) await insertRecall(organizationId, r);

  await db.update(organizations).set({ catalogTemplateVersion: t.version }).where(eq(organizations.id, organizationId));
  return { addedProducts: plan.products.length, addedRecalls: plan.recalls.length, upToDate: plan.products.length === 0 && plan.recalls.length === 0 };
}


// ---------------------------------------------------------------------------
// "Use the default prices" for a company that already exists
// ---------------------------------------------------------------------------

export type ApplyPricesResult = {
  hasTemplate: boolean;
  priced: number;
  alreadyPriced: number;
  notInDefault: number;
  tiersAdded: number;
  settingsFilled: string[];
  /** The company has not made a quotation yet, so its lists were matched to the default (leftovers hidden, never deleted). */
  matched: boolean;
  conditionsAdded: number;
  rangesAdded: number;
  hidden: number;
  productsWithExpiry: number;
  detailsFilled: number;
};

/**
 * Fills in the default catalog's price for every product this company has at $0 (matched by name), plus the general
 * settings it has not set itself (payment terms, receiving form, email wording, menus, colors). A price the
 * company already set is never changed, and a company's own bonus tiers are never replaced (the default tiers are
 * added only when it has none).
 */
export async function applyDefaultPricesForOrg(organizationId: string): Promise<ApplyPricesResult> {
  const t = await getLatestTemplate();
  if (!t) return { hasTemplate: false, priced: 0, alreadyPriced: 0, notInDefault: 0, tiersAdded: 0, settingsFilled: [], matched: false, conditionsAdded: 0, rangesAdded: 0, hidden: 0, productsWithExpiry: 0, detailsFilled: 0 };
  const sync = await syncStructure(organizationId, t);
  const priceBy = new Map(t.data.products.filter((p) => (p.price ?? 0) > 0).map((p) => [lc(p.name), p.price as number]));
  const mine = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, price: purchasingProducts.standardPrice })
    .from(purchasingProducts)
    .where(and(eq(purchasingProducts.organizationId, organizationId), isNull(purchasingProducts.archivedAt)));
  let priced = 0;
  let alreadyPriced = 0;
  let notInDefault = 0;
  for (const p of mine) {
    if (p.price > 0) {
      alreadyPriced++;
      continue;
    }
    const want = priceBy.get(lc(p.name));
    if (want === undefined) {
      notInDefault++;
      continue;
    }
    await db
      .update(purchasingProducts)
      .set({ standardPrice: want })
      .where(and(eq(purchasingProducts.id, p.id), eq(purchasingProducts.organizationId, organizationId)));
    priced++;
  }
  let tiersAdded = 0;
  if (t.data.bonusTiers && t.data.bonusTiers.length > 0) {
    const have = await db.select().from(purchasingBonusTiers).where(eq(purchasingBonusTiers.organizationId, organizationId));
    if (have.length === 0) {
      await insertBonusTiers(organizationId, t.data.bonusTiers);
      tiersAdded = t.data.bonusTiers.length;
    } else if (sync.matched) {
      // No quotations yet: line the tiers up with the default. Missing ones are added, ones that aren't in the default are hidden.
      const tierKey = (x: { thresholdAmount: number; bonusAmount: number }) => `${x.thresholdAmount}|${x.bonusAmount}`;
      const haveBy = new Map(have.map((x) => [tierKey(x), x]));
      const wanted = new Set(t.data.bonusTiers.map(tierKey));
      let sort = have.length;
      for (const x of t.data.bonusTiers) {
        const cur = haveBy.get(tierKey(x));
        if (!cur) {
          await db.insert(purchasingBonusTiers).values({ id: newId("pbonus"), organizationId, thresholdAmount: x.thresholdAmount, bonusAmount: x.bonusAmount, description: x.description, sortOrder: sort++, active: x.active });
          tiersAdded++;
        } else if (cur.active !== x.active || (!cur.description && x.description)) {
          await db
            .update(purchasingBonusTiers)
            .set({ active: x.active, description: cur.description ?? x.description })
            .where(and(eq(purchasingBonusTiers.id, cur.id), eq(purchasingBonusTiers.organizationId, organizationId)));
        }
      }
      for (const cur of have) {
        if (!wanted.has(tierKey(cur)) && cur.active) {
          await db.update(purchasingBonusTiers).set({ active: false }).where(and(eq(purchasingBonusTiers.id, cur.id), eq(purchasingBonusTiers.organizationId, organizationId)));
          sync.hidden++;
        }
      }
    }
  }
  const settingsFilled = await applySettings(organizationId, t.data.settings, { overwriteDefaults: false });
  if ((await fillShippingAddressFromProfile(organizationId)).filled) settingsFilled.push("your shipping address (from your business profile)");
  return { hasTemplate: true, priced, alreadyPriced, notInDefault, tiersAdded, settingsFilled, ...sync };
}

type SyncCounts = Pick<ApplyPricesResult, "matched" | "conditionsAdded" | "rangesAdded" | "hidden" | "productsWithExpiry" | "detailsFilled">;

/**
 * Brings a company's condition list, month ranges and per-product expiry options (and blank NDC / code / notes /
 * brand) in line with the default catalog. Always only ADDS and fills blanks. When the company has not made a
 * quotation yet it also aligns what it can safely align -- conditions, month ranges, brands, products' "never
 * expires" and active flags -- and HIDES (never deletes) conditions and month ranges that are not in the default.
 */
async function syncStructure(organizationId: string, t: LoadedTemplate): Promise<SyncCounts> {
  const d = t.data;
  const out: SyncCounts = { matched: false, conditionsAdded: 0, rangesAdded: 0, hidden: 0, productsWithExpiry: 0, detailsFilled: 0 };
  const [q] = await db.select({ id: purchasingQuotations.id }).from(purchasingQuotations).where(eq(purchasingQuotations.organizationId, organizationId)).limit(1);
  const fresh = !q;
  out.matched = fresh;

  // Conditions
  const conds = await db.select().from(purchasingConditions).where(eq(purchasingConditions.organizationId, organizationId));
  const condByName = new Map(conds.map((c) => [lc(c.name), c]));
  let condSort = conds.length;
  const condId = new Map(conds.map((c) => [lc(c.name), c.id]));
  const wantedConds = new Set(d.conditions.map((c) => lc(c.name)));
  for (const c of d.conditions) {
    const have = condByName.get(lc(c.name));
    if (!have) {
      const id = newId("pcond");
      await db.insert(purchasingConditions).values({ id, organizationId, name: c.name, multiplier: c.multiplier, sortOrder: condSort++, active: c.active });
      condId.set(lc(c.name), id);
      out.conditionsAdded++;
    } else if (fresh && (have.multiplier !== c.multiplier || have.active !== c.active)) {
      await db.update(purchasingConditions).set({ multiplier: c.multiplier, active: c.active }).where(and(eq(purchasingConditions.id, have.id), eq(purchasingConditions.organizationId, organizationId)));
    }
  }
  if (fresh && d.conditions.length > 0) {
    for (const c of conds) {
      if (!wantedConds.has(lc(c.name)) && c.active) {
        await db.update(purchasingConditions).set({ active: false }).where(and(eq(purchasingConditions.id, c.id), eq(purchasingConditions.organizationId, organizationId)));
        out.hidden++;
      }
    }
  }

  // Month ranges
  const ranges = await db.select().from(purchasingExpirationRanges).where(eq(purchasingExpirationRanges.organizationId, organizationId));
  const rangeByKey = new Map(ranges.map((r) => [rangeKeyM(r), r]));
  let rangeSort = ranges.length;
  const rangeIdAt = new Map<number, string>();
  const wantedRanges = new Set(d.ranges.map((r) => rangeKeyM(r)));
  for (const [i, r] of d.ranges.entries()) {
    const have = rangeByKey.get(rangeKeyM(r));
    if (!have) {
      const id = newId("prange");
      await db.insert(purchasingExpirationRanges).values({ id, organizationId, label: r.label, minMonths: r.minMonths, maxMonths: r.maxMonths, defaultMultiplier: r.defaultMultiplier, sortOrder: rangeSort++, active: r.active });
      rangeIdAt.set(i, id);
      out.rangesAdded++;
    } else {
      rangeIdAt.set(i, have.id);
      if (fresh && have.active !== r.active) {
        await db.update(purchasingExpirationRanges).set({ active: r.active }).where(and(eq(purchasingExpirationRanges.id, have.id), eq(purchasingExpirationRanges.organizationId, organizationId)));
      }
    }
  }
  if (fresh && d.ranges.length > 0) {
    for (const r of ranges) {
      if (!wantedRanges.has(rangeKeyM(r)) && r.active) {
        await db.update(purchasingExpirationRanges).set({ active: false }).where(and(eq(purchasingExpirationRanges.id, r.id), eq(purchasingExpirationRanges.organizationId, organizationId)));
        out.hidden++;
      }
    }
  }

  // Brands
  const cats = await db.select().from(purchasingCategories).where(eq(purchasingCategories.organizationId, organizationId));
  const catId = new Map(cats.map((c) => [lc(c.name), c.id]));
  let catSort = cats.length;
  for (const name of new Set(d.products.map((p) => p.category).filter((c): c is string => !!c))) {
    if (catId.has(lc(name))) continue;
    const id = newId("pcat");
    await db.insert(purchasingCategories).values({ id, organizationId, name, sortOrder: catSort++ });
    catId.set(lc(name), id);
  }

  // Products: expiry options, conditions and blank details
  const mine = await db.select().from(purchasingProducts).where(and(eq(purchasingProducts.organizationId, organizationId), isNull(purchasingProducts.archivedAt)));
  const mineBy = new Map<string, typeof mine>();
  for (const p of mine) mineBy.set(lc(p.name), [...(mineBy.get(lc(p.name)) ?? []), p]);
  const haveMult = new Set((await db.select({ p: purchasingProductMultipliers.productId }).from(purchasingProductMultipliers).where(eq(purchasingProductMultipliers.organizationId, organizationId))).map((r) => r.p));
  const haveLink = new Set((await db.select({ p: purchasingProductConditions.productId }).from(purchasingProductConditions).where(eq(purchasingProductConditions.organizationId, organizationId))).map((r) => r.p));
  const multRows: (typeof purchasingProductMultipliers.$inferInsert)[] = [];
  const linkRows: (typeof purchasingProductConditions.$inferInsert)[] = [];
  for (const tp of d.products) {
    for (const p of mineBy.get(lc(tp.name)) ?? []) {
      if (!haveMult.has(p.id)) {
        const seen = new Set<string>();
        let any = false;
        for (const m of tp.ranges) {
          const rid = rangeIdAt.get(m.r);
          if (!rid || seen.has(rid)) continue;
          seen.add(rid);
          multRows.push({ id: newId("pmult"), organizationId, productId: p.id, expirationRangeId: rid, multiplier: m.multiplier });
          any = true;
        }
        if (any) out.productsWithExpiry++;
      }
      if (!haveLink.has(p.id)) {
        const seen = new Set<string>();
        for (const cn of tp.conditions) {
          const cid = condId.get(lc(cn));
          if (!cid || seen.has(cid)) continue;
          seen.add(cid);
          linkRows.push({ id: newId("pprodcond"), organizationId, productId: p.id, conditionId: cid });
        }
      }
      const patch: Partial<typeof purchasingProducts.$inferInsert> = {};
      if (!p.ndc && tp.ndc) patch.ndc = tp.ndc;
      if (!p.productCode && tp.productCode) patch.productCode = tp.productCode;
      if (!p.notes && tp.notes) patch.notes = tp.notes;
      const wantCat = tp.category ? catId.get(lc(tp.category)) : undefined;
      if (wantCat && (!p.categoryId || (fresh && p.categoryId !== wantCat))) patch.categoryId = wantCat;
      if (fresh && p.noExpiration !== tp.noExpiration) patch.noExpiration = tp.noExpiration;
      if (fresh && p.active !== tp.active) patch.active = tp.active;
      if (Object.keys(patch).length > 0) {
        await db.update(purchasingProducts).set(patch).where(and(eq(purchasingProducts.id, p.id), eq(purchasingProducts.organizationId, organizationId)));
        out.detailsFilled++;
      }
    }
  }
  for (const rows of chunk(multRows)) await db.insert(purchasingProductMultipliers).values(rows);
  for (const rows of chunk(linkRows)) await db.insert(purchasingProductConditions).values(rows);
  return out;
}
