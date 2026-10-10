"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { createAuditAction } from "@/app/actions/audit";
import { DATE_PRESETS, PRESET_LABEL, REG_SUBTYPES, presetRange, type AuditType } from "@/lib/audit-rules";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";

type Pharmacy = { id: string; name: string; ncpdp: string | null; npi: string | null; email: string | null };

const label = "text-xs font-medium text-slate-700 dark:text-slate-300";

export function NewAuditForm({ type, pharmacies, today }: { type: AuditType; pharmacies: Pharmacy[]; today: string }) {
  const [state, action, pending] = useActionState(createAuditAction, undefined);
  const [find, setFind] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [device, setDevice] = useState("");
  const shown = useMemo(() => {
    const t = find.trim().toLowerCase();
    return t ? pharmacies.filter((p) => p.name.toLowerCase().includes(t) || (p.ncpdp ?? "").includes(t)) : pharmacies;
  }, [find, pharmacies]);
  const chosen = pharmacies.find((p) => p.id === buyerId) ?? null;
  const pbm = type === "PBM";
  const internal = type === "INTERNAL";
  const regulatory = type === "REGULATORY";

  if (pharmacies.length === 0) {
    return (
      <p className={card} data-testid="no-pharmacies">
        There are no pharmacies yet. Add the pharmacy in <Link href="/dashboard/sales/buyers" className="text-emerald-800 underline dark:text-emerald-300">Sales → Buyers</Link> first (with its NCPDP number), then come back.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4" data-testid="new-audit-form">
      <input type="hidden" name="type" value={type} />

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">1. Pharmacy</h2>
        <div>
          <label htmlFor="pharmacy-find" className={label}>Find by name or NCPDP</label>
          <input id="pharmacy-find" value={find} onChange={(e) => setFind(e.target.value)} className={`${field} mt-1`} placeholder="Type to narrow the list" data-testid="pharmacy-find" />
        </div>
        <div>
          <label htmlFor="buyerId" className={label}>Pharmacy</label>
          <select id="buyerId" name="buyerId" value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className={`${field} mt-1`} data-testid="pharmacy-select" required>
            <option value="">Choose the pharmacy…</option>
            {shown.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ncpdp ? ` · NCPDP ${p.ncpdp}` : ""}</option>)}
          </select>
        </div>
        {chosen && (
          <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="pharmacy-info">
            {chosen.ncpdp ? <>NCPDP <strong data-testid="pharmacy-ncpdp">{chosen.ncpdp}</strong> is filled in from the pharmacy&apos;s record.</> : (
              <span className={pbm ? "font-medium text-red-700 dark:text-red-300" : ""} data-testid="pharmacy-no-ncpdp">
                This pharmacy has no NCPDP number yet.{pbm ? " A PBM audit needs it. " : " "}
                <Link href={`/dashboard/sales/buyers/${chosen.id}`} className="underline">Add it to the pharmacy</Link>.
              </span>
            )}
          </p>
        )}
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">2. Dates the {pbm ? "auditor" : internal ? "pharmacy" : "regulator"} asked for</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className={label}>Start date</label>
            <input id="startDate" name="startDate" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} mt-1`} data-testid="start-date" required />
          </div>
          <div>
            <label htmlFor="endDate" className={label}>End date</label>
            <input id="endDate" name="endDate" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} mt-1`} data-testid="end-date" required />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Quick date ranges">
          {DATE_PRESETS.map((p) => (
            <button key={p} type="button" className={ghostBtn} onClick={() => { const r = presetRange(p, today); setStart(r.start); setEnd(r.end); }} data-testid={`preset-${p}`}>
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
      </section>

      {!internal && (
        <section className={`${card} space-y-2`} data-testid="device-question">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">3. {pbm ? "Is this a device audit?" : "Is the regulator asking for medical-device purchase records?"}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">This cannot be skipped. Some audit requests are about prescription drugs and do not need anything from a device distributor.</p>
          {[
            ["YES", "YES — device records are requested"],
            ["NO", "NO — device records are not requested"],
            ["UNCLEAR", "NOT CLEAR — I need to ask the auditor"],
          ].map(([v, t]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input type="radio" name="deviceAnswer" value={v} checked={device === v} onChange={() => setDevice(v)} data-testid={`device-${v}`} required /> {t}
            </label>
          ))}
          {device === "UNCLEAR" && <p className="rounded-md bg-amber-100 p-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100" data-testid="device-unclear-note">Contact the auditor and confirm whether medical-device purchase records are required. The case will be saved as &ldquo;Device confirmation needed&rdquo; and no file can be generated until it is settled.</p>}
        </section>
      )}

      <section className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{internal ? "3" : "4"}. Who asked {internal ? "(optional)" : ""}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="auditorName" className={label}>{internal ? "Contact name" : "Auditor name"}</label><input id="auditorName" name="auditorName" className={`${field} mt-1`} data-testid="auditor-name" /></div>
          <div><label htmlFor="auditorCompany" className={label}>{internal ? "Company" : "Auditor company"}</label><input id="auditorCompany" name="auditorCompany" className={`${field} mt-1`} /></div>
          <div><label htmlFor="auditorEmail" className={label}>Email</label><input id="auditorEmail" name="auditorEmail" type="email" className={`${field} mt-1`} data-testid="auditor-email" /></div>
          <div><label htmlFor="auditorPhone" className={label}>Phone</label><input id="auditorPhone" name="auditorPhone" className={`${field} mt-1`} /></div>
          {pbm && <div><label htmlFor="pbmName" className={label}>PBM</label><input id="pbmName" name="pbmName" className={`${field} mt-1`} data-testid="pbm-name" /></div>}
          {regulatory && (
            <>
              <div>
                <label htmlFor="auditSubtype" className={label}>Kind of regulator</label>
                <select id="auditSubtype" name="auditSubtype" className={`${field} mt-1`} data-testid="reg-subtype" required defaultValue="">
                  <option value="">Choose…</option>
                  {REG_SUBTYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div><label htmlFor="agency" className={label}>Agency / office name</label><input id="agency" name="agency" className={`${field} mt-1`} data-testid="reg-agency" /></div>
            </>
          )}
          <div><label htmlFor="referenceNumber" className={label}>Their reference / case number</label><input id="referenceNumber" name="referenceNumber" className={`${field} mt-1`} /></div>
          <div><label htmlFor="requestReceivedOn" className={label}>Request received</label><input id="requestReceivedOn" name="requestReceivedOn" type="date" defaultValue={today} className={`${field} mt-1`} /></div>
          <div><label htmlFor="dueOn" className={label}>Due date</label><input id="dueOn" name="dueOn" type="date" className={`${field} mt-1`} /></div>
        </div>
        <div>
          <label htmlFor="request" className={label}>Their audit request (PDF, email or letter, kept exactly as it came, up to 5 MB)</label>
          <input id="request" name="request" type="file" className={`${field} mt-1`} data-testid="request-file" />
        </div>
        {internal && (
          <label htmlFor="includePharmacy" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
            <input id="includePharmacy" type="checkbox" name="includePharmacy" value="yes" data-testid="include-pharmacy" /> Put the pharmacy&apos;s name and NCPDP in the spreadsheet too
          </label>
        )}
        {regulatory && (
          <div className="space-y-1">
            <label htmlFor="includePharmacy" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input id="includePharmacy" type="checkbox" name="includePharmacy" value="yes" data-testid="include-pharmacy" /> Name the pharmacy in the report (name, NCPDP and address)
            </label>
            <p className="text-xs text-slate-600 dark:text-slate-400">Leave this off unless the regulator asked for it. The pharmacy is also never copied on the email unless an Admin or the Owner adds it.</p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className={primaryBtn} disabled={pending} data-testid="create-audit">{pending ? "Saving…" : "Save and review the records"}</button>
        {state?.error && <p className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="audit-error">{state.error}</p>}
      </div>
    </form>
  );
}
