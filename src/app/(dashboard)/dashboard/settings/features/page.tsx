import { notFound } from "next/navigation";
import { listFeatures, STAGE_LABELS } from "@/lib/features";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { requireOrg } from "@/lib/tenant";
import { AddCompanyForm, RemoveCompanyForm, StageForm } from "./feature-forms";

export const dynamic = "force-dynamic";

/** Switch new features on in stages: try them on your own company (the mothership) first, then chosen companies, then everyone. */
export default async function FeatureRolloutPage() {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformAdmin(org))) notFound();
  const features = await listFeatures();
  return (
    <div className="flex max-w-3xl flex-col gap-5" data-testid="features-page">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Feature rollout</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This company is the mothership: new features go live here first. Try one yourself, then open it to a few companies, then to everyone. Switching it back to &ldquo;Mothership only&rdquo; or &ldquo;Off&rdquo; hides it again right away.
        </p>
      </div>
      {features.map((f) => (
        <section key={f.key} className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid={`feature-${f.key}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{f.label}</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid={`feature-stage-${f.key}`}>{STAGE_LABELS[f.stage]}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{f.blurb}</p>
          <div className="mt-3"><StageForm featureKey={f.key} stage={f.stage} /></div>
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-50">Selected companies</h4>
            {f.companies.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">None picked.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1" data-testid={`picked-${f.key}`}>
                {f.companies.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{c.name} <span className="font-mono text-xs text-slate-500">{c.code ?? ""}</span></span>
                    <RemoveCompanyForm featureKey={f.key} organizationId={c.id} name={c.name} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3"><AddCompanyForm featureKey={f.key} /></div>
            {f.stage !== "selected" && f.companies.length > 0 && <p className="mt-2 text-xs text-slate-500">These only take effect when the stage is &ldquo;Selected companies&rdquo;.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
