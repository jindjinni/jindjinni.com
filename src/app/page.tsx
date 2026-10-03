import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        Phase 1 scaffold
      </span>
      <h1 className="mt-4 max-w-xl text-3xl font-semibold text-slate-900 dark:text-slate-50">
        Inventory and invoicing for resellers of conditioned goods
      </h1>
      <p className="mt-3 max-w-md text-slate-500 dark:text-slate-400">
        Ledger-based stock tracking by condition, sequential invoicing, one
        organization per company -- built from the ground up to be sold to
        more than one business.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:text-slate-300"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
