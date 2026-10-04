import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewReceiving, canWriteReceiving } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";
import { ReceivingNav } from "./receiving-nav";

// Receiving is its own department: gold sidebar, full-width workspace.
export default async function ReceivingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewReceiving(org.role)) notFound();
  const showStorageNote = canWriteReceiving(org.role) && !storage.configured();

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <ReceivingNav orgName={org.organizationName} />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        {showStorageNote && (
          <p className="border-b border-amber-300 bg-amber-100 px-6 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Photo storage isn&apos;t connected yet, so photos can&apos;t be added. Everything else in Receiving works.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
