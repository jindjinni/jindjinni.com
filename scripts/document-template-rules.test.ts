import assert from "node:assert/strict";
import { DEFAULT_TITLE, TEMPLATE_LIMITS, activeNotice, cleanRevisionNote, cleanTemplate, isDay, nextRevision, numberWithRevision } from "../src/lib/document-template-rules";
import { resolveMenu, DEPARTMENT_MENUS } from "../src/lib/sidebar-menu";
import { formatNumber, isOrderDoc } from "../src/lib/sales-rules";
import { poFileName } from "../src/lib/purchase-order-rules";
import { pdfFileName } from "../src/lib/sales-pdf";

// ---- cleanTemplate
const ok = cleanTemplate({ displayName: "  Plantarz  Medical ", titleText: " ORDER ", introText: "Line one\r\nLine   two<script>", termsText: "", footerText: "Thanks", noticeText: "Out of office\nuntil Monday", noticeEnabled: "on", noticeUntil: "2026-06-10", showLogo: "off" });
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.value.displayName, "Plantarz Medical");
  assert.equal(ok.value.titleText, "ORDER");
  assert.equal(ok.value.introText, "Line one\nLine two script");
  assert.equal(ok.value.termsText, null);
  assert.equal(ok.value.noticeText, "Out of office\nuntil Monday");
  assert.equal(ok.value.noticeEnabled, true);
  assert.equal(ok.value.noticeUntil, "2026-06-10");
  assert.equal(ok.value.showLogo, false);
}
const blank = cleanTemplate({});
assert.ok(blank.ok && blank.value.showLogo && !blank.value.noticeEnabled && blank.value.displayName === null);
assert.equal(cleanTemplate({ noticeEnabled: true, noticeText: "  " }).ok, false, "a notice that is on needs words");
assert.equal(cleanTemplate({ noticeText: "x".repeat(TEMPLATE_LIMITS.notice + 1) }).ok, false);
assert.equal(cleanTemplate({ noticeEnabled: true, noticeText: "hi", noticeUntil: "2026-02-31" }).ok, false, "a day that does not exist");
assert.equal(cleanTemplate({ noticeEnabled: true, noticeText: "hi", noticeUntil: "soon" }).ok, false);
assert.equal(cleanTemplate({ titleText: "t".repeat(TEMPLATE_LIMITS.title + 1) }).ok, false);

// ---- isDay
assert.ok(isDay("2026-02-28") && !isDay("2026-02-30") && !isDay("2026-2-3") && !isDay(null));

// ---- the notice shows only while it is on, has words and is not past its last day
const n = { noticeText: "Closed", noticeEnabled: true, noticeUntil: "2026-06-10" };
assert.equal(activeNotice(n, "2026-06-01"), "Closed");
assert.equal(activeNotice(n, "2026-06-10"), "Closed", "the last day still shows");
assert.equal(activeNotice(n, "2026-06-11"), null);
assert.equal(activeNotice({ ...n, noticeUntil: null }, "2030-01-01"), "Closed");
assert.equal(activeNotice({ ...n, noticeEnabled: false }, "2026-06-01"), null);
assert.equal(activeNotice({ ...n, noticeText: "   " }, "2026-06-01"), null);
assert.equal(activeNotice(null, "2026-06-01"), null);

// ---- revisions
assert.equal(numberWithRevision("PO-1005", 2), "PO-1005 Rev 2");
assert.equal(numberWithRevision("PO-1005", 0), "PO-1005");
assert.equal(numberWithRevision("PO-1005", null), "PO-1005");
assert.equal(nextRevision(null), 1);
assert.equal(nextRevision(0), 1);
assert.equal(nextRevision(2), 3);
assert.equal(cleanRevisionNote("  ").ok, false);
assert.equal(cleanRevisionNote("ab").ok, false);
const note = cleanRevisionNote("They sent 15 boxes\r\ninstead of 20");
assert.ok(note.ok && note.note === "They sent 15 boxes\ninstead of 20");
assert.equal(cleanRevisionNote("x".repeat(1001)).ok, false);

// ---- titles, numbers and file names
assert.equal(DEFAULT_TITLE.PURCHASE_ORDER, "PURCHASE ORDER");
assert.equal(formatNumber("PURCHASE_ORDER", 1001), "RPO-1001");
assert.equal(formatNumber("QUOTATION", 1001), "Q-1001");
assert.equal(formatNumber("INVOICE", 1001), "1001");
assert.ok(isOrderDoc("QUOTATION") && isOrderDoc("PURCHASE_ORDER") && !isOrderDoc("INVOICE"));
assert.equal(poFileName("PO-1005", "Acme Supply", 2), "PO-1005-Rev2-Acme-Supply.pdf");
assert.equal(poFileName("PO-1005", "Acme Supply"), "PO-1005-Acme-Supply.pdf");
assert.equal(pdfFileName("PURCHASE_ORDER", "RPO-1001", "HHCRx", 1), "PurchaseOrder-RPO-1001-Rev1-HHCRx.pdf");
assert.equal(pdfFileName("QUOTATION", "Q-1001", "HHCRx"), "Quotation-Q-1001-HHCRx.pdf");

// ---- the menu: a Distributor sees Purchase Orders above Quotations unless the company saved its own order
const ids = (m: ReturnType<typeof resolveMenu>) => m.items.filter((i) => !i.setup).map((i) => i.id);
const pur = ids(resolveMenu("purchasing", {}));
assert.ok(pur.indexOf("quotations") < pur.indexOf("purchase-orders"));
const purD = ids(resolveMenu("purchasing", {}, undefined, { purchaseOrdersFirst: true }));
assert.ok(purD.indexOf("purchase-orders") < purD.indexOf("quotations"));
assert.equal(purD.indexOf("dashboard"), 0, "the dashboard stays first");
const saved = ids(resolveMenu("purchasing", { purchasing: { order: ["quotations", "purchase-orders"] } }, undefined, { purchaseOrdersFirst: true }));
assert.ok(saved.indexOf("quotations") < saved.indexOf("purchase-orders"), "the company's own order wins");
const sal = ids(resolveMenu("sales", {}));
assert.deepEqual(sal.slice(0, 2), ["quotations", "purchase-orders"]);
assert.deepEqual(ids(resolveMenu("sales", {}, undefined, { purchaseOrdersFirst: true })).slice(0, 2), ["purchase-orders", "quotations"]);
for (const d of ["purchasing", "sales"] as const) assert.ok(DEPARTMENT_MENUS[d].items.some((i) => i.id === "templates" && i.setup), `${d} has a Document Templates settings tab`);

console.log("document-template-rules: all passed");
