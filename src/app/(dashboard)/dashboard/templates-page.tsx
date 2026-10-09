import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canManageSalesSettings, canViewPurchasing, canViewSales, isPurchasingManager } from "@/lib/permissions";
import { companyIdentity, operationTypeOf, purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { resolveFrom } from "@/lib/sales-service";
import { getTemplate } from "@/lib/document-template-service";
import { DEFAULT_TITLE, isDocType, type TemplateDepartment } from "@/lib/document-template-rules";
import { DOC_LABEL, documentOrder, type DocType } from "@/lib/operation-type";
import { DocumentTemplateEditor, type TemplateEditorCopy } from "@/components/document-template-editor";

const P = "/dashboard/purchasing";
const S = "/dashboard/sales";

/**
 * Settings -> Document Templates, for Purchasing and for Sales: one tab per document (Quotation, Purchase Order). Which tab opens
 * first follows the company's sign-up answer. Everyone who can see the department can read the templates; only the people who
 * manage that department's settings can change them.
 */
export async function TemplatesPage({ department, type }: { department: TemplateDepartment; type?: string }) {
  const org = await requireOrg();
  const sees = department === "purchasing" ? canViewPurchasing(org.role, org.access) : canViewSales(org.role, org.access);
  if (!sees || !(await purchaseOrdersEnabled(org.organizationId))) notFound();
  const canEdit = !org.viewAs && (department === "purchasing" ? isPurchasingManager(org.role) : canManageSalesSettings(org.role));

  const operation = await operationTypeOf(org.organizationId);
  const order = documentOrder(operation);
  const docType: DocType = isDocType(type) ? type : order[0];
  const [template, ident, from] = await Promise.all([getTemplate(org.organizationId, department, docType), companyIdentity(org.organizationId), resolveFrom(org.organizationId)]);

  const base = department === "purchasing" ? `${P}/templates` : `${S}/templates`;
  const word = DOC_LABEL[docType];
  const noticeOnly = department === "purchasing" && docType === "QUOTATION";
  const fallback = department === "purchasing" ? { name: ident.name, logo: ident.logoDataUrl } : { name: from.name, logo: from.logoDataUrl };
  const copy: TemplateEditorCopy = {
    word,
    defaultTitle: DEFAULT_TITLE[docType],
    termsLabel: department === "purchasing" ? "Terms printed at the bottom of each new purchase order" : `Standard notes for each new ${word.toLowerCase()}`,
    termsHelp:
      department === "purchasing"
        ? "Each new purchase order starts with these terms. You can still change them on any one order."
        : "Filled in when you start a new one and printed for the other company to read. You can still change them on any one document.",
    fallbackName: fallback.name,
    fallbackLogo: fallback.logo,
  };

  return (
    <div className="max-w-3xl" data-testid="templates-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Document Templates</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        How your {department === "purchasing" ? "Purchasing" : "Sales"} documents look: the logo, wording and a standing notice that prints on every one. Quotations and Purchase Orders each have their own template.
        {operation === null ? "" : ` You told us you run as a ${operation.toLowerCase()}, so ${DOC_LABEL[order[0]].toLowerCase()} comes first; both are always here.`}
      </p>

      <nav className="mt-4 flex gap-2" aria-label="Document type" data-testid="templates-tabs">
        {order.map((t) => (
          <Link
            key={t}
            href={`${base}?type=${t}`}
            aria-current={t === docType ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${t === docType ? "bg-emerald-700 text-white" : "border border-slate-300 text-slate-800 hover:bg-white dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"}`}
            data-testid={`templates-tab-${t}`}
          >
            {DOC_LABEL[t]}
          </Link>
        ))}
      </nav>

      {noticeOnly && (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid="templates-quotation-note">
          A Purchasing quotation&apos;s company name and logo are set in <Link href={`${P}/quotation-profile`} className="underline">Quotation Profile</Link>, and its fixed wording in <Link href={`${P}/receipt-layout`} className="underline">Quotation Receipt Layout</Link>. The standing notice below prints on every quotation receipt.
        </p>
      )}
      {!canEdit && (
        <p className="mt-4 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400" data-testid="templates-readonly">
          {department === "purchasing" ? "Only a Purchasing Manager or Master Admin can change these templates." : "Only a Purchasing Manager, Admin or the Owner can change these templates."}
        </p>
      )}

      <div className="mt-5">
        <DocumentTemplateEditor
          key={`${department}-${docType}`}
          department={department}
          docType={docType}
          initial={{
            displayName: template.displayName ?? "",
            showLogo: template.showLogo,
            titleText: template.titleText ?? "",
            introText: template.introText ?? "",
            termsText: template.termsText ?? "",
            footerText: template.footerText ?? "",
            noticeText: template.noticeText ?? "",
            noticeEnabled: template.noticeEnabled,
            noticeUntil: template.noticeUntil ?? "",
          }}
          ownLogo={template.logoDataUrl}
          copy={copy}
          noticeOnly={noticeOnly}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
