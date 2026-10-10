// The database side of "Wholesale and Distribution are two different LLCs". The second operation's workspace row carries its own
// approval status (empty = it shares the company's) and its own verification row, so the platform owner reviews it exactly like a
// company. See second-business-rules.ts for the pure rules.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, businessVerifications, organizations } from "@/db/schema";
import { einInUse, EIN_IN_USE_MESSAGE, saveVerification, type VerificationInput } from "@/lib/business-verification";
import { distinctFromFirst } from "@/lib/second-business-rules";

/** The company's first business papers (the main row), for comparing the second set against. */
async function firstPapers(rootId: string) {
  const [v] = await db
    .select({ ein: businessVerifications.ein, registeredState: businessVerifications.registeredState, stateFileNumber: businessVerifications.stateFileNumber })
    .from(businessVerifications)
    .where(eq(businessVerifications.organizationId, rootId))
    .limit(1);
  return v ?? null;
}

/**
 * The plain reason the second business's papers cannot be accepted, or null. `rootId` is the company's main row (null at sign-up,
 * when the first papers are the ones just typed: pass them as `first`). `childId` is the operation being verified, so a re-send
 * does not collide with its own earlier papers.
 */
export async function checkSecondBusiness(
  second: VerificationInput,
  opts: { rootId?: string; first?: { ein: string; registeredState: string; stateFileNumber: string }; childId?: string },
): Promise<string | null> {
  const first = opts.first ?? (opts.rootId ? await firstPapers(opts.rootId) : null);
  if (first) {
    const same = distinctFromFirst(first, second);
    if (same) return same;
  }
  if (await einInUse(second.ein, opts.childId)) return EIN_IN_USE_MESSAGE;
  return null;
}

/**
 * Makes one operation a separate business: it now has its own papers and its own review, and stays locked until the platform owner
 * approves it. Sends the papers into the review queue. The operation's own business profile carries its own EIN and file number.
 */
export async function startSeparateBusiness(childId: string, papers: VerificationInput): Promise<void> {
  const now = new Date().toISOString();
  await saveVerification(childId, papers);
  await db
    .update(businessProfiles)
    .set({ taxId: papers.ein, businessRegistrationNumber: papers.stateFileNumber })
    .where(eq(businessProfiles.organizationId, childId));
  await db.update(organizations).set({ approvalStatus: "pending", approvalReason: null, approvalDecidedAt: null, updatedAt: now }).where(eq(organizations.id, childId));
}

export type OperationEntity = {
  /** The operation's workspace row (never the main row). */
  childId: string;
  kind: string | null;
  /** null = shares the company's business and approval. */
  status: string | null;
  reason: string | null;
  decidedAt: string | null;
  ein: string | null;
};

/** The company's second operation and whether it is a separate business, or null when the company has only one operation. */
export async function entityOfSecondOperation(rootId: string): Promise<OperationEntity | null> {
  const [row] = await db
    .select({
      childId: organizations.id,
      kind: organizations.operationKind,
      status: organizations.approvalStatus,
      reason: organizations.approvalReason,
      decidedAt: organizations.approvalDecidedAt,
      ein: businessVerifications.ein,
    })
    .from(organizations)
    .leftJoin(businessVerifications, eq(businessVerifications.organizationId, organizations.id))
    .where(and(eq(organizations.parentOrganizationId, rootId)))
    .limit(1);
  return row ?? null;
}
