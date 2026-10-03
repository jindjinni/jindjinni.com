import { randomUUID } from "crypto";

/** Prefixed ids (e.g. "org_3f1c2b...") -- self-describing in logs and DB browsers. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
