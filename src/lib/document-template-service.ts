// Reading and saving a company's document templates (Quotation and Purchase Order, per department), and working out what prints
// today: the resolved wording and the standing notice. Every query is scoped by organizationId.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documentTemplates } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import type { DocType } from "@/lib/operation-type";
import { EMPTY_TEMPLATE, activeNotice, cleanTemplate, type TemplateDepartment, type TemplateInput, type TemplateText } from "@/lib/document-template-rules";

export type TemplateRow = typeof documentTemplates.$inferSelect;
export type Template = TemplateText & { logoDataUrl: string | null; hasLogo: boolean; updatedAt: string | null };

const toTemplate = (r: TemplateRow | null): Template => ({
  displayName: r?.displayName ?? null,
  showLogo: r?.showLogo ?? true,
  titleText: r?.titleText ?? null,
  introText: r?.introText ?? null,
  termsText: r?.termsText ?? null,
  footerText: r?.footerText ?? null,
  noticeText: r?.noticeText ?? null,
  noticeEnabled: r?.noticeEnabled ?? false,
  noticeUntil: r?.noticeUntil ?? null,
  logoDataUrl: r?.logoData && r.logoContentType ? `data:${r.logoContentType};base64,${r.logoData}` : null,
  hasLogo: !!(r?.logoData && r.logoContentType),
  updatedAt: r?.updatedAt ?? null,
});

export async function getTemplate(organizationId: string, department: TemplateDepartment, docType: DocType): Promise<Template> {
  const [row] = await db
    .select()
    .from(documentTemplates)
    .where(and(eq(documentTemplates.organizationId, organizationId), eq(documentTemplates.department, department), eq(documentTemplates.docType, docType)))
    .limit(1);
  return toTemplate(row ?? null);
}

async function ensureRow(organizationId: string, department: TemplateDepartment, docType: DocType) {
  await db
    .insert(documentTemplates)
    .values({ id: newId("dtpl"), organizationId, department, docType })
    .onConflictDoNothing();
}

export type TemplateOrg = { organizationId: string; userId: string };

/** Saves the wording and the notice (not the logo). The input is cleaned here, so a caller can pass the form as it came. */
export async function saveTemplate(org: TemplateOrg, department: TemplateDepartment, docType: DocType, input: TemplateInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleaned = cleanTemplate(input);
  if (!cleaned.ok) return cleaned;
  const v = cleaned.value;
  await ensureRow(org.organizationId, department, docType);
  await db
    .update(documentTemplates)
    .set({
      displayName: v.displayName,
      showLogo: v.showLogo,
      titleText: v.titleText,
      introText: v.introText,
      termsText: v.termsText,
      footerText: v.footerText,
      noticeText: v.noticeText,
      noticeEnabled: v.noticeEnabled,
      noticeUntil: v.noticeUntil,
      updatedByUserId: org.userId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(documentTemplates.organizationId, org.organizationId), eq(documentTemplates.department, department), eq(documentTemplates.docType, docType)));
  return { ok: true };
}

export async function saveTemplateLogo(org: TemplateOrg, department: TemplateDepartment, docType: DocType, logo: { data: string; contentType: string } | null) {
  await ensureRow(org.organizationId, department, docType);
  await db
    .update(documentTemplates)
    .set({ logoData: logo?.data ?? null, logoContentType: logo?.contentType ?? null, updatedByUserId: org.userId, updatedAt: new Date().toISOString() })
    .where(and(eq(documentTemplates.organizationId, org.organizationId), eq(documentTemplates.department, department), eq(documentTemplates.docType, docType)));
}

/** The company's own calendar day (YYYY-MM-DD), in the time zone it chose in Accounts. */
export async function companyToday(organizationId: string): Promise<string> {
  const terms = await getPaymentTerms(organizationId).catch(() => null);
  return todayIn(terms?.timeZone ?? "America/New_York");
}

/** The template plus the notice that prints today (null when it is off, empty or past its last day). */
export async function templateWithNotice(organizationId: string, department: TemplateDepartment, docType: DocType): Promise<{ template: Template; notice: string | null; today: string }> {
  const [template, today] = await Promise.all([getTemplate(organizationId, department, docType), companyToday(organizationId)]);
  return { template, notice: activeNotice(template, today), today };
}

export { EMPTY_TEMPLATE };
