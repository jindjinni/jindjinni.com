"use client";

import { useActionState } from "react";
import { publishMasterCatalog, type CatalogTemplateActionState } from "@/app/actions/catalog-template";

export function PublishMasterPanel({ latest }: { latest: { version: number; publishedAt: string } | null }) {
  const [state, action, pending] = useActionState<CatalogTemplateActionState, FormData>(publishMasterCatalog, undefined);

  return (
    <form action={action} className="mt-4 flex max-w-2xl flex-col items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Platform owner: default catalog for new companies</p>
      <p className="text-xs text-amber-800 dark:text-amber-300">
        {latest ? `Latest published: version ${latest.version} (${latest.publishedAt.slice(0, 10)}). ` : "Nothing published yet &mdash; new companies get the built-in starter catalog. "}
        Publishing copies this company&rsquo;s products, brands, NDCs, conditions, month ranges, starter recalls and receipt wording as the default every new company starts with. Prices, customers, quotations and recall lot lists are never copied.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "Publishing…" : "Publish my catalog as the default"}
      </button>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </form>
  );
}
