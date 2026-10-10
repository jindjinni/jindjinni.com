import assert from "node:assert/strict";
import { SO_HOLDING_STATUSES, canMakeSalesOrder, formatNumber, hasNdcColumn, isOrderDoc, kindWord, KIND_LABEL } from "../src/lib/sales-rules";
import { DOC_BACK, DOC_BASE, dateLabel, dueLabel, dueShort, refLabel, refShort, docTitle } from "../src/lib/sales-doc-ui";

// numbering
assert.equal(formatNumber("SALES_ORDER", 1001), "SO-1001");
assert.equal(formatNumber("PURCHASE_ORDER", 1001), "RPO-1001");
assert.equal(formatNumber("QUOTATION", 1001), "Q-1001");
assert.equal(formatNumber("INVOICE", 1001), "1001");

// what a sales order is
assert.equal(isOrderDoc("SALES_ORDER"), true);
assert.equal(isOrderDoc("INVOICE"), false);
assert.equal(KIND_LABEL.SALES_ORDER, "Sales order");
assert.equal(kindWord("SALES_ORDER"), "sales order");
assert.equal(kindWord("nonsense"), "document");
assert.equal(hasNdcColumn("SALES_ORDER"), true);
assert.equal(hasNdcColumn("PURCHASE_ORDER"), true);
assert.equal(hasNdcColumn("QUOTATION"), false);
assert.deepEqual([...SO_HOLDING_STATUSES], ["DRAFT", "SENT", "ACCEPTED"]);

// where a sales order can come from
const ok = (kind: string, status: string) => canMakeSalesOrder({ kind, status });
assert.deepEqual(ok("PURCHASE_ORDER", "SENT"), { ok: true });
assert.deepEqual(ok("PURCHASE_ORDER", "ACCEPTED"), { ok: true });
assert.deepEqual(ok("QUOTATION", "SENT"), { ok: true });
for (const st of ["DRAFT", "CONVERTED", "VOID", "DECLINED"]) assert.equal(ok("QUOTATION", st).ok, false, st);
assert.match((ok("QUOTATION", "DRAFT") as { error: string }).error, /Send the quotation first/);
assert.match((ok("PURCHASE_ORDER", "CONVERTED") as { error: string }).error, /already made into another document/);
assert.match((ok("INVOICE", "SENT") as { error: string }).error, /quotation or a received purchase order/);
assert.equal(ok("SALES_ORDER", "SENT").ok, false); // not a sales order from a sales order

// screens
assert.equal(DOC_BASE.SALES_ORDER, "/dashboard/sales/sales-orders");
assert.equal(DOC_BACK.QUOTATION, "/dashboard/sales");
assert.equal(DOC_BACK.SALES_ORDER, "/dashboard/sales/sales-orders");
assert.equal(docTitle("SALES_ORDER"), "Sales Orders");
assert.equal(dueLabel("SALES_ORDER"), "Ship by");
assert.equal(dueShort("SALES_ORDER"), "Ship by");
assert.equal(dueLabel("INVOICE"), "Due date");
assert.equal(dateLabel("SALES_ORDER"), "Order date");
assert.equal(refLabel("SALES_ORDER"), "Buyer's PO number");
assert.equal(refLabel("QUOTATION"), "Reference (optional)");
assert.equal(refShort("PURCHASE_ORDER"), "Buyer's PO #");

console.log("sales-order-rules: ok");
