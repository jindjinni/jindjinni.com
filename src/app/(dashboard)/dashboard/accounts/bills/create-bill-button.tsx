"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBillAction } from "@/app/actions/payables";
import { primaryBtn } from "@/components/sales-ui";

/** "Create bill" for a received order that has none. The server checks the order and the person again. */
export function CreateBillButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`${primaryBtn} !px-3 !py-1.5`}
        data-testid="bill-create"
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await createBillAction(purchaseOrderId);
            if (!r.ok) return setErr(r.error);
            router.push(`/dashboard/accounts/bills/${r.id}`);
          })
        }
      >
        {pending ? "Making…" : "Create bill"}
      </button>
      {err && <span role="alert" className="text-xs text-red-700 dark:text-red-300" data-testid="bill-create-error">{err}</span>}
    </span>
  );
}
