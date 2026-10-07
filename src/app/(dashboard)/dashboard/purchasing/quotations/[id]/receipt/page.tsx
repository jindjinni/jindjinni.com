import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingQuotationWithItems,
  getPurchasingExpirationRanges,
  getReceiptVersions,
  getBusinessProfile,
  getQuotationProfile,
  resolveBusinessDocumentIdentity,
  getPurchasingReceiptSettings,
  resolvePurchasingReceiptSettings,
  renderReceiptCopy,
} from "@/lib/queries";
import { saveReceiptVersion } from "@/app/actions/purchasing";
import { ActionButton } from "@/components/action-button";
import { PrintButton } from "./print-button";

/** "7+ months" range + a quotation dated Sep 30 2026 -> "Apr 2027" (quotation date + the range's minMonths). Null when the range has no minMonths or can't be resolved (e.g. it was later deleted). */
function expiryOnwardsLabel(quotationDate: string, minMonths: number | null | undefined) {
  if (minMonths == null) return null;
  const d = new Date(quotationDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + minMonths);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function QuotationReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();

  const data = await getPurchasingQuotationWithItems(org.organizationId, id);
  if (!data) notFound();
  const { quotation, items } = data;
  const [ranges, versions, profile, receiptSettingsRow, quotationProfile] = await Promise.all([
    // (quotationProfile: Purchasing's own name and logo for quotations)
    getPurchasingExpirationRanges(org.organizationId, { includeInactive: true }),
    getReceiptVersions(id),
    getBusinessProfile(org.organizationId),
    getPurchasingReceiptSettings(org.organizationId),
    getQuotationProfile(org.organizationId),
  ]);
  const rangesById = new Map(ranges.map((r) => [r.id, r]));
  const business = resolveBusinessDocumentIdentity(org.organizationName, profile, quotationProfile);
  const copy = renderReceiptCopy(resolvePurchasingReceiptSettings(receiptSettingsRow), business.displayName);
  const conditionBullets = copy.conditionBullets.split("\n").map((b) => b.trim()).filter(Boolean);

  const formattedDate = new Date(quotation.quotationDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/dashboard/purchasing/quotations/${id}`}
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Back to quotation
        </Link>
        <div className="flex items-center gap-3">
          <ActionButton
            action={saveReceiptVersion.bind(null, id)}
            label="Save version to history"
            pendingLabel="Saving..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
          />
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-slate-900 shadow-sm print:border-none print:p-0 print:shadow-none">
        {/* Header / wordmark */}
        <div className="text-center">
          {business.showLogo && business.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoDataUrl} alt={business.displayName} className="mx-auto h-14 object-contain" />
          ) : (
            <div className="leading-tight">
              {business.displayName.split(" ").length > 1 ? (
                <>
                  <div className="text-2xl font-extrabold tracking-tight text-red-600">
                    {business.displayName.split(" ")[0]}
                  </div>
                  <div className="text-base font-extrabold uppercase tracking-wide text-blue-700">
                    {business.displayName.split(" ").slice(1).join(" ")}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-extrabold tracking-tight text-slate-900">{business.displayName}</div>
              )}
            </div>
          )}
        </div>

        <h1 className="mt-3 text-center text-3xl font-bold text-slate-900">Quotation Receipt</h1>
        <hr className="mt-3 border-slate-300" />

        <div className="mt-4 rounded-md bg-amber-300 px-4 py-2 text-center text-lg font-extrabold uppercase tracking-wide text-slate-900">
          {copy.bannerText}
        </div>

        <p className="mt-4 text-sm text-slate-700">Date: {formattedDate}</p>

        <p className="mt-3 text-sm font-bold text-blue-700">QUOTATION FOR:</p>
        <p className="text-lg font-bold uppercase text-slate-900">{quotation.customerNameSnapshot}</p>

        <div className="relative mt-4 overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-blue-600 text-left text-white">
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Product</th>
              <th className="px-2 py-2 font-semibold">Note</th>
              <th className="px-2 py-2 font-semibold">Expiry</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">Unit Price</th>
              <th className="px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const range = item.expirationRangeId ? rangesById.get(item.expirationRangeId) : undefined;
              const onwards = expiryOnwardsLabel(quotation.quotationDate, range?.minMonths);
              return (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="px-2 py-3 align-top text-slate-500">{i + 1}</td>
                  <td className="px-2 py-3 align-top font-medium">
                    {item.productNameSnapshot}
                    {item.productCodeSnapshot ? ` (${item.productCodeSnapshot})` : ""}
                  </td>
                  <td className="px-2 py-3 align-top text-slate-600">{item.conditionNameSnapshot ?? "—"}</td>
                  <td className="px-2 py-3 align-top text-slate-600">
                    {item.expirationRangeLabelSnapshot ?? "—"}
                    {onwards && (
                      <>
                        <br />
                        <span className="text-xs text-slate-400">({onwards} Onwards)</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right align-top tabular-nums">{item.quantity}</td>
                  <td className="px-2 py-3 text-right align-top tabular-nums">${item.finalUnitPrice.toFixed(2)}</td>
                  <td className="px-2 py-3 text-right align-top tabular-nums font-medium">${item.lineTotal.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="mt-4 flex flex-col items-end gap-0.5 text-sm">
          <span>
            Items Total: <span className="tabular-nums font-medium">${quotation.itemsTotal.toFixed(2)}</span>
          </span>
          {quotation.bonusAmount > 0 && (
            <>
              <span>
                Bonus: <span className="tabular-nums font-medium">${quotation.bonusAmount.toFixed(2)}</span>
              </span>
              {quotation.bonusTierLabelSnapshot && (
                <span className="text-xs text-slate-400">{quotation.bonusTierLabelSnapshot}</span>
              )}
            </>
          )}
          {quotation.deductionEnabled && quotation.deductionAmount > 0 && (
            <span>
              Deduction: <span className="tabular-nums font-medium">−${quotation.deductionAmount.toFixed(2)}</span>
            </span>
          )}
          <span className="mt-1 text-lg font-extrabold text-red-600">
            Grand Total: <span className="tabular-nums">${quotation.grandTotal.toFixed(2)}</span>
          </span>
        </div>

        <div className="mt-4 rounded-md bg-blue-50 px-4 py-3 text-center text-lg font-bold text-slate-900">
          Total will be ${quotation.grandTotal.toFixed(2)} {copy.shippingSuffix}
        </div>

        <div className="mt-6 text-xs leading-relaxed text-slate-600">
          <p className="text-sm font-bold text-blue-700">DISCLAIMER:</p>
          <p className="mt-1">{copy.disclaimerIntro}</p>
          <p>{copy.disclaimerReturnPolicy}</p>
          <p className="mt-1">{copy.disclaimerDamageSummary}</p>

          {conditionBullets.length > 0 && (
            <>
              <p className="mt-3 text-sm font-bold text-blue-700">{copy.conditionHeading}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {conditionBullets.map((bullet, i) => (
                  <li key={i} className={i === conditionBullets.length - 1 ? "font-bold" : undefined}>
                    {bullet}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-sm font-bold text-red-600">{copy.paymentTimingText}</p>
        <p className="mt-1 text-center text-xs text-slate-500">{copy.paymentTimingSubtext}</p>

        <hr className="mt-4 border-slate-300" />
        <p className="mt-3 text-center text-xs text-slate-400">{copy.footerThankYou}</p>
        <p className="text-center text-xs text-slate-300">Page 1 of 1</p>
      </div>

      {versions.length > 0 && (
        <div className="mx-auto mt-6 max-w-2xl print:hidden">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Saved receipt history</h2>
          <ul className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {versions.map((v) => (
              <li key={v.id}>
                Version {v.version} — saved {new Date(v.generatedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
