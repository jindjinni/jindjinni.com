import { createOrganization } from "@/app/actions/onboarding";

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Set up your company
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          You&apos;re signed in, but not attached to an organization yet.
        </p>
        <form action={createOrganization} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Company name
            </span>
            <input
              name="companyName"
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Create organization
          </button>
        </form>
      </div>
    </div>
  );
}
