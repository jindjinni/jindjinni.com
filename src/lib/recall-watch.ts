// Which products always get the recall checker switched on the moment they are chosen (Purchasing quotation line,
// Receiving Step 6 row). The products under recall today: every Omnipod, FreeStyle Libre 3 and Libre 3 Plus sensors,
// and Dexcom G7 receivers (the Dexcom G7 SENSORS are not recalled). Everything else leaves the checker available
// but quiet. When a new recall is announced, add its product pattern to ALWAYS_CHECK. This only decides when the
// checker opens; the accept / return rules are unchanged.

const ALWAYS_CHECK: RegExp[] = [/omnipod/i, /libre\s*3/i, /libre3/i, /dexcom\s*g\s*7[^,]*receiver/i];

export function needsRecallChecker(productName: string | null | undefined): boolean {
  const name = String(productName ?? "").trim();
  return name !== "" && ALWAYS_CHECK.some((re) => re.test(name));
}
