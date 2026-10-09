// Separate operations under one company: the pure rules (no database). See operation-groups.ts for the part that talks to the database.
//
// A company can run two operations, Wholesale and Distribution. Each is its own workspace (its own organization row, linked to the
// company's main row), so nothing operational is shared between them. Signing in with one workspace goes straight in; with two, the
// person picks which one to open (or the read-only Overall status).

export const KINDS = ["wholesale", "distribution"] as const;
export type OperationKind = (typeof KINDS)[number];

export function parseKind(v: unknown): OperationKind | null {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v) ? (v as OperationKind) : null;
}

export const kindLabel = (k: OperationKind | null | undefined) => (k === "wholesale" ? "Wholesale" : k === "distribution" ? "Distribution" : "Not chosen yet");
export const otherKind = (k: OperationKind): OperationKind => (k === "wholesale" ? "distribution" : "wholesale");

export const COOKIE_NAME = "jj_workspace";

/** One workspace a person can open: where they have an active membership. `rootId` = the company's main row (itself when it is the main one). */
export type Workspace = { organizationId: string; rootId: string; kind: OperationKind | null; role: string; companyName: string };

export type Pick = { action: "open"; organizationId: string } | { action: "choose" };

/**
 * Which workspace to open. A remembered choice (cookie) wins when the person still has access to it. A single workspace opens
 * straight away. Two or more workspaces of the SAME company, with nothing remembered, ask. Unrelated companies keep the older rule
 * (the first one), so nobody is surprised by a screen they never had.
 */
export function pickWorkspace(list: Workspace[], remembered: string | null | undefined): Pick | null {
  if (!list.length) return null;
  if (remembered && list.some((w) => w.organizationId === remembered)) return { action: "open", organizationId: remembered };
  if (list.length === 1) return { action: "open", organizationId: list[0].organizationId };
  const perCompany = new Map<string, number>();
  for (const w of list) perCompany.set(w.rootId, (perCompany.get(w.rootId) ?? 0) + 1);
  if ([...perCompany.values()].some((n) => n > 1)) return { action: "choose" };
  return { action: "open", organizationId: list[0].organizationId };
}

/** What to show in the header and on the picker: "Acme" for a single workspace, "Acme · Wholesale" when the company has two. */
export function workspaceTitle(companyName: string, kind: OperationKind | null, hasSibling: boolean): string {
  return hasSibling && kind ? `${companyName} · ${kindLabel(kind)}` : companyName;
}

/** Why the second operation cannot be added right now, or null when it can. `existing` = the kinds the company already has. */
export function addOperationBlocker(current: OperationKind | null, existing: OperationKind[], wanted: OperationKind, canManage: boolean): string | null {
  if (!canManage) return "Only an owner or admin can add an operation.";
  if (!current) return "Choose what your current records are (Wholesale or Distribution) first. Then you can add the other operation.";
  if (existing.includes(wanted)) return `${kindLabel(wanted)} is already set up.`;
  if (wanted === current) return `${kindLabel(wanted)} is already set up.`;
  return null;
}

/** A person may work in a workspace only when they have an active membership in it (checked again on the server for every switch). */
export const mayOpen = (list: Workspace[], organizationId: string) => list.some((w) => w.organizationId === organizationId);

/** The older three-way answer a single operation corresponds to (kept in step so older menus keep working). */
export const typeFromKind = (k: OperationKind): "WHOLESALER" | "DISTRIBUTOR" => (k === "wholesale" ? "WHOLESALER" : "DISTRIBUTOR");

/** The workspace a new company's main row becomes: Wholesale or Distribution as chosen; "Both" starts with Wholesale and adds Distribution next to it. */
export const firstKindFor = (type: "WHOLESALER" | "DISTRIBUTOR" | "BOTH"): OperationKind => (type === "DISTRIBUTOR" ? "distribution" : "wholesale");
