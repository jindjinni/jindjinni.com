"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { addContactAction, deleteContactAction, importContactsAction, setOptoutAction } from "@/app/actions/marketing";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";
import { fmtPhone } from "@/lib/marketing-rules";

export type PersonView = {
  key: string;
  source: "CUSTOMER" | "CONTACT";
  name: string;
  company: string | null;
  email: string | null;
  emailOk: boolean;
  phone: string | null;
  phoneOk: boolean;
  emailOut: boolean;
  textOut: boolean;
};

const SHOW = 200;

export function ContactsView({ rows }: { rows: PersonView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "" });

  const q = search.trim().toLowerCase();
  const match = (r: PersonView) => !q || `${r.name} ${r.company ?? ""} ${r.email ?? ""} ${r.phone ?? ""}`.toLowerCase().includes(q);
  const shown = useMemo(() => rows.filter(match), [rows, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const customers = shown.filter((r) => r.source === "CUSTOMER");
  const contacts = shown.filter((r) => r.source === "CONTACT");
  const gone = shown.filter((r) => r.emailOut || r.textOut);

  const emailReach = rows.filter((r) => r.emailOk && !r.emailOut).length;
  const textReach = rows.filter((r) => r.phoneOk && !r.textOut).length;
  const done = (r: { ok: boolean; message?: string; error?: string }) => {
    setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error ?? "That didn't work." });
    router.refresh();
  };

  const groups: { id: string; title: string; hint: string; list: PersonView[] }[] = [
    { id: "customers", title: "Customers from quotations", hint: "Read live from Purchasing", list: customers },
    { id: "uploaded", title: "Uploaded and typed-in contacts", hint: "Yours to keep up", list: contacts },
    { id: "unsubscribed", title: "Unsubscribed", hint: "Won't get that kind of message", list: gone },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Contacts</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Everyone you can reach: customers from your quotations, plus any contacts you add or upload.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="mk-tiles">
        <div className={card}><p className="text-xs uppercase tracking-wide text-slate-500">People</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid="mk-total">{rows.length}</p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-slate-500">Can get email</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid="mk-email-reach">{emailReach}</p></div>
        <div className={card}><p className="text-xs uppercase tracking-wide text-slate-500">Can get texts</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid="mk-text-reach">{textReach}</p></div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="mk-search" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Find someone</label>
          <input id="mk-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or phone" className={`${field} mt-1 !w-64`} data-testid="mk-search" />
        </div>
        <button type="button" className={primaryBtn} onClick={() => setAdding((v) => !v)} data-testid="mk-add-toggle">{adding ? "Close" : "Add a contact"}</button>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              done(await importContactsAction(fd));
              if (fileRef.current) fileRef.current.value = "";
            });
          }}
        >
          <div>
            <label htmlFor="mk-file" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Upload a list (CSV or Excel)</label>
            <input id="mk-file" ref={fileRef} type="file" name="file" accept=".csv,.xlsx,.xls,.txt" className="mt-1 block text-sm" data-testid="mk-file" />
          </div>
          <button className={ghostBtn} disabled={pending} data-testid="mk-upload">Upload</button>
        </form>
      </div>

      {adding && (
        <form
          className={`${card} grid gap-3 sm:grid-cols-6`}
          data-testid="mk-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addContactAction(form);
              done(r);
              if (r.ok) setForm({ firstName: "", lastName: "", email: "", phone: "", company: "" });
            });
          }}
        >
          {([["firstName", "First name"], ["lastName", "Last name"], ["email", "Email"], ["phone", "Phone"], ["company", "Company"]] as const).map(([k, label]) => (
            <div key={k} className={k === "email" || k === "company" ? "sm:col-span-2" : ""}>
              <label htmlFor={`mk-f-${k}`} className="block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>
              <input id={`mk-f-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={`${field} mt-1`} data-testid={`mk-f-${k}`} />
            </div>
          ))}
          <div className="flex items-end"><button className={primaryBtn} disabled={pending} data-testid="mk-add-save">Add</button></div>
        </form>
      )}

      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "mk-msg-ok" : "mk-msg-err"}>{msg.text}</p>}
      <p className="text-xs text-slate-500">A spreadsheet needs a column for email and/or phone; first name, last name and company are picked up if present. Each email address is added once.</p>

      <div className="space-y-3" data-testid="mk-groups">
        {groups.map((g) => (
          <details key={g.id} open={!!q && g.list.length > 0} className={`${card} !p-0`} data-testid="mk-group" data-group={g.id}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="font-semibold text-slate-900 dark:text-slate-50">{g.title}</span>
              <span className="text-sm text-slate-600 dark:text-slate-400" data-testid="mk-group-count">{g.list.length} {g.list.length === 1 ? "person" : "people"}</span>
              <span className="text-sm text-slate-500">{g.hint}</span>
            </summary>
            {g.list.length === 0 ? (
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800">No one here{q ? " matches that search" : " yet"}.</p>
            ) : (
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2">Name</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Phone</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
                  <tbody>
                    {g.list.slice(0, SHOW).map((r) => (
                      <tr key={`${r.source}-${r.key}`} className="border-t border-slate-100 dark:border-slate-800" data-testid="mk-row" data-key={r.key}>
                        <td className="px-4 py-2"><span className="font-medium text-slate-900 dark:text-slate-50">{r.name}</span>{r.company && <span className="block text-xs text-slate-500">{r.company}</span>}</td>
                        <td className="px-2 py-2">
                          {r.email ? <span className={r.emailOk ? "" : "text-red-700 dark:text-red-300"}>{r.email}</span> : <span className="text-slate-400">-</span>}
                          {r.emailOut && <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" data-testid="mk-email-out">no email</span>}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {r.phone ? <span className={r.phoneOk ? "" : "text-red-700 dark:text-red-300"}>{r.phoneOk ? fmtPhone(r.phone) : r.phone}</span> : <span className="text-slate-400">-</span>}
                          {r.textOut && <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" data-testid="mk-text-out">no texts</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">
                          {r.emailOk && (
                            <button type="button" className="mr-3 text-xs font-medium underline" disabled={pending} data-testid="mk-toggle-email" onClick={() => start(async () => done(await setOptoutAction("EMAIL", r.email!, !r.emailOut)))}>
                              {r.emailOut ? "Allow email" : "Stop email"}
                            </button>
                          )}
                          {r.phoneOk && (
                            <button type="button" className="mr-3 text-xs font-medium underline" disabled={pending} data-testid="mk-toggle-text" onClick={() => start(async () => done(await setOptoutAction("TEXT", r.phone!, !r.textOut)))}>
                              {r.textOut ? "Allow texts" : "Stop texts"}
                            </button>
                          )}
                          {r.source === "CONTACT" && (
                            <button type="button" className="text-xs font-medium text-red-700 underline dark:text-red-300" disabled={pending} data-testid="mk-delete" onClick={() => start(async () => done(await deleteContactAction(r.key)))}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.list.length > SHOW && <p className="px-4 py-2 text-xs text-slate-500">Showing the first {SHOW} of {g.list.length}. Search to find the rest.</p>}
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
