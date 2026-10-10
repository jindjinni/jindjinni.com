import { DISTRIBUTION_HIDDEN, WHOLESALE_HIDDEN, hiddenTabIds, hidesTabs, purchasingBlurb, singleSide, withoutHidden, SIDE_FLOW } from "../src/lib/operation-tabs-rules";
import { DEPARTMENT_MENUS } from "../src/lib/sidebar-menu";
import { sidesNote } from "../src/lib/operations-rules";
let f = 0; const t = (n: string, c: boolean) => { if (!c) { f++; console.log("FAIL", n); } };
const W = { wholesale: true, distribution: false }, D = { wholesale: false, distribution: true }, B = { wholesale: true, distribution: true };
t("single side", singleSide(W) === "wholesale" && singleSide(D) === "distribution" && singleSide(B) === null);
t("wholesale hides purchase orders and suppliers only", JSON.stringify(hiddenTabIds(W, "purchasing", false)) === '["purchase-orders","suppliers"]' && hiddenTabIds(W, "receiving", false).length === 0);
t("distribution hides quotations and individuals' tabs", hiddenTabIds(D, "purchasing", false).includes("quotations") && hiddenTabIds(D, "purchasing", false).includes("customers") && hiddenTabIds(D, "receiving", false).includes("adjustments"));
t("distribution keeps purchase orders and suppliers", !hiddenTabIds(D, "purchasing", false).includes("purchase-orders") && !hiddenTabIds(D, "purchasing", false).includes("suppliers"));
t("both sides or none hide nothing", hiddenTabIds(B, "purchasing", false).length === 0 && !hidesTabs(B) && hidesTabs(W));
t("show-all hides nothing", hiddenTabIds(D, "purchasing", true).length === 0 && hiddenTabIds(W, "purchasing", true).length === 0);
t("withoutHidden", JSON.stringify(withoutHidden(["quotations", "purchase-orders", "products"], D, "purchasing", false)) === '["purchase-orders","products"]');
// every hidden id is a real tab (a typo would silently hide nothing)
for (const [name, h] of [["wholesale", WHOLESALE_HIDDEN], ["distribution", DISTRIBUTION_HIDDEN]] as const)
  for (const [dept, ids] of Object.entries(h)) for (const id of ids ?? []) t(`${name}/${dept}/${id} is a real tab`, DEPARTMENT_MENUS[dept as keyof typeof DEPARTMENT_MENUS].items.some((i) => i.id === id));
// the home and the everyday tabs a side needs are never hidden
t("home tabs stay", !DISTRIBUTION_HIDDEN.purchasing!.includes("dashboard") && !DISTRIBUTION_HIDDEN.purchasing!.includes("products") && !WHOLESALE_HIDDEN.purchasing!.includes("products"));
t("blurbs differ", purchasingBlurb(D) !== purchasingBlurb(W) && /purchase orders/i.test(purchasingBlurb(D)) && /Quote individuals/.test(purchasingBlurb(W)));
t("flow has four steps each, wholesale mentions quotation, distribution mentions invoice then purchase order", SIDE_FLOW.wholesale.length === 4 && SIDE_FLOW.distribution.length === 4 && /quotation/.test(SIDE_FLOW.wholesale[0]) && /invoice/.test(SIDE_FLOW.distribution[0]) && /purchase order/.test(SIDE_FLOW.distribution[1]));
t("Jin hears the day of each side", /How a day goes/.test(sidesNote(D)) && /invoice/.test(sidesNote(D)) && /quotation/.test(sidesNote(W)));
console.log(f ? `${f} failed` : "Operation tabs rules: all passed"); process.exit(f ? 1 : 0);
