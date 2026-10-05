// Recall checks for received products: the pure rules (normalising lot / serial numbers, reading the lists an admin
// pastes in, reading GS1 barcodes, matching a number against the lists). No database in here.
//
// A check can only ever say "this number IS on a recall list we have loaded" or "it is NOT on the lists we have
// loaded". It never says a product is safe: lists change, and some manufacturers (Abbott, Dexcom) only offer a
// serial-number lookup form on their own site, so the app opens that page and records what the agent found there.

export const RECALL_RESULTS = ["ON_LIST", "NOT_ON_LIST", "CONFIRMED_AFFECTED", "CONFIRMED_OK"] as const;
export type RecallResult = (typeof RECALL_RESULTS)[number];

export const RECALL_RESULT_LABELS: Record<RecallResult, string> = {
  ON_LIST: "On the recall list",
  NOT_ON_LIST: "Not on the lists we have",
  CONFIRMED_AFFECTED: "Affected (checked on the manufacturer's site)",
  CONFIRMED_OK: "Not affected (checked on the manufacturer's site)",
};

/** True for the results that mean "do not accept this one". */
export const isRecalledResult = (r: string | null | undefined) => r === "ON_LIST" || r === "CONFIRMED_AFFECTED";

/** The three recalls in progress when this was built. An admin can add or change recalls; these are the starting set. */
export const DEFAULT_RECALLS = [
  {
    name: "Omnipod 5 Pods (tubing tear)",
    manufacturer: "Insulet",
    keywords: "omnipod",
    numberHint: "Lot number: on the Pod tray lid, the 5-pack box, or the flat side of the Pod. Omnipod 5 lots start PH1U or PR1U.",
    lookupUrl: "https://www.omnipod.com/mdc/check-pod-lot",
    lookupLabel: "Omnipod lot check",
    noticeUrl: "https://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/insulin-pump-recall-insulet-removes-certain-omnipod-5-pods",
  },
  {
    name: "FreeStyle Libre 3 and Libre 3 Plus sensors",
    manufacturer: "Abbott",
    keywords: "libre 3, libre3",
    numberHint: "Serial number: the 9-character code on the sensor kit. It never starts with T and has no B, I, O or S.",
    lookupUrl: "https://www.freestylecheck.com/us-en/product-lookup.html",
    lookupLabel: "FreeStyle sensor serial check",
    noticeUrl: "https://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/continuous-glucose-monitoring-cgm-sensor-recall-abbott-diabetes-care-inc-issues-recall-certain",
  },
  {
    name: "Dexcom G7 receivers (speaker fault)",
    manufacturer: "Dexcom",
    keywords: "receiver",
    numberHint: "Serial number: on the receiver's back label and on its box.",
    lookupUrl: "https://cdn.c1.amplience.net/c/dexcom/en-us-receiver-lookup",
    lookupLabel: "Dexcom receiver serial check",
    noticeUrl: "https://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/continuous-glucose-monitor-receiver-recall-dexcom-inc-removes-certain-dexcom-g6-g7-one-and-one",
  },
] as const;

/** "ph1u-0103 2521" -> "PH1U01032521". Lot and serial numbers are compared in this form. */
export function normalizeNumber(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const DATEISH = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})$/;

/**
 * Reads the list an admin pastes in (copied from a manufacturer's page, an FDA table or a spreadsheet): any mix of
 * lines, commas, tabs and spaces. A token ending in * is a prefix ("PH1U01*" covers every lot that starts that way).
 * Words, dates and short numbers are dropped, and the count of what was skipped is returned.
 */
export function parseRecallList(text: string): { values: string[]; prefixes: string[]; skipped: number } {
  const values = new Set<string>();
  const prefixes = new Set<string>();
  let skipped = 0;
  for (const raw of text.split(/[\s,;|]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const isPrefix = t.endsWith("*");
    const n = normalizeNumber(t);
    const looksLikeNumber = n.length >= (isPrefix ? 3 : 4) && /\d/.test(n) && !DATEISH.test(t) && !(/^\d+$/.test(n) && n.length < 5);
    if (!looksLikeNumber) {
      skipped++;
      continue;
    }
    (isPrefix ? prefixes : values).add(n);
  }
  return { values: [...values], prefixes: [...prefixes], skipped };
}

export type Gs1 = { gtin?: string; lot?: string; serial?: string; expiry?: string };

function gs1Expiry(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return undefined;
  const year = 2000 + yy;
  if (dd === 0) dd = new Date(Date.UTC(year, mm, 0)).getUTCDate(); // day 00 means the end of the month
  if (dd < 1 || dd > 31) return undefined;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Reads the text of a GS1 barcode (the DataMatrix / Code 128 / QR codes on medical packaging), either as printed with
 * brackets "(01)00812345678901(17)270720(10)ABC123(21)SN9" or raw, with the group-separator character between
 * variable-length fields. Returns null when it doesn't look like GS1 data.
 */
export function parseGs1(input: string): Gs1 | null {
  let t = input.trim();
  if (!t) return null;
  const out: Gs1 = {};
  const set = (ai: string, v: string) => {
    if (!v) return;
    if (ai === "01") out.gtin = v;
    else if (ai === "10") out.lot = v;
    else if (ai === "21") out.serial = v;
    else if (ai === "17") out.expiry = gs1Expiry(v);
  };
  if (/\(\d{2,4}\)/.test(t)) {
    for (const m of t.matchAll(/\((\d{2,4})\)([^(]*)/g)) set(m[1], m[2].replace(/\u001d/g, "").trim());
  } else {
    t = t.replace(/^\][A-Za-z]\d/, ""); // symbology identifier, e.g. ]d2
    const FIXED: Record<string, number> = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
    const VARIABLE = new Set(["10", "21", "22", "30", "37", "240", "241", "242", "250", "251", "253", "254", "255", "400", "91", "92", "93", "94", "95", "96", "97", "98", "99"]);
    let i = 0;
    let steps = 0;
    while (i < t.length && steps++ < 20) {
      if (t[i] === "\u001d") {
        i++;
        continue;
      }
      const two = t.slice(i, i + 2);
      const three = t.slice(i, i + 3);
      if (FIXED[two]) {
        set(two, t.slice(i + 2, i + 2 + FIXED[two]));
        i += 2 + FIXED[two];
      } else if (VARIABLE.has(three) || VARIABLE.has(two)) {
        const ai = VARIABLE.has(three) ? three : two;
        let end = t.indexOf("\u001d", i + ai.length);
        if (end < 0) end = t.length;
        set(ai, t.slice(i + ai.length, end));
        i = end + 1;
      } else {
        return Object.keys(out).length ? out : null;
      }
    }
  }
  return out.gtin || out.lot || out.serial ? out : null;
}

/** The numbers worth checking in whatever was scanned or typed: a GS1 barcode gives its lot and serial; otherwise every token. */
export function numbersToCheck(input: string): string[] {
  const gs1 = parseGs1(input);
  const raw = gs1 ? [gs1.lot ?? "", gs1.serial ?? ""] : input.split(/[\s,;|]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const n = normalizeNumber(r);
    if (n.length >= 4 && /\d/.test(n) && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export type RecallListIndex = {
  recallId: string;
  recallName: string;
  values: Set<string>;
  prefixes: string[];
};

/** Which loaded recall lists contain this number (normalised). */
export function matchNumber(number: string, lists: RecallListIndex[]): { recallId: string; recallName: string }[] {
  const n = normalizeNumber(number);
  return lists
    .filter((l) => l.values.has(n) || l.prefixes.some((p) => n.startsWith(p)))
    .map((l) => ({ recallId: l.recallId, recallName: l.recallName }));
}

/** Words in the product name that point at a manufacturer (so its official check page is offered first). */
export function recallsForProduct<T extends { keywords: string }>(productName: string, recalls: T[]): T[] {
  const name = productName.toLowerCase();
  return recalls.filter((r) => r.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => name.includes(k)));
}

export type RecallCheckLite = { itemId: string; result: RecallResult };

/** What the row shows: the worst thing any of its checks found. */
export function rowRecallState(checks: { result: string }[]): "RECALLED" | "CHECKED" | "NONE" {
  if (checks.some((c) => isRecalledResult(c.result))) return "RECALLED";
  return checks.length > 0 ? "CHECKED" : "NONE";
}
