// The one-word state of each product on the simplified Recall check screen. Pure: the screen and the tests share it.

import { activeRecallHits, isClearingCheck } from "@/lib/receiving-recall";

export type RowStatus = { key: "recalled" | "look" | "needs" | "checked" | "cleared" | "none"; label: string; tone: "bad" | "warn" | "ok" | "muted" };

type CheckLike = { result: string; enteredNumber?: string | null; recallId?: string | null; note?: string | null };
type RecallLike = { id: string; numberCount: number; prefixCount: number };

/**
 * `recalls` are the active recalls that apply to this product (by name); `checks` are the checks made on this row.
 * A recall with a list loaded needs one lot or serial checked; one with no list needs the manufacturer page's answer.
 */
export function rowCheckStatus(recalls: RecallLike[], checks: CheckLike[]): RowStatus {
  if (activeRecallHits(checks).length > 0) return { key: "recalled", label: "Recalled", tone: "bad" };
  const answered = checks.some((c) => c.result === "CONFIRMED_OK" || c.result === "CONFIRMED_AFFECTED");
  if (!answered && checks.some((c) => c.note?.startsWith("NEAR:"))) return { key: "look", label: "Look closer", tone: "warn" };
  const open = recalls.filter((r) =>
    r.numberCount + r.prefixCount > 0
      ? !checks.some((c) => c.result === "ON_LIST" || c.result === "NOT_ON_LIST" || c.recallId === r.id)
      : !checks.some((c) => c.recallId === r.id && (c.result === "CONFIRMED_OK" || c.result === "CONFIRMED_AFFECTED")),
  );
  if (open.length > 0) return { key: "needs", label: "Needs a check", tone: "warn" };
  if (checks.some(isClearingCheck)) return { key: "cleared", label: "Cleared", tone: "ok" };
  if (checks.length > 0) return { key: "checked", label: "Checked", tone: "ok" };
  return { key: "none", label: "No recall to check", tone: "muted" };
}
