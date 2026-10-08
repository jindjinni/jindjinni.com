import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, businessVerifications, organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin, isOwner } from "@/lib/permissions";
import { stateName } from "@/lib/business-verification";
import { TONE_CLASS, accountStatusText, paymentStatusText } from "@/lib/account-status";
import { UpdateFilingForm } from "./update-filing-form";

export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** The company's own mini profile: contact details, registration details, account status and payment status. Owners and admins only. */
export default async function CompanyProfilePage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>;
  }
  const [o] = await db
    .select({
      name: organizations.name,
      status: organizations.approvalStatus,
      createdAt: organizations.createdAt,
      plan: organizations.billingPlan,
      paymentStatus: organizations.paymentStatus,
      paymentGraceEndsAt: organizations.paymentGraceEndsAt,
      lastPaymentAt: organizations.lastPaymentAt,
    })
    .from(organizations)
    .where(eq(organizations.id, org.organizationId))
    .limit(1);
  const [p] = await db.select().from(businessProfiles).where(eq(businessProfiles.organizationId, org.organizationId)).limit(1);
  // Never select the proof document itself here.
  const [v] = await db
    .select({
      ein: businessVerifications.ein,
      state: businessVerifications.registeredState,
      entityType: businessVerifications.entityType,
      file: businessVerifications.stateFileNumber,
      year: businessVerifications.yearFormed,
      kind: businessVerifications.businessType,
      updatedAt: businessVerifications.updatedAt,
    })
    .from(businessVerifications)
    .where(eq(businessVerifications.organizationId, org.organizationId))
    .limit(1);

  const account = accountStatusText(o?.status ?? null);
  const payment = paymentStatusText({ paymentStatus: o?.paymentStatus ?? null, paymentGraceEndsAt: o?.paymentGraceEndsAt ?? null, lastPaymentAt: o?.lastPaymentAt ?? null });
  const sec = "rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
  const dl = "grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm";
  const dt = "text-slate-500 dark:text-slate-400";
  const dd = "text-slate-900 dark:text-slate-50";
  const address = [p?.businessAddressStreet1, p?.businessAddressStreet2, p?.businessAddressCity, p?.businessAddressState, p?.businessAddressZip].filter(Boolean).join(", ");
  const contact = [p?.primaryContactFirstName, p?.primaryContactLastName].filter(Boolean).join(" ");

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="company-profile">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Company profile</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything we have on file for {o?.name}, and where your account stands.</p>
      </div>

      <section className={`${sec} grid gap-4 sm:grid-cols-2`}>
        <div data-testid="account-status">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Account status</p>
          <p className="mt-1"><span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${TONE_CLASS[account.tone]}`}>{account.label}</span></p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{account.text}</p>
        </div>
        <div data-testid="payment-status">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Payment status</p>
          <p className="mt-1"><span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${TONE_CLASS[payment.tone]}`}>{payment.label}</span></p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{payment.text}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Plan chosen: {o?.plan === "monthly" ? "Monthly" : o?.plan === "yearly" ? "Yearly" : "none yet"}. See <Link href="/dashboard/settings/billing" className="underline">Plan &amp; billing</Link>.
          </p>
        </div>
      </section>

      <section className={sec}>
        <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-50">Company details</h3>
        <dl className={dl}>
          <dt className={dt}>Legal name</dt><dd className={dd}>{o?.name}</dd>
          {p?.dbaName && (<><dt className={dt}>Doing business as</dt><dd className={dd}>{p.dbaName}</dd></>)}
          <dt className={dt}>Address</dt><dd className={dd}>{address || "—"}</dd>
          <dt className={dt}>Phone</dt><dd className={dd}>{p?.businessPhone || "—"}</dd>
          <dt className={dt}>Business email</dt><dd className={dd}>{p?.businessEmail || "—"}</dd>
          {p?.website && (<><dt className={dt}>Website</dt><dd className={dd}>{p.website}</dd></>)}
          <dt className={dt}>Company since</dt><dd className={dd}>{day(o?.createdAt ?? null)}</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Change these in <Link href="/dashboard/settings/business-profile" className="underline">Business profile</Link>.</p>
      </section>

      <section className={sec}>
        <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-50">Primary contact</h3>
        <dl className={dl}>
          <dt className={dt}>Name</dt><dd className={dd}>{contact || "—"}</dd>
          <dt className={dt}>Phone</dt><dd className={dd}>{p?.primaryContactPhone || "—"}</dd>
          <dt className={dt}>Email</dt><dd className={dd}>{p?.primaryContactEmail || "—"}</dd>
        </dl>
      </section>

      <section className={sec} data-testid="registration">
        <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-50">Business registration</h3>
        {v ? (
          <>
            <dl className={dl}>
              <dt className={dt}>EIN</dt><dd className={dd} data-testid="profile-ein">{v.ein}</dd>
              <dt className={dt}>State registered in</dt><dd className={dd}>{stateName(v.state)}</dd>
              <dt className={dt}>Business structure</dt><dd className={dd}>{v.entityType}</dd>
              <dt className={dt}>State file number</dt><dd className={dd} data-testid="profile-file">{v.file}</dd>
              <dt className={dt}>Year formed</dt><dd className={dd}>{v.year}</dd>
              <dt className={dt}>Kind of business</dt><dd className={dd}>{v.kind}</dd>
              <dt className={dt}>Last updated</dt><dd className={dd}>{day(v.updatedAt)}</dd>
            </dl>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              We only work with active companies. We check your business against your state&rsquo;s records from time to time, and if it is no longer active and in good standing with the state, your account can be suspended until it is active again.
            </p>
            {isOwner(org.role) ? (
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <UpdateFilingForm current={v.file} />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">To change your EIN or legal business name, contact support. Those need to be checked against your documents.</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Only the company&rsquo;s owner can update the registration number.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">This company was set up before business verification existed, so there are no registration details on file yet.</p>
        )}
      </section>
    </div>
  );
}
