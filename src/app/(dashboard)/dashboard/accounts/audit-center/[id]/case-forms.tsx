"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addNoteAction, attachFileAction, generateAuditAction, markSentAction, reopenAuditAction, setAuditStatusAction, updateAuditAction,
  type AuditFormState,
} from "@/app/actions/audit";
import { REG_SUBTYPES } from "@/lib/audit-rules";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";

const label = "text-xs font-medium text-slate-700 dark:text-slate-300";
const Msg = ({ s }: { s: AuditFormState }) =>
  s?.error ? <p className="text-sm text-red-700 dark:text-red-300" role="alert" data-testid="case-error">{s.error}</p> : s?.message ? <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status" data-testid="case-message">{s.message}</p> : null;

export function GenerateButton({ auditId, disabled, reason, hasFile }: { auditId: string; disabled: boolean; reason?: string; hasFile: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<AuditFormState>();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className={primaryBtn}
        disabled={disabled || pending}
        title={disabled ? reason : undefined}
        onClick={() => start(async () => { setRes(await generateAuditAction(auditId)); router.refresh(); })}
        data-testid="generate"
      >
        {pending ? "Building the Excel file…" : hasFile ? "Generate a new version" : "Generate Excel"}
      </button>
      <Msg s={res} />
    </div>
  );
}

export type EditValues = {
  type: "INTERNAL" | "PBM" | "REGULATORY";
  buyerId: string;
  startDate: string;
  endDate: string;
  deviceAnswer: string;
  productScope: "ALL" | "SELECTED";
  productKeys: string[];
  includePharmacy: boolean;
  auditorName: string;
  auditorCompany: string;
  auditorEmail: string;
  auditorPhone: string;
  pbmName: string;
  agency: string;
  auditSubtype: string;
  referenceNumber: string;
  requestReceivedOn: string;
  dueOn: string;
};

export function EditAuditForm({ auditId, v, pharmacies, products }: { auditId: string; v: EditValues; pharmacies: { id: string; name: string; ncpdp: string | null }[]; products: { key: string; name: string; ndc: string | null }[] }) {
  const [state, action, pending] = useActionState(updateAuditAction.bind(null, auditId), undefined);
  const [scope, setScope] = useState(v.productScope);
  const pbm = v.type === "PBM";
  return (
    <form action={action} className="space-y-3" data-testid="edit-form">
      <input type="hidden" name="type" value={v.type} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="e-buyer" className={label}>Pharmacy</label>
          <select id="e-buyer" name="buyerId" defaultValue={v.buyerId} className={`${field} mt-1`}>
            {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ncpdp ? ` · NCPDP ${p.ncpdp}` : ""}</option>)}
          </select>
        </div>
        <div><label htmlFor="e-start" className={label}>Start date</label><input id="e-start" name="startDate" type="date" defaultValue={v.startDate} className={`${field} mt-1`} data-testid="e-start" /></div>
        <div><label htmlFor="e-end" className={label}>End date</label><input id="e-end" name="endDate" type="date" defaultValue={v.endDate} className={`${field} mt-1`} data-testid="e-end" /></div>
        {v.type !== "INTERNAL" && (
          <div className="sm:col-span-2">
            <label htmlFor="e-device" className={label}>Are device purchase records requested?</label>
            <select id="e-device" name="deviceAnswer" defaultValue={v.deviceAnswer} className={`${field} mt-1`} data-testid="e-device">
              <option value="YES">YES — device records are requested</option>
              <option value="NO">NO — not requested</option>
              <option value="UNCLEAR">NOT CLEAR — clarification required</option>
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <p className={label}>Products</p>
          <label className="mt-1 flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100"><input type="radio" name="productScope" value="ALL" checked={scope === "ALL"} onChange={() => setScope("ALL")} data-testid="scope-all" /> All qualifying products</label>
          <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100"><input type="radio" name="productScope" value="SELECTED" checked={scope === "SELECTED"} onChange={() => setScope("SELECTED")} data-testid="scope-selected" /> Only the products I tick</label>
          {scope === "SELECTED" && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700" data-testid="product-picks">
              {products.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">This pharmacy has no purchases in these dates.</p>}
              {products.map((p) => (
                <label key={p.key} className="flex items-center gap-2 py-0.5 text-sm text-slate-800 dark:text-slate-100">
                  <input type="checkbox" name="productKey" value={p.key} defaultChecked={v.productKeys.includes(p.key)} /> {p.name}{p.ndc ? <span className="text-slate-500"> · {p.ndc}</span> : null}
                </label>
              ))}
            </div>
          )}
        </div>
        <div><label htmlFor="e-aname" className={label}>{pbm ? "Auditor name" : "Contact name"}</label><input id="e-aname" name="auditorName" defaultValue={v.auditorName} className={`${field} mt-1`} /></div>
        <div><label htmlFor="e-acomp" className={label}>Company</label><input id="e-acomp" name="auditorCompany" defaultValue={v.auditorCompany} className={`${field} mt-1`} /></div>
        <div><label htmlFor="e-aemail" className={label}>Email</label><input id="e-aemail" name="auditorEmail" type="email" defaultValue={v.auditorEmail} className={`${field} mt-1`} data-testid="e-aemail" /></div>
        <div><label htmlFor="e-aphone" className={label}>Phone</label><input id="e-aphone" name="auditorPhone" defaultValue={v.auditorPhone} className={`${field} mt-1`} /></div>
        {pbm && <div><label htmlFor="e-pbm" className={label}>PBM</label><input id="e-pbm" name="pbmName" defaultValue={v.pbmName} className={`${field} mt-1`} /></div>}
        {v.type === "REGULATORY" && (
          <>
            <div>
              <label htmlFor="e-sub" className={label}>Kind of regulator</label>
              <select id="e-sub" name="auditSubtype" defaultValue={v.auditSubtype} className={`${field} mt-1`} data-testid="e-subtype">
                <option value="">Choose…</option>
                {REG_SUBTYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div><label htmlFor="e-agency" className={label}>Agency / office name</label><input id="e-agency" name="agency" defaultValue={v.agency} className={`${field} mt-1`} data-testid="e-agency" /></div>
          </>
        )}
        <div><label htmlFor="e-ref" className={label}>Their reference number</label><input id="e-ref" name="referenceNumber" defaultValue={v.referenceNumber} className={`${field} mt-1`} /></div>
        <div><label htmlFor="e-recv" className={label}>Request received</label><input id="e-recv" name="requestReceivedOn" type="date" defaultValue={v.requestReceivedOn} className={`${field} mt-1`} /></div>
        <div><label htmlFor="e-due" className={label}>Due date</label><input id="e-due" name="dueOn" type="date" defaultValue={v.dueOn} className={`${field} mt-1`} /></div>
        {v.type === "REGULATORY" && (
          <label htmlFor="e-incl" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100 sm:col-span-2"><input id="e-incl" type="checkbox" name="includePharmacy" value="yes" defaultChecked={v.includePharmacy} data-testid="e-include" /> Name the pharmacy in the report (name, NCPDP and address)</label>
        )}
        {v.type === "INTERNAL" && (
          <label htmlFor="e-incl" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100 sm:col-span-2"><input id="e-incl" type="checkbox" name="includePharmacy" value="yes" defaultChecked={v.includePharmacy} /> Put the pharmacy&apos;s name and NCPDP in the spreadsheet</label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={primaryBtn} disabled={pending} data-testid="save-case">{pending ? "Saving…" : "Save changes"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function NoteForm({ auditId }: { auditId: string }) {
  const [state, action, pending] = useActionState(addNoteAction.bind(null, auditId), undefined);
  return (
    <form action={action} className="space-y-2" key={state?.message ?? "n"}>
      <label htmlFor="note" className={label}>Add a note (kept with the case; it cannot be deleted)</label>
      <textarea id="note" name="note" rows={2} className={field} data-testid="note-text" />
      <div className="flex items-center gap-3"><button className={ghostBtn} disabled={pending} data-testid="add-note">Add note</button><Msg s={state} /></div>
    </form>
  );
}

export function AttachForm({ auditId }: { auditId: string }) {
  const [state, action, pending] = useActionState(attachFileAction.bind(null, auditId), undefined);
  return (
    <form action={action} className="space-y-2" key={state?.message ?? "a"}>
      <label htmlFor="attach-file" className={label}>Attach a document (up to 5 MB)</label>
      <input id="attach-file" name="file" type="file" className={field} data-testid="attach-file" />
      <label htmlFor="attach-kind" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100"><input id="attach-kind" type="checkbox" name="kind" value="REQUEST" /> This is the auditor&apos;s original request</label>
      <div className="flex items-center gap-3"><button className={ghostBtn} disabled={pending} data-testid="attach-submit">Attach</button><Msg s={state} /></div>
    </form>
  );
}

export type SentCheck = { versions: { id: string; label: string; clean: boolean }[]; type: "INTERNAL" | "PBM" | "REGULATORY"; ncpdp: string | null; deviceYes: boolean; auditorEmail: string; pharmacyEmail: string; subject: string; defaultTo: string; defaultCc: string; hasDates: boolean };

/** Records that the file was sent (by hand in this phase). For a PBM audit every box in the check must be green first. */
export function MarkSentForm({ auditId, c }: { auditId: string; c: SentCheck }) {
  const [state, action, pending] = useActionState(markSentAction.bind(null, auditId), undefined);
  const [to, setTo] = useState(c.defaultTo);
  const [cc, setCc] = useState(c.defaultCc);
  const [versionId, setVersionId] = useState(c.versions[0]?.id ?? "");
  const [sure, setSure] = useState(false);
  const has = (list: string, mail: string) => !!mail && list.toLowerCase().includes(mail.toLowerCase());
  const v = c.versions.find((x) => x.id === versionId);
  const pbm = c.type === "PBM";
  const checks: [string, boolean][] = pbm
    ? [
        ["NCPDP verified", !!c.ncpdp],
        ["Date range verified", c.hasDates],
        ["Device audit confirmed", c.deviceYes],
        ["Pricing excluded", !!v?.clean],
        ["Shipping cost excluded", !!v?.clean],
        ["Recipient is the auditor", c.auditorEmail ? has(to, c.auditorEmail) : !!to.trim()],
        ["Pharmacy copied", c.pharmacyEmail ? has(cc, c.pharmacyEmail) : true],
      ]
    : [["Date range verified", c.hasDates], ["Recipient entered", !!to.trim()]];
  const allGood = checks.every(([, ok]) => ok) && !!v;
  return (
    <form action={action} className="space-y-3" data-testid="sent-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="s-version" className={label}>Which file was sent</label>
          <select id="s-version" name="versionId" value={versionId} onChange={(e) => setVersionId(e.target.value)} className={`${field} mt-1`} data-testid="s-version">
            {c.versions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <div><label htmlFor="s-to" className={label}>Sent to</label><input id="s-to" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1`} data-testid="s-to" /></div>
        <div><label htmlFor="s-cc" className={label}>Copy to</label><input id="s-cc" name="cc" value={cc} onChange={(e) => setCc(e.target.value)} className={`${field} mt-1`} data-testid="s-cc" /></div>
        <div className="sm:col-span-2"><label htmlFor="s-subject" className={label}>Subject used</label><input id="s-subject" name="subject" defaultValue={c.subject} className={`${field} mt-1`} data-testid="s-subject" /></div>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2" data-testid="send-checks">
        {checks.map(([t, ok]) => (
          <li key={t} className={`text-sm ${ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-ok={ok ? "yes" : "no"}>{ok ? "✓" : "✗"} {t}</li>
        ))}
      </ul>
      <label htmlFor="s-confirm" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100"><input id="s-confirm" type="checkbox" name="confirm" value="yes" checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="s-confirm" /> I sent this file to the person above.</label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={primaryBtn} disabled={pending || !allGood || !sure} data-testid="mark-sent">{pending ? "Saving…" : "Record as sent"}</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function StatusButtons({ auditId, sent, followUp, canCancel }: { auditId: string; sent: boolean; followUp: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<AuditFormState>();
  const go = (to: "FOLLOW_UP_REQUIRED" | "COMPLETE" | "CANCELLED") => start(async () => { setRes(await setAuditStatusAction(auditId, to)); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sent && !followUp && <button className={ghostBtn} disabled={pending} onClick={() => go("FOLLOW_UP_REQUIRED")} data-testid="follow-up">Follow-up required</button>}
      {(sent || followUp) && <button className={primaryBtn} disabled={pending} onClick={() => go("COMPLETE")} data-testid="complete">Mark complete</button>}
      {canCancel && <button className={ghostBtn} disabled={pending} onClick={() => go("CANCELLED")} data-testid="cancel-audit">Cancel this audit</button>}
      <Msg s={res} />
    </div>
  );
}

export function ReopenForm({ auditId }: { auditId: string }) {
  const [state, action, pending] = useActionState(reopenAuditAction.bind(null, auditId), undefined);
  return (
    <form action={action} className={`${card} space-y-2`} data-testid="reopen-form">
      <label htmlFor="reopen-reason" className={label}>Reason for reopening (recorded in the trail)</label>
      <input id="reopen-reason" name="reason" className={field} data-testid="reopen-reason" />
      <div className="flex items-center gap-3"><button className={ghostBtn} disabled={pending} data-testid="reopen">Reopen this audit</button><Msg s={state} /></div>
    </form>
  );
}
