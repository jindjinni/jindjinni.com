"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { isAuditType, isDeviceAnswer, BUILT_TYPES, type AuditType } from "@/lib/audit-rules";
import {
  MAX_ATTACHMENT, addAttachment, addNote, createAudit, generateVersion, markSent, reopenAudit, setStatus, updateAudit, type AuditInputForm,
} from "@/lib/audit-service";

export type AuditFormState = { error?: string; message?: string } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Everyone who works in Accounts can run an audit; a platform person looking in never can. Always re-checked here on the server. */
async function worker() {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed) return { error: "The Audit Center isn't available here." } as const;
  if (!acc.canWork) return { error: "Your role can look at the Audit Center but can't change it." } as const;
  return { org, acc } as const;
}

function formFrom(fd: FormData, type: AuditType): AuditInputForm {
  const answer = str(fd, "deviceAnswer");
  return {
    type,
    buyerId: str(fd, "buyerId"),
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate"),
    deviceAnswer: isDeviceAnswer(answer) ? answer : null,
    productScope: str(fd, "productScope") === "SELECTED" ? "SELECTED" : "ALL",
    productKeys: fd.getAll("productKey").map(String).filter(Boolean),
    includePharmacy: fd.get("includePharmacy") === "yes",
    auditorName: str(fd, "auditorName"),
    auditorCompany: str(fd, "auditorCompany"),
    auditorEmail: str(fd, "auditorEmail"),
    auditorPhone: str(fd, "auditorPhone"),
    pbmName: str(fd, "pbmName"),
    agency: str(fd, "agency"),
    referenceNumber: str(fd, "referenceNumber"),
    requestReceivedOn: str(fd, "requestReceivedOn"),
    dueOn: str(fd, "dueOn"),
  };
}

async function readUpload(fd: FormData, name: string): Promise<{ fileName: string; contentType: string; bytes: Buffer } | { error: string } | null> {
  const f = fd.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_ATTACHMENT) return { error: "That file is over 5 MB. Send a smaller copy." };
  return { fileName: f.name, contentType: f.type || "application/octet-stream", bytes: Buffer.from(await f.arrayBuffer()) };
}

/** Starts a case. PBM and regulatory cases must answer the device question; "not clear" is allowed and holds the case until it is settled. */
export async function createAuditAction(_prev: AuditFormState, fd: FormData): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const type = str(fd, "type");
  if (!isAuditType(type) || !BUILT_TYPES.includes(type)) return { error: "Choose an audit type." };
  const input = formFrom(fd, type);
  if (!input.buyerId) return { error: "Choose the pharmacy." };
  if (!input.startDate || !input.endDate) return { error: "Enter the start date and the end date." };
  if (type !== "INTERNAL" && !input.deviceAnswer) return { error: "Answer the device question first. It cannot be skipped." };
  const up = await readUpload(fd, "request");
  if (up && "error" in up) return { error: up.error };
  const made = await createAudit({ organizationId: w.org.organizationId, userId: w.org.userId }, input);
  if (!made.ok) return { error: made.error };
  if (up) await addAttachment({ organizationId: w.org.organizationId, userId: w.org.userId }, made.id, { ...up, kind: "REQUEST" });
  revalidatePath("/dashboard/accounts/audit-center");
  redirect(`/dashboard/accounts/audit-center/${made.id}`);
}

export async function updateAuditAction(auditId: string, _prev: AuditFormState, fd: FormData): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const type = str(fd, "type");
  if (!isAuditType(type)) return { error: "Choose an audit type." };
  const res = await updateAudit({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, formFrom(fd, type));
  if (!res.ok) return { error: res.error };
  const up = await readUpload(fd, "request");
  if (up && "error" in up) return { error: up.error };
  if (up) await addAttachment({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, { ...up, kind: "REQUEST" });
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  return { message: "Saved." };
}

export async function generateAuditAction(auditId: string): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const res = await generateVersion({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  return { message: `Excel file version ${res.version} saved.` };
}

export async function addNoteAction(auditId: string, _prev: AuditFormState, fd: FormData): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const res = await addNote({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, str(fd, "note"));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  return { message: "Note added." };
}

export async function attachFileAction(auditId: string, _prev: AuditFormState, fd: FormData): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  const up = await readUpload(fd, "file");
  if (!up) return { error: "Choose a file first." };
  if ("error" in up) return { error: up.error };
  const res = await addAttachment({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, { ...up, kind: str(fd, "kind") === "REQUEST" ? "REQUEST" : "OTHER" });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  return { message: "File attached." };
}

/** The file is sent by hand in this phase: staff record who it went to and which version. */
export async function markSentAction(auditId: string, _prev: AuditFormState, fd: FormData): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  if (fd.get("confirm") !== "yes") return { error: "Tick the box to confirm the file was really sent." };
  const res = await markSent({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, str(fd, "versionId"), str(fd, "to"), str(fd, "cc"), str(fd, "subject"));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  return { message: "Recorded as sent." };
}

export async function setAuditStatusAction(auditId: string, to: "FOLLOW_UP_REQUIRED" | "COMPLETE" | "CANCELLED"): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  if (to === "CANCELLED" && !w.acc.isManager) return { error: "Only an Admin or the Owner can cancel an audit." };
  const res = await setStatus({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, to);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  revalidatePath("/dashboard/accounts/audit-center");
  return { message: "Updated." };
}

/** Management reopens a closed case; the reason is recorded. */
export async function reopenAuditAction(auditId: string, _prev: AuditFormState, fd: FormData): Promise<AuditFormState> {
  const w = await worker();
  if ("error" in w) return { error: w.error };
  if (!w.acc.isManager) return { error: "Only an Admin or the Owner can reopen an audit." };
  const res = await reopenAudit({ organizationId: w.org.organizationId, userId: w.org.userId }, auditId, str(fd, "reason"));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/dashboard/accounts/audit-center/${auditId}`);
  return { message: "Reopened." };
}
