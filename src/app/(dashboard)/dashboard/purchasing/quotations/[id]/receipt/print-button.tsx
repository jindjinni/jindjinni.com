"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function PrintButton() {
  const params = useSearchParams();

  // Quotation Summary's "Download" action links here with ?autoprint=1 so
  // the browser's print dialog (Save as PDF) pops open immediately instead
  // of making the user find and click this button themselves.
  useEffect(() => {
    if (params.get("autoprint") === "1") {
      const t = setTimeout(() => window.print(), 150);
      return () => clearTimeout(t);
    }
  }, [params]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
    >
      Print / Save as PDF
    </button>
  );
}
