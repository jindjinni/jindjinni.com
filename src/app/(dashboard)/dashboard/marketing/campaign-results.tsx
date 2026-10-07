"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelSendingAction, sendBatchAction } from "@/app/actions/marketing";
import { card, ghostBtn, primaryBtn } from "@/components/sales-ui";
import type { CampaignView } from "./campaign-editor";

type Msg = { id: string; to: string; name: string; status: string; error: string | null };
type Progress = { sent: number; failed: number; skipped: number; pending: number; done: boolean };

const GROUPS = [
  { key: "SENT", title: "Sent" },
  { key: "FAILED", title: "Failed" },
  { key: "SKIPPED", title: "Skipped" },
  { key: "PENDING", title: "Waiting" },
] as const;

/** A campaign that has started: totals, who it reached (closed groups by outcome), and Resume / Stop while it is part-way. */
export function CampaignResults({ campaign, progress, messages, base }: { campaign: CampaignView & { startedAt: string | null; finishedAt: string | null }; progress: Progress; messages: Msg[]; base: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [live, setLive] = useState<Progress | null>(null);
  const p = live ?? progress;
  const word = campaign.channel === "EMAIL" ? "email" : "text";

  const resume = () =>
    start(async () => {
      setMsg(null);
      for (let i = 0; i < 400; i++) {
        const r = await sendBatchAction(campaign.id!);
        if (!r.ok) {
          setMsg(r.error);
          break;
        }
        setLive(r.progress);
        if (r.progress.done) break;
      }
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div>
        <Link href={base} className="text-sm text-slate-600 underline dark:text-slate-400">‹ All {word} campaigns</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{campaign.name}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="mk-result-status">{campaign.status === "SENT" ? "Sent" : campaign.status === "SENDING" ? "Sending, not finished" : "Stopped before it finished"}{campaign.channel === "EMAIL" ? `: ${campaign.subject}` : ""}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4" data-testid="mk-result-tiles">
        {([["Sent", p.sent, "mk-r-sent"], ["Failed", p.failed, "mk-r-failed"], ["Skipped", p.skipped, "mk-r-skipped"], ["Waiting", p.pending, "mk-r-pending"]] as const).map(([l, v, t]) => (
          <div key={l} className={card}><p className="text-xs uppercase tracking-wide text-slate-500">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums" data-testid={t}>{v}</p></div>
        ))}
      </div>
      {campaign.status === "SENDING" && (
        <div className="flex flex-wrap items-center gap-3" data-testid="mk-resume-box">
          <button className={primaryBtn} disabled={pending} onClick={resume} data-testid="mk-resume">{pending ? "Sending…" : "Resume sending"}</button>
          <button className={ghostBtn} disabled={pending} onClick={() => start(async () => { const r = await cancelSendingAction(campaign.id!); if (!r.ok) setMsg(r.error); router.refresh(); })} data-testid="mk-stop">Stop and skip the rest</button>
        </div>
      )}
      {msg && <p role="alert" className="text-sm text-red-700 dark:text-red-300" data-testid="mk-msg-err">{msg}</p>}
      <div className="space-y-3" data-testid="mk-result-groups">
        {GROUPS.map((g) => {
          const list = messages.filter((m) => m.status === g.key);
          if (!list.length) return null;
          return (
            <details key={g.key} className={`${card} !p-0`} data-testid="mk-result-group" data-status={g.key}>
              <summary className="flex cursor-pointer items-center gap-4 px-4 py-3"><span className="font-semibold text-slate-900 dark:text-slate-50">{g.title}</span><span className="text-sm text-slate-600 dark:text-slate-400">{list.length}</span></summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm dark:divide-slate-800 dark:border-slate-800">
                {list.slice(0, 300).map((m) => (
                  <li key={m.id} className="flex flex-wrap gap-x-4 px-4 py-2" data-testid="mk-result-line"><span className="font-medium">{m.name || m.to}</span><span className="text-slate-600 dark:text-slate-400">{m.to}</span>{m.error && <span className="text-red-700 dark:text-red-300">{m.error}</span>}</li>
                ))}
              </ul>
              {list.length > 300 && <p className="px-4 py-2 text-xs text-slate-500">Showing the first 300 of {list.length}.</p>}
            </details>
          );
        })}
      </div>
    </div>
  );
}
