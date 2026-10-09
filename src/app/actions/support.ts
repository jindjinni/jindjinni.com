"use server";

// Support center actions. Company side: send a ticket, answer, allow / take back "view my account". Platform side (platform owner
// only, re-checked here): reply, internal note, status, start looking at a company. Hiding a button is never the guard.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { featureOn } from "@/lib/features";
import { isAdmin } from "@/lib/permissions";
import { isPlatformStaff } from "@/lib/platform-admin";
import { rateHit, waitMessage } from "@/lib/rate-limit";
import {
  addCompanyMessage,
  addInternalNote,
  createTicket,
  grantViewConsent,
  replyAsSupport,
  revokeViewConsent,
  setTicketStatus,
  startViewSession,
} from "@/lib/support-service";
import { VIEW_MINUTES } from "@/lib/support-rules";
import { requireOrg } from "@/lib/tenant";
import { twoStepOn } from "@/lib/two-step";
import { VIEW_COOKIE, signViewToken } from "@/lib/view-as-token";

export type SupportState = { error?: string; message?: string } | undefined;

// ---- Company side ------------------------------------------------------------------------------------------------------------
export async function sendTicket(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Nothing can be sent while viewing a company's account." };
  if (!(await featureOn("support-center", org.organizationId))) return { error: "Support isn't available for your company yet." };
  const wait = await rateHit("ticket", org.userId, 10, 3600);
  if (!wait.allowed) return { error: waitMessage(wait.retryAfterSec) };
  const days = Number(formData.get("viewDays") ?? 0);
  const res = await createTicket(org, {
    subject: String(formData.get("subject") ?? ""),
    category: String(formData.get("category") ?? ""),
    body: String(formData.get("body") ?? ""),
    viewDays: formData.get("allowView") === "on" && [1, 3, 7].includes(days) ? days : null,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/dashboard/support");
  redirect(`/dashboard/support/${res.id}`);
}

export async function replyToTicket(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Nothing can be sent while viewing a company's account." };
  const wait = await rateHit("ticket-reply", org.userId, 30, 3600);
  if (!wait.allowed) return { error: waitMessage(wait.retryAfterSec) };
  const res = await addCompanyMessage(org, String(formData.get("ticketId") ?? ""), String(formData.get("body") ?? ""));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/support/${String(formData.get("ticketId") ?? "")}`);
  return { message: "Sent. We'll reply here and by email." };
}

export async function allowSupportView(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Not available while viewing a company's account." };
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can allow that." };
  const ticketId = String(formData.get("ticketId") ?? "");
  const res = await grantViewConsent(org, ticketId, Number(formData.get("days") ?? 0));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/support/${ticketId}`);
  return { message: "Done. Support may now look at your account, read-only, until that time." };
}

export async function takeBackSupportView(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Not available while viewing a company's account." };
  const ticketId = String(formData.get("ticketId") ?? "");
  const res = await revokeViewConsent(org, ticketId);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/support/${ticketId}`);
  return { message: "Permission taken back. Support can no longer look at your account." };
}

// ---- Platform side -----------------------------------------------------------------------------------------------------------
async function platformStaffOnly() {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformStaff(org))) throw new Error("Not allowed.");
  return org;
}

export async function supportReply(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await platformStaffOnly();
  const ticketId = String(formData.get("ticketId") ?? "");
  const res = await replyAsSupport(ticketId, org.userId, String(formData.get("body") ?? ""), formData.get("solve") === "on");
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/lamp/support/${ticketId}`);
  return { message: formData.get("solve") === "on" ? "Reply sent and ticket marked solved." : "Reply sent." };
}

export async function supportNote(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await platformStaffOnly();
  const ticketId = String(formData.get("ticketId") ?? "");
  const res = await addInternalNote(ticketId, org.userId, String(formData.get("body") ?? ""));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/lamp/support/${ticketId}`);
  return { message: "Note saved. The company never sees notes." };
}

export async function supportSetStatus(_prev: SupportState, formData: FormData): Promise<SupportState> {
  await platformStaffOnly();
  const ticketId = String(formData.get("ticketId") ?? "");
  const ok = await setTicketStatus(ticketId, String(formData.get("status") ?? ""), String(formData.get("priority") ?? "") || undefined);
  if (!ok) return { error: "Couldn't change that." };
  revalidatePath(`/dashboard/lamp/support/${ticketId}`);
  revalidatePath("/dashboard/lamp/support");
  return { message: "Updated." };
}

/** Starts the read-only look at the ticket's company. Needs: platform owner, two-step on, the feature on, the company's OK. */
export async function startViewAsCompany(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const org = await platformStaffOnly();
  if (!(await featureOn("view-as-company", org.organizationId))) return { error: "View as company isn't switched on yet." };
  if (!(await twoStepOn(org.userId))) return { error: "Turn on two-step sign-in in My account first. Looking at a company's account requires it." };
  const ticketId = String(formData.get("ticketId") ?? "");
  const res = await startViewSession(ticketId, { userId: org.userId, organizationId: org.organizationId });
  if (!res.ok) return { error: res.error };
  const exp = Date.parse(res.expiresAt);
  (await cookies()).set(VIEW_COOKIE, signViewToken({ s: res.sessionId, u: org.userId, exp }), {
    httpOnly: true,
    sameSite: "lax",
    secure: !!process.env.VERCEL,
    path: "/",
    maxAge: VIEW_MINUTES * 60,
  });
  redirect("/dashboard");
}
