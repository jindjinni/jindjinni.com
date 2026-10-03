import { requireOrg } from "@/lib/tenant";

/**
 * Placeholder for the business Profile tab. Deliberately empty for now --
 * the fields this page should collect (everything a business must set up
 * to operate on the platform) are coming in a follow-up spec from the
 * user, rather than being carried over from the old Business settings
 * page. Once that spec arrives, build the real form/fields here.
 */
export default async function ProfilePage() {
  const org = await requireOrg();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Profile</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Business profile for {org.organizationName}.
      </p>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
        Nothing set up here yet -- this will hold the business details and setup requirements once they&rsquo;re defined.
      </div>
    </div>
  );
}
