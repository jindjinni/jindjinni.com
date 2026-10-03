import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getOperationsQueues } from "@/lib/queries";

/**
 * The buyback module's home screen -- what an agent opens to find their next
 * task. Mirrors the old Airtable "Order Operations Center" interface, which
 * split one Receiving Shipments table across separate Receiving / Accounts /
 * Customer Service board pages; here it's the same underlying rows, sorted
 * into queues on one screen instead of six Airtable interface pages.
 */
export default async function OperationsCenterPage() {
  const org = await requireOrg();
  const queues = await getOperationsQueues(org.organizationId);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Order Operations Center
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Buyback + receiving for {org.organizationName}. Everything below
            posts into the same inventory ledger your invoices draw from.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/dashboard/sellers"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            + New seller
          </Link>
          <Link
            href="/dashboard/buyback/orders"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            + New quote
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QueueCard
          emoji="📬"
          title="Awaiting arrival"
          subtitle="Quoted -- package not logged as received yet"
          count={queues.awaitingArrival.length}
          emptyLabel="Nothing waiting on a package."
          viewAllHref="/dashboard/buyback/orders"
          items={queues.awaitingArrival.slice(0, 5).map((o) => ({
            key: o.id,
            href: `/dashboard/buyback/${o.id}`,
            primary: o.sellerName,
            secondary: o.orderReference ?? "No reference",
            trailing: `$${o.quotedTotal.toFixed(2)}`,
          }))}
        />
        <QueueCard
          emoji="📦"
          title="Receiving"
          subtitle="Package arrived -- verification in progress"
          count={queues.inProgress.length}
          emptyLabel="Nothing currently being received."
          viewAllHref="/dashboard/buyback/shipments"
          items={queues.inProgress.slice(0, 5).map((s) => ({
            key: s.id,
            href: `/dashboard/buyback/shipments/${s.id}`,
            primary: s.sellerName,
            secondary: s.orderReference ?? "No reference",
            trailing: "Continue →",
          }))}
          accent="slate"
        />
        <QueueCard
          emoji="💵"
          title="Accounts"
          subtitle="Received -- needs a payment decision"
          count={queues.needsAccounts.length}
          emptyLabel="Nothing waiting on Accounts."
          viewAllHref="/dashboard/buyback/shipments"
          items={queues.needsAccounts.slice(0, 5).map((s) => ({
            key: s.id,
            href: `/dashboard/buyback/shipments/${s.id}`,
            primary: s.sellerName,
            secondary: s.orderReference ?? "No reference",
            trailing: `$${s.quotedTotal.toFixed(2)}`,
          }))}
          accent="amber"
        />
        <QueueCard
          emoji="📱"
          title="Customer service"
          subtitle="Paid -- seller hasn't been notified yet"
          count={queues.needsNotification.length}
          emptyLabel="Everyone paid has been notified."
          viewAllHref="/dashboard/buyback/shipments"
          items={queues.needsNotification.slice(0, 5).map((s) => ({
            key: s.id,
            href: `/dashboard/buyback/shipments/${s.id}`,
            primary: s.sellerName,
            secondary: s.orderReference ?? "No reference",
            trailing: s.paidAt ? new Date(s.paidAt).toLocaleDateString() : "",
          }))}
          accent="sky"
        />
        <Link
          href="/dashboard/buyback/shipments"
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              🏢 All shipments
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {queues.totalShipments}
            </p>
          </div>
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            Browse every shipment, any status →
          </p>
        </Link>
        <Link
          href="/dashboard/database"
          className="flex flex-col justify-between rounded-xl border border-dashed border-slate-300 bg-white p-5 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900"
        >
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              🗄️ Admin database
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Every table, raw -- the same view you'd get opening the base
              directly.
            </p>
          </div>
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            Open database view →
          </p>
        </Link>
      </div>
    </div>
  );
}

const accentStyles: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
  default: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
};

function QueueCard({
  emoji,
  title,
  subtitle,
  count,
  emptyLabel,
  viewAllHref,
  items,
  accent = "default",
}: {
  emoji: string;
  title: string;
  subtitle: string;
  count: number;
  emptyLabel: string;
  viewAllHref: string;
  items: { key: string; href: string; primary: string; secondary: string; trailing: string }[];
  accent?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
            {emoji} {title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${accentStyles[accent]}`}>
          {count}
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-1">
        {items.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">{emptyLabel}</p>
        )}
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span className="min-w-0">
              <span className="block truncate text-slate-800 dark:text-slate-200">{item.primary}</span>
              <span className="block truncate text-xs text-slate-400">{item.secondary}</span>
            </span>
            <span className="shrink-0 pl-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {item.trailing}
            </span>
          </Link>
        ))}
      </div>

      {count > 5 && (
        <Link
          href={viewAllHref}
          className="mt-3 text-center text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          View all {count} →
        </Link>
      )}
    </div>
  );
}
