"use client";

import { useActionState, useState } from "react";
import {
  createInvitation,
  createStaffLogin,
  resendInvitation,
  resetStaffPassword,
  revokeInvitation,
  saveMemberAccess,
  setMemberActive,
  type TeamActionState,
} from "@/app/actions/team";
import {
  GRANTABLE_DEPTS,
  GRANTABLE_DEPT_LABELS,
  USE_ONLY_DEPTS,
  describeAccess,
  parseAccess,
  roleBaseLevel,
  type Access,
  type GrantableDept,
} from "@/lib/permissions";
import { buildUsername, cleanLoginName } from "@/lib/staff-login";

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

/**
 * Lets the admin hand-pick what one person can see and do, department by department, on top of their role.
 * Closed by default (clean look); opens by itself for "Custom access", which starts with nothing.
 */
export function AccessPicker({ role, initial }: { role: string; initial: Access }) {
  if (role === "admin") {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Admins can see and use every department, so there is nothing to pick.</p>;
  }
  const summary = describeAccess(initial);
  return (
    <details open={role === "custom"} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100">
        Choose departments by hand
        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
          {summary ? `Extra: ${summary}` : role === "custom" ? "Nothing picked yet" : "Optional — on top of the role"}
        </span>
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {GRANTABLE_DEPTS.map((dept) => (
          <DeptChoice key={`${dept}-${role}`} dept={dept} role={role} value={initial[dept] ?? ""} />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        &ldquo;Can look&rdquo; shows the department but nothing can be changed. &ldquo;Can work&rdquo; also lets them add and edit there. HR, the Admin panel and
        manager powers (price overrides, archive) always come from the role.
      </p>
    </details>
  );
}

function DeptChoice({ dept, role, value }: { dept: GrantableDept; role: string; value: string }) {
  const base = roleBaseLevel(role, dept);
  const label = GRANTABLE_DEPT_LABELS[dept];
  const useOnly = USE_ONLY_DEPTS.includes(dept);
  const id = `access-${dept}-${Math.abs(hash(role + dept))}`;
  if (base === "work") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <span className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Already included with this role</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      <select id={id} name={`access_${dept}`} defaultValue={value} className={input}>
        {base === "view" ? <option value="">Can look (from role)</option> : <option value="">No access</option>}
        {base === "none" && !useOnly && <option value="view">Can look</option>}
        <option value="work">{useOnly ? "Can use" : "Can work"}</option>
      </select>
    </div>
  );
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

/** A staff login that was just created or reset: shown once, with a ready-to-send message. */
function CredentialsBox({ credentials }: { credentials: NonNullable<TeamActionState>["credentials"] }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!credentials) return null;
  const message = () =>
    `Sign in at ${window.location.origin}/login\nUsername: ${credentials.username}\nPassword: ${credentials.password}\nYou'll be asked to choose your own password after you sign in.`;
  async function copy(kind: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked -- the fields are selectable */
    }
  }
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40" role="status">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Save this now. The password is shown only once.</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-600 dark:text-slate-400">Username</dt>
          <dd className="mt-0.5 break-all font-mono text-slate-900 dark:text-slate-50" data-testid="cred-username">{credentials.username}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-600 dark:text-slate-400">Password</dt>
          <dd className="mt-0.5 font-mono text-slate-900 dark:text-slate-50" data-testid="cred-password">{credentials.password}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryBtn} onClick={() => copy("msg", message())}>
          {copied === "msg" ? "Copied" : "Copy sign-in message"}
        </button>
        <button type="button" className={`${primaryBtn} bg-slate-600 hover:bg-slate-700`} onClick={() => copy("pw", credentials.password)}>
          {copied === "pw" ? "Copied" : "Copy password only"}
        </button>
      </div>
    </div>
  );
}

export function AddPerson({ roles, full, limit, orgSlug }: { roles: RoleChoice[]; full: boolean; limit: number; orgSlug: string }) {
  const [mode, setMode] = useState<"invite" | "login">("invite");
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"}`;
  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="How to add them">
        <button type="button" className={tab(mode === "invite")} aria-pressed={mode === "invite"} onClick={() => setMode("invite")}>
          Invite with a link
        </button>
        <button type="button" className={tab(mode === "login")} aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          Create a username &amp; password
        </button>
      </div>
      {mode === "invite" ? (
        <InviteForm roles={roles} full={full} limit={limit} />
      ) : (
        <StaffLoginForm roles={roles} full={full} limit={limit} orgSlug={orgSlug} />
      )}
    </div>
  );
}

export function InviteForm({ roles, full, limit }: { roles: RoleChoice[]; full: boolean; limit: number }) {
  const [state, action, pending] = useActionState(createInvitation, undefined);
  const [role, setRole] = useState("purchasing_agent");
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        They get a private link (emailed if email is on, and always shown here to copy). They choose their own password.
      </p>
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
          <select id="invite-role" name="role" required value={role} onChange={(e) => setRole(e.target.value)} className={input}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <AccessPicker role={role} initial={{}} />
      <div>
        <button type="submit" disabled={pending || full} className={primaryBtn}>
          {pending ? "Sending..." : "Send invitation"}
        </button>
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

export function StaffLoginForm({ roles, full, limit, orgSlug }: { roles: RoleChoice[]; full: boolean; limit: number; orgSlug: string }) {
  const [state, action, pending] = useActionState(createStaffLogin, undefined);
  const [role, setRole] = useState("receiver");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [loginTouched, setLoginTouched] = useState(false);
  const effectiveLogin = cleanLoginName(loginTouched ? login : name.split(" ")[0] ?? "");
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        For people without an email. We make the password and show it once. They sign in on the normal sign-in page and land in your company.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="staff-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Their name
          </label>
          <input id="staff-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Lopez" className={input} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="staff-login" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Login name
          </label>
          <input
            id="staff-login"
            name="login"
            value={loginTouched ? login : effectiveLogin}
            onChange={(e) => {
              setLoginTouched(true);
              setLogin(e.target.value);
            }}
            placeholder="maria"
            autoCapitalize="none"
            spellCheck={false}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="staff-role" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Role
          </label>
          <select id="staff-role" name="role" required value={role} onChange={(e) => setRole(e.target.value)} className={input}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        They will sign in as{" "}
        <span className="break-all font-mono text-slate-900 dark:text-slate-50" data-testid="username-preview">
          {effectiveLogin.length >= 2 ? buildUsername(effectiveLogin, orgSlug) : `name_${orgSlug}`}
        </span>
      </p>
      <AccessPicker role={role} initial={{}} />
      <div>
        <button type="submit" disabled={pending || full} className={primaryBtn}>
          {pending ? "Creating..." : "Create login"}
        </button>
      </div>
      {full && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Your team is full ({limit} seats, counting pending invitations). Remove someone or cancel a pending invitation to add another person.
        </p>
      )}
      <Feedback state={state} />
      <CredentialsBox credentials={state?.credentials} />
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
  username: string | null;
  deptAccess: string | null;
  role: string;
  roleLabel: string;
  isYou: boolean;
  active: boolean;
  lastLoginAt: string | null;
  locked: boolean;
  paused: boolean;
  canReset: boolean;
  roles: RoleChoice[];
}) {
  const [accessState, saveAccess, savingAccess] = useActionState(saveMemberAccess.bind(null, props.membershipId), undefined);
  const [resetState, reset, resetting] = useActionState(resetStaffPassword.bind(null, props.membershipId), undefined);
  const [activeState, toggle, toggling] = useActionState(
    setMemberActive.bind(null, props.membershipId, !props.active),
    undefined,
  );
  const [role, setRole] = useState(props.role === "staff" ? "purchasing_agent" : props.role);
  const access = parseAccess(props.deptAccess);
  const extras = describeAccess(access);
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
            {props.paused && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Sign-in paused
              </span>
            )}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {props.username ?? props.email} &middot; Last sign-in: {lastSignIn}
          </p>
          {extras && <p className="truncate text-xs text-slate-500 dark:text-slate-400">Extra access: {extras}</p>}
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {props.roleLabel}
        </span>
      </div>

      {!props.locked && (
        <div className="flex flex-wrap items-center gap-4">
          <details className="w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
            <summary className="cursor-pointer text-sm font-medium text-emerald-700 dark:text-emerald-400">Edit access</summary>
            <form action={saveAccess} className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1 sm:max-w-xs">
                <label htmlFor={`role-${props.membershipId}`} className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Role for {props.username ?? props.email}
                </label>
                <select id={`role-${props.membershipId}`} name="role" value={role} onChange={(e) => setRole(e.target.value)} className={input}>
                  {props.roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <AccessPicker role={role} initial={access} />
              <div>
                <button className={primaryBtn} disabled={savingAccess}>
                  {savingAccess ? "Saving..." : "Save access"}
                </button>
              </div>
              <Feedback state={accessState} />
            </form>
          </details>
          <form action={toggle}>
            <button className={props.active ? dangerBtn : linkBtn} disabled={toggling}>
              {props.active ? "Turn off access" : "Turn access back on"}
            </button>
          </form>
          {props.canReset && (
            <form action={reset}>
              <button className={linkBtn} disabled={resetting}>
                {resetting ? "Resetting..." : "Reset password"}
              </button>
            </form>
          )}
        </div>
      )}
      <Feedback state={resetState ?? activeState} />
      <CredentialsBox credentials={resetState?.credentials} />
    </li>
  );
}
