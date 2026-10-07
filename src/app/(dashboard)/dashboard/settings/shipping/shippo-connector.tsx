"use client";

import { useActionState, useState } from "react";
import {
  connectShippoAction,
  disconnectShippoAction,
  enableTrackingAction,
  recheckShippoAction,
  type ShippingActionState,
} from "@/app/actions/shipping";

const card = "rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const primaryBtn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const linkBtn = "text-sm font-medium text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-400";
const dangerBtn = "text-sm font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400";

function Feedback({ state }: { state: ShippingActionState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
      {state.warning && <p className="text-sm text-amber-700 dark:text-amber-400">{state.warning}</p>}
    </>
  );
}

export function ShippoConnector(props: {
  source: "company" | "platform" | "none";
  status: "ACTIVE" | "NEEDS_ATTENTION" | "NONE";
  keyHint: string | null;
  isTest: boolean;
  carriers: string;
  lastError: string | null;
  webhookOn: boolean;
  connectedAt: string | null;
  companyName: string;
}) {
  const [connectState, connect, connecting] = useActionState(connectShippoAction, undefined);
  const [checkState, check, checking] = useActionState(recheckShippoAction, undefined);
  const [trackState, track, tracking] = useActionState(enableTrackingAction, undefined);
  const [discState, disconnect, disconnecting] = useActionState(disconnectShippoAction, undefined);
  const [confirmOff, setConfirmOff] = useState(false);
  const own = props.source === "company";
  const connectedOn = own && props.status === "ACTIVE";

  return (
    <>
      <section className={card} data-testid="shippo-status">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Your Shippo account</h3>
        {props.source === "none" && (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300" data-testid="shippo-state">
            Not connected. {props.companyName} can&apos;t buy labels yet. Paste your Shippo token below to start.
          </p>
        )}
        {props.source === "platform" && (
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300" data-testid="shippo-state">
            Using the platform&apos;s own Shippo account. You can connect a different Shippo account below at any time.
          </p>
        )}
        {own && props.status === "NEEDS_ATTENTION" && (
          <div className="mt-2 text-sm text-red-700 dark:text-red-400" data-testid="shippo-state">
            <p className="font-medium">Needs attention. Labels are paused until this is fixed.</p>
            {props.lastError && <p className="mt-0.5">{props.lastError}</p>}
            <p className="mt-0.5 text-slate-600 dark:text-slate-400">Paste a current token below.</p>
          </div>
        )}
        {connectedOn && (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2" data-testid="shippo-state">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Status</dt>
              <dd className="mt-0.5 font-medium text-emerald-700 dark:text-emerald-400">Connected</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Mode</dt>
              <dd className="mt-0.5 text-slate-900 dark:text-slate-50">
                {props.isTest ? "Test: practice labels, nothing is charged or shipped" : "Live: real labels, charged to your Shippo account"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Token</dt>
              <dd className="mt-0.5 font-mono text-slate-900 dark:text-slate-50">…{props.keyHint}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Carriers switched on</dt>
              <dd className="mt-0.5 text-slate-900 dark:text-slate-50">{props.carriers || "None found in your Shippo account"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Live tracking</dt>
              <dd className="mt-0.5 text-slate-900 dark:text-slate-50">{props.webhookOn ? "On: packages update by themselves" : "Off: updates when an order is opened and nightly"}</dd>
            </div>
          </dl>
        )}
        {own && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <form action={check}>
              <button className={linkBtn} disabled={checking}>{checking ? "Checking..." : "Check again"}</button>
            </form>
            {connectedOn && !props.webhookOn && (
              <form action={track}>
                <button className={linkBtn} disabled={tracking}>{tracking ? "Turning on..." : "Turn on live tracking"}</button>
              </form>
            )}
            {!confirmOff ? (
              <button type="button" className={dangerBtn} onClick={() => setConfirmOff(true)}>Disconnect</button>
            ) : (
              <form action={disconnect} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 dark:text-slate-300">Labels stop until you connect again. Disconnect?</span>
                <button className={dangerBtn} disabled={disconnecting}>Yes, disconnect</button>
                <button type="button" className={linkBtn} onClick={() => setConfirmOff(false)}>Keep it</button>
              </form>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-col gap-1">
          <Feedback state={checkState} />
          <Feedback state={trackState} />
          <Feedback state={discState} />
        </div>
      </section>

      <section className={card}>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{own ? "Replace your token" : "Connect Shippo"}</h3>
        <form action={connect} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="shippo-token" className="text-xs font-medium text-slate-600 dark:text-slate-400">Shippo API token</label>
            <input
              id="shippo-token"
              name="token"
              type="password"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="shippo_live_…"
              className={input}
            />
          </div>
          <div>
            <button className={primaryBtn} disabled={connecting}>{connecting ? "Checking with Shippo..." : own ? "Replace token" : "Connect Shippo"}</button>
          </div>
          <Feedback state={connectState} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            We check the token with Shippo first. It is stored encrypted, only the last 4 characters are ever shown again, and it is used only for {props.companyName}.
          </p>
        </form>
      </section>

      <details className={card}>
        <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-50">How to get your token</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
          <li>Sign in at goshippo.com (or create your free Shippo account).</li>
          <li>Open <strong>Settings → API</strong> and copy your <strong>Live</strong> token. Use the <strong>Test</strong> token first if you only want to practice.</li>
          <li>In Shippo, open <strong>Settings → Carriers</strong> and switch on <strong>UPS</strong> and <strong>USPS</strong>. Add your payment method there too, because Shippo bills you for labels.</li>
          <li>Paste the token above and press <strong>Connect Shippo</strong>.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Once connected, your Purchasing team can generate UPS Ground or USPS Priority Mail labels from any quotation, and packages are followed automatically.
        </p>
      </details>
    </>
  );
}
