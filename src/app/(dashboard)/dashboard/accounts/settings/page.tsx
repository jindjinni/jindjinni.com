import { requireOrg } from "@/lib/tenant";
import { canViewAccounts, isAdmin } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { accountsClosureDays } from "@/db/schema";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn, usFederalHolidays } from "@/lib/payment-due";
import { PaymentTermsForm } from "./payment-terms-form";

export const dynamic = "force-dynamic";

// Payment Terms (Setup): how many business days after a package is delivered the customer must be paid. Everyone in
// Accounts can see the terms; only an owner or admin changes them.
export default async function PaymentTermsPage() {
  const org = await requireOrg();
  if (!canViewAccounts(org.role, org.access)) notFound();
  const terms = await getPaymentTerms(org.organizationId);
  const closures = await db
    .select({ id: accountsClosureDays.id, day: accountsClosureDays.day, label: accountsClosureDays.label })
    .from(accountsClosureDays)
    .where(eq(accountsClosureDays.organizationId, org.organizationId))
    .orderBy(asc(accountsClosureDays.day));
  const today = todayIn(terms.timeZone);
  const year = Number(today.slice(0, 4));
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Payment Terms</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        How long you have to pay a customer once their package is delivered. To Be Paid is sorted by the due date this works out.
      </p>
      <PaymentTermsForm
        canEdit={isAdmin(org.role)}
        initial={{ businessDays: terms.businessDays, skipUsHolidays: terms.skipUsHolidays, timeZone: terms.timeZone }}
        closures={closures}
        today={today}
        holidays={[year, year + 1].map((y) => ({ year: y, list: usFederalHolidays(y) }))}
      />
    </div>
  );
}
