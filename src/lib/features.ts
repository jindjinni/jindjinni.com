// Feature rollout. A new feature is switched on in stages so it can be tried on the platform's own company first:
//   off        -> nobody sees it
//   mothership -> only the platform's own company (the "mothership") sees it
//   selected   -> the Lamp plus the companies the platform owner picked
//   everyone   -> every company
// The list of known features is here in code (each with the stage it starts at); the chosen stage is saved in the database.
// The server checks featureOn() before showing or running a feature -- hiding a link is never the only guard.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlagCompanies, featureFlags, organizations } from "@/db/schema";
import { mayUsePlatformShippo } from "@/lib/shippo-connection";
import { isStage, stageAllows, type Stage } from "@/lib/feature-stages";

export { STAGES, STAGE_LABELS, isStage, stageAllows, type Stage } from "@/lib/feature-stages";

export type FeatureDef = { key: string; label: string; blurb: string; defaultStage: Stage };

/** Every feature that can be switched in stages. Add new ones here. */
export const FEATURES: FeatureDef[] = [
  {
    key: "support-center",
    label: "Support center",
    blurb: "The Support page in every company, where people send tickets and read our replies.",
    defaultStage: "mothership",
  },
  {
    key: "view-as-company",
    label: "View as company",
    blurb: "Lets platform support look at a company's account, read-only, after that company says yes on a ticket.",
    defaultStage: "mothership",
  },
  {
    key: "purchase-orders",
    label: "Purchase orders, templates and revisions",
    blurb: "Purchase orders and saved suppliers in Purchasing, received purchase orders in Sales, the quotation and purchase order templates (logo, wording, standing notice) in both departments' Settings, and sending revisions. For every company; the sign-up answer only decides which document comes first.",
    defaultStage: "mothership",
  },
  {
    key: "operations",
    label: "Wholesale and Distribution sides",
    blurb: "Separate operations: a company can run Wholesale (sourcing directly from sellers) and Distribution (buying from wholesalers, selling to pharmacies) as two separate workspaces under one sign-in, free. Settings -> Operations, the sign-in picker, the top-bar switcher and Overall status come with it.",
    defaultStage: "mothership",
  },
  {
    key: "audit-center",
    label: "Audit Center",
    blurb: "Accounts → Audit Center in a Distribution operation: pharmacy internal audits, PBM audits and State/Federal regulatory audits (Excel files built from the pharmacy's invoices; PBM files never carry prices or shipping), a saved case record for each audit, and sending the files from the company's own mailbox after a review.",
    defaultStage: "mothership",
  },
  {
    key: "mailboxes",
    label: "Department mailboxes",
    blurb: "A Mail tab in Purchasing, Sales, Receiving, Accounts and Customer Service: each department connects its own company email (shared, plus personal ones), with Inbox, Sent, Drafts and scheduled emails. Works on both the Wholesale and Distribution sides.",
    defaultStage: "mothership",
  },
  {
    key: "sales-orders",
    label: "Sales orders",
    blurb: "Sales -> Sales Orders: a sent quotation or a received purchase order becomes a sales order that sets its units aside, can be confirmed to the buyer by email, and is then made into the invoice. Quotations, purchase orders and invoices work as before.",
    defaultStage: "mothership",
  },
  {
    key: "receivables",
    label: "Money coming in (receivables)",
    blurb: "Accounts -> To Be Collected: every sent invoice with what is owed and how late it is, where payments are recorded; and Customer Service -> Payments Received with the thank-you email ready to review and send.",
    defaultStage: "mothership",
  },
  {
    key: "payables",
    label: "Supplier bills (payables)",
    blurb: "Accounts -> Supplier Bills: when Receiving confirms a supplier's purchase order has arrived, Accounts gets a bill to pay, marks it paid, and sees what is owed by supplier.",
    defaultStage: "mothership",
  },
  {
    key: "quickbooks",
    label: "QuickBooks",
    blurb: "Settings -> Connectors: a company connects its own QuickBooks Online (read only) or uploads a QuickBooks Desktop / Enterprise export, and Sales and Accounts get a QuickBooks tab with who has paid, who owes and profit and loss.",
    defaultStage: "mothership",
  },
  {
    key: "storefronts",
    label: "Company storefronts",
    blurb: "Public pages a company can switch on for its own website visitors: the Wholesale 'sell to us' page (requests land in Purchasing -> Website requests, ready to become a quotation) and, later, the Distribution pharmacy ordering page. Settings -> Storefront.",
    defaultStage: "mothership",
  },
  {
    key: "shipping",
    label: "Shipping department",
    blurb: "Shipping: orders ready to go out, shipments with their boxes, tracking numbers and photos, the status of every package, and the 'your order has shipped' email you review and send.",
    defaultStage: "mothership",
  },
  {
    key: "box-sizes",
    label: "Saved box sizes",
    blurb: "Shipping -> a shipment -> Make shipping labels: save the box sizes you use again and again (length x width x height, never the weight) and fill them in with one click, plus the sizes used on earlier labels. Removing a size only hides it.",
    defaultStage: "mothership",
  },
  {
    key: "shipping-email-edit",
    label: "Edit the shipped email",
    blurb: "Shipping -> a shipment -> Email to the buyer: an 'Edit this email' button turns the subject and the message into boxes you can change before pressing Send (warns if the tracking number is taken out), with 'put the original wording back'. Off = the email is reviewed but not editable.",
    defaultStage: "mothership",
  },
  {
    key: "label-sizes",
    label: "Label sizes for roll printers",
    blurb: "Shipping -> a shipment -> Make shipping labels: choose the size the label is made at (4 x 6 inch for a roll/thermal printer, 4 x 8, A6, narrow, or a full page) and optionally keep that size for every label. Off = full page labels, as before.",
    defaultStage: "mothership",
  },
  {
    key: "recall-release",
    label: "Receiving: clear a recall hit that the manufacturer says is not affected",
    blurb: "Receiving -> Step 6 Recall check: when an Owner or Admin records 'Not affected' from the manufacturer's own page for a number that was on the recall list, that list hit stops holding the item, the return mark the recall put on it is taken off, and the item moves into Live Stock. Also refreshes Live Stock right after any recall check on a shipment that was already submitted. Off = a list hit keeps the item out of Live Stock.",
    defaultStage: "mothership",
  },
  {
    key: "recall-simple",
    label: "Receiving: simpler Recall check",
    blurb: "Receiving -> intake form -> Step 6 Recall check: one step at a time. Pick the product (each shows Needs a check / Checked / Recalled), type or scan the number, press Check, then open that product's manufacturer page and say Affected or Not affected. Other recalls, the checks already made and the admin lists stay closed until opened. Off = the full Recall check screen as before.",
    defaultStage: "mothership",
  },
  {
    key: "quotation-delete",
    label: "Delete quotations",
    blurb: "Purchasing -> Quotations: tick quotations and delete them, or delete all. Quotations with nothing received, paid or shipped are erased for good; any that already have received stock, a payment or a bought label are hidden in Settings -> Archive instead.",
    defaultStage: "mothership",
  },
  {
    key: "receiving-picks",
    label: "Receiving intake: pick lists",
    blurb: "Receiving -> Intake form: the agent ticks options (packaging issues, damage, adjustment details, outcome, recommended adjustment, customer warning level) instead of typing, with a Custom note on each list. Each company can hide options or add its own in Receiving -> Form settings.",
    defaultStage: "mothership",
  },
  {
    key: "payout-links",
    label: "Customer payment-details links",
    blurb: "Purchasing -> a quotation: send the customer a private link where they enter the direct-deposit details we pay them with (a bank account, PayPal, Cash App, Venmo or Chime). The details are stored encrypted, only owners, admins and Accounts can see them, and they are erased when the order is marked Paid.",
    defaultStage: "mothership",
  },
  {
    key: "inventory-import",
    label: "Inventory: import opening stock",
    blurb: "Inventory -> Import Stock: a company moving over loads what it holds today from an Excel or CSV file. The file is read and shown first, nothing is saved until the person confirms, the same file can't be imported twice, and an import can be undone (reversing entries, nothing deleted). Same permissions as Manual Add.",
    defaultStage: "mothership",
  },
  {
    key: "invoice-stock-picker",
    label: "Sales: stock browser and exact expirations on invoice lines",
    blurb: "In the Sales editor: a closed, expandable Browse stock list grouped by brand and product to add items from, a choice of the exact expiration month or month range on each line (or a typed date or month range), and Live Stock showing how many units invoices are holding and what is still available.",
    defaultStage: "mothership",
  },
  {
    key: "invoice-edit-sent",
    label: "Sales: edit an invoice after it was sent",
    blurb: "A sent (or part-paid, or paid) invoice can be changed at any time by Sales, Accounts, Admin and the Owner: remove an item, change a quantity or price, fix an address. Units come back into or leave Inventory by themselves, payments already recorded stay, the earlier version is kept, and the updated invoice can be emailed. Also adds the right-click menu on the invoice list.",
    defaultStage: "mothership",
  },
  {
    key: "inventory-fix-name",
    label: "Inventory: correct a product's name or brand in Live Stock",
    blurb: "Fix name and Change brand buttons on each product in Live Stock for the Owner, Admin, Purchasing Managers and anyone given work in Inventory: pick the right product from your list (or type a name) and all of that product's stock moves to it with the same quantities, dating, lots and costs (recorded in the movements history; drafts holding it follow the new name), or file the product under the right brand (category) with no units moving.",
    defaultStage: "mothership",
  },
  {
    key: "inventory-edit-stock",
    label: "Inventory: edit stock lines in Live Stock (reconciliation)",
    blurb: "An Edit button on each stock line in Live Stock for the Owner, Admin, Purchasing Managers and anyone given work in Inventory: correct the quantity, condition, expiration or month range, lot number, cost or product of each lot, with a required reason. Done with adjustment rows in the movements history (Receiving's records and imports are never changed); refused if it would leave less than open invoices are holding.",
    defaultStage: "mothership",
  },
];

export const featureDef = (key: string) => FEATURES.find((f) => f.key === key);

async function stageOf(key: string): Promise<Stage> {
  const def = featureDef(key);
  if (!def) return "off"; // an unknown feature is never on
  const [row] = await db.select({ stage: featureFlags.stage }).from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  return row && isStage(row.stage) ? row.stage : def.defaultStage;
}

/** Is this feature on for this company? Unknown features are off. */
export async function featureOn(key: string, organizationId: string): Promise<boolean> {
  const stage = await stageOf(key);
  if (stage === "everyone") return true;
  if (stage === "off") return false;
  const [org] = await db.select({ slug: organizations.slug, parent: organizations.parentOrganizationId }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  // An operation of a company follows the company's own choice (its main row).
  const companyId = org?.parent ?? organizationId;
  const mothership = !!org && mayUsePlatformShippo(org.slug);
  let selected = false;
  if (stage === "selected" && !mothership) {
    const [pick] = await db
      .select({ k: featureFlagCompanies.flagKey })
      .from(featureFlagCompanies)
      .where(and(eq(featureFlagCompanies.flagKey, key), eq(featureFlagCompanies.organizationId, companyId)))
      .limit(1);
    selected = !!pick;
  }
  return stageAllows(stage, mothership, selected);
}

export type FeatureRow = FeatureDef & { stage: Stage; companies: { id: string; name: string; code: string | null }[] };

/** Every feature with its current stage and chosen companies (for the Feature rollout page). */
export async function listFeatures(): Promise<FeatureRow[]> {
  const out: FeatureRow[] = [];
  for (const f of FEATURES) {
    const stage = await stageOf(f.key);
    const picks = await db
      .select({ id: organizations.id, name: organizations.name, code: organizations.companyCode })
      .from(featureFlagCompanies)
      .innerJoin(organizations, eq(featureFlagCompanies.organizationId, organizations.id))
      .where(eq(featureFlagCompanies.flagKey, f.key));
    out.push({ ...f, stage, companies: picks });
  }
  return out;
}

export async function setFeatureStage(key: string, stage: Stage, userId: string): Promise<boolean> {
  if (!featureDef(key) || !isStage(stage)) return false;
  const now = new Date().toISOString();
  await db
    .insert(featureFlags)
    .values({ key, stage, updatedByUserId: userId, updatedAt: now })
    .onConflictDoUpdate({ target: featureFlags.key, set: { stage, updatedByUserId: userId, updatedAt: now } });
  return true;
}

export async function setFeatureCompany(key: string, organizationId: string, on: boolean): Promise<boolean> {
  if (!featureDef(key)) return false;
  if (on) {
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!org) return false;
    await db.insert(featureFlagCompanies).values({ flagKey: key, organizationId }).onConflictDoNothing();
  } else {
    await db.delete(featureFlagCompanies).where(and(eq(featureFlagCompanies.flagKey, key), eq(featureFlagCompanies.organizationId, organizationId)));
  }
  return true;
}
