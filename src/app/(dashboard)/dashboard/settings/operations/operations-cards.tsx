"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSidesAction, setSideAction } from "@/app/actions/operations";
import type { Side, SideInfo, Sides } from "@/lib/operations-rules";

const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const primary = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";
const ghost = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function OperationsCards(props: {
  sides: Sides;
  confirmed: boolean;
  since: { wholesale: string | null; distribution: string | null };
  info: SideInfo[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const change = (side: Side, on: boolean) =>
    start(async () => {
      setMsg(null);
      const r = await setSideAction(side, on);
      setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "Saved." });
      router.refresh();
    });
  const confirm = () =>
    start(async () => {
      setMsg(null);
      const r = await confirmSidesAction();
      setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "Saved." });
      router.refresh();
    });

  return (
    <div className="mt-5 space-y-5">
      {!props.confirmed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="ops-confirm">
          <p className="font-semibold">Please confirm how your company runs.</p>
          <p className="mt-1">Check the two cards below, switch on the side you want, then press the button. Nothing you already use is hidden until you do.</p>
          {props.canEdit && <button type="button" onClick={confirm} disabled={pending} className={`${primary} mt-3`} data-testid="ops-confirm-btn">This is right</button>}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {props.info.map((i) => {
          const on = props.sides[i.side];
          return (
            <section key={i.side} className={card} data-testid={`ops-card-${i.side}`} data-active={on ? "yes" : "no"}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">{i.title}</h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}
                  data-testid={`ops-status-${i.side}`}
                >
                  {on ? "Active" : "Not active"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{i.tagline}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Buys from</dt><dd className="text-slate-900 dark:text-slate-100">{i.buysFrom}</dd>
                <dt className="text-slate-500">Sells to</dt><dd className="text-slate-900 dark:text-slate-100">{i.sellsTo}</dd>
                {on && props.since[i.side] && (<><dt className="text-slate-500">Active since</dt><dd className="text-slate-900 dark:text-slate-100">{day(props.since[i.side])}</dd></>)}
              </dl>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">What this side gives you</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {i.turnsOn.map((t) => <li key={t}>{t}</li>)}
              </ul>
              {on && (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Your first steps</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm" data-testid={`ops-steps-${i.side}`}>
                    {i.firstSteps.map((s) => (
                      <li key={s.href}><Link href={s.href} className="text-emerald-800 underline dark:text-emerald-300">{s.text}</Link></li>
                    ))}
                  </ol>
                </>
              )}
              {props.canEdit && (
                <div className="mt-5">
                  {on ? (
                    <button type="button" disabled={pending} onClick={() => { if (confirm_(`Switch the ${i.title} side off? Everything stays saved, it just hides.`)) change(i.side, false); }} className={ghost} data-testid={`ops-off-${i.side}`}>Switch off</button>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => change(i.side, true)} className={primary} data-testid={`ops-on-${i.side}`}>Switch on (free)</button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} role={msg.ok ? "status" : "alert"} data-testid={msg.ok ? "ops-message" : "ops-error"}>{msg.text}</p>
      )}

      <section className={card} data-testid="ops-explainer">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">How it all fits together</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Quotations and Purchase Orders are in Purchasing and in Sales for everyone. A side adds the extra tabs and steps for that kind of business.</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-800 dark:text-slate-200">
          <li><strong>Buying from an individual:</strong> Quotation, then a free label, then Receiving checks the package, then Accounts pays, then it goes into Inventory.</li>
          <li><strong>Buying from a wholesaler:</strong> Purchase Order, then the supplier ships, then Receiving checks it, then Accounts pays, then it goes into Inventory.</li>
          <li><strong>Selling to a distributor:</strong> Quotation, then Invoice, then ship, then get paid.</li>
          <li><strong>Selling to a pharmacy or outlet:</strong> their Purchase Order or your Quotation, then Invoice, then ship, then get paid.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Stuck or unsure? <Link href="/dashboard/support" className="text-emerald-800 underline dark:text-emerald-300">Send us a message</Link> and we will help you set it up.
        </p>
      </section>
    </div>
  );
}

// A tiny wrapper so the switch-off button can ask first without a browser confirm in server code.
function confirm_(text: string): boolean {
  return typeof window === "undefined" ? true : window.confirm(text);
}
