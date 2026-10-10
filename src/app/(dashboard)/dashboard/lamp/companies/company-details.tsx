import { stateName } from "@/lib/business-verification";
import { DECISION_LABELS, type CompanyRow, type SecondBusinessRow } from "@/lib/company-admin";
import { TONE_CLASS, paymentStatusText } from "@/lib/account-status";
import { longDay } from "@/lib/billing-schedule";
import { usd } from "@/lib/billing-config";
import { canCheckAutomatically, registryLink } from "@/lib/state-registry";
import { DecisionForm } from "./decision-form";
import { RegistryRecheck } from "./registry-check";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const dl = "grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm";
const dt = "text-slate-500 dark:text-slate-400";

const STATUS_WORDS: Record<string, string> = { pending: "Waiting for review", approved: "Approved", rejected: "Turned down", suspended: "Suspended", banned: "Banned" };

/** The second operation when it is a different LLC: its own papers, its own state-records check and its own decision buttons. */
function SecondBusiness({ s, full }: { s: SecondBusinessRow; full: boolean }) {
  const kind = s.kind === "wholesale" ? "Wholesale" : s.kind === "distribution" ? "Distribution" : "Second";
  return (
    <div className="mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700" data-testid="second-business" data-status={s.status}>
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Second business · {kind} operation · a different LLC</p>
      <p className="mt-1 text-sm" data-testid="second-status"><strong>{STATUS_WORDS[s.status] ?? s.status}.</strong> That operation stays locked until this business is approved; the company&apos;s other operation works normally.</p>
      <dl className={`${dl} mt-2`}>
        {s.ein && (
          <>
            <dt className={dt}>EIN</dt><dd data-testid="second-ein">{s.ein} · {s.registeredState ? stateName(s.registeredState) : ""}</dd>
            <dt className={dt}>Structure</dt><dd>{s.entityType}, formed {s.yearFormed}</dd>
            <dt className={dt}>State file number</dt><dd>{s.stateFileNumber}</dd>
            <dt className={dt}>State records</dt>
            <dd data-testid="second-registry-detail">
              {s.registryDetail ?? "Not checked yet."}{" "}
              {s.registryCheckedAt && <span className="text-xs text-slate-500">({day(s.registryCheckedAt)})</span>}
              <span className="mt-1 flex flex-wrap items-center gap-3">
                {s.registeredState && (
                  <a href={registryLink(s.registeredState)} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline dark:text-emerald-300">Look it up on {stateName(s.registeredState)}&apos;s site</a>
                )}
                {full && <RegistryRecheck orgId={s.id} canCheck={!!s.registeredState && canCheckAutomatically(s.registeredState)} />}
              </span>
            </dd>
            <dt className={dt}>Kind of business</dt><dd>{s.businessType}</dd>
            <dt className={dt}>What they do</dt><dd>{s.businessDescription}</dd>
            <dt className={dt}>Proof</dt>
            <dd>
              {full ? (
                <>{s.proofType} · <a href={`/api/approvals/${s.id}/proof`} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-300" data-testid="second-proof-link">Open {s.proofFileName}</a></>
              ) : (
                <>{s.proofType} on file <span className="text-xs text-slate-500">(the document itself is for the Owner, co-owners and admins)</span></>
              )}
            </dd>
          </>
        )}
        {(s.status === "rejected" || s.status === "suspended") && s.reason && (<><dt className={dt}>Your note</dt><dd>{s.reason} <span className="text-xs text-slate-500">({day(s.decidedAt)})</span></dd></>)}
      </dl>
      {s.history.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-sm text-slate-700 dark:text-slate-200" data-testid="second-history">
          {s.history.map((h) => (
            <li key={h.id}><span className="text-xs text-slate-500">{day(h.createdAt)}</span> · <strong>{DECISION_LABELS[h.decision] ?? h.decision}</strong>{h.reason ? ` — ${h.reason}` : ""}</li>
          ))}
        </ul>
      )}
      {full && <div className="mt-2" data-testid="second-decision"><DecisionForm orgId={s.id} status={s.status} /></div>}
    </div>
  );
}

/** Everything the Lamp knows about one company. `full` = Owner, co-owner or admin (customer support sees the facts but not the proof document or the decision buttons). */
export function CompanyDetails({ c, ownOrgId, full }: { c: CompanyRow; ownOrgId: string; full: boolean }) {
  return (
    <>
    <dl className={dl}>
      <dt className={dt}>Owner</dt><dd>{[c.ownerName, c.ownerEmail].filter(Boolean).join(" · ") || "—"}</dd>
      <dt className={dt}>Contact</dt><dd>{[c.contactName, c.contactEmail, c.contactPhone].filter(Boolean).join(" · ") || "—"}</dd>
      <dt className={dt}>Business email</dt><dd>{c.businessEmail || "—"}{c.website ? ` · ${c.website}` : ""}</dd>
      <dt className={dt}>Location</dt><dd>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</dd>
      {c.ein && (
        <>
          <dt className={dt}>Structure</dt><dd>{c.entityType}, formed {c.yearFormed}</dd>
          <dt className={dt}>State file number</dt><dd>{c.stateFileNumber}</dd>
          <dt className={dt}>State records</dt>
          <dd data-testid="registry-detail">
            {c.registryDetail ?? "Not checked yet."}{" "}
            {c.registryCheckedAt && <span className="text-xs text-slate-500">({day(c.registryCheckedAt)})</span>}
            <span className="mt-1 flex flex-wrap items-center gap-3">
              {c.registeredState && (
                <a href={registryLink(c.registeredState)} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 underline dark:text-emerald-300" data-testid="registry-link">Look it up on {stateName(c.registeredState)}&apos;s site</a>
              )}
              {full && <RegistryRecheck orgId={c.id} canCheck={!!c.registeredState && canCheckAutomatically(c.registeredState)} />}
            </span>
          </dd>
          <dt className={dt}>Kind of business</dt><dd>{c.businessType}</dd>
          <dt className={dt}>What they do</dt><dd>{c.businessDescription}</dd>
          <dt className={dt}>Proof</dt>
          <dd>
            {full ? (
              <>
                {c.proofType} ·{" "}
                <a href={`/api/approvals/${c.id}/proof`} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-300" data-testid="proof-link">Open {c.proofFileName}</a>
              </>
            ) : (
              <>{c.proofType} on file <span className="text-xs text-slate-500">(the document itself is for the Owner, co-owners and admins)</span></>
            )}
          </dd>
        </>
      )}
      <dt className={dt}>Payment</dt>
      <dd data-testid="payment-line">
        {(() => { const ps = paymentStatusText(c); return (<><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[ps.tone]}`}>{ps.label}</span> <span className="text-slate-600 dark:text-slate-300">{ps.text}</span></>); })()}
      </dd>
      {c.cancelRequestedOn && (
        <>
          <dt className={dt}>Cancellation</dt>
          <dd data-testid="cancel-line">
            Cancelled on {longDay(c.cancelRequestedOn)}. Service {c.status === "suspended" ? "ended" : "ends"} {longDay(c.serviceEndsOn ?? c.cancelRequestedOn)}.{" "}
            {(c.cancelRefundCents ?? 0) > 0 ? `Refund due: ${usd(c.cancelRefundCents ?? 0)}.` : "No refund due."}
          </dd>
        </>
      )}
      <dt className={dt}>Operation</dt><dd data-testid="company-sides">{c.sides}</dd>
      <dt className={dt}>Price</dt><dd data-testid="company-price">{c.price}</dd>
      {c.codes && (<><dt className={dt}>Codes used</dt><dd data-testid="company-codes">{c.codes}</dd></>)}
      <dt className={dt}>Plan chosen</dt><dd data-testid="plan-chosen">{c.billingPlan === "monthly" ? "Monthly" : c.billingPlan === "yearly" ? "Yearly" : "None yet"} <span className="text-xs text-slate-500">(billing isn&apos;t live)</span></dd>
      <dt className={dt}>People</dt><dd>{c.teamSize} active</dd>
      <dt className={dt}>Last sign-in</dt><dd>{c.lastSignIn ? day(c.lastSignIn) : "Never"}</dd>
      {(c.status === "rejected" || c.status === "suspended") && c.reason && (
        <><dt className={dt}>Your note</dt><dd>{c.reason} <span className="text-xs text-slate-500">({day(c.decidedAt)})</span></dd></>
      )}
    </dl>
    {c.history.length > 0 && (
      <div>
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">History</p>
        <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-700 dark:text-slate-200" data-testid="company-history">
          {c.history.map((h) => (
            <li key={h.id}>
              <span className="text-xs text-slate-500">{day(h.createdAt)}</span> · <strong>{DECISION_LABELS[h.decision] ?? h.decision}</strong>
              {h.reason ? ` — ${h.reason}` : ""}
            </li>
          ))}
        </ul>
      </div>
    )}
    {c.second && <SecondBusiness s={c.second} full={full} />}
    {c.id === ownOrgId ? (
      <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="own-company">Your company. It can&apos;t be changed from here.</p>
    ) : full ? (
      <DecisionForm orgId={c.id} status={c.status} />
    ) : (
      <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="no-decision">Approving, suspending and banning are for the Owner, co-owners and admins.</p>
    )}
    </>
  );
}
