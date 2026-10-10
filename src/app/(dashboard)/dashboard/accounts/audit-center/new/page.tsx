import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { auditAccess } from "@/lib/audit-access";
import { BUILT_TYPES, TYPE_BLURB, TYPE_LABEL, isAuditType } from "@/lib/audit-rules";
import { searchPharmacies } from "@/lib/audit-service";
import { auditorTitle } from "@/lib/audit-insights";
import { listAuditors } from "@/lib/audit-insights-service";
import { billingDateOf } from "@/lib/billing-schedule";
import { NewAuditForm } from "./new-audit-form";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

// Start an audit: pick the pharmacy and the dates the auditor asked for, answer the device question, attach their request. The case is then
// saved and opens with the preview.
export default async function NewAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const acc = await auditAccess(org);
  if (!acc.allowed || !acc.canWork) notFound();
  const raw = (await searchParams).type;
  const type = Array.isArray(raw) ? raw[0] : raw;
  if (!isAuditType(type) || !BUILT_TYPES.includes(type)) notFound();
  const [pharmacies, saved] = await Promise.all([searchPharmacies(org.organizationId, ""), listAuditors(org.organizationId)]);
  const auditors = saved.map((a) => ({ id: a.id, kind: a.kind, title: auditorTitle(a), name: a.name ?? "", company: a.company ?? "", email: a.email ?? "", phone: a.phone ?? "" }));
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/dashboard/accounts/audit-center" className="text-sm text-emerald-800 underline dark:text-emerald-300">← Audit Center</Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">New {TYPE_LABEL[type]}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{TYPE_BLURB[type]}</p>
      </div>
      <NewAuditForm type={type} pharmacies={pharmacies} today={billingDateOf()} auditors={auditors} />
    </div>
  );
}
