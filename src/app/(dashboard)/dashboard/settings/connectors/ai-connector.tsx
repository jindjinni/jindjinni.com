"use client";

import { useActionState, useState } from "react";
import { connectAiAction, disconnectAiAction, recheckAiAction, type AiActionState } from "@/app/actions/ai-connector";
import { PROVIDERS, PROVIDER_CONSOLE, PROVIDER_LABEL, PROVIDER_MAKER, type AiProvider } from "@/lib/ai-provider";

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
export function AiConnector(props: { source: "company" | "platform" | "none"; provider: AiProvider; status: "ACTIVE" | "NEEDS_ATTENTION" | "NONE"; keyHint: string | null; lastError: string | null; companyName: string }) {
  const [connectState, connect, connecting] = useActionState(connectAiAction, undefined);
  const [checkState, check, checking] = useActionState(recheckAiAction, undefined);
  const [discState, disconnect, disconnecting] = useActionState(disconnectAiAction, undefined);
  const [confirmOff, setConfirmOff] = useState(false);
  const own = props.source === "company";
  const [choice, setChoice] = useState<AiProvider>(props.provider);

  return (
    <section className={card} data-testid="ai-connector">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">AI assistant (Claude or ChatGPT)</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Reads lot and serial numbers from label photos in Receiving, and gives Jin, the built-in helper, a much higher daily limit. Connect the AI you already pay for: usage is billed to <strong>your</strong> account with that company. Jin works for everyone with a fair daily limit, and the industry news on Home is a built-in courtesy, so neither needs this.
      </p>
      <div className="mt-3 text-sm" data-testid="ai-state">
        {props.source === "none" && <p className="text-amber-800 dark:text-amber-300">Not connected. Label-photo reading is off for {props.companyName}. Type or scan the numbers instead; the Home news is not affected.</p>}
        {props.source === "platform" && <p className="text-slate-700 dark:text-slate-300">Using the platform&apos;s own AI account. You can connect your own below at any time.</p>}
        {own && props.status === "ACTIVE" && (
          <p className="text-slate-700 dark:text-slate-300">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Connected</span> · {PROVIDER_LABEL[props.provider]} · key ending <span className="font-mono">…{props.keyHint}</span>
          </p>
        )}
        {own && props.status === "NEEDS_ATTENTION" && (
          <div className="text-red-700 dark:text-red-400">
            <p className="font-medium">Needs attention. Label-photo reading is paused until this is fixed.</p>
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
              <span className="text-sm text-slate-700 dark:text-slate-300">Label-photo reading stops and Jin goes back to the standard daily limit until you connect again. Disconnect?</span>
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
        <fieldset className="flex flex-wrap gap-4" data-testid="ai-provider">
          <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Which AI do you use?</legend>
          {PROVIDERS.map((p) => (
            <label key={p} htmlFor={`ai-provider-${p}`} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input id={`ai-provider-${p}`} type="radio" name="provider" value={p} checked={choice === p} onChange={() => setChoice(p)} />
              {PROVIDER_LABEL[p]} <span className="text-xs text-slate-500">({PROVIDER_MAKER[p]})</span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-key" className="text-xs font-medium text-slate-600 dark:text-slate-400">{own ? `Replace your ${PROVIDER_LABEL[choice]} key` : `${PROVIDER_LABEL[choice]} API key`}</label>
          <input id="ai-key" name="key" type="password" required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={choice === "anthropic" ? "sk-ant-…" : "sk-…"} className={input} />
        </div>
        <div>
          <button className={primaryBtn} disabled={connecting}>{connecting ? `Checking with ${PROVIDER_MAKER[choice]}...` : own ? "Replace key" : `Connect ${PROVIDER_LABEL[choice]}`}</button>
        </div>
        <Feedback state={connectState} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Create a key at {PROVIDER_CONSOLE[choice]} under <strong>API keys</strong> (add a payment method there, because {PROVIDER_MAKER[choice]} bills you for use; a chat subscription is not the same as an API key). We check it first, store it encrypted, only ever show the last 4 characters, and use it only for {props.companyName}.
        </p>
      </form>
    </section>
  );
}
