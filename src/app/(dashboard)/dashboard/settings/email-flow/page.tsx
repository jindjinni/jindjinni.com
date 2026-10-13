import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getConnection } from "@/lib/email-connector";
import { deptSenderFor } from "@/lib/mail-system";
import { DEPT_LABEL, MAIL_DEPTS } from "@/lib/mail-rules";
import { PLATFORM_EMAILS, RECONNECT_NOTE, SENDER_ORDER, WHOLESALE_EMAILS } from "@/lib/email-flow-rules";

export const dynamic = "force-dynamic";

// Settings -> How our emails work: the same explainer for every wholesale company, plus where THIS company's emails go out from right now.
export default async function EmailFlowPage() {
  const org = await requireOrg();
  const admin = isAdmin(org.role);
  const [conn, ...senders] = await Promise.all([getConnection(org.organizationId), ...MAIL_DEPTS.map((d) => deptSenderFor(org.organizationId, d))]);
  const rows = MAIL_DEPTS.map((d, i) => {
    const s = senders[i];
    if (s.state === "MAILBOX") return { dept: d, text: `Its own mailbox: ${s.accountEmail}`, tone: "ok" as const };
    if (s.state === "RECONNECT") return { dept: d, text: "Its mailbox needs to be signed in again. Its emails are paused until you do.", tone: "warn" as const };
    if (conn) return { dept: d, text: `Your company mailbox: ${conn.accountEmail}${conn.status !== "ACTIVE" ? " (needs to be signed in again)" : ""}`, tone: conn.status === "ACTIVE" ? ("ok" as const) : ("warn" as const) };
    return { dept: d, text: "The platform's shared address, with your company's name on it", tone: "plain" as const };
  });
  const tone = { ok: "text-emerald-800 dark:text-emerald-300", warn: "text-amber-800 dark:text-amber-300", plain: "text-slate-700 dark:text-slate-300" };
  return (
    <div className="max-w-3xl" data-testid="email-flow-page">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">How our emails work</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Every email the wholesale flow sends: when it goes, who gets it, which department it comes from, and where you change the wording. This is the same for every company on the platform.
      </p>

      <section className="mt-6" aria-labelledby="ef-from">
        <h3 id="ef-from" className="text-base font-semibold text-slate-900 dark:text-slate-50">Who an email comes from</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The app tries these in order and uses the first one that is set up.</p>
        <ol className="mt-3 space-y-2" data-testid="ef-sender-order">
          {SENDER_ORDER.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
              <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{i + 1}</span>
              <span>
                <span className="font-medium text-slate-900 dark:text-slate-50">{s.title}.</span> <span className="text-slate-700 dark:text-slate-300">{s.text}</span>
                {s.where && admin && <> <Link href={s.where.href} className="whitespace-nowrap font-medium text-emerald-800 underline dark:text-emerald-300">{s.where.label}</Link></>}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{RECONNECT_NOTE}</p>

        <h4 className="mt-5 text-sm font-semibold text-slate-900 dark:text-slate-50">Right now, for your company</h4>
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" data-testid="ef-live">
          {rows.map((r) => (
            <li key={r.dept} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2" data-dept={r.dept}>
              <span className="font-medium text-slate-900 dark:text-slate-50">{DEPT_LABEL[r.dept]}</span>
              <span className={tone[r.tone]}>{r.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="ef-flow">
        <h3 id="ef-flow" className="text-base font-semibold text-slate-900 dark:text-slate-50">The wholesale flow, step by step</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Customers are the people who sell you supplies. In every step the department named is the one whose mailbox sends it.</p>
        <ol className="mt-3 space-y-3" data-testid="ef-flow-list">
          {WHOLESALE_EMAILS.map((e, i) => (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900" data-step={e.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Step {i + 1} · {e.when}</p>
              <h4 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">{e.title}</h4>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-slate-500 dark:text-slate-400">Goes to</dt><dd className="text-slate-800 dark:text-slate-200">{e.to}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Comes from</dt><dd className="text-slate-800 dark:text-slate-200">{DEPT_LABEL[e.dept]}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Starts when</dt><dd className="text-slate-800 dark:text-slate-200">{e.trigger}</dd>
                <dt className="text-slate-500 dark:text-slate-400">What it says</dt><dd className="text-slate-800 dark:text-slate-200">{e.what}</dd>
                {e.edit && (
                  <>
                    <dt className="text-slate-500 dark:text-slate-400">Change it</dt>
                    <dd>{e.edit.adminOnly && !admin ? <span className="text-slate-600 dark:text-slate-400">{e.edit.label} (owner or admin)</span> : <Link href={e.edit.href} className="font-medium text-emerald-800 underline dark:text-emerald-300">{e.edit.label}</Link>}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="ef-platform">
        <h3 id="ef-platform" className="text-base font-semibold text-slate-900 dark:text-slate-50">Emails from the platform itself</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
          {PLATFORM_EMAILS.map((p) => (
            <li key={p.title}><span className="font-medium text-slate-900 dark:text-slate-50">{p.title}.</span> {p.text}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300" aria-labelledby="ef-ship">
        <h3 id="ef-ship" className="text-base font-semibold text-slate-900 dark:text-slate-50">Which way a shipping label goes</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Customer sells to you (Purchasing):</strong> the customer is the sender and your company is the receiver. Receiving address: Purchasing → Shipping settings.</li>
          <li><strong>Return package to a customer (Shipping):</strong> your company is the sender and the customer is the receiver.</li>
          <li><strong>Shipment to a supplier or distributor (Shipping):</strong> your company is the sender and they are the receiver.</li>
        </ul>
        <p className="mt-2">For the last two, the sender address is your Shipping address (Shipping → Shipping settings), and you type the weight and box size for every label.</p>
      </section>
    </div>
  );
}
