import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { EmailForm, NameForm, PasswordForm } from "./account-forms";
import { FinishSetupForm, NewCodesForm, StartSetupForm, TurnOffForm } from "./two-step-forms";
import { decryptToken } from "@/lib/email-connector-crypto";
import { qrSvg } from "@/lib/qr";
import { otpauthUri, parseHashes } from "@/lib/totp";
import { hasTwoStep } from "@/lib/two-step";

export default async function MyAccountPage() {
  const org = await requireOrg();
  const [me] = await db
    .select({ name: users.name, email: users.email, username: users.username, termsAcceptedAt: users.termsAcceptedAt, totpSecret: users.totpSecret, totpEnabledAt: users.totpEnabledAt, totpBackupCodes: users.totpBackupCodes })
    .from(users)
    .where(eq(users.id, org.userId))
    .limit(1);

  const twoStepOn = !!me && hasTwoStep(me);
  // A setup that was started but not finished: show its picture again so a page reload doesn't lose it.
  const pendingSecret = me && !twoStepOn && me.totpSecret ? decryptToken(me.totpSecret) : null;
  const pendingSvg = pendingSecret ? qrSvg(otpauthUri("jindjinni", me?.username ?? me?.email ?? "account", pendingSecret)) : null;
  const codesLeft = parseHashes(me?.totpBackupCodes).length;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">My account</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your own sign-in details. Only you can change these.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{me?.username ? "Username (your sign-in)" : "Email (your sign-in)"}</dt>
            <dd className="mt-1 break-all text-slate-900 dark:text-slate-50">{me?.username ?? me?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Company</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-50">{org.organizationName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Your role</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-50">
              {ROLE_LABELS[org.role]} <span className="text-slate-500 dark:text-slate-400">&mdash; {ROLE_DESCRIPTIONS[org.role]}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          To change your sign-in name or role, ask an admin.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Your name</h3>
        <NameForm name={me?.name ?? ""} />
      </section>

      {!me?.username && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="email-section">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Change sign-in email</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            We send a 6-digit code to the new address to prove it is yours, and tell your old address afterwards. You will be signed out and sign in again with the new email.
          </p>
          <EmailForm />
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Change password</h3>
        <PasswordForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="twostep-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Two-step sign-in</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${twoStepOn ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`} data-testid="twostep-status">
            {twoStepOn ? "On" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Adds a second lock: after your password, you type a 6-digit code from an app on your phone. Even if someone learns your password, they can&apos;t get in.
        </p>
        {twoStepOn ? (
          <>
            <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" data-testid="twostep-codes-left">You have {codesLeft} backup code{codesLeft === 1 ? "" : "s"} left.</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">Make new backup codes</summary>
              <NewCodesForm />
            </details>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">Turn off</summary>
              <TurnOffForm />
            </details>
          </>
        ) : pendingSecret ? (
          <FinishSetupForm secret={pendingSecret} svg={pendingSvg} />
        ) : (
          <StartSetupForm />
        )}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {me?.termsAcceptedAt
          ? `You agreed to the Terms of Service and Privacy Policy on ${new Date(me.termsAcceptedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. `
          : ""}
        <a href="/terms" className="underline">Terms of Service</a> &middot; <a href="/privacy" className="underline">Privacy Policy</a> &middot;{" "}
        <a href="/acceptable-use" className="underline">Acceptable Use</a> &middot; <a href="/security" className="underline">Security</a>
      </p>
    </div>
  );
}
