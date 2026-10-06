"use client";

import { useState } from "react";
import { PhotoSlot } from "../receiving/intake/[id]/intake-parts";
import type { PackagePhoto } from "@/lib/receiving-queries";

/** Where the payment receipt (a screenshot from the payables system, or a PDF) is attached to an order. */
export function ReceiptSlot({ packageId, photos, canChange, storageOk }: { packageId: string; photos: PackagePhoto[]; canChange: boolean; storageOk: boolean }) {
  const [error, setError] = useState("");
  return (
    <div data-testid="receipt-slot">
      <PhotoSlot packageId={packageId} kind="PAYMENT_CONFIRMATION" photos={photos} editable={canChange} canAdd={canChange} storageOk={storageOk} onError={setError} />
      {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
    </div>
  );
}
