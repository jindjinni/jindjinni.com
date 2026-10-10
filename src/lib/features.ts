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
    blurb: "Separate operations: a company can run Wholesale (buying from individuals) and Distribution (buying from wholesalers, selling to pharmacies) as two separate workspaces under one sign-in, free. Settings -> Operations, the sign-in picker, the top-bar switcher and Overall status come with it.",
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
