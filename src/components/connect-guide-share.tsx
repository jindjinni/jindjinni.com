"use client";

import { useState } from "react";

/** "Tell your team": a ready message the owner can copy and paste into chat or email. */
export function ShareBox({ id, text }: { id: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900 dark:text-slate-50">Tell your team (copy and paste)</label>
      <textarea
        id={id}
        readOnly
        rows={3}
        value={text}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
      />
      <button
        type="button"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* the text can still be selected by hand */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
