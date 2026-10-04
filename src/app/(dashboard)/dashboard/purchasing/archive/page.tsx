import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingQuotations,
  getPurchasingProducts,
  getPurchasingCustomers,
  getPurchasingConditions,
  getPurchasingExpirationRanges,
  getPurchasingBonusTiers,
  getPurchasingCategories,
  purchasingCustomerName,
} from "@/lib/queries";
import {
  restorePurchasingQuotation,
  restorePurchasingProduct,
  restorePurchasingCustomer,
  restorePurchasingCondition,
  restorePurchasingExpirationRange,
  restorePurchasingBonusTier,
  restorePurchasingCategory,
} from "@/app/actions/purchasing";
import { ActionButton } from "@/components/action-button";
import { ArchiveTabs } from "./archive-tabs";

const cellClass = "px-4 py-3 text-slate-700 dark:text-slate-300";
const restoreButtonClass =
  "rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950";

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400">
        {label}
      </td>
    </tr>
  );
}

/**
 * Everything in Purchasing that's been archived or deactivated, in one
 * place, with a one-click Restore on every row -- instead of hunting
 * through each section's own list. "Archived" here means what it already
 * means on each record: archivedAt set (customers/products/quotations) or
 * Active unchecked (conditions/month ranges/bonus tiers/categories). A
 * record that was PERMANENTLY deleted (only allowed once it has no
 * quotation history to lose -- see deletePurchasingProduct and friends)
 * has nothing left to show here by design; archiving is the reversible
 * path, and it's what every "Delete"/"Remove" control steers people to
 * once a record has real history attached to it.
 */
export default async function PurchasingArchivePage() {
  const org = await requireOrg();
  const canEdit = org.role !== "staff";

  if (!canEdit) {
    return (
      <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        Only a Purchasing Manager or Master Admin can view the Archive.
      </p>
    );
  }

  const [quotations, products, customers, conditions, ranges, bonusTiers, categories] = await Promise.all([
    getPurchasingQuotations(org.organizationId, { includeArchived: true }),
    getPurchasingProducts(org.organizationId, { includeInactive: true }),
    getPurchasingCustomers(org.organizationId, { includeArchived: true }),
    getPurchasingConditions(org.organizationId, { includeInactive: true }),
    getPurchasingExpirationRanges(org.organizationId, { includeInactive: true }),
    getPurchasingBonusTiers(org.organizationId, { includeInactive: true }),
    getPurchasingCategories(org.organizationId, { includeInactive: true }),
  ]);

  const archivedQuotations = quotations.filter((q) => q.archivedAt);
  const archivedProducts = products.filter((p) => p.archivedAt);
  const archivedCustomers = customers.filter((c) => c.archivedAt);
  const inactiveConditions = conditions.filter((c) => !c.active);
  const inactiveRanges = ranges.filter((r) => !r.active);
  const inactiveBonusTiers = bonusTiers.filter((t) => !t.active);
  const inactiveCategories = categories.filter((c) => !c.active);

  const counts = {
    quotations: archivedQuotations.length,
    products: archivedProducts.length,
    customers: archivedCustomers.length,
    conditions: inactiveConditions.length,
    ranges: inactiveRanges.length,
    bonusTiers: inactiveBonusTiers.length,
    categories: inactiveCategories.length,
  };

  const tabs = [
    {
      key: "quotations",
      label: "Quotations",
      count: counts.quotations,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Quotation #</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 text-right font-medium">Grand total</th>
              <th className="px-4 py-3 font-medium">Archived</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {archivedQuotations.length === 0 && <EmptyRow colSpan={5} label="No archived quotations." />}
            {archivedQuotations.map((q) => (
              <tr key={q.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>
                  <Link href={`/dashboard/purchasing/quotations/${q.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
                    {q.quotationNumber}
                  </Link>
                </td>
                <td className={cellClass}>{q.customerNameSnapshot}</td>
                <td className={`${cellClass} text-right tabular-nums`}>${q.grandTotal.toFixed(2)}</td>
                <td className={cellClass}>{q.archivedAt ? new Date(q.archivedAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingQuotation.bind(null, q.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "products",
      label: "Products",
      count: counts.products,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {archivedProducts.length === 0 && <EmptyRow colSpan={4} label="No archived products." />}
            {archivedProducts.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>
                  <Link href={`/dashboard/purchasing/products/${p.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
                    {p.name}
                  </Link>
                </td>
                <td className={cellClass}>{p.productCode ?? "—"}</td>
                <td className={cellClass}>{p.categoryName ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingProduct.bind(null, p.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "customers",
      label: "Customers",
      count: counts.customers,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {archivedCustomers.length === 0 && <EmptyRow colSpan={3} label="No archived customers." />}
            {archivedCustomers.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>
                  <Link href={`/dashboard/purchasing/customers/${c.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
                    {purchasingCustomerName(c)}
                  </Link>
                </td>
                <td className={cellClass}>{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingCustomer.bind(null, c.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "conditions",
      label: "Conditions",
      count: counts.conditions,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 text-right font-medium">Multiplier</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {inactiveConditions.length === 0 && <EmptyRow colSpan={3} label="No archived conditions." />}
            {inactiveConditions.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>{c.name}</td>
                <td className={`${cellClass} text-right tabular-nums`}>{c.multiplier.toFixed(2)}×</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingCondition.bind(null, c.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "ranges",
      label: "Month Range",
      count: counts.ranges,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 text-right font-medium">Default multiplier</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {inactiveRanges.length === 0 && <EmptyRow colSpan={3} label="No archived month ranges." />}
            {inactiveRanges.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>{r.label}</td>
                <td className={`${cellClass} text-right tabular-nums`}>{r.defaultMultiplier.toFixed(2)}×</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingExpirationRange.bind(null, r.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "bonusTiers",
      label: "Bonus Tiers",
      count: counts.bonusTiers,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 text-right font-medium">Threshold</th>
              <th className="px-4 py-3 text-right font-medium">Bonus</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {inactiveBonusTiers.length === 0 && <EmptyRow colSpan={4} label="No archived bonus tiers." />}
            {inactiveBonusTiers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>{t.description ?? "—"}</td>
                <td className={`${cellClass} text-right tabular-nums`}>${t.thresholdAmount.toFixed(2)}</td>
                <td className={`${cellClass} text-right tabular-nums`}>${t.bonusAmount.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingBonusTier.bind(null, t.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "categories",
      label: "Categories",
      count: counts.categories,
      content: (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {inactiveCategories.length === 0 && <EmptyRow colSpan={2} label="No archived categories." />}
            {inactiveCategories.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className={cellClass}>{c.name}</td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    action={restorePurchasingCategory.bind(null, c.id)}
                    label="Restore"
                    pendingLabel="Restoring..."
                    className={restoreButtonClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
  ];

  const totalArchived = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Archive</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Everything archived or deactivated across Purchasing -- quotations, products, and customers you archived, plus
        conditions, month ranges, bonus tiers, and categories you turned off. Nothing here is gone for good; Restore
        puts a record right back where it was. A record only disappears permanently when it&rsquo;s deleted and has no
        quotation history attached to it -- that&rsquo;s refused and pointed here otherwise.
      </p>

      {totalArchived === 0 ? (
        <p className="mt-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Nothing archived right now.
        </p>
      ) : (
        <ArchiveTabs tabs={tabs} />
      )}
    </div>
  );
}
