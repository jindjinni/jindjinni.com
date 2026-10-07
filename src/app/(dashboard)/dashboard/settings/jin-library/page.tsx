import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jinFeedback, organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { allLibraryRows, CATEGORY_LIST, isCategory } from "@/lib/jin-library";
import { BUILTIN_KNOWLEDGE, CATEGORY_LABELS } from "@/lib/industry-knowledge-builtin";
import { DeleteEntry, EntryForm, FeedbackButtons, emptyEntry, type EntryValues } from "./library-forms";

export const dynamic = "force-dynamic";

const badge = "rounded-full px-2 py-0.5 text-xs font-medium";

/** Jin's industry library and feedback inbox. Platform owner only. */
export default async function JinLibraryPage() {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) notFound();

  const [rows, fb] = await Promise.all([
    allLibraryRows(),
    db
      .select({ id: jinFeedback.id, rating: jinFeedback.rating, question: jinFeedback.question, answer: jinFeedback.answer, note: jinFeedback.note, createdAt: jinFeedback.createdAt, company: organizations.name })
      .from(jinFeedback)
      .innerJoin(organizations, eq(organizations.id, jinFeedback.organizationId))
      .where(eq(jinFeedback.status, "NEW"))
      .orderBy(desc(jinFeedback.createdAt))
      .limit(100),
  ]);
  const byCat = new Map<string, typeof rows>();
  for (const r of rows) {
    const c = isCategory(r.category) ? r.category : "other";
    byCat.set(c, [...(byCat.get(c) ?? []), r]);
  }
  const values = (r: (typeof rows)[number]): EntryValues => ({ id: r.id, title: r.title, category: r.category, brand: r.brand ?? "", body: r.body, source: r.source, verifiedOn: r.verifiedOn ?? "", formats: r.formats ?? "", formatKind: r.formatKind ?? "lot", status: r.status });
  const sec = "rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="jin-library">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Jin&apos;s library</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          What Jin knows about the industry, beyond the basics built in. Everything you mark <strong>Live</strong> is read by every company&apos;s Jin, so keep it to facts: no customer names, no company records, no prices. Only you can see this page.
        </p>
      </div>

      <details className={sec} open={fb.length > 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50" data-testid="feedback-summary">
          Feedback to review <span className={`${badge} ml-2 ${fb.length ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{fb.length}</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-slate-100 p-4 dark:border-slate-800">
          {fb.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing waiting. When someone presses Helpful or Not right on an answer, it shows up here.</p>}
          {fb.map((f) => (
            <details key={f.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800" data-testid="feedback-item">
              <summary className="cursor-pointer text-sm text-slate-800 dark:text-slate-100">
                <span className={`${badge} mr-2 ${f.rating === "DOWN" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}`}>{f.rating === "DOWN" ? "Not right" : "Helpful"}</span>
                {f.question.slice(0, 90)} <span className="text-xs text-slate-500">· {f.company} · {f.createdAt.slice(0, 10)}</span>
              </summary>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <p><strong>Asked:</strong> {f.question}</p>
                <p className="whitespace-pre-wrap"><strong>Jin said:</strong> {f.answer}</p>
                {f.note && <p className="whitespace-pre-wrap rounded bg-amber-50 p-2 dark:bg-amber-950/40"><strong>Their note:</strong> {f.note}</p>}
                <FeedbackButtons id={f.id} />
              </div>
            </details>
          ))}
        </div>
      </details>

      <details className={sec} data-testid="add-entry">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Add an entry</summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <EntryForm v={emptyEntry} idPrefix="new" />
        </div>
      </details>

      <div className="flex flex-col gap-3">
        {CATEGORY_LIST.filter((c) => byCat.has(c)).map((c) => {
          const list = byCat.get(c)!;
          const drafts = list.filter((r) => r.status === "DRAFT").length;
          return (
            <details key={c} className={sec} data-testid={`cat-${c}`}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">
                {CATEGORY_LABELS[c]} <span className={`${badge} ml-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>{list.length}</span>
                {drafts > 0 && <span className={`${badge} ml-2 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>{drafts} draft</span>}
              </summary>
              <div className="flex flex-col gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
                {list.map((r) => (
                  <details key={r.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800" data-testid="entry-row">
                    <summary className="cursor-pointer text-sm text-slate-800 dark:text-slate-100">
                      {r.title} {r.brand && <span className="text-xs text-slate-500">· {r.brand}</span>}
                      <span className={`${badge} ml-2 ${r.status === "LIVE" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{r.status === "LIVE" ? "Live" : "Draft"}</span>
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <EntryForm v={values(r)} idPrefix={r.id} />
                      <DeleteEntry id={r.id} />
                    </div>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing recorded yet. Add the first entry above, for example a maker&apos;s lot number layout.</p>}
      </div>

      <details className={sec}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Built in (always on) <span className={`${badge} ml-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>{BUILTIN_KNOWLEDGE.length}</span></summary>
        <ul className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800">
          {BUILTIN_KNOWLEDGE.map((e) => (
            <li key={e.id}>
              <p className="font-medium text-slate-900 dark:text-slate-50">{e.title}</p>
              <p className="text-slate-600 dark:text-slate-300">{e.body}</p>
              <p className="text-xs text-slate-500">Source: {e.source} · checked {e.verifiedOn}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
