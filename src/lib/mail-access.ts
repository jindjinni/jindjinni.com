// Who may do what with a department's mail. Everything is decided here, on the server: the pages and the actions call these and the
// menu only hides links. A platform person looking through "View as company" can never send or change anything.

import { featureOn } from "@/lib/features";
import { canSendCustomerEmails, canViewAccounts, canViewCustomerService, canViewPurchasing, canViewReceiving, canViewSales, canViewShipping, canWritePayment, canWritePurchasing, canWriteReceiving, canWriteSales, canWriteShipping, isAdmin, type Access } from "@/lib/permissions";
import type { MailDept } from "@/lib/mail-rules";
import type { CurrentOrg } from "@/lib/tenant";

/** The rollout switch for department mailboxes (Settings -> Feature rollout). */
export const mailboxesOn = (organizationId: string) => featureOn("mailboxes", organizationId);

/** A department's menu without its Mail tab while the mailboxes rollout switch is off for the company. */
export async function withMailTab(ids: string[], organizationId: string): Promise<string[]> {
  return (await mailboxesOn(organizationId)) ? ids : ids.filter((id) => id !== "mail");
}

type Who = { role: string; access?: Access };

/** May this person open the department at all (and so see its shared mailbox)? */
export function canViewMailDept(dept: MailDept, w: Who): boolean {
  switch (dept) {
    case "purchasing": return canViewPurchasing(w.role, w.access);
    case "sales": return canViewSales(w.role, w.access);
    case "shipping": return canViewShipping(w.role, w.access);
    case "receiving": return canViewReceiving(w.role, w.access);
    case "accounts": return canViewAccounts(w.role, w.access);
    case "customer-service": return canViewCustomerService(w.role, w.access);
  }
}

/** May this person send from the department's shared mailbox? The same people who can change things in that department. */
export function canSendMailDept(dept: MailDept, w: Who): boolean {
  switch (dept) {
    case "purchasing": return canWritePurchasing(w.role, w.access);
    case "sales": return canWriteSales(w.role, w.access);
    case "shipping": return canWriteShipping(w.role, w.access);
    case "receiving": return canWriteReceiving(w.role, w.access);
    case "accounts": return canWritePayment(w.role, w.access);
    case "customer-service": return canSendCustomerEmails(w.role, w.access);
  }
}

export type BoxFacts = { kind: string; ownerUserId: string | null; department: string };
export type MailRights = {
  /** Open the mailbox and read its mail. */
  read: boolean;
  /** Compose, save drafts, schedule and send. */
  send: boolean;
  /** Rename, hide or restore, disconnect. */
  manage: boolean;
  /** Sign in to the mail account for it (only the person it belongs to, or an admin for a shared one). */
  connect: boolean;
};
const NONE: MailRights = { read: false, send: false, manage: false, connect: false };

/**
 * A shared mailbox is read by everyone who can open the department, sent from by those who work in it, and set up by an admin.
 * A personal mailbox is read, sent from and connected only by the person it belongs to; an admin can switch it off or hide it
 * (for example when someone leaves) but never reads it.
 */
export function mailRights(box: BoxFacts, org: Pick<CurrentOrg, "userId" | "role" | "access" | "viewAs">, dept: MailDept): MailRights {
  if (box.department !== dept) return NONE;
  const who = { role: org.role, access: org.access };
  const live = !org.viewAs;
  const sees = canViewMailDept(dept, who);
  if (box.kind === "PERSONAL") {
    const mine = box.ownerUserId === org.userId;
    return {
      read: sees && mine,
      send: sees && mine && live,
      manage: live && ((sees && mine) || isAdmin(org.role)),
      connect: live && sees && mine,
    };
  }
  return {
    read: sees,
    send: sees && live && canSendMailDept(dept, who),
    manage: live && isAdmin(org.role) && sees,
    connect: live && isAdmin(org.role) && sees,
  };
}

/** May this person add a mailbox: shared ones by an admin, a personal one by anybody who can open the department. */
export function canAddMailbox(kind: "SHARED" | "PERSONAL", dept: MailDept, org: Pick<CurrentOrg, "role" | "access" | "viewAs">): boolean {
  if (org.viewAs) return false;
  if (!canViewMailDept(dept, { role: org.role, access: org.access })) return false;
  return kind === "PERSONAL" ? true : isAdmin(org.role);
}
