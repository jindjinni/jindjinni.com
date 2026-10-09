// The stages a feature can be in (pure, so the browser-side forms can use them too). See lib/features.ts for the rest.

export const STAGES = ["off", "mothership", "selected", "everyone"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  off: "Off",
  mothership: "Mothership only",
  selected: "Selected companies",
  everyone: "Everyone",
};

export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
/** Pure rule: does this stage show the feature to this company? */
export function stageAllows(stage: Stage, isMothership: boolean, isSelected: boolean): boolean {
  if (stage === "everyone") return true;
  if (stage === "off") return false;
  if (stage === "mothership") return isMothership;
  return isMothership || isSelected;
}

