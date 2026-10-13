// Receiving Intake Form: the pick lists. Instead of typing, the receiving agent ticks what applies in each list and may add one
// custom note at the end of any list. Pure; reads and writes nothing.
//
// The standard lists live here in code, so every company (new or existing) has them the moment the feature is on for it. A company
// changes only its own copy (Receiving -> Form settings): it can hide an option it never uses and add options of its own
// (see receiving-form-config.ts). What an agent ticked is saved on the shipment as the option WORDS, so a record never changes
// meaning if the lists change later.
//
// The old free-text fields (damage notes, packaging issue notes, adjustment details, receiving notes) are still filled in, from the
// picks, by `legacyFromPicks`. That keeps the missing-info rules, Accounts, Customer Service, the adjustment quotation and the
// customer emails working exactly as before.

import type { ReceivingFormConfig } from "@/lib/receiving-form-config";

export const PICK_SECTION_KEYS = ["packaging", "damage", "adjustment", "outcome", "adjOutcome", "warning"] as const;
export type PickSectionKey = (typeof PICK_SECTION_KEYS)[number];

export type PickSectionDef = {
  key: PickSectionKey;
  title: string;
  /** One line under the title: when to use this list. */
  help: string;
  /** Labels that stand alone: ticking one clears the others in the list (and ticking another clears it). */
  exclusive: string[];
  options: string[];
};

export const PICK_SECTIONS: readonly PickSectionDef[] = [
  {
    key: "packaging",
    title: "Packaging issues",
    help: "Use when the customer did not follow the shipping and packaging instructions. Tick all that apply.",
    exclusive: [],
    options: [
      "Not Double Boxed",
      "Shipping Boxes Not Sturdy",
      "Flimsy Shipping Box Used",
      "Crushed Shipping Box",
      "Recycled Box Used",
      "Amazon Box Used – Prohibited",
      "Supplies Not Properly Secured",
      "Insufficient Bubble Wrap / Protection",
      "Bubble Wrap / Wrapping Paper Not Clean",
      "Dirty Packaging Materials",
      "Strong Cigarette / Nicotine Odor",
      "Strong Unusual Odor",
      "Signs of Insect Infestation",
      "Shipping Label Not Securely Attached",
      "Packaging Instructions Not Followed",
    ],
  },
  {
    key: "damage",
    title: "Damage noted",
    help: "Use to record the physical condition of the product boxes received. Tick every condition found.",
    exclusive: ["No Damage"],
    options: [
      "No Damage",
      "Minor Dent / Ding",
      "Major Dent / Ding",
      "Crushed Box",
      "Torn / Ripped Box",
      "Stained Box",
      "Discolored / Faded Box",
      "Sticky Residue",
      "Damaged Seal",
      "Opened / Tampered Packaging",
      "Missing Contents",
      "Hidden Damage Found Under Label",
      "Multiple Damaged Boxes",
      "Severe Damage – Cannot Accept",
    ],
  },
  {
    key: "adjustment",
    title: "Adjustment details",
    help: "Use when the quotation or payment amount needs to change because of what was actually received. Ticking one sets Adjustment Needed to Yes.",
    exclusive: [],
    options: [
      "Damaged – Tear / Rip",
      "Damaged – Stain",
      "Damaged – Crushed",
      "Damaged – Dent / Ding",
      "Damaged – Discoloration",
      "Damaged – Sticky Residue",
      "Missing Pods / Contents – Return Required",
      "Opened / Tampered Item – Cannot Accept",
      "Broken / Damaged Seal – Cannot Accept",
      "Expired – Cannot Accept",
      "Short-Dated – Cannot Accept",
      "Unauthorized / Unapproved Item",
      "Recalled Item – Cannot Accept",
      "Wrong Product Type",
      "Wrong Product Code",
      "Wrong Expiration Date",
      "Wrong Condition Selected",
      "Quantity Received Does Not Match Quotation",
      "Extra Item Received – Add to Quotation",
      "Item Not Listed on Quotation",
      "Item Not Currently Accepted",
      "Return Required",
    ],
  },
  {
    key: "outcome",
    title: "Receiving outcome",
    help: "Use for the final receiving assessment. Tick what describes this shipment.",
    exclusive: ["GOOD TO GO – Everything Received in Acceptable Condition"],
    options: [
      "GOOD TO GO – Everything Received in Acceptable Condition",
      "Customer Followed Packaging Instructions – No Issues",
      "Customer Did Not Follow Packaging Instructions – No Damage This Time",
      "Customer Did Not Follow Packaging Instructions – Supplies Arrived Damaged",
      "Customer Followed Packaging Instructions – Supplies Still Arrived Damaged",
      "Customer Packaging Caused Damage in Transit",
      "Quotation Quantity Does Not Match Quantity Received",
      "Product Received Does Not Match Quotation",
      "Expiration Received Does Not Match Quotation",
      "Condition Received Does Not Match Quotation",
      "Extra Item(s) Received",
      "Missing Item(s) From Quotation",
      "Quotation Adjustment Required",
      "No Quotation Adjustment Required",
      "Item(s) Need to Be Returned",
      "Item(s) Cannot Be Accepted",
      "Courtesy Pass Given – No Adjustment This Time",
      "Formal Warning Required",
      "Final Warning Required",
    ],
  },
  {
    key: "adjOutcome",
    title: "Recommended adjustment outcome",
    help: "Tell Accounts exactly what needs to happen, without typing.",
    exclusive: ["No Adjustment"],
    options: [
      "No Adjustment",
      "Courtesy Pass – Full Amount",
      "Price Adjustment Required",
      "Up to 50% Deduction",
      "Item Removed From Quotation",
      "Item Added to Quotation",
      "Quantity Adjusted",
      "Expiration Price Adjusted",
      "Product Code Price Adjusted",
      "Condition Price Adjusted",
      "Return Item to Customer",
      "Return at Customer Expense",
      "One-Time Courtesy Return",
      "Reject Item",
      "Send to Accounts for Review",
      "Management Review Required",
    ],
  },
  {
    key: "warning",
    title: "Customer warning level",
    help: "Records which customer message fits. Nothing is sent to the customer from this list.",
    exclusive: ["No Warning Needed"],
    options: [
      "No Warning Needed",
      "Friendly Reminder",
      "Courtesy Warning",
      "Formal Warning",
      "Final Warning",
      "Customer May Not Be the Right Fit",
      "Management Review Before Future Transactions",
    ],
  },
];

export const PICK_SECTION_BY_KEY: Record<PickSectionKey, PickSectionDef> = Object.fromEntries(PICK_SECTIONS.map((s) => [s.key, s])) as Record<PickSectionKey, PickSectionDef>;

/** The words on the "Custom note" tab of each list. */
export const CUSTOM_NOTE_LABEL: Record<PickSectionKey, string> = {
  packaging: "Custom packaging note",
  damage: "Custom damage note",
  adjustment: "Custom adjustment note",
  outcome: "Custom receiving note",
  adjOutcome: "Custom adjustment outcome note",
  warning: "Custom warning note",
};

export const MAX_EXTRA_PER_SECTION = 40;
export const MAX_LABEL = 90;
export const MAX_CUSTOM = 1000;

/** A short id for an option, stable for a given wording. Used to remember which standard options a company hid. */
export const slug = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
export const pickId = (section: PickSectionKey, label: string): string => `${section}:${slug(label)}`;

export type PickOption = { label: string; own: boolean };

/** The options one company's agents see in a list: the standard ones it kept, then the ones it added. */
export function optionsFor(section: PickSectionKey, cfg: Pick<ReceivingFormConfig, "hiddenPicks" | "extraPicks"> | null | undefined): PickOption[] {
  const hidden = new Set(cfg?.hiddenPicks ?? []);
  const out: PickOption[] = PICK_SECTION_BY_KEY[section].options.filter((l) => !hidden.has(pickId(section, l))).map((label) => ({ label, own: false }));
  const have = new Set(out.map((o) => o.label.toLowerCase()));
  for (const label of cfg?.extraPicks?.[section] ?? []) {
    if (have.has(label.toLowerCase())) continue;
    have.add(label.toLowerCase());
    out.push({ label, own: true });
  }
  return out;
}

/** Every wording a company's list could ever hold (kept or hidden), so an old tick is never thrown away. */
export function knownLabels(section: PickSectionKey, cfg: Pick<ReceivingFormConfig, "extraPicks"> | null | undefined): Set<string> {
  return new Set([...PICK_SECTION_BY_KEY[section].options, ...(cfg?.extraPicks?.[section] ?? [])]);
}

// ---- what is saved on a shipment ----------------------------------------------------------------------------------

export type PickState = { [K in PickSectionKey]: string[] } & { custom: { [K in PickSectionKey]: string } };

export const emptyPicks = (): PickState => ({
  packaging: [], damage: [], adjustment: [], outcome: [], adjOutcome: [], warning: [],
  custom: { packaging: "", damage: "", adjustment: "", outcome: "", adjOutcome: "", warning: "" },
});

export const picksEmpty = (p: PickState): boolean => PICK_SECTION_KEYS.every((k) => p[k].length === 0 && !p.custom[k].trim());

/** Reads saved or submitted picks. Unknown words are dropped, exclusive options win, text is trimmed. */
export function cleanPicks(raw: unknown, cfg?: Pick<ReceivingFormConfig, "extraPicks"> | null): PickState {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const out = emptyPicks();
  if (!v || typeof v !== "object") return out;
  const o = v as Record<string, unknown>;
  const custom = o.custom && typeof o.custom === "object" ? (o.custom as Record<string, unknown>) : {};
  for (const key of PICK_SECTION_KEYS) {
    const known = knownLabels(key, cfg);
    const given = Array.isArray(o[key]) ? (o[key] as unknown[]).filter((x): x is string => typeof x === "string" && known.has(x)) : [];
    const unique = [...new Set(given)];
    const def = PICK_SECTION_BY_KEY[key];
    const stand = unique.filter((l) => def.exclusive.includes(l));
    // "No damage" and friends stand alone: if it was ticked together with others, the first one ticked wins.
    out[key] = stand.length > 0 && unique.length > 1 ? [unique[0]] : unique;
    const c = custom[key];
    out.custom[key] = typeof c === "string" ? c.trim().slice(0, MAX_CUSTOM) : "";
  }
  return out;
}

/** Ticks or unticks one option, keeping exclusive options alone. */
export function togglePick(section: PickSectionKey, current: string[], label: string, on: boolean): string[] {
  const def = PICK_SECTION_BY_KEY[section];
  if (!on) return current.filter((l) => l !== label);
  if (current.includes(label)) return current;
  if (def.exclusive.includes(label)) return [label];
  return [...current.filter((l) => !def.exclusive.includes(l)), label];
}

/** What to store on the shipment: null when nothing was picked or written. */
export function serializePicks(p: PickState): string | null {
  return picksEmpty(p) ? null : JSON.stringify(p);
}

// ---- the old text fields, filled in from the picks -----------------------------------------------------------------

const join = (labels: string[], note: string): string => {
  const parts: string[] = [];
  if (labels.length) parts.push(labels.join("; "));
  if (note.trim()) parts.push(labels.length ? `Note: ${note.trim()}` : note.trim());
  return parts.join(". ");
};

export type LegacyText = { damageNotes: string; packagingIssueNotes: string; adjustmentDetails: string; receivingNotes: string };

/** The four text fields the rest of the app reads, written out from the picks. Blank when nothing was picked or written. */
export function legacyFromPicks(p: PickState): LegacyText {
  const lines: string[] = [];
  const add = (heading: string, labels: string[], note: string) => {
    const text = join(labels, note);
    if (text) lines.push(`${heading}: ${text}`);
  };
  add("Outcome", p.outcome, p.custom.outcome);
  add("Recommended adjustment", p.adjOutcome, p.custom.adjOutcome);
  add("Customer warning level", p.warning, p.custom.warning);
  return {
    damageNotes: join(p.damage, p.custom.damage),
    packagingIssueNotes: join(p.packaging, p.custom.packaging),
    adjustmentDetails: join(p.adjustment, p.custom.adjustment),
    receivingNotes: lines.join("\n"),
  };
}

/** A readable summary of everything picked, in the order the agent fills the form in. Empty lists are left out. */
export function summaryLines(p: PickState): { title: string; text: string }[] {
  const order: PickSectionKey[] = ["packaging", "damage", "adjustment", "outcome", "adjOutcome", "warning"];
  const out: { title: string; text: string }[] = [];
  for (const key of order) {
    const text = join(p[key], p.custom[key]);
    if (text) out.push({ title: PICK_SECTION_BY_KEY[key].title, text });
  }
  return out;
}
