import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { getEmailDraft } from "@/lib/customer-service-queries";
import { Composer } from "./composer";

export const dynamic = "force-dynamic";

// One order in Customer Service: the email exactly as the customer will get it, what is attached, and the Send button.
export default async function CustomerServiceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();
  const draft = await getEmailDraft(org, id);
  if (!draft) notFound();
  return (
    <div className="max-w-4xl">
      <Link href={draft.alreadyEmailed ? "/dashboard/customer-service/emailed" : "/dashboard/customer-service"} className="text-sm text-emerald-800 underline dark:text-emerald-300">
        ‹ {draft.alreadyEmailed ? "Emailed" : "To Be Emailed"}
      </Link>
      <Composer draft={draft} />
    </div>
  );
}
