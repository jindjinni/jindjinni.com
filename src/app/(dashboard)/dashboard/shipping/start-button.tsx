"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startShipmentAction } from "@/app/actions/shipping-dept";
import { primaryBtn } from "@/components/sales-ui";

/** Starts a shipment for one order and opens it. */
export function StartButton({ documentId, label = "Start shipment" }: { documentId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={primaryBtn}
        data-testid="start-shipment"
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await startShipmentAction(documentId);
            if (!r.ok) return setErr(r.error);
            router.push(`/dashboard/shipping/shipments/${r.id}`);
          })
        }
      >
        {pending ? "Starting…" : label}
      </button>
      {err && <span role="alert" className="text-xs text-red-700 dark:text-red-300">{err}</span>}
    </span>
  );
}
