import { STATUS_LABELS, whenText, type TicketStatus } from "@/lib/support-rules";

export type ThreadMessage = { id: string; authorKind: string; authorName: string | null; body: string; via: string; createdAt: string };

export const STATUS_PILL: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  waiting: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  solved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

export function StatusPill({ status, forCompany = false }: { status: TicketStatus; forCompany?: boolean }) {
  // The company sees "Open / We replied / Solved"; the platform sees who needs to act.
  const label = forCompany ? (status === "open" ? "Open" : status === "waiting" ? "We replied" : "Solved") : STATUS_LABELS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`} data-testid="ticket-status">{label}</span>;
}

/** The conversation, oldest first. Internal notes (platform side only) are drawn apart so they can't be mistaken for a reply. */
export function Thread({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="flex flex-col gap-3" data-testid="thread">
      {messages.map((m) => {
        const note = m.authorKind === "note";
        const ours = m.authorKind === "support";
        const box = note
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : ours
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
        return (
          <li key={m.id} className={`rounded-lg border p-4 ${box}`} data-testid="message" data-kind={m.authorKind}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {note ? "Internal note (the company never sees this)" : m.authorName || (ours ? "Jindjinni Support" : "Company")}
              </span>
              <span>
                {m.via === "email" ? "by email · " : ""}
                {whenText(m.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-slate-50">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
