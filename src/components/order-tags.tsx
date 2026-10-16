"use client";

// The two small tags on an order (feature `order-tags`): "Email sent" (automatic) and "Contacted on Facebook" (a person ticks it).

import { useState, useTransition } from "react";
import { setFacebookContacted } from "@/app/actions/order-tags";
import { LocalTime } from "@/components/local-time";
import type { OrderTagInfo } from "@/lib/customer-service-queries";

export function OrderTags({ packageId, tags, canSet }: { packageId: string; tags: OrderTagInfo; canSet: boolean }) {
  const [t, setT] = useState(tags);
  // The page re-reads the order after an email goes out; take the new values when they arrive.
  const sig = `${tags.emailSentAt}|${tags.facebookAt}|${tags.facebookBy}`;
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setT(tags);
  }
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    setError("");
    start(async () => {
      const r = await setFacebookContacted(packageId, !t.facebookAt);
      if (r.error) return setError(r.error);
      if (r.tags) setT(r.tags);
    });
  }

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Order tags" data-order-tags>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</span>
        {t.emailSentAt ? (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-900 dark:bg-green-900/40 dark:text-green-100" data-tag="email-sent">
            Email sent · <LocalTime value={t.emailSentAt} />
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-tag="email-not-sent">Email not sent</span>
        )}
        {t.facebookAt ? (
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" data-tag="facebook">
            Contacted on Facebook{t.facebookBy ? ` · ${t.facebookBy}` : ""} · <LocalTime value={t.facebookAt} />
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-tag="facebook-none">Not contacted on Facebook</span>
        )}
        {canSet && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            data-testid="fb-toggle"
          >
            {pending ? "Saving…" : t.facebookAt ? "Undo: not contacted on Facebook" : "I contacted them on Facebook"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">Tick the Facebook tag after you message the customer through Facebook Business Manager, so nobody does it twice.</p>
      {error && <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>}
    </section>
  );
}
