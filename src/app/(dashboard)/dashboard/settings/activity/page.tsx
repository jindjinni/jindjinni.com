import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, signInEvents, users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { blockSupportStaff } from "@/lib/staff-guard";
import { ROLE_LABELS, isAdmin } from "@/lib/permissions";
import { getTeamMembers } from "@/lib/team-queries";

function when(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ActivityPage() {
  const org = await requireOrg();
  await blockSupportStaff(org);
  const mine = await db
    .select({ createdAt: signInEvents.createdAt })
    .from(signInEvents)
    .where(eq(signInEvents.userId, org.userId))
    .orderBy(desc(signInEvents.createdAt))
    .limit(10);

  const admin = isAdmin(org.role);
  const team = admin ? await getTeamMembers(org.organizationId) : [];
  const changes = admin
    ? await db
        .select({
          id: purchasingAuditLog.id,
          note: purchasingAuditLog.note,
          changedAt: purchasingAuditLog.changedAt,
          who: users.name,
          whoEmail: users.email,
        })
        .from(purchasingAuditLog)
        .leftJoin(users, eq(purchasingAuditLog.userId, users.id))
        .where(and(eq(purchasingAuditLog.organizationId, org.organizationId), inArray(purchasingAuditLog.recordType, ["team", "company"])))
        .orderBy(desc(purchasingAuditLog.changedAt))
        .limit(30)
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Security &amp; activity</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Spot anything you don&rsquo;t recognise? Change your password under My account and tell an admin.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Your recent sign-ins</h3>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sign-ins are recorded from now on.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {mine.map((m, i) => (
              <li key={m.createdAt + i} className="py-1.5 text-slate-700 dark:text-slate-300">{when(m.createdAt)}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">We record the time of each sign-in only, not your location or device.</p>
      </section>

      {admin && (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Team sign-ins</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500 dark:text-slate-400">
                  <tr><th className="py-1 pr-4 font-medium">Person</th><th className="py-1 pr-4 font-medium">Role</th><th className="py-1 font-medium">Last sign-in</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {team.map((m) => (
                    <tr key={m.membershipId} className="text-slate-700 dark:text-slate-300">
                      <td className="py-1.5 pr-4">{m.name || m.email}{m.deactivatedAt ? " (access off)" : ""}</td>
                      <td className="py-1.5 pr-4">{ROLE_LABELS[m.role] ?? m.role}</td>
                      <td className="py-1.5">{m.lastLoginAt ? when(m.lastLoginAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Recent team &amp; account changes</h3>
            {changes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {changes.map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between">
                    <span className="text-slate-800 dark:text-slate-200">{c.note}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{c.who || c.whoEmail || "System"} &middot; {when(c.changedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Price and quotation edits are in Purchasing &rarr; Audit log.</p>
          </section>
        </>
      )}
    </div>
  );
}
