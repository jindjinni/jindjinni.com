"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startOtherShipmentAction } from "@/app/actions/shipping-dept";
import { field, primaryBtn } from "@/components/sales-ui";

export type Option = { id: string; label: string; kind: string; ready: boolean };

/** Start a return (or any shipment with no order): pick the saved address, say why, and open the shipment to make the label. */
export function NewShipmentForm({ options, initial, kinds }: { options: Option[]; initial: string; kinds: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [contact, setContact] = useState(initial);
  const [kind, setKind] = useState("RETURN");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const shown = options.filter((o) => !filter.trim() || o.label.toLowerCase().includes(filter.trim().toLowerCase()) || o.id === contact);
  return (
    <div className="max-w-xl space-y-4" data-testid="new-shipment-form">
      <div>
        <label htmlFor="ns-kind" className="text-xs font-medium text-slate-700 dark:text-slate-300">What is going out?</label>
        <select id="ns-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`} data-testid="ns-kind">
          <option value="RETURN">A return</option>
          <option value="OTHER">Something else (no order)</option>
        </select>
      </div>
      <div>
        <label htmlFor="ns-filter" className="text-xs font-medium text-slate-700 dark:text-slate-300">Ship to (search your saved addresses)</label>
        <input id="ns-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type part of a name or city" className={`${field} mt-1`} data-testid="ns-filter" />
        <select id="ns-contact" aria-label="Saved address" value={contact} onChange={(e) => setContact(e.target.value)} size={Math.min(8, Math.max(3, shown.length + 1))} className={`${field} mt-2`} data-testid="ns-contact">
          <option value="">Choose an address…</option>
          {shown.map((o) => <option key={o.id} value={o.id}>{o.label} ({kinds[o.kind] ?? o.kind}){o.ready ? "" : " - address incomplete"}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ns-reason" className="text-xs font-medium text-slate-700 dark:text-slate-300">Why? (optional, shown on the shipment)</label>
        <input id="ns-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="For example: damaged items sent back" className={`${field} mt-1`} data-testid="ns-reason" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !contact}
          className={primaryBtn}
          data-testid="ns-go"
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await startOtherShipmentAction(contact, kind, reason);
              if (!r.ok) return setErr(r.error);
              router.push(`/dashboard/shipping/shipments/${r.id}`);
            })
          }
        >
          {pending ? "Starting…" : "Start shipment"}
        </button>
        {err && <span role="alert" className="text-sm text-red-700 dark:text-red-300">{err}</span>}
      </div>
    </div>
  );
}
