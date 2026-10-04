"use client";

import { useActionState, useState } from "react";
import {
  changeMemberRole,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  setMemberActive,
  type TeamActionState,
} from "@/app/actions/team";

type RoleChoice = { value: string; label: string };

const input =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";
const primaryBtn =
  "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const linkBtn =
  "text-sm font-medium text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-400";
const dangerBtn = "text-sm font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400";

function Feedback({ state }: { state: TeamActionState }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state.message) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>;
  return null;
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-800 sm:flex-row sm:items-center">
      <input
        id="invite-link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className={`${input} min-w-0 flex-1 font-mono text-xs`}
        aria-label="Invitation link"
      />
      <button
        type="button"
        className={primaryBtn}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard blocked -- the field above is selectable */
          }
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function InviteForm({ roles, full, limit }: { roles: RoleChoice[]; full: boolean; limit: number }) {
  const [state, action, pending] = useActionState(createInvitation, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="invite-email" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Email address
          </label>
          <input id="invite-email" name="email" type="email" required placeholder="name@company.com" className={input} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-role" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Role
          </label>
          <select id="invite-role" name="role" required defaultValue="purchasing_agent" className={input}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={pending || full} className={primaryBtn}>
            {pending ? "Sending..." : "Send invitation"}
          </button>
        </div>
      </div>
      {full && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Your team is full ({limit} seats, counting pending invitations). Remove someone or cancel a pending invitation to invite another person.
        </p>
      )}
      <Feedback state={state} />
      {state?.inviteLink && <CopyLink link={state.inviteLink} />}
    </form>
  );
}

export function InvitationRow(props: {
  id: string;
  email: string;
  roleLabel: string;
  expired: boolean;
  expiresAt: string;
}) {
  const [resendState, resend, resending] = useActionState(resendInvitation.bind(null, props.id), undefined);
  const [revokeState, revoke, revoking] = useActionState(revokeInvitation.bind(null, props.id), undefined);
  const expires = new Date(props.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{props.email}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {props.roleLabel} &middot;{" "}
            {props.expired ? (
              <span className="text-amber-700 dark:text-amber-400">Expired {expires}</span>
            ) : (
              <>Expires {expires}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <form action={resend}>
            <button className={linkBtn} disabled={resending}>
              {props.expired ? "Reopen & send new link" : "Send new link"}
            </button>
          </form>
          <form action={revoke}>
            <button className={dangerBtn} disabled={revoking}>
              Cancel
            </button>
          </form>
        </div>
      </div>
      <Feedback state={resendState ?? revokeState} />
      {resendState?.inviteLink && <CopyLink link={resendState.inviteLink} />}
    </li>
  );
}

export function MemberRow(props: {
  membershipId: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  isYou: boolean;
  active: boolean;
  lastLoginAt: string | null;
  roles: RoleChoice[];
  locked: boolean;
}) {
  const [roleState, changeRole, savingRole] = useActionState(changeMemberRole.bind(null, props.membershipId), undefined);
  const [activeState, toggle, toggling] = useActionState(
    setMemberActive.bind(null, props.membershipId, !props.active),
    undefined,
  );
  const lastSignIn = props.lastLoginAt
    ? new Date(props.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Never";
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
            {props.name}
            {props.isYou && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
            {!props.active && (
              <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                Access off
              </span>
            )}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {props.email} &middot; Last sign-in: {lastSignIn}
          </p>
        </div>

        {props.locked ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            {props.roleLabel}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <form action={changeRole} className="flex items-center gap-2">
              <label htmlFor={`role-${props.membershipId}`} className="sr-only">
                Role for {props.email}
              </label>
              <select
                id={`role-${props.membershipId}`}
                name="role"
                defaultValue={props.role === "staff" ? "purchasing_agent" : props.role}
                className={input}
              >
                {props.roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button className={linkBtn} disabled={savingRole}>
                Save
              </button>
            </form>
            <form action={toggle}>
              <button className={props.active ? dangerBtn : linkBtn} disabled={toggling}>
                {props.active ? "Turn off access" : "Turn access back on"}
              </button>
            </form>
          </div>
        )}
      </div>
      <Feedback state={roleState ?? activeState} />
    </li>
  );
}
