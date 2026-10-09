"use client";

import { useActionState } from "react";
import { addFeatureCompany, changeFeatureStage, removeFeatureCompany, type FeatureState } from "@/app/actions/features";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/feature-stages";

const btn = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60";
const btnGhost = "rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

function Feedback({ state }: { state: FeatureState }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-emerald-700 dark:text-emerald-400" data-testid="feature-ok">{state.message}</p>;
  return null;
}

const HELP: Record<Stage, string> = {
  off: "Nobody sees it.",
  mothership: "Only your own company (the Lamp) sees it. Try it here first.",
  selected: "Your own company plus the companies you pick below.",
  everyone: "Every company sees it.",
};

export function StageForm({ featureKey, stage }: { featureKey: string; stage: Stage }) {
  const [state, action, pending] = useActionState(changeFeatureStage, undefined);
  return (
    <form action={action} className="flex flex-col gap-2" data-testid={`stage-form-${featureKey}`}>
      <input type="hidden" name="key" value={featureKey} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Who sees this feature</legend>
        {STAGES.map((s) => (
          <label key={s} className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
            <input type="radio" name="stage" value={s} defaultChecked={s === stage} className="mt-1" data-testid={`stage-${featureKey}-${s}`} />
            <span><strong>{STAGE_LABELS[s]}</strong> <span className="text-slate-500 dark:text-slate-400">&mdash; {HELP[s]}</span></span>
          </label>
        ))}
      </fieldset>
      <div><button className={btn} disabled={pending} data-testid={`stage-save-${featureKey}`}>{pending ? "Saving..." : "Save"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function AddCompanyForm({ featureKey }: { featureKey: string }) {
  const [state, action, pending] = useActionState(addFeatureCompany, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid={`add-company-${featureKey}`}>
      <input type="hidden" name="key" value={featureKey} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={`pick-${featureKey}`} className="text-xs font-medium text-slate-600 dark:text-slate-400">Add a company (ID like JJ-1042, or its name)</label>
        <input id={`pick-${featureKey}`} name="company" maxLength={100} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
      </div>
      <button className={btn} disabled={pending} data-testid={`add-company-go-${featureKey}`}>{pending ? "Adding..." : "Add"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function RemoveCompanyForm({ featureKey, organizationId, name }: { featureKey: string; organizationId: string; name: string }) {
  const [, action, pending] = useActionState(removeFeatureCompany, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="key" value={featureKey} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <button className={btnGhost} disabled={pending} aria-label={`Remove ${name}`}>Remove</button>
    </form>
  );
}
