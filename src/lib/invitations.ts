// Invitation tokens: random, URL-safe, shown once in the invite link. Only a
// SHA-256 hash is stored (see teamInvitations.tokenHash).
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, teamInvitations } from "@/db/schema";

export const INVITE_VALID_DAYS = 7;

export function newInviteToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteLookup =
  | { status: "invalid" }
  | {
      status: "valid" | "expired" | "used" | "revoked";
      invitation: typeof teamInvitations.$inferSelect;
      organizationName: string;
    };

/** Finds an invitation from the raw token in a link and says whether it can still be used. */
export async function lookupInvitation(token: string): Promise<InviteLookup> {
  if (!token || token.length < 20 || token.length > 200) return { status: "invalid" };
  const [row] = await db
    .select({ invitation: teamInvitations, organizationName: organizations.name, closedAt: organizations.closedAt })
    .from(teamInvitations)
    .innerJoin(organizations, eq(teamInvitations.organizationId, organizations.id))
    .where(eq(teamInvitations.tokenHash, hashInviteToken(token)))
    .limit(1);
  if (!row) return { status: "invalid" };
  const { invitation, organizationName, closedAt } = row;
  if (closedAt) return { status: "revoked", invitation, organizationName };
  if (invitation.acceptedAt) return { status: "used", invitation, organizationName };
  if (invitation.revokedAt) return { status: "revoked", invitation, organizationName };
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return { status: "expired", invitation, organizationName };
  return { status: "valid", invitation, organizationName };
}
