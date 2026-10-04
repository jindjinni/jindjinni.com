"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAdjustment } from "@/app/actions/receiving-adjustments";

/** Starts (or opens) the adjustment quotation for a shipment and goes to the editor. */
export function StartAdjustmentButton({ packageId, label = "Create adjustment quotation", className }: { packageId: string; label?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-block">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await startAdjustment(packageId);
            if (r.error || !r.id) setError(r.error ?? "Couldn't start the adjustment.");
            else router.push(`/dashboard/receiving/adjustments/${r.id}`);
          })
        }
        className={className ?? "rounded-lg bg-[#F7B838] px-3 py-2 text-sm font-semibold text-amber-950 hover:brightness-95 disabled:opacity-60"}
      >
        {pending ? "Opening…" : label}
      </button>
      {error && <span role="alert" className="mt-1 block text-xs text-red-700">{error}</span>}
    </span>
  );
}
