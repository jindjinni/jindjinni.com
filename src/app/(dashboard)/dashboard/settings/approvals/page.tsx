import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, businessVerifications, organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { stateName } from "@/lib/business-verification";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

const badge = "rounded-full px-2 py-0.5 text-xs font-medium";
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** New companies waiting for the platform owner, with everything needed to decide. Platform owner only. */
export default async function ApprovalsPage() {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) notFound();

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      status: organizations.approvalStatus,
      reason: organizations.approvalReason,
      decidedAt: organizations.approvalDecidedAt,
      v: businessVerifications,
      p: businessProfiles,
    })
    .from(businessVerifications)
    .innerJoin(organizations, eq(organizations.id, businessVerifications.organizationId))
    .leftJoin(businessProfiles, eq(businessProfiles.organizationId, organizations.id))
    .orderBy(desc(businessVerifications.submittedAt))
    .limit(300);

  const norm = (s: string | null): "pending" | "approved" | "rejected" => (s === "pending" || s === "rejected" ? s : "approved");
  const groups: { key: "pending" | "rejected" | "approved"; title: string; open: boolean }[] = [
    { key: "pending", title: "Waiting for you", open: true },
    { key: "rejected", title: "Turned down or suspended", open: false },
    { key: "approved", title: "Approved", open: false },
  ];
  const sec = "rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const dl = "grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm";
  const dt = "text-slate-500 dark:text-slate-400";

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="approvals">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Company approvals</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every new company stays locked until you approve it. Check the EIN and state file number against the proof document and, if you like, your state&apos;s business search, then approve or send it back with a note. Only you can see this page and these documents.
        </p>
      </div>
      {groups.map((g) => {
        const list = rows.filter((r) => norm(r.status) === g.key);
        return (
          <details key={g.key} className={sec} open={g.open || list.length > 0 && g.key === "pending"} data-testid={`group-${g.key}`}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {g.title}{" "}
              <span className={`${badge} ml-2 ${g.key === "pending" && list.length ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{list.length}</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 dark:border-slate-800">
              {list.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{g.key === "pending" ? "Nobody is waiting." : "None."}</p>}
              {list.map(({ id, name, status, reason, decidedAt, v, p }) => (
                <details key={id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800" data-testid="approval-item" open={g.key === "pending"}>
                  <summary className="cursor-pointer text-sm text-slate-800 dark:text-slate-100">
                    <strong>{name}</strong> <span className="text-xs text-slate-500">· EIN {v.ein} · {stateName(v.registeredState)} · sent {day(v.submittedAt)}</span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <dl className={dl}>
                      <dt className={dt}>Structure</dt><dd>{v.entityType}, formed {v.yearFormed}</dd>
                      <dt className={dt}>State file number</dt><dd>{v.stateFileNumber}</dd>
                      <dt className={dt}>Kind of business</dt><dd>{v.businessType}</dd>
                      <dt className={dt}>What they do</dt><dd>{v.businessDescription}</dd>
                      <dt className={dt}>Address</dt><dd>{[p?.businessAddressStreet1, p?.businessAddressCity, p?.businessAddressState, p?.businessAddressZip].filter(Boolean).join(", ")}</dd>
                      <dt className={dt}>Contact</dt><dd>{[p?.primaryContactFirstName, p?.primaryContactLastName].filter(Boolean).join(" ")} · {p?.primaryContactEmail} · {p?.primaryContactPhone}</dd>
                      <dt className={dt}>Business email</dt><dd>{p?.businessEmail}{p?.website ? ` · ${p.website}` : ""}</dd>
                      <dt className={dt}>Proof</dt>
                      <dd>
                        {v.proofType} ·{" "}
                        <a href={`/api/approvals/${id}/proof`} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-300" data-testid="proof-link">Open {v.proofFileName}</a>
                      </dd>
                      {status === "rejected" && reason && (<><dt className={dt}>Your note</dt><dd>{reason} <span className="text-xs text-slate-500">({day(decidedAt)})</span></dd></>)}
                    </dl>
                    {id !== org.organizationId && <DecisionForm orgId={id} status={norm(status)} />}
                  </div>
                </details>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
