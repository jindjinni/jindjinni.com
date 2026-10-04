import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, isAdmin } from "@/lib/permissions";
import { getSeatUsage } from "@/lib/seats";
import { getOpenInvitations, getTeamMembers } from "@/lib/team-queries";
import { InviteForm, InvitationRow, MemberRow } from "./team-forms";

/**
 * Admin -> Team. Owner and Admins invite people, choose what each role can
 * do, and switch access on or off. Everything here is re-checked on the
 * server in actions/team.ts; this page just hides it from people who
 * shouldn't see it.
 */
export default async function AdminPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) redirect("/dashboard");

  const [members, invitations, seats] = await Promise.all([
    getTeamMembers(org.organizationId),
    getOpenInvitations(org.organizationId),
    getSeatUsage(org.organizationId),
  ]);
  const isOwner = org.role === "owner";
  const roleChoices = ASSIGNABLE_ROLES.filter((r) => isOwner || r !== "admin").map((r) => ({
    value: r,
    label: ROLE_LABELS[r],
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Team &amp; access</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Invite people to your workspace and choose what each of them can do.
        </p>
        <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {seats.unlimited
            ? `${seats.used} on your team · no limit`
            : `${seats.used} of ${seats.limit} seats used${seats.pendingInvites ? ` (${seats.pendingInvites} pending invite${seats.pendingInvites === 1 ? "" : "s"})` : ""}`}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Invite someone</h2>
        <InviteForm roles={roleChoices} full={seats.full} limit={seats.limit} />
      </section>

      {invitations.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-50">Pending invitations</h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {invitations.map((inv) => (
              <InvitationRow
                key={inv.id}
                id={inv.id}
                email={inv.email}
                roleLabel={ROLE_LABELS[inv.role]}
                expired={inv.expired}
                expiresAt={inv.expiresAt}
              />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-50">Team</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {members.map((m) => {
            const locked =
              m.userId === org.userId || m.role === "owner" || (m.role === "admin" && !isOwner);
            return (
              <MemberRow
                key={m.membershipId}
                membershipId={m.membershipId}
                name={m.name || m.email}
                email={m.email}
                role={m.role}
                roleLabel={ROLE_LABELS[m.role] ?? m.role}
                isYou={m.userId === org.userId}
                active={!m.deactivatedAt}
                lastLoginAt={m.lastLoginAt}
                roles={roleChoices}
                locked={locked}
              />
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">What each role can do</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {(["owner", ...ASSIGNABLE_ROLES] as const).map((r) => (
            <div key={r}>
              <dt className="font-medium text-slate-900 dark:text-slate-50">{ROLE_LABELS[r]}</dt>
              <dd className="text-slate-500 dark:text-slate-400">{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
