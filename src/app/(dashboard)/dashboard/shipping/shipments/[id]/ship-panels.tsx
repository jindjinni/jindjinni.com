"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addBoxAction, followBoxAction, makeLabelsAction, refreshShipmentAction, removeBoxAction, removeShipmentFileAction, sendShippedEmailAction, setBoxStatusAction, setFileAttachAction,
  setShipToAction, skipShippedEmailAction, updateShipmentAction, uploadShipmentFileAction,
} from "@/app/actions/shipping-dept";
import { field, ghostBtn, primaryBtn } from "@/components/sales-ui";
import { AddressFields, type AddressValue } from "../../addresses/address-fields";
import { guessCarrier, MANUAL_STATUSES, pickAttachments, shippedEmail, statusLabel, type EmailItem } from "@/lib/shipping-rules";
import { carrierTrackingLink, pillClass } from "@/lib/tracking-rules";
import { DEFAULT_PARCEL } from "@/lib/shipping-address-rules";

type Msg = { ok: boolean; text: string } | null;
type R = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<R>, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      if (r.message) setMsg({ ok: true, text: r.message });
      after?.();
      router.refresh();
    });
  };
  return { pending, msg, run, setMsg };
}

const Note = ({ msg, id }: { msg: Msg; id: string }) =>
  msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={`${id}-${msg.ok ? "ok" : "error"}`}>{msg.text}</p> : null;

const Panel = ({ title, children, id }: { title: string; children: React.ReactNode; id: string }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid={id}>
    <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
    {children}
  </section>
);

// ---------------------------------------------------------------------------
// Where it goes
// ---------------------------------------------------------------------------

export type ContactOption = { id: string; label: string; kind: string };

export function ShipToPanel({ shipmentId, address, lines, contactId, options, locked, canWrite, problem }: {
  shipmentId: string; address: AddressValue; lines: string[]; contactId: string | null; options: ContactOption[]; locked: boolean; canWrite: boolean; problem: string | null;
}) {
  const { pending, msg, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AddressValue>(address);
  const [save, setSave] = useState(false);
  const [saveAs, setSaveAs] = useState("BUYER");
  const [pick, setPick] = useState(contactId ?? "");
  return (
    <Panel title="Ship to" id="shipto-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-slate-800 dark:text-slate-200" data-testid="shipto-lines">
          {lines.length ? lines.map((l, i) => <p key={i} className={i === 0 ? "font-semibold" : ""}>{l}</p>) : <p className="text-slate-500">No address yet.</p>}
          {problem && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300" data-testid="shipto-problem">{problem}</p>}
        </div>
        {canWrite && !locked && !editing && <button type="button" className={ghostBtn} onClick={() => setEditing(true)} data-testid="shipto-change">Change address</button>}
      </div>
      {editing && (
        <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          {options.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1">
                <label htmlFor="shipto-pick" className="text-xs font-medium text-slate-700 dark:text-slate-300">Use a saved address</label>
                <select id="shipto-pick" value={pick} onChange={(e) => setPick(e.target.value)} className={`${field} mt-1`} data-testid="shipto-pick">
                  <option value="">Choose…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <button type="button" disabled={pending || !pick} className={ghostBtn} data-testid="shipto-use" onClick={() => run(() => setShipToAction(shipmentId, { contactId: pick }), () => setEditing(false))}>Use it</button>
            </div>
          )}
          <p className="text-xs text-slate-500">Or type the address for this shipment:</p>
          <AddressFields idp="st" value={form} onChange={setForm} />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} data-testid="shipto-save" />
            Also save it as an address profile
          </label>
          {save && (
            <select aria-label="Profile type" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} className={`${field} max-w-xs`}>
              <option value="BUYER">Buyer or pharmacy</option>
              <option value="SELLER">Seller</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="OTHER">Other</option>
            </select>
          )}
          <div className="flex gap-3">
            <button type="button" disabled={pending} className={primaryBtn} data-testid="shipto-submit" onClick={() => run(() => setShipToAction(shipmentId, { address: form, saveAs: save ? saveAs : null }), () => setEditing(false))}>{pending ? "Saving…" : "Save address"}</button>
            <button type="button" className={ghostBtn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
      <Note msg={msg} id="shipto" />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

export type BoxView = {
  id: string; carrier: string; trackingNumber: string; status: string; statusDetails: string | null; location: string | null; eta: string | null; lastError: string | null;
  followAuto: boolean; labelUrl: string | null; labelService: string | null; labelCost: number | null;
};

export function BoxesPanel({ shipmentId, boxes, locked, canWrite, trackingConnected }: { shipmentId: string; boxes: BoxView[]; locked: boolean; canWrite: boolean; trackingConnected: boolean }) {
  const { pending, msg, run } = useRun();
  const [tn, setTn] = useState("");
  const [carrier, setCarrier] = useState("");
  const guess = guessCarrier(tn);
  return (
    <Panel title={`Boxes (${boxes.length})`} id="boxes-panel">
      {boxes.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="boxes-empty">No boxes yet. Make a label below, or type a tracking number you already have.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="boxes-list">
          {boxes.map((b, i) => {
            const link = carrierTrackingLink(b.carrier, b.trackingNumber);
            return (
              <li key={b.id} className="space-y-1.5 py-3 text-sm" data-testid="box-row">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">Box {i + 1}</span>
                  <span className="font-semibold tabular-nums" data-testid="box-tracking">{b.carrier === "Other" ? "" : `${b.carrier} `}{b.trackingNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillClass(b.status)}`} data-testid="box-status">{statusLabel(b.status)}</span>
                  {link && <a href={link} target="_blank" rel="noreferrer" className="text-xs text-slate-600 underline dark:text-slate-400">Open on {b.carrier}</a>}
                  {b.labelUrl && <a href={b.labelUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-800 underline dark:text-emerald-300" data-testid="box-label">Open label to print</a>}
                </div>
                <p className="text-xs text-slate-500">
                  {[b.labelService, b.labelCost != null ? `$${b.labelCost.toFixed(2)}` : null, b.statusDetails, b.location, b.eta ? `Expected ${b.eta.slice(0, 10)}` : null].filter(Boolean).join(" · ") || (trackingConnected ? "Waiting for the carrier's first update." : "")}
                  {!b.followAuto && " · status set by hand"}
                </p>
                {b.lastError && b.followAuto && <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="box-error">{b.lastError}</p>}
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="sr-only" htmlFor={`bs-${b.id}`}>Set status</label>
                    <select id={`bs-${b.id}`} value="" onChange={(e) => e.target.value && run(() => setBoxStatusAction(b.id, e.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" data-testid="box-setstatus">
                      <option value="">Set status by hand…</option>
                      {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {!b.followAuto && <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => followBoxAction(b.id))} data-testid="box-follow">Follow the carrier again</button>}
                    {!locked && <button type="button" className="text-xs text-red-700 underline dark:text-red-300" disabled={pending} onClick={() => run(() => removeBoxAction(b.id))} data-testid="box-remove">Remove</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="min-w-56 flex-1">
            <label htmlFor="box-tn" className="text-xs font-medium text-slate-700 dark:text-slate-300">Add a tracking number you already have</label>
            <input id="box-tn" value={tn} onChange={(e) => setTn(e.target.value)} placeholder="1Z999AA10123456784" className={`${field} mt-1`} data-testid="box-tn" />
          </div>
          <div>
            <label htmlFor="box-carrier" className="text-xs font-medium text-slate-700 dark:text-slate-300">Carrier</label>
            <select id="box-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className={`${field} mt-1`} data-testid="box-carrier">
              <option value="">{guess ? `${guess} (looks like)` : "Pick for me"}</option>
              <option value="UPS">UPS</option><option value="USPS">USPS</option><option value="FedEx">FedEx</option><option value="Other">Other</option>
            </select>
          </div>
          <button type="button" disabled={pending} className={primaryBtn} data-testid="box-add" onClick={() => run(() => addBoxAction(shipmentId, tn, carrier), () => setTn(""))}>Add box</button>
          {boxes.length > 0 && <button type="button" disabled={pending} className={ghostBtn} data-testid="box-refresh" onClick={() => run(() => refreshShipmentAction(shipmentId))}>Refresh tracking</button>}
        </div>
      )}
      {!trackingConnected && boxes.length > 0 && <p className="mt-2 text-xs text-slate-500">Live tracking isn&apos;t connected, so set each box&apos;s status by hand. An owner or admin can connect Shippo under Connectors.</p>}
      <Note msg={msg} id="boxes" />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function LabelsPanel({ shipmentId, canWrite, shippoReady, shippoWhy, fromReady, addressProblem }: { shipmentId: string; canWrite: boolean; shippoReady: boolean; shippoWhy: string | null; fromReady: boolean; addressProblem: string | null }) {
  const { pending, msg, run } = useRun();
  const [service, setService] = useState("UPS_GROUND");
  const [count, setCount] = useState(1);
  const [len, setLen] = useState(String(DEFAULT_PARCEL.lengthIn));
  const [wid, setWid] = useState(String(DEFAULT_PARCEL.widthIn));
  const [hei, setHei] = useState(String(DEFAULT_PARCEL.heightIn));
  const [wt, setWt] = useState(String(DEFAULT_PARCEL.weightLb));
  const blocked = !shippoReady ? shippoWhy : !fromReady ? "Add your business's ship-from address (with a phone and an email) in Settings → Business first." : addressProblem ? `The address isn't complete. ${addressProblem}` : null;
  const lab = "text-xs font-medium text-slate-700 dark:text-slate-300";
  return (
    <Panel title="Make shipping labels" id="labels-panel">
      <p className="mb-3 text-xs text-slate-500">Labels are bought from your own Shippo account. Each label is one box with its own tracking number, followed for you automatically.</p>
      {blocked && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="labels-blocked">{blocked}</p>}
      {canWrite && (
        <div className="grid gap-3 sm:grid-cols-[1.4fr_5rem_repeat(4,4.5rem)_auto] sm:items-end">
          <div><label htmlFor="lb-service" className={lab}>Service</label>
            <select id="lb-service" value={service} onChange={(e) => setService(e.target.value)} className={`${field} mt-1`} data-testid="lb-service">
              <option value="UPS_GROUND">UPS Ground</option><option value="USPS_PRIORITY">USPS Priority Mail</option>
            </select></div>
          <div><label htmlFor="lb-count" className={lab}>Labels</label><input id="lb-count" type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${field} mt-1`} data-testid="lb-count" /></div>
          <div><label htmlFor="lb-len" className={lab}>Long (in)</label><input id="lb-len" value={len} onChange={(e) => setLen(e.target.value)} className={`${field} mt-1`} data-testid="lb-len" /></div>
          <div><label htmlFor="lb-wid" className={lab}>Wide (in)</label><input id="lb-wid" value={wid} onChange={(e) => setWid(e.target.value)} className={`${field} mt-1`} /></div>
          <div><label htmlFor="lb-hei" className={lab}>High (in)</label><input id="lb-hei" value={hei} onChange={(e) => setHei(e.target.value)} className={`${field} mt-1`} /></div>
          <div><label htmlFor="lb-wt" className={lab}>Weight (lb)</label><input id="lb-wt" value={wt} onChange={(e) => setWt(e.target.value)} className={`${field} mt-1`} data-testid="lb-wt" /></div>
          <button type="button" disabled={pending || !!blocked} className={primaryBtn} data-testid="lb-make" onClick={() => run(() => makeLabelsAction(shipmentId, { service, count, lengthIn: len, widthIn: wid, heightIn: hei, weightLb: wt }))}>{pending ? "Making…" : "Make labels"}</button>
        </div>
      )}
      <Note msg={msg} id="labels" />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Photos and documents
// ---------------------------------------------------------------------------

export type FileView = { id: string; filename: string; kind: string; sizeBytes: number; attach: boolean; isImage: boolean };

const KIND_LABEL: Record<string, string> = { LABEL: "Shipping label", ORDER_DOC: "Invoice or purchase order", OTHER: "Other" };

export function FilesPanel({ shipmentId, files, locked, canWrite }: { shipmentId: string; files: FileView[]; locked: boolean; canWrite: boolean }) {
  const { pending, msg, run } = useRun();
  const [kind, setKind] = useState("LABEL");
  return (
    <Panel title={`Photos and documents (${files.length})`} id="files-panel">
      {files.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="files-empty">Add a photo of the label, or of the invoice or purchase order. Ticked files go in the email.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="files-list">
          {files.map((f) => (
            <li key={f.id} className="flex gap-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800" data-testid="file-row">
              <a href={`/api/shipping/files/${f.id}`} target="_blank" rel="noreferrer" className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 text-xs text-slate-500 dark:bg-slate-800">
                {f.isImage ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/shipping/files/${f.id}`} alt={f.filename} className="h-full w-full object-cover" /> : "PDF"}
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.filename}</p>
                <p className="text-xs text-slate-500">{KIND_LABEL[f.kind] ?? f.kind} · {Math.max(1, Math.round(f.sizeBytes / 1024))} KB</p>
                {canWrite && !locked && (
                  <div className="mt-1 flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.attach} disabled={pending} onChange={(e) => run(() => setFileAttachAction(f.id, e.target.checked))} data-testid="file-attach" />In the email</label>
                    <button type="button" className="text-xs text-red-700 underline dark:text-red-300" disabled={pending} onClick={() => run(() => removeShipmentFileAction(f.id))} data-testid="file-remove">Remove</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canWrite && !locked && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(() => uploadShipmentFileAction(shipmentId, kind, fd), () => form.reset());
          }}
        >
          <div>
            <label htmlFor="file-kind" className="text-xs font-medium text-slate-700 dark:text-slate-300">What is it?</label>
            <select id="file-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`} data-testid="file-kind">
              <option value="LABEL">Shipping label</option><option value="ORDER_DOC">Invoice or purchase order</option><option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="file-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">Photo or PDF (up to 4 MB)</label>
            <input id="file-input" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" capture="environment" className={`${field} mt-1`} data-testid="file-input" />
          </div>
          <button type="submit" disabled={pending} className={primaryBtn} data-testid="file-upload">{pending ? "Adding…" : "Add file"}</button>
        </form>
      )}
      <Note msg={msg} id="files" />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

export type EmailProps = {
  shipmentId: string; to: string; docKind: string; docNumber: string; reference: string | null; reason: string | null; company: string; contact: string | null; shipDate: string;
  boxes: { carrier: string; trackingNumber: string }[]; items: EmailItem[]; files: { id: string; filename: string; sizeBytes: number; attach: boolean }[]; sender: string;
  hasOrder: boolean; hasInvoice: boolean; canSend: boolean;
};

export function EmailPanel(p: EmailProps) {
  const { pending, msg, run } = useRun();
  const [to, setTo] = useState(p.to);
  const [note, setNote] = useState("");
  const [attachOrder, setAttachOrder] = useState(false);
  const [attachInvoice, setAttachInvoice] = useState(false);
  const [reason, setReason] = useState("");
  const pick = pickAttachments(p.files, 0);
  const names = p.files.filter((f) => pick.use.includes(f.id)).map((f) => f.filename);
  if (attachOrder && p.hasOrder) names.push("Order.pdf");
  if (attachInvoice && p.hasInvoice) names.push("Invoice.pdf");
  const mail = shippedEmail({ company: p.company, contact: p.contact, docKind: p.docKind, docNumber: p.docNumber, reference: p.reference, shipDate: p.shipDate, boxes: p.boxes, items: p.items, attachmentNames: names, note, senderName: p.sender, reason: p.reason });
  const lab = "text-xs font-medium text-slate-700 dark:text-slate-300";
  return (
    <Panel title="Email to the buyer" id="email-panel">
      {p.boxes.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="email-needs-boxes">Add at least one box and the email appears here to review.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800" data-testid="email-preview">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What the buyer will get</p>
            <p className="mt-2 text-sm"><span className="text-slate-500">Subject: </span><span data-testid="email-subject">{mail.subject}</span></p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200" data-testid="email-body">{mail.text}</pre>
            {pick.left.length > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Too many or too large to attach: {pick.left.join(", ")}. Untick some files.</p>}
          </div>
          {p.canSend && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="em-to" className={lab}>Send to</label><input id="em-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="buyer@company.com" className={`${field} mt-1`} data-testid="em-to" /></div>
                <div><label htmlFor="em-note" className={lab}>A note to the buyer (optional)</label><input id="em-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} data-testid="em-note" /></div>
              </div>
              {(p.hasOrder || p.hasInvoice) && (
                <div className="flex flex-wrap gap-5 text-sm">
                  {p.hasOrder && <label className="flex items-center gap-2"><input type="checkbox" checked={attachOrder} onChange={(e) => setAttachOrder(e.target.checked)} data-testid="em-attach-order" />Attach the order PDF</label>}
                  {p.hasInvoice && <label className="flex items-center gap-2"><input type="checkbox" checked={attachInvoice} onChange={(e) => setAttachInvoice(e.target.checked)} data-testid="em-attach-invoice" />Attach the invoice PDF</label>}
                  <span className="text-xs text-slate-500">PDFs show prices.</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={pending} className={primaryBtn} data-testid="em-send" onClick={() => run(() => sendShippedEmailAction(p.shipmentId, { to, note, attachOrder, attachInvoice }))}>{pending ? "Sending…" : "Send the email"}</button>
                <span className="text-xs text-slate-500">Nothing is sent until you press Send.</span>
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="min-w-60 flex-1"><label htmlFor="em-reason" className={lab}>No email needed? Why (optional)</label><input id="em-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: told them by phone" className={`${field} mt-1`} data-testid="em-reason" /></div>
                <button type="button" disabled={pending} className={ghostBtn} data-testid="em-skip" onClick={() => run(() => skipShippedEmailAction(p.shipmentId, reason))}>Set aside, no email</button>
              </div>
            </>
          )}
        </div>
      )}
      <Note msg={msg} id="email" />
    </Panel>
  );
}

/** Ship date and the buyer's email, kept up to date until the email is handled. */
export function DetailsPanel({ shipmentId, shipDate, buyerEmail, buyerContact, locked, canWrite }: { shipmentId: string; shipDate: string; buyerEmail: string; buyerContact: string; locked: boolean; canWrite: boolean }) {
  const { pending, msg, run } = useRun();
  const [d, setD] = useState(shipDate);
  const [e, setE] = useState(buyerEmail);
  const [c, setC] = useState(buyerContact);
  const lab = "text-xs font-medium text-slate-700 dark:text-slate-300";
  if (!canWrite || locked) return null;
  return (
    <Panel title="Details" id="details-panel">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor="dt-date" className={lab}>Ship date</label><input id="dt-date" type="date" value={d} onChange={(x) => setD(x.target.value)} className={`${field} mt-1`} data-testid="dt-date" /></div>
        <div><label htmlFor="dt-contact" className={lab}>Greet them as</label><input id="dt-contact" value={c} onChange={(x) => setC(x.target.value)} className={`${field} mt-1`} data-testid="dt-contact" /></div>
        <div><label htmlFor="dt-email" className={lab}>Buyer&apos;s email</label><input id="dt-email" value={e} onChange={(x) => setE(x.target.value)} className={`${field} mt-1`} data-testid="dt-email" /></div>
      </div>
      <div className="mt-3"><button type="button" disabled={pending} className={ghostBtn} data-testid="dt-save" onClick={() => run(() => updateShipmentAction(shipmentId, { shipDate: d, buyerEmail: e, buyerContact: c }).then((r) => (r.ok ? { ok: true as const, message: "Saved." } : r)))}>Save details</button></div>
      <Note msg={msg} id="dt" />
    </Panel>
  );
}
