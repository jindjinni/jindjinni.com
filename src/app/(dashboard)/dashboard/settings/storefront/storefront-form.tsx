"use client";

import { useActionState, useState } from "react";
import { saveStorefrontAction } from "@/app/actions/storefront";

type Initial = { handle: string; displayName: string; welcomeText: string; sellOpen: boolean; buyOpen: boolean; hidden: boolean };

export function StorefrontForm({ initial, base, suggestion }: { initial: Initial; base: string; suggestion: string }) {
  const [state, action, pending] = useActionState(saveStorefrontAction, undefined);
  const [handle, setHandle] = useState(initial.handle || suggestion);
  const field = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return (
    <form action={action} className="mt-6 flex max-w-xl flex-col gap-5" data-testid="sf-settings-form">
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Name visitors see
        <input name="displayName" required maxLength={80} defaultValue={initial.displayName} className={field} data-testid="sfs-name" />
      </label>
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Web address
        <input name="handle" required maxLength={40} value={handle} onChange={(e) => setHandle(e.target.value)} className={field} data-testid="sfs-handle" />
        <span className="mt-1 block break-all text-xs font-normal text-slate-500">Your page: <span className="font-mono" data-testid="sfs-preview">{base}/s/{handle || "your-name"}</span></span>
      </label>
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Welcome words <span className="font-normal text-slate-400">(optional)</span>
        <textarea name="welcomeText" rows={3} maxLength={600} defaultValue={initial.welcomeText} className={field} data-testid="sfs-welcome" />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="sellOpen" defaultChecked={initial.sellOpen} className="mt-1" data-testid="sfs-sell" />
        <span><span className="font-medium">Open the &ldquo;Sell to us&rdquo; page.</span><br /><span className="text-slate-500">Sellers can send you a list of what they have. It lands in Purchasing &rarr; Website requests.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="buyOpen" defaultChecked={initial.buyOpen} className="mt-1" data-testid="sfs-buy" />
        <span><span className="font-medium">Let pharmacies apply for an account.</span><br /><span className="text-slate-500">A pharmacy sends its license details; your team approves it in Sales &rarr; Web accounts. Only approved pharmacies can sign in.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="hidden" defaultChecked={initial.hidden} className="mt-1" data-testid="sfs-hidden" />
        <span><span className="font-medium">Hide my whole page for now.</span><br /><span className="text-slate-500">Visitors see &ldquo;not found&rdquo;. Nothing is deleted; untick to bring it back.</span></span>
      </label>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="sfs-error">{state.error}</p>}
      {state?.saved && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status" data-testid="sfs-saved">Saved.</p>}
      <div><button disabled={pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" data-testid="sfs-save">{pending ? "Saving..." : "Save"}</button></div>
    </form>
  );
}
