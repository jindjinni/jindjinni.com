"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canManageSalesSettings, isPurchasingManager } from "@/lib/permissions";
import { encodeLogoFile } from "@/lib/logo-validation";
import { purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { saveTemplate, saveTemplateLogo } from "@/lib/document-template-service";
import { isDocType, isTemplateDepartment, type TemplateInput } from "@/lib/document-template-rules";

export type TemplateState = { error?: string; message?: string } | undefined;

// Every action: signed in, the person who manages that department's settings (Purchasing manager, or the Sales settings
// managers), the "purchase-orders" feature on for this company, and not merely "viewing as" it. The company comes from the session.
async function editor(department: unknown, docType: unknown): Promise<{ org: CurrentOrg; department: "purchasing" | "sales"; docType: "QUOTATION" | "PURCHASE_ORDER" } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "You are only viewing this company, so nothing was changed." };
  if (!isTemplateDepartment(department) || !isDocType(docType)) return { error: "Something went wrong. Reload the page and try again." };
  const ok = department === "purchasing" ? isPurchasingManager(org.role) : canManageSalesSettings(org.role);
  if (!ok) return { error: department === "purchasing" ? "Only a Purchasing Manager or Master Admin can change the Purchasing templates." : "Only a Purchasing Manager, Admin or the Owner can change the Sales templates." };
  if (!(await purchaseOrdersEnabled(org.organizationId))) return { error: "Document templates aren't turned on for your company yet." };
  return { org, department, docType };
}

const refresh = (department: string) => revalidatePath(`/dashboard/${department}/templates`);

export async function saveTemplateAction(department: string, docType: string, input: TemplateInput): Promise<TemplateState> {
  const e = await editor(department, docType);
  if ("error" in e) return e;
  const res = await saveTemplate(e.org, e.department, e.docType, input);
  if (!res.ok) return { error: res.error };
  refresh(e.department);
  return { message: "Saved." };
}

export async function uploadTemplateLogoAction(department: string, docType: string, formData: FormData): Promise<TemplateState> {
  const e = await editor(department, docType);
  if ("error" in e) return e;
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PNG or JPG image to upload." };
  const encoded = await encodeLogoFile(file);
  if ("error" in encoded) return { error: encoded.error };
  await saveTemplateLogo(e.org, e.department, e.docType, encoded);
  refresh(e.department);
  return { message: "Logo saved." };
}

export async function removeTemplateLogoAction(department: string, docType: string): Promise<TemplateState> {
  const e = await editor(department, docType);
  if ("error" in e) return e;
  await saveTemplateLogo(e.org, e.department, e.docType, null);
  refresh(e.department);
  return { message: "Logo removed." };
}
