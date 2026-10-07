"use client";

import { useActionState, useState } from "react";
import { connectAiAction, disconnectAiAction, recheckAiAction, type AiActionState } from "@/app/actions/ai-connector";

const card = "rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const primaryBtn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const linkBtn = "text-sm font-medium text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-400";
const dangerBtn = "text-sm font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400";

function Feedback({ state }: { state: AiActionState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
    </>
  );
}

/** The company's own Claude key: status, replace, check again, disconnect. */
export function AiConnector(props: { source: "company" | "platform" | "none"; status: "ACTIVE" | "NEEDS_ATTENTION" | "NONE"; keyHint: string | null; lastError: string | null; companyName: string }) {
  const [connectState, connect, connecting] = useActionState(connectAiAction, undefined);
  const [checkState, check, checking] = useActionState(recheckAiAction, undefined);
  const [discState, disconnect, disconnecting] = useActionState(disconnectAiAction, undefined);
  const [confirmOff, setConfirmOff] = useState(false);
  const own = props.source === "company";

  return (
    <section className={card} data-testid="ai-connector">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Claude (AI)</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Reads lot and serial numbers from label photos in Receiving, and checks and summarises the industry news on Home. Usage is billed to <strong>your</strong> Anthropic account.
      </p>
      <div className="mt-3 text-sm" data-testid="ai-state">
        {props.source === "none" && <p className="text-amber-800 dark:text-amber-300">Not connected. These AI features are off for {props.companyName}; the news is still sorted by keywords.</p>}
        {props.source === "platform" && <p className="text-slate-700 dark:text-slate-300">Using the platform&apos;s own Claude account. You can connect your own below at any time.</p>}
        {own && props.status === "ACTIVE" && (
          <p className="text-slate-700 dark:text-slate-300">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Connected</span> · key ending <span className="font-mono">…{props.keyHint}</span>
          </p>
        )}
        {own && props.status === "NEEDS_ATTENTION" && (
          <div className="text-red-700 dark:text-red-400">
            <p className="font-medium">Needs attention. The AI features are paused until this is fixed.</p>
            {props.lastError && <p className="mt-0.5">{props.lastError}</p>}
          </div>
        )}
      </div>
      {own && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <form action={check}>
            <button className={linkBtn} disabled={checking}>{checking ? "Checking..." : "Check again"}</button>
          </form>
          {!confirmOff ? (
            <button type="button" className={dangerBtn} onClick={() => setConfirmOff(true)}>Disconnect</button>
          ) : (
            <form action={disconnect} className="flex items-center gap-3">
              <span className="text-sm text-slate-700 dark:text-slate-300">The AI features stop until you connect again. Disconnect?</span>
              <button className={dangerBtn} disabled={disconnecting}>Yes, disconnect</button>
              <button type="button" className={linkBtn} onClick={() => setConfirmOff(false)}>Keep it</button>
            </form>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-1">
        <Feedback state={checkState} />
        <Feedback state={discState} />
      </div>
      <form action={connect} className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-key" className="text-xs font-medium text-slate-600 dark:text-slate-400">{own ? "Replace your Claude key" : "Claude API key"}</label>
          <input id="ai-key" name="key" type="password" required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="sk-ant-…" className={input} />
        </div>
        <div>
          <button className={primaryBtn} disabled={connecting}>{connecting ? "Checking with Anthropic..." : own ? "Replace key" : "Connect Claude"}</button>
        </div>
        <Feedback state={connectState} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Create a key at console.anthropic.com under <strong>API keys</strong> (add a payment method there, because Anthropic bills you for use). We check it first, store it encrypted, only ever show the last 4 characters, and use it only for {props.companyName}.
        </p>
      </form>
    </section>
  );
}
