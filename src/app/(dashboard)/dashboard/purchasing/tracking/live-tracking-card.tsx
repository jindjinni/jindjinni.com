"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enableLiveTracking, refreshAllTracking, type RefreshAllState } from "@/app/actions/tracking";
import type { TrackingHealth } from "@/lib/tracking-service";

const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export function LiveTrackingCard({ configured, on, problem, canChange, isAdmin, health }: { configured: boolean; on: boolean; problem: string | null; canChange: boolean; isAdmin: boolean; health: TrackingHealth }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [all, setAll] = useState<RefreshAllState | null>(null);
  const [updating, startUpdate] = useTransition();

  function updateAll() {
    setAll(null);
    startUpdate(async () => {
      setAll(await refreshAllTracking());
      router.refresh();
    });
  }

  function turnOn() {
    setError("");
    startTransition(async () => {
      const res = await enableLiveTracking();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-5 space-y-4">
      <section className={card} data-testid="tracking-health">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Are my orders being tracked?</h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300" data-testid="health-line">
          {health.withNumber} order{health.withNumber === 1 ? " has" : "s have"} a tracking number. {health.followed} {health.followed === 1 ? "is" : "are"} being followed
          {health.notFollowedYet > 0 ? `, ${health.notFollowedYet} not started yet` : ""}. {health.checked} checked with the carrier so far ({health.moving} on the way, {health.delivered} delivered)
          {health.notChecked > 0 ? `, ${health.notChecked} waiting for their first check` : ""}
          {health.problems > 0 ? `, ${health.problems} the carrier couldn't find yet` : ""}.
        </p>
        <p className="mt-1 text-xs text-slate-500" data-testid="health-last">{health.lastChecked ? `Last carrier check: ${health.lastChecked} UTC.` : "No package has been checked with the carrier yet."}</p>
        {configured ? (
          <button type="button" data-testid="refresh-all" disabled={updating} onClick={updateAll} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
            {updating ? "Checking packages…" : "Update all tracking now"}
          </button>
        ) : (
          <p className="mt-2 text-xs text-amber-900 dark:text-amber-200">Connect Shippo (below) and the packages can be checked.</p>
        )}
        {all?.error && <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert" data-testid="refresh-all-error">{all.error}</p>}
        {all?.ok && (
          <p className="mt-2 text-sm text-green-800 dark:text-green-300" data-testid="refresh-all-done">
            Started following {all.started} order{all.started === 1 ? "" : "s"}; checked {all.refreshed} package{all.refreshed === 1 ? "" : "s"}
            {all.failed ? `; ${all.failed} the carrier doesn't know yet` : ""}.{all.remaining ? ` ${all.remaining} more are waiting: press the button again.` : " Everything due is up to date."}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Shippo connection</h2>
        {configured ? (
          <p className="mt-2 text-sm text-green-800 dark:text-green-300" data-testid="shippo-connected">Connected. Labels and tracking use your company&apos;s Shippo account.</p>
        ) : (
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-200" data-testid="shippo-not-connected">
            Shippo isn&apos;t connected yet, so packages can&apos;t be tracked.{" "}
            {isAdmin ? (
              <Link href="/dashboard/purchasing/connectors" className="font-semibold underline">Connect your Shippo account</Link>
            ) : (
              "An owner or admin can connect your Shippo account in Purchasing → Settings → Connectors labels."
            )}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Live updates</h2>
        <p className="mt-1 text-xs text-slate-500">
          With live updates on, Shippo tells us the moment a package moves, so the status is current without anyone pressing anything. Without it, the status still refreshes whenever an order is opened and once a night.
        </p>
        <p className="mt-3 text-sm" data-testid="live-state">
          {!configured ? (
            <span className="text-slate-600 dark:text-slate-300">Connect Shippo first.</span>
          ) : on ? (
            <span className="font-medium text-green-800 dark:text-green-300">On. Shippo sends tracking updates to this app.</span>
          ) : (
            <span className="font-medium text-amber-900 dark:text-amber-200">Off. Updates only arrive when an order is opened and nightly.</span>
          )}
        </p>
        {problem && <p className="mt-1 text-xs text-red-700 dark:text-red-400" data-testid="live-problem">Couldn&apos;t check with Shippo: {problem}</p>}
        {configured && !on && canChange && (
          <button type="button" data-testid="turn-on-live" disabled={pending} onClick={turnOn} className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {pending ? "Turning on…" : "Turn on live tracking"}
          </button>
        )}
        {configured && !on && !canChange && <p className="mt-2 text-xs text-slate-500">An owner or admin turns this on.</p>}
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert" data-testid="live-error">{error}</p>}
      </section>
    </div>
  );
}
