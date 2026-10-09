import { notFound } from "next/navigation";
import { listRemoved, listStaff } from "@/lib/mothership-staff";
import { GRANTABLE_LEVELS, LEVEL_BLURBS, LEVEL_LABELS, mayManageLevel, mayOpenStaffPage, type StaffLevel } from "@/lib/mothership-rules";
import { staffLevelOf } from "@/lib/platform-admin";
import { requireOrg } from "@/lib/tenant";
import { AddStaffForm, DeleteForever, StaffRowActions } from "./staff-forms";

export const dynamic = "force-dynamic";

const PILL: Record<StaffLevel, string> = {
  owner: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  co_owner: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  admin: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  support: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

/** Who is on the Lamp's team and what each level may do. */
export default async function StaffPage() {
  const org = await requireOrg({ real: true });
  const mine = await staffLevelOf(org);
  if (!mayOpenStaffPage(mine)) notFound();
  const staff = await listStaff(org.organizationId);
  const removed = mine === "owner" || mine === "co_owner" ? await listRemoved(org.organizationId) : [];
  const addable = GRANTABLE_LEVELS.filter((l) => mayManageLevel(mine, l));

  return (
    <div className="flex max-w-4xl flex-col gap-5" data-testid="staff-page">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Staff</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The team that runs the platform. Everyone signs in with their own email, and everything they do here is written to the audit log. Turn on two-step sign-in for everyone on this list.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="level-key">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">What each level can do</h3>
        <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
          {(["owner", "co_owner", "admin", "support"] as StaffLevel[]).map((l) => (
            <div key={l} className="contents">
              <dt><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PILL[l]}`}>{LEVEL_LABELS[l]}</span></dt>
              <dd className="text-slate-600 dark:text-slate-300">{LEVEL_BLURBS[l]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ul className="flex flex-col gap-2" data-testid="staff-list">
        {staff.map((s) => {
          const mine_ = s.userId === org.userId;
          const canManage = !mine_ && s.level !== "owner" && mayManageLevel(mine, s.level);
          return (
            <li key={s.userId} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="staff-item" data-email={s.email} data-level={s.level}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <strong className="min-w-0 break-words text-slate-900 dark:text-slate-50">{s.name || s.email}</strong>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PILL[s.level]}`} data-testid="staff-level">{LEVEL_LABELS[s.level]}</span>
                {mine_ && <span className="text-xs text-slate-500">(you)</span>}
                <span className="text-xs text-slate-500">{s.email}</span>
                <span className={`text-xs ${s.twoStep ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`} data-testid="staff-twostep">{s.twoStep ? "Two-step on" : "Two-step not on yet"}</span>
                {s.mustChangePassword && <span className="text-xs text-slate-500">Hasn&apos;t chosen a password yet</span>}
              </div>
              {canManage && <StaffRowActions userId={s.userId} email={s.email} level={s.level as Exclude<StaffLevel, "owner">} levels={addable} managed={s.managed} hasTwoStep={s.twoStep} />}
            </li>
          );
        })}
      </ul>

      {removed.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="removed-list">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Removed people</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">They can&apos;t sign in. Delete them from the system here if they should be gone completely.</p>
          <ul className="mt-3 flex flex-col gap-3">
            {removed.map((r) => (
              <li key={r.userId} className="flex flex-col gap-2" data-testid="removed-item" data-email={r.email}>
                <div className="text-sm"><strong className="text-slate-900 dark:text-slate-50">{r.name || r.email}</strong> <span className="text-xs text-slate-500">{r.email}</span></div>
                <DeleteForever userId={r.userId} email={r.email} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {addable.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add a person</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">They get a temporary password (shown once) and choose their own when they first sign in. Someone who already has a login in this company can be given a level here by typing their email.</p>
          <AddStaffForm levels={addable} />
        </section>
      )}
    </div>
  );
}
