import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { NameForm, PasswordForm } from "./account-forms";

export default async function MyAccountPage() {
  const org = await requireOrg();
  const [me] = await db
    .select({ name: users.name, email: users.email, username: users.username, termsAcceptedAt: users.termsAcceptedAt })
    .from(users)
    .where(eq(users.id, org.userId))
    .limit(1);

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

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Change password</h3>
        <PasswordForm />
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
