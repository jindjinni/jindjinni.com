// Checks what a company typed at sign-up against the state's own public business records. Only states that publish their
// register as free official open data (Socrata portals) can be checked automatically: New York, Colorado, Pennsylvania,
// Oregon and Connecticut. For every other state the panel shows a link to the state's own search and the platform owner
// looks by hand. The check only INFORMS the owner (matched / look closer / not found); it never approves or refuses anyone.
// It reads public data through each state's published API; it does not scrape websites or get around any blocks.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessVerifications, organizations } from "@/db/schema";
import { stateName } from "@/lib/business-verification";

export type RegistryStatus = "matched" | "check" | "not_found" | "not_checked" | "error";

type Source = {
  state: string;
  host: string;
  dataset: string;
  numberField: string;
  nameField: string;
  typeField?: string;
  statusField?: string;
  dateField?: string;
  /** Other spellings of the same file number (leading zeros). */
  variants: (digits: string) => string[];
  /** The state's own business search, for the owner to open. */
  searchUrl: string;
};

const noZeros = (d: string) => d.replace(/^0+/, "") || d;

const SOURCES: Record<string, Source> = {
  NY: { state: "NY", host: "https://data.ny.gov", dataset: "n9v6-gdp6", numberField: "dos_id", nameField: "current_entity_name", typeField: "entity_type", dateField: "initial_dos_filing_date", variants: (d) => [d, noZeros(d)], searchUrl: "https://apps.dos.ny.gov/publicInquiry/" },
  CO: { state: "CO", host: "https://data.colorado.gov", dataset: "4ykn-tg5h", numberField: "entityid", nameField: "entityname", typeField: "entitytype", statusField: "entitystatus", dateField: "entityformdate", variants: (d) => [d, noZeros(d)], searchUrl: "https://www.coloradosos.gov/biz/BusinessEntityCriteria.do" },
  PA: { state: "PA", host: "https://data.pa.gov", dataset: "xvd7-5r2c", numberField: "filing_number", nameField: "business_name", typeField: "typeofbusinessregistration", dateField: "creationdate", variants: (d) => [d, d.padStart(10, "0"), noZeros(d)], searchUrl: "https://file.dos.pa.gov/search/business" },
  OR: { state: "OR", host: "https://data.oregon.gov", dataset: "tckn-sxa6", numberField: "registry_number", nameField: "business_name", typeField: "entity_type", dateField: "registry_date", variants: (d) => [d, noZeros(d)], searchUrl: "https://sos.oregon.gov/business/pages/find.aspx" },
  CT: { state: "CT", host: "https://data.ct.gov", dataset: "n7gp-d28j", numberField: "accountnumber", nameField: "name", statusField: "status", dateField: "date_registration", variants: (d) => [d, noZeros(d)], searchUrl: "https://service.ct.gov/business/s/onlinebusinesssearch" },
};

export function canCheckAutomatically(stateCode: string): boolean {
  return stateCode in SOURCES;
}

/** The state's own business search where we know it; otherwise a web search for it. */
export function registryLink(stateCode: string): string {
  return SOURCES[stateCode]?.searchUrl ?? `https://www.google.com/search?q=${encodeURIComponent(`${stateName(stateCode)} Secretary of State business entity search`)}`;
}

const SUFFIX = /\b(L ?L ?C|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLP|LP|PLLC|PC|THE)\b/g;
function normName(s: string): string {
  return s.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}

/** Same business name once punctuation and endings like LLC/Inc are ignored. A state note after the name (Colorado adds "Delinquent ...") is tolerated. */
export function sameName(typed: string, recorded: string): boolean {
  const a = normName(typed);
  const b = normName(recorded);
  if (!a || !b) return false;
  return a === b || b.startsWith(a + " ") || a.startsWith(b + " ");
}

type Kind = "llc" | "corp" | "partnership" | "nonprofit" | "unknown";
function recordedKind(t: string): Kind {
  const s = t.toUpperCase();
  if (/NON-?PROFIT|NOT-FOR-PROFIT|^[DF]NC$/.test(s)) return "nonprofit";
  if (/PARTNERSHIP|LLLP|LLP|^[DF]L?P$/.test(s)) return "partnership";
  if (/LIMITED LIABILITY|LLC|^[DF]LLC$/.test(s)) return "llc";
  if (/CORPORATION|CORP|INC|^[DF](PC|BC)$/.test(s)) return "corp";
  return "unknown";
}
function typedKind(t: string): Kind {
  if (t === "LLC") return "llc";
  if (t === "C corporation" || t === "S corporation") return "corp";
  if (t === "Partnership / LLP") return "partnership";
  if (t === "Nonprofit") return "nonprofit";
  return "unknown";
}

export type RegistryInput = { state: string; fileNumber: string; name: string; entityType: string; yearFormed: number };
export type RegistryResult = { status: RegistryStatus; detail: string };

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function fetchRows(src: Source, variants: string[]): Promise<Row[]> {
  const where = `${src.numberField} in (${variants.map((v) => `'${v}'`).join(",")})`;
  const q = `$where=${encodeURIComponent(where)}&$limit=20`;
  const test = process.env.REGISTRY_TEST_BASE;
  const url = test ? `${test}/${src.state}/resource/${src.dataset}.json?${q}` : `${src.host}/resource/${src.dataset}.json?${q}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("unexpected answer");
  return data as Row[];
}

/** Looks the file number up in the state's open data and compares name, kind of business, year and standing. */
export async function checkRegistry(input: RegistryInput): Promise<RegistryResult> {
  const src = SOURCES[input.state];
  if (!src) return { status: "not_checked", detail: `${stateName(input.state)} doesn't publish its records in a form we can read automatically yet. Use the link to look it up on the state's site.` };

  const digits = input.fileNumber.replace(/[^0-9]/g, "");
  if (digits.length < 3) return { status: "not_found", detail: `The file number "${input.fileNumber.slice(0, 40)}" doesn't look like a ${stateName(input.state)} number (it should be digits). Look it up by hand.` };

  let rows: Row[];
  try {
    rows = await fetchRows(src, [...new Set(src.variants(digits))].filter((v) => /^[0-9]{1,20}$/.test(v)));
  } catch {
    return { status: "error", detail: `${stateName(input.state)}'s records didn't answer just now. Try Check again, or look it up by hand.` };
  }
  if (rows.length === 0) {
    return { status: "not_found", detail: `No ${stateName(input.state)} record has the file number ${input.fileNumber.slice(0, 40)}. The number may be mistyped, the business may be registered in another state, or this state's data may be behind. Look it up by hand.` };
  }

  // Some states list one entity on several rows (agents, officers); the first row carries the entity's own details.
  const r = rows[0];
  const recName = str(r[src.nameField]);
  const notes: string[] = [];
  let look = false;

  if (sameName(input.name, recName)) notes.push("Name matches.");
  else { look = true; notes.push(`Name differs: the state has "${recName.slice(0, 100)}".`); }

  if (src.typeField) {
    const recType = str(r[src.typeField]);
    const a = typedKind(input.entityType);
    const b = recordedKind(recType);
    if (a !== "unknown" && b !== "unknown") {
      if (a === b) notes.push("Business type matches.");
      else { look = true; notes.push(`Business type differs: they said ${input.entityType}, the state has "${recType.slice(0, 60)}".`); }
    }
  }

  if (src.dateField) {
    const year = Number(str(r[src.dateField]).slice(0, 4));
    if (year > 1800) {
      if (year === input.yearFormed) notes.push(`Registered ${year}, as they said.`);
      else { look = true; notes.push(`Year differs: they said ${input.yearFormed}, the state shows ${year}.`); }
    }
  }

  if (src.statusField) {
    const st = str(r[src.statusField]);
    if (/^(active|good standing)$/i.test(st)) notes.push(`Standing: ${st}.`);
    else if (st) { look = true; notes.push(`Standing: ${st.slice(0, 60)}.`); }
  } else {
    notes.push("Listed as an active business.");
  }

  return { status: look ? "check" : "matched", detail: notes.join(" ") };
}

/** Runs the check for one company and saves the answer next to its verification. Never throws. */
export async function runRegistryCheck(organizationId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        name: organizations.name,
        state: businessVerifications.registeredState,
        file: businessVerifications.stateFileNumber,
        entityType: businessVerifications.entityType,
        year: businessVerifications.yearFormed,
      })
      .from(businessVerifications)
      .innerJoin(organizations, eq(organizations.id, businessVerifications.organizationId))
      .where(eq(businessVerifications.organizationId, organizationId))
      .limit(1);
    if (!row) return;
    let result: RegistryResult;
    try {
      result = await checkRegistry({ state: row.state, fileNumber: row.file, name: row.name, entityType: row.entityType, yearFormed: row.year });
    } catch {
      result = { status: "error", detail: "The check failed. Try Check again, or look it up by hand." };
    }
    await db
      .update(businessVerifications)
      .set({ registryStatus: result.status, registryDetail: result.detail, registryCheckedAt: new Date().toISOString() })
      .where(eq(businessVerifications.organizationId, organizationId));
  } catch {
    // A failed check must never break sign-up or a page; the owner can press Check again.
  }
}
