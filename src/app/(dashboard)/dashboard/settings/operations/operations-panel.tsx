"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addOperationAction, nameWorkspaceAction, openWorkspace, showAllTabsAction } from "@/app/actions/workspaces";
import { kindLabel, otherKind, type OperationKind } from "@/lib/operation-groups-rules";
import type { SideInfo } from "@/lib/operations-rules";

const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const primary = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";

type Props = {
  /** What this workspace is; null = a company from before operations were separated, which says so once. */
  kind: OperationKind | null;
  /** The company's other workspace, when it already exists. */
  otherId: string | null;
  info: Record<OperationKind, SideInfo>;
  canEdit: boolean;
  /** The day of this operation, step by step. */
  flow: Record<OperationKind, string[]>;
  /** An owner switched on "show every tab" for this operation. */
  showAll: boolean;
  /** What running one or both operations costs this company (its own locked price, in words). */
  cost: { hasBoth: boolean; percent: number; oneText: string; bothText: string; moreText: string; planNamed: boolean; billingLive: boolean };
};

export function OperationsPanel({ kind, otherId, info, canEdit, flow, showAll, cost }: Props) {
  const [named, nameAction, naming] = useActionState(nameWorkspaceAction, undefined);
  const [added, addAction, adding] = useActionState(addOperationAction, undefined);
  const [tabs, tabsAction, switching] = useActionState(showAllTabsAction, undefined);
  const openId = otherId ?? added?.openId ?? null;
  const msg = named?.message ?? added?.message ?? tabs?.message;
  const err = named?.error ?? added?.error ?? tabs?.error;
  const allShown = tabs?.message ? /Every tab is now/.test(tabs.message) : showAll;
  const other = kind ? otherKind(kind) : null;

  return (
    <div className="mt-5 flex flex-col gap-5">
      {!kind && (
        <section className={card} data-testid="ops-name-this">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">First, what are the records you have now?</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your company can run Wholesale and Distribution as two separate operations, each with its own customers, suppliers, products, orders, stock and payments. Tell us which one your current records belong to. The other one can then be added, empty and separate.
          </p>
          {canEdit && (
            <form action={nameAction} className="mt-4 flex flex-wrap gap-3">
              {(["wholesale", "distribution"] as const).map((k) => (
                <button key={k} name="kind" value={k} disabled={naming} className={primary} data-testid={`ops-kind-${k}`}>
                  They are {kindLabel(k)}
                </button>
              ))}
            </form>
          )}
        </section>
      )}

      {kind && (
        <section className={card} data-testid="ops-this" data-kind={kind}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{info[kind].title}</h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">You are in this operation</span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{info[kind].tagline}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">Buys from</dt><dd className="text-slate-900 dark:text-slate-100">{info[kind].buysFrom}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Sells to</dt><dd className="text-slate-900 dark:text-slate-100">{info[kind].sellsTo}</dd>
          </dl>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">What this operation gives you</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">{info[kind].turnsOn.map((t) => <li key={t}>{t}</li>)}</ul>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">How a day goes in this operation</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200" data-testid="ops-flow">{flow[kind].map((t) => <li key={t}>{t}</li>)}</ol>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Your first steps</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm" data-testid="ops-steps">
            {info[kind].firstSteps.map((s) => (
              <li key={s.id}><Link href={s.href} className="text-emerald-800 underline dark:text-emerald-300">{s.text}</Link></li>
            ))}
          </ol>
        </section>
      )}

      {kind && cost.hasBoth && (
        <section className={card} data-testid="ops-price">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">What this costs</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Your company runs both operations, so your plan is {cost.bothText}. That is {cost.percent}% more than one operation ({cost.oneText}).</p>
        </section>
      )}

      {kind && (
        <section className={card} data-testid="ops-tabs" data-all={allShown ? "1" : "0"}>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Which tabs show in the menus</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {kind === "wholesale"
              ? "A Wholesale operation buys from individuals, so Purchasing shows Quotations and Customers, and leaves out Purchase Orders and Suppliers."
              : "A Distribution operation buys from wholesalers with purchase orders, so Purchasing shows Purchase Orders and Suppliers, and leaves out Quotations, Customers and the quotation setup tabs."}{" "}
            Nothing is deleted, and the pages still open if you have a link to one.
          </p>
          {canEdit && (
            <form action={tabsAction} className="mt-3">
              <input type="hidden" name="on" value={allShown ? "0" : "1"} />
              <button disabled={switching} className={primary} data-testid="ops-tabs-toggle">{allShown ? "Go back to the tailored menus" : "Show every tab anyway"}</button>
            </form>
          )}
        </section>
      )}

      {kind && other && (
        <section className={card} data-testid="ops-other" data-other={other}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{info[other].title}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${openId ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`} data-testid="ops-other-status">{openId ? "Set up" : "Not added"}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{info[other].tagline}</p>
          {openId ? (
            <form action={openWorkspace} className="mt-4">
              <input type="hidden" name="organizationId" value={openId} />
              <button className={primary} data-testid="ops-open-other">Open {kindLabel(other)}</button>
            </form>
          ) : (
            canEdit && (
              <>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                  It starts <strong>empty and separate</strong>: its own customers, suppliers, products, orders, stock, payments, mailboxes and connections. Your owners and admins can open both. Everyone else is added to the operation they work in from Team &amp; access.
                </p>
                <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="ops-cost">
                  {cost.planNamed
                    ? `Running both costs ${cost.percent}% more. Your plan goes from ${cost.oneText} to ${cost.bothText} (${cost.moreText}), starting with your next charge.`
                    : `Running both costs ${cost.percent}% more than running one.`}
                  {!cost.billingLive && " Billing is not switched on yet, so nothing is charged now."}
                </p>
                <form action={addAction} className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="kind" value={other} />
                  <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                    <input type="checkbox" name="confirmCost" value="yes" className="mt-1" data-testid="ops-confirm-cost" />
                    <span>I understand the price goes up when I add this operation.</span>
                  </label>
                  <div>
                    <button disabled={adding} className={primary} data-testid={`ops-add-${other}`}>Add the {kindLabel(other)} operation</button>
                  </div>
                </form>
              </>
            )
          )}
        </section>
      )}

      {msg && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300" data-testid="ops-message">{msg}</p>}
      {err && <p role="alert" className="text-sm text-red-700 dark:text-red-300" data-testid="ops-error">{err}</p>}

      <section className={card} data-testid="ops-explainer">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">How it all fits together</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Each operation is its own workspace with every department inside it. When you sign in with two operations, you choose which one to open, or look at the overall status of both. You can switch from the menu at the top at any time.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-800 dark:text-slate-200">
          <li><strong>Wholesale:</strong> you send an individual a quotation (with a free label if you offer one), Receiving checks the package, Accounts pays, it goes into Inventory, and you sell it on to distributors.</li>
          <li><strong>Distribution:</strong> a wholesaler sends you an invoice, you send back a purchase order (no quotation needed), Receiving checks it, Accounts pays, it goes into Inventory, and you sell to pharmacies and other retail outlets.</li>
          <li><strong>Shared by the company:</strong> your legal business details, your plan and bill, and who can sign in. Everything else is kept apart.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Stuck or unsure? <Link href="/dashboard/support" className="text-emerald-800 underline dark:text-emerald-300">Send us a message</Link> and we will help you set it up.
        </p>
      </section>
    </div>
  );
}
