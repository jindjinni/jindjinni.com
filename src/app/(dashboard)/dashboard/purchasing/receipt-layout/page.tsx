import { isPurchasingManager } from "@/lib/permissions";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingReceiptSettings,
  resolvePurchasingReceiptSettings,
  getBusinessProfile,
  getQuotationProfile,
  resolveBusinessDocumentIdentity,
} from "@/lib/queries";
import { ReceiptLayoutTabs } from "./receipt-layout-tabs";

export default async function ReceiptLayoutPage() {
  const org = await requireOrg();
  const canEdit = isPurchasingManager(org.role);

  const [row, profile, quotationProfile] = await Promise.all([
    getPurchasingReceiptSettings(org.organizationId),
    getBusinessProfile(org.organizationId),
    getQuotationProfile(org.organizationId),
  ]);
  const business = resolveBusinessDocumentIdentity(org.organizationName, profile, quotationProfile);
  const current = resolvePurchasingReceiptSettings(row);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Quotation Receipt Layout</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every piece of fixed wording printed on a quotation receipt -- the banner, the disclaimer, the mint-condition
        policy, the payment-timing note, and the footer. The item table, totals, and customer info always come from
        the quotation itself and aren&rsquo;t edited here. Leave a field blank and save to reset it to the built-in
        default.
      </p>

      {canEdit ? (
        <ReceiptLayoutTabs current={current} businessDisplayName={business.displayName} />
      ) : (
        <p className="mt-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Only a Purchasing Manager or Master Admin can edit the Quotation Receipt Layout.
        </p>
      )}
    </div>
  );
}
