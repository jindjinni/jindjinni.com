"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markOrderPaid } from "@/app/actions/accounts";

/** The one button that pays an order out in Accounts. Disabled until a receipt is attached. */
export function MarkPaidButton({ packageId, hasReceipt }: { packageId: string; hasReceipt: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function pay() {
    setError("");
    start(async () => {
      const res = await markOrderPaid(packageId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={pending || !hasReceipt}
        className="rounded-lg bg-[var(--dept-accent,#60a5fa)] px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark as Paid"}
      </button>
      {!hasReceipt && <p className="mt-1.5 text-xs text-slate-500">Attach the payment receipt above to turn this on.</p>}
      {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
    </div>
  );
}
