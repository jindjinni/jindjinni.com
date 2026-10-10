// The sidebar down the left of every department (Purchasing, Receiving, and each department we add).
// This file holds the ORIGINAL menu of each department and the rules for applying what a company changed:
// the names of the tabs, their order, and the heading over the Setup group. Pure; reads and writes nothing.
//
// To give a new department this sidebar: add it to DEPARTMENT_MENUS below, then render <DepartmentSidebar> in
// that department's layout (see receiving/layout.tsx). Renaming and re-ordering then work there with no more code.

export type MenuDept = "purchasing" | "receiving" | "accounts" | "customer-service" | "inventory" | "sales" | "hr" | "marketing";

export type MenuItemDef = {
  /** Never changes, even when the tab is renamed: it is how a saved name or position finds its tab. */
  id: string;
  href: string;
  /** The original name. */
  label: string;
  icon?: string;
  /** Highlighted only on exactly this page (a home page), not on the pages under it. */
  exact?: boolean;
  /** Listed under the Setup heading, a little quieter. */
  setup?: boolean;
};

export type DepartmentMenu = { title: string; setupLabel: string; items: MenuItemDef[] };

const P = "/dashboard/purchasing";
const R = "/dashboard/receiving";
const A = "/dashboard/accounts";
const C = "/dashboard/customer-service";
const I = "/dashboard/inventory";
const S = "/dashboard/sales";
const H = "/dashboard/hr";
const M = "/dashboard/marketing";

export const DEPARTMENT_MENUS: Record<MenuDept, DepartmentMenu> = {
  purchasing: {
    title: "Purchasing Department",
    setupLabel: "Settings",
    items: [
      { id: "dashboard", href: P, label: "Dashboard", icon: "🏠", exact: true },
      { id: "quotations", href: `${P}/quotations`, label: "Quotations", icon: "🧾" },
      { id: "purchase-orders", href: `${P}/purchase-orders`, label: "Purchase Orders", icon: "📑" },
      { id: "suppliers", href: `${P}/suppliers`, label: "Suppliers", icon: "🏭" },
      { id: "customers", href: `${P}/customers`, label: "Customers", icon: "👥" },
      { id: "products", href: `${P}/products`, label: "Products", icon: "🏷️" },
      { id: "mail", href: `${P}/mail`, label: "Mail", icon: "✉️" },
      { id: "categories", href: `${P}/categories`, label: "Categories", setup: true },
      { id: "conditions", href: `${P}/conditions`, label: "Conditions", setup: true },
      { id: "month-range", href: `${P}/expiration-ranges`, label: "Month Range", setup: true },
      { id: "product-multipliers", href: `${P}/product-multipliers`, label: "Product Multipliers", setup: true },
      { id: "bonus-tiers", href: `${P}/bonus-tiers`, label: "Bonus tiers", setup: true },
      { id: "quotation-profile", href: `${P}/quotation-profile`, label: "Quotation Profile", setup: true },
      { id: "templates", href: `${P}/templates`, label: "Document Templates", setup: true },
      { id: "receipt-layout", href: `${P}/receipt-layout`, label: "Quotation Receipt Layout", setup: true },
      { id: "shipment-tracking", href: `${P}/tracking`, label: "Shipment Tracking", setup: true },
      { id: "connectors", href: `${P}/connectors`, label: "Connectors", setup: true },
    ],
  },
  receiving: {
    title: "Receiving Department",
    setupLabel: "Settings",
    items: [
      { id: "all-shipments", href: R, label: "All Shipments", icon: "📦", exact: true },
      { id: "delivered-today", href: `${R}/delivered-today`, label: "Delivered Today", icon: "🚚" },
      { id: "intake", href: `${R}/intake`, label: "Receiving Intake Form", icon: "📝" },
      { id: "received-items", href: `${R}/received-items`, label: "Received Items", icon: "📋" },
      { id: "daily", href: `${R}/daily`, label: "Daily Receiving", icon: "🗓️" },
      { id: "tracker", href: `${R}/tracker`, label: "Lot & Serial Tracker", icon: "🔎" },
      { id: "products", href: `${R}/products`, label: "Products", icon: "🏷️" },
      { id: "adjustments", href: `${R}/adjustments`, label: "Order Adjustments", icon: "🧾" },
      { id: "mail", href: `${R}/mail`, label: "Mail", icon: "✉️" },
      { id: "connectors", href: `${R}/connectors`, label: "Connectors", setup: true },
    ],
  },
  accounts: {
    title: "Accounts Department",
    setupLabel: "Settings",
    items: [
      { id: "to-be-paid", href: A, label: "To Be Paid", icon: "💵", exact: true },
      { id: "paid-orders", href: `${A}/paid`, label: "Paid Orders", icon: "✅" },
      { id: "to-be-collected", href: `${A}/collect`, label: "To Be Collected", icon: "🧾" },
      { id: "monthly-report", href: `${A}/report`, label: "Monthly Report", icon: "📊" },
      { id: "quickbooks", href: `${A}/quickbooks`, label: "QuickBooks", icon: "📒" },
      { id: "audit-center", href: `${A}/audit-center`, label: "Audit Center", icon: "🔍" },
      { id: "mail", href: `${A}/mail`, label: "Mail", icon: "✉️" },
      { id: "payment-terms", href: `${A}/settings`, label: "Payment Terms", setup: true },
      { id: "connectors", href: `${A}/connectors`, label: "Connectors", setup: true },
    ],
  },
  "customer-service": {
    title: "Customer Service Department",
    setupLabel: "Settings",
    items: [
      { id: "to-be-emailed", href: C, label: "To Be Emailed", icon: "✉️", exact: true },
      { id: "emailed", href: `${C}/emailed`, label: "Emailed", icon: "📨" },
      { id: "payments-received", href: `${C}/payments`, label: "Payments Received", icon: "💰" },
      { id: "mail", href: `${C}/mail`, label: "Mail", icon: "📬" },
      { id: "email-settings", href: `${C}/email-settings`, label: "Email Settings", setup: true },
      { id: "connectors", href: `${C}/connectors`, label: "Connectors", setup: true },
    ],
  },
  inventory: {
    title: "Inventory Department",
    setupLabel: "Settings",
    items: [
      { id: "stock", href: I, label: "Live Stock", icon: "📦", exact: true },
      { id: "manual-add", href: `${I}/manual-add`, label: "Manual Add", icon: "➕" },
      { id: "movements", href: `${I}/movements`, label: "Stock History", icon: "🕘" },
      { id: "estimated-prices", href: `${I}/estimated-prices`, label: "Estimated Prices", setup: true },
    ],
  },
  sales: {
    title: "Sales Department",
    setupLabel: "Settings",
    items: [
      { id: "quotations", href: S, label: "Quotations", icon: "🧾", exact: true },
      { id: "purchase-orders", href: `${S}/purchase-orders`, label: "Purchase Orders", icon: "📑" },
      { id: "sales-orders", href: `${S}/sales-orders`, label: "Sales Orders", icon: "📦" },
      { id: "invoices", href: `${S}/invoices`, label: "Invoices", icon: "💵" },
      { id: "buyers", href: `${S}/buyers`, label: "Buyers", icon: "👥" },
      { id: "price-comparison", href: `${S}/price-comparison`, label: "Price Comparison", icon: "⚖️" },
      { id: "quickbooks", href: `${S}/quickbooks`, label: "QuickBooks", icon: "📒" },
      { id: "mail", href: `${S}/mail`, label: "Mail", icon: "✉️" },
      { id: "company-profile", href: `${S}/company-profile`, label: "Company Profile", setup: true },
      { id: "templates", href: `${S}/templates`, label: "Document Templates", setup: true },
      { id: "connectors", href: `${S}/connectors`, label: "Connectors", setup: true },
    ],
  },
  hr: {
    title: "HR Department",
    setupLabel: "Settings",
    items: [
      { id: "staff", href: H, label: "Staff Today", icon: "👥", exact: true },
      { id: "activity", href: `${H}/activity`, label: "Activity Log", icon: "🕘" },
      { id: "time-sheets", href: `${H}/time-sheets`, label: "Time Sheets", icon: "⏱️" },
    ],
  },
  marketing: {
    title: "Marketing Department",
    setupLabel: "Settings",
    items: [
      { id: "contacts", href: M, label: "Contacts", icon: "👥", exact: true },
      { id: "email-campaigns", href: `${M}/email`, label: "Email Campaigns", icon: "✉️" },
      { id: "text-campaigns", href: `${M}/text`, label: "Text Campaigns", icon: "💬" },
      { id: "email-settings", href: `${M}/email-settings`, label: "Email Settings", setup: true },
      { id: "text-settings", href: `${M}/text-settings`, label: "Text Settings", setup: true },
      { id: "connectors", href: `${M}/connectors`, label: "Connectors", setup: true },
    ],
  },
};

/**
 * The tab ids a person may see in a department. "Connectors" (where the company plugs in its own accounts) is for
 * owners and admins only; `base` narrows the list further for roles that see fewer tabs.
 */
export function menuIdsFor(dept: MenuDept, opts: { connectors: boolean; base?: string[] }): string[] {
  const ids = DEPARTMENT_MENUS[dept].items.map((i) => i.id);
  return ids.filter((id) => (id !== "connectors" || opts.connectors) && (!opts.base || opts.base.includes(id)));
}

export const isMenuDept = (v: unknown): v is MenuDept => typeof v === "string" && Object.prototype.hasOwnProperty.call(DEPARTMENT_MENUS, v);

/** What a company saved for one department. */
export type SavedMenu = {
  /** Tab ids, first to last. */
  order?: string[];
  /** Tab id -> the name the company chose (only where it differs from the original). */
  labels?: Record<string, string>;
  /** The name over the Setup group, when changed. */
  setupLabel?: string;
};
export type SavedMenus = Partial<Record<MenuDept, SavedMenu>>;

export const MAX_LABEL = 40;

/** A tab name as typed: whitespace tidied, no control characters, at most 40 characters. */
export function cleanLabel(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL);
}

/** Reads the saved JSON; anything unreadable or unknown is ignored (the original menu shows). */
export function parseSidebarMenus(raw: string | null | undefined): SavedMenus {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const out: SavedMenus = {};
  if (!data || typeof data !== "object") return out;
  for (const dept of Object.keys(DEPARTMENT_MENUS) as MenuDept[]) {
    const m = (data as Record<string, unknown>)[dept];
    if (!m || typeof m !== "object") continue;
    const known = new Set(DEPARTMENT_MENUS[dept].items.map((i) => i.id));
    const o = m as Record<string, unknown>;
    const saved: SavedMenu = {};
    if (Array.isArray(o.order)) saved.order = [...new Set(o.order.filter((x): x is string => typeof x === "string" && known.has(x)))];
    if (o.labels && typeof o.labels === "object") {
      const labels: Record<string, string> = {};
      for (const [id, v] of Object.entries(o.labels as Record<string, unknown>)) if (known.has(id) && cleanLabel(v)) labels[id] = cleanLabel(v);
      saved.labels = labels;
    }
    if (typeof o.setupLabel === "string" && cleanLabel(o.setupLabel)) saved.setupLabel = cleanLabel(o.setupLabel);
    out[dept] = saved;
  }
  return out;
}

export type ResolvedItem = {
  id: string;
  href: string;
  /** The name shown now (the company's, or the original). */
  label: string;
  defaultLabel: string;
  icon?: string;
  exact: boolean;
  setup: boolean;
};

export type ResolvedMenu = { title: string; setupLabel: string; defaultSetupLabel: string; items: ResolvedItem[] };

/**
 * The menu to show: the department's tabs (only the ones this person's role may open), in the order the company
 * chose, with the names the company chose. Tabs the company never placed (for example, ones added later) follow
 * the placed ones in their original order. The main tabs always come first and the Setup tabs after them.
 */
export function resolveMenu(dept: MenuDept, saved: SavedMenus, allowedIds?: string[], opts: { purchaseOrdersFirst?: boolean; defaultLabels?: Record<string, string> } = {}): ResolvedMenu {
  const def = DEPARTMENT_MENUS[dept];
  const mine = saved[dept] ?? {};
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const rank = new Map((mine.order ?? []).map((id, i) => [id, i]));
  const defaultIndex = new Map(def.items.map((it, i) => [it.id, i]));
  // A Distributor starts with Purchase Orders before Quotations (the company's own saved order, if any, always wins).
  if (opts.purchaseOrdersFirst && !(mine.order && mine.order.length)) {
    const q = defaultIndex.get("quotations");
    const o = defaultIndex.get("purchase-orders");
    if (q !== undefined && o !== undefined) {
      defaultIndex.set("quotations", o);
      defaultIndex.set("purchase-orders", q);
    }
  }
  const items = def.items
    .filter((it) => !allowed || allowed.has(it.id))
    .map<ResolvedItem>((it) => ({ id: it.id, href: it.href, label: mine.labels?.[it.id] || opts.defaultLabels?.[it.id] || it.label, defaultLabel: opts.defaultLabels?.[it.id] || it.label, icon: it.icon, exact: !!it.exact, setup: !!it.setup }));
  items.sort((a, b) => {
    if (a.setup !== b.setup) return a.setup ? 1 : -1;
    const ra = rank.has(a.id) ? rank.get(a.id)! : 1000 + defaultIndex.get(a.id)!;
    const rb = rank.has(b.id) ? rank.get(b.id)! : 1000 + defaultIndex.get(b.id)!;
    return ra - rb;
  });
  return { title: def.title, setupLabel: mine.setupLabel || def.setupLabel, defaultSetupLabel: def.setupLabel, items };
}

/**
 * Applies a save from the editor on top of what was saved before. `items` is the order of the tabs the editor
 * could see, with the names typed. Tabs the editor could not see keep their earlier name and place.
 */
export function applyMenuEdit(dept: MenuDept, previous: SavedMenus, edit: { items: { id: string; label: string }[]; setupLabel: string }): SavedMenus {
  const def = DEPARTMENT_MENUS[dept];
  const known = new Map(def.items.map((i) => [i.id, i]));
  const prev = previous[dept] ?? {};
  const seen = new Set<string>();
  const order: string[] = [];
  const labels: Record<string, string> = { ...(prev.labels ?? {}) };
  for (const it of edit.items) {
    const orig = known.get(it.id);
    if (!orig || seen.has(it.id)) continue;
    seen.add(it.id);
    order.push(it.id);
    const l = cleanLabel(it.label);
    if (l && l !== orig.label) labels[it.id] = l;
    else delete labels[it.id];
  }
  for (const id of prev.order ?? []) if (!seen.has(id)) order.push(id);
  const setupLabel = cleanLabel(edit.setupLabel);
  const next: SavedMenu = { order, labels };
  if (setupLabel && setupLabel !== def.setupLabel) next.setupLabel = setupLabel;
  return { ...previous, [dept]: next };
}
