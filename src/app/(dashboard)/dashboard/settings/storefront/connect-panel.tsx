"use client";

import { useActionState, useState } from "react";
import { makeKeyAction, revokeKeyAction, saveOriginsAction } from "@/app/actions/storefront";

export type KeyView = { id: string; kind: "secret" | "public"; label: string; hint: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

const field = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const code = "overflow-x-auto rounded-md bg-slate-100 p-3 text-xs leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-100";
const day = (s: string | null) => (s ? s.slice(0, 10) : "never");

export function ConnectPanel({ keys, origins, apiBase, hasStorefront }: { keys: KeyView[]; origins: string; apiBase: string; hasStorefront: boolean }) {
  const [made, makeAction, making] = useActionState(makeKeyAction, undefined);
  const [saved, saveAction, saving] = useActionState(saveOriginsAction, undefined);
  const [copied, setCopied] = useState(false);
  const working = keys.filter((k) => !k.revokedAt);
  const off = keys.filter((k) => k.revokedAt);
  const api = `${apiBase}/api/storefront/v1`;

  return (
    <section className="mt-12 max-w-3xl border-t border-slate-200 pt-8 dark:border-slate-800" data-testid="sf-connect">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Connect your own website</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Already have a website? Connect it here instead of using the page above. When a seller or a pharmacy fills in a form on <em>your</em> site, it arrives in your records exactly like one sent from the storefront page:
        sellers in Purchasing &rarr; Website requests (ready to become a quotation), pharmacies in Sales &rarr; Web accounts. Your site keeps its own look; we only receive the data.
      </p>

      {!hasStorefront && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Save your storefront settings above first (name and web address). Then you can make keys.</p>}

      <h3 className="mt-8 text-base font-semibold text-slate-900 dark:text-slate-50">1. Keys</h3>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        A <strong>secret key</strong> goes on your website&rsquo;s server and can send requests and check their status. A <strong>public key</strong> can sit in a web page&rsquo;s code; it can only send a new request or application, and only from the website addresses you list in step 2.
        Treat a secret key like a password. A key is shown once, when you make it.
      </p>

      {made?.key && (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950" role="status" data-testid="ck-newkey-box">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Your new {made.kind} key{made.label ? ` "${made.label}"` : ""}. Copy it now; we can&rsquo;t show it again.</p>
          <p className="mt-2 break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100" data-testid="ck-newkey">{made.key}</p>
          <button type="button" className="mt-2 rounded-md border border-emerald-600 px-3 py-1 text-sm text-emerald-800 dark:text-emerald-200" onClick={() => { navigator.clipboard?.writeText(made.key ?? "").then(() => setCopied(true)).catch(() => {}); }} data-testid="ck-copy">{copied ? "Copied" : "Copy key"}</button>
        </div>
      )}

      <form action={makeAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="ck-form">
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100 sm:w-44">Kind
          <select id="ck-kind" name="kind" defaultValue="secret" className={field} data-testid="ck-kind">
            <option value="secret">Secret (your server)</option>
            <option value="public">Public (web page)</option>
          </select>
        </label>
        <label className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">Name
          <input id="ck-label" name="label" required maxLength={60} placeholder="For example: Main website" className={field} data-testid="ck-label" />
        </label>
        <button disabled={making || !hasStorefront} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" data-testid="ck-make">{making ? "Making..." : "Make a key"}</button>
      </form>
      {made?.error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="ck-error">{made.error}</p>}

      <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800" data-testid="ck-list">
        {working.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No working keys yet.</li>}
        {working.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm" data-testid="ck-row">
            <span><span className="font-medium text-slate-900 dark:text-slate-50">{k.label}</span> <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{k.kind}</span>
              <br /><span className="font-mono text-xs text-slate-500">{k.hint}</span> <span className="text-xs text-slate-500">&middot; made {day(k.createdAt)} &middot; last used {day(k.lastUsedAt)}</span></span>
            <form action={revokeKeyAction.bind(null, k.id)}><button className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300" data-testid="ck-revoke">Turn off</button></form>
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <details className="mt-3 text-sm text-slate-500" data-testid="ck-off">
          <summary className="cursor-pointer">{off.length} key{off.length === 1 ? "" : "s"} turned off</summary>
          <ul className="mt-2 space-y-1">{off.map((k) => <li key={k.id}>{k.label} ({k.kind}) <span className="font-mono text-xs">{k.hint}</span> &middot; off since {day(k.revokedAt)}</li>)}</ul>
        </details>
      )}

      <h3 className="mt-10 text-base font-semibold text-slate-900 dark:text-slate-50">2. Website addresses for public keys</h3>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">List each address your web pages are on, one per line, like <span className="font-mono">https://www.example.com</span> (no page after it). A public key is refused from anywhere else. Secret keys don&rsquo;t need this.</p>
      <form action={saveAction} className="mt-3 max-w-xl" data-testid="ck-origins-form">
        <textarea id="ck-origins" name="origins" rows={3} defaultValue={origins} className={`${field} font-mono`} placeholder="https://www.example.com" data-testid="ck-origins" />
        <button disabled={saving || !hasStorefront} className="mt-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" data-testid="ck-origins-save">{saving ? "Saving..." : "Save addresses"}</button>
      </form>
      {saved?.error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="ck-origins-error">{saved.error}</p>}
      {saved?.saved && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status" data-testid="ck-origins-saved">Saved.</p>}

      <h3 className="mt-10 text-base font-semibold text-slate-900 dark:text-slate-50">3. How your website talks to us</h3>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">Give this page to whoever builds or maintains your website. Everything is JSON, and every call sends the key as <span className="font-mono">Authorization: Bearer YOUR_KEY</span>.</p>
      <div className="mt-3 space-y-4 text-sm text-slate-700 dark:text-slate-200" data-testid="ck-guide">
        <details open>
          <summary className="cursor-pointer font-medium">Check the connection</summary>
          <pre className={`${code} mt-2`}>{`curl ${api} \\\n  -H "Authorization: Bearer YOUR_SECRET_KEY"`}</pre>
          <p className="mt-1 text-xs text-slate-500">Answers with your company name and whether sell requests and pharmacy applications are open.</p>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">Send a seller&rsquo;s request (wholesale)</summary>
          <pre className={`${code} mt-2`}>{`POST ${api}/sell-requests

{
  "businessName": "Main St Pharmacy",
  "contactName": "Pat Lee",
  "email": "pat@example.com",
  "phone": "713-555-0100",            (optional)
  "street1": "1 Main St", "street2": "",
  "city": "Houston", "state": "TX", "zip": "77002",
  "items": [
    { "name": "Dexcom G6 Sensor 3-pack", "quantity": 4,
      "ndc": "08627-0016-01", "expiration": "2027-03" },
    { "name": "Omnipod 5 Pods", "quantity": 2 }
  ],
  "itemsText": "Anything else, in words",   (optional)
  "donation": false,                        (optional)
  "notes": ""                                (optional)
}`}</pre>
          <p className="mt-1 text-xs text-slate-500">Send <span className="font-mono">items</span> (a list), <span className="font-mono">itemsText</span> (words), or both. Answer: <span className="font-mono">201 {`{ "reference": "WEB-7KQ2MX", "status": "received" }`}</span>. Show the reference to the seller. The request appears in Purchasing &rarr; Website requests, where your team makes the quotation. Prices, status and company can&rsquo;t be set by the website.</p>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">Show a seller where their request stands, and their free label (secret key)</summary>
          <pre className={`${code} mt-2`}>{`GET ${api}/sell-requests/WEB-7KQ2MX

{ "reference": "WEB-7KQ2MX", "status": "quotation_made",
  "createdAt": "...", "updatedAt": "...",
  "label": { "carrier": "UPS_GROUND", "trackingNumber": "1Z...",
             "trackingUrl": "...", "labelUrl": "..." } }`}</pre>
          <p className="mt-1 text-xs text-slate-500"><span className="font-mono">status</span> is <span className="font-mono">received</span>, <span className="font-mono">quotation_made</span> or <span className="font-mono">declined</span>. <span className="font-mono">label</span> is empty until your team makes the free shipping label on the quotation; your site can then show the seller the label link and tracking number. No prices or staff notes are ever returned.</p>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">Send a pharmacy&rsquo;s application (distribution)</summary>
          <pre className={`${code} mt-2`}>{`POST ${api}/pharmacy-applications

{
  "businessName": "Main St Pharmacy", "contactName": "Pat Lee",
  "email": "pat@example.com", "phone": "",
  "street1": "1 Main St", "street2": "",
  "city": "Houston", "state": "TX", "zip": "77002",
  "npi": "1234567893", "deaNumber": "AB1234563",
  "licenseNumber": "PH 12345", "licenseState": "TX", "notes": ""
}`}</pre>
          <p className="mt-1 text-xs text-slate-500">Answer: <span className="font-mono">202 {`{ "received": true }`}</span>. Your team approves or declines it in Sales &rarr; Web accounts. Pharmacies are asked for NPI, DEA number and state license only; an NCPDP number is never part of an application.</p>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">From a web page (public key)</summary>
          <pre className={`${code} mt-2`}>{`const res = await fetch("${api}/sell-requests", {
  method: "POST",
  headers: { "Authorization": "Bearer YOUR_PUBLIC_KEY", "Content-Type": "application/json" },
  body: JSON.stringify({ /* the fields above */ })
});
const data = await res.json();   // { reference } or { error: { code, message } }`}</pre>
          <p className="mt-1 text-xs text-slate-500">The page&rsquo;s address must be listed in step 2. Public keys are limited to a few tries an hour per visitor. A secret key is refused if it is used from a browser.</p>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">If something goes wrong</summary>
          <p className="mt-2 text-xs text-slate-500">Errors look like <span className="font-mono">{`{ "error": { "code": "invalid_request", "message": "..." } }`}</span>; the message says how to fix it. Codes: <span className="font-mono">missing_key</span> and <span className="font-mono">invalid_key</span> (401), <span className="font-mono">secret_key_in_browser</span>, <span className="font-mono">origin_not_allowed</span>, <span className="font-mono">not_allowed_for_key</span> (403), <span className="font-mono">not_found</span> and <span className="font-mono">storefront_unavailable</span> (404), <span className="font-mono">not_open</span> (409, switch the page on above), <span className="font-mono">invalid_request</span> (422), <span className="font-mono">rate_limited</span> and <span className="font-mono">daily_limit</span> (429).</p>
        </details>
      </div>
    </section>
  );
}
