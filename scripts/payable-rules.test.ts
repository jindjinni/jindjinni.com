import assert from "node:assert/strict";
import {
  approveProblem, attentionCount, billBalance, billNumberOf, billProblem, dueFromTerms, inSupplierNoticeWindow, isOpen, netDays, oweSummary, payProblem, statusAfterPayment,
  supplierNoticeEmail, supplierNoticeReadiness, supplierTotals, voidProblem,
} from "../src/lib/payable-rules";

// numbering and balance
assert.equal(billNumberOf(7), "BILL-0007");
assert.equal(billNumberOf(12345), "BILL-12345");
assert.equal(billBalance({ total: 100, amountPaid: 40.25 }), 59.75);
assert.equal(billBalance({ total: 100, amountPaid: 120 }), 0);
assert.ok(isOpen("PENDING") && isOpen("APPROVED") && isOpen("PARTIALLY_PAID") && !isOpen("PAID") && !isOpen("VOID"));

// due date from terms
assert.equal(netDays("Net 30"), 30);
assert.equal(netDays("NET45 days from invoice"), 45);
assert.equal(netDays("Due on receipt"), 0);
assert.equal(netDays("Cash on delivery"), 0);
assert.equal(netDays("whenever"), null);
assert.equal(netDays(null), null);
assert.equal(dueFromTerms("Net 30", "2026-10-01"), "2026-10-31");
assert.equal(dueFromTerms("Net 30", "2026-12-15"), "2027-01-14");
assert.equal(dueFromTerms("Due on receipt", "2026-10-01"), "2026-10-01");
assert.equal(dueFromTerms("soon", "2026-10-01"), null);
assert.equal(dueFromTerms("Net 30", "not a day"), null);

// the details as typed
const ok = { supplierInvoiceNumber: "INV-9", invoiceDate: "2026-10-01", dueDate: "2026-10-31", total: 250, note: "" };
assert.equal(billProblem(ok), null);
assert.ok(billProblem({ ...ok, total: 0 }));
assert.ok(billProblem({ ...ok, total: NaN }));
assert.ok(billProblem({ ...ok, total: -5 }));
assert.ok(billProblem({ ...ok, dueDate: "2026-09-01" }));
assert.ok(billProblem({ ...ok, invoiceDate: "10/01/2026" }));
assert.ok(billProblem({ ...ok, supplierInvoiceNumber: "x".repeat(61) }));
assert.ok(billProblem({ ...ok, total: 100 }, 150)); // can't go below what's paid
assert.equal(billProblem({ ...ok, total: 150 }, 150), null);
assert.equal(billProblem({ ...ok, invoiceDate: "", dueDate: "" }), null);

// approving, paying, setting aside
assert.equal(approveProblem("PENDING"), null);
assert.ok(approveProblem("APPROVED") && approveProblem("PAID") && approveProblem("VOID"));
assert.ok(payProblem({ status: "PENDING", total: 100, amountPaid: 0 }, { amount: 10, paidOn: "2026-10-02" })?.includes("Approve"));
assert.ok(payProblem({ status: "VOID", total: 100, amountPaid: 0 }, { amount: 10, paidOn: "2026-10-02" }));
assert.ok(payProblem({ status: "PAID", total: 100, amountPaid: 100 }, { amount: 10, paidOn: "2026-10-02" }));
assert.equal(payProblem({ status: "APPROVED", total: 100, amountPaid: 0 }, { amount: 100, paidOn: "2026-10-02" }), null);
assert.equal(payProblem({ status: "PARTIALLY_PAID", total: 100, amountPaid: 40 }, { amount: 60, paidOn: "2026-10-02" }), null);
assert.ok(payProblem({ status: "PARTIALLY_PAID", total: 100, amountPaid: 40 }, { amount: 60.01, paidOn: "2026-10-02" })?.includes("$60.00"));
assert.ok(payProblem({ status: "APPROVED", total: 100, amountPaid: 0 }, { amount: 0, paidOn: "2026-10-02" }));
assert.ok(payProblem({ status: "APPROVED", total: 100, amountPaid: 0 }, { amount: 5, paidOn: "yesterday" }));
assert.equal(statusAfterPayment(100, 0), "APPROVED");
assert.equal(statusAfterPayment(100, 30), "PARTIALLY_PAID");
assert.equal(statusAfterPayment(100, 100), "PAID");
assert.equal(voidProblem({ status: "PENDING", amountPaid: 0 }), null);
assert.ok(voidProblem({ status: "PARTIALLY_PAID", amountPaid: 10 }));
assert.ok(voidProblem({ status: "VOID", amountPaid: 0 }));

// totals
const today = "2026-10-10";
const rows = [
  { id: "a", supplier: "Alpha", dueDate: "2026-07-01", total: 100, amountPaid: 0, status: "APPROVED" }, // 101 days late
  { id: "b", supplier: "Alpha", dueDate: "2026-09-20", total: 200, amountPaid: 50, status: "PARTIALLY_PAID" }, // 20 late, owes 150
  { id: "c", supplier: "Beta", dueDate: "2026-10-14", total: 300, amountPaid: 0, status: "PENDING" }, // due in 4
  { id: "d", supplier: "Beta", dueDate: "2026-12-01", total: 400, amountPaid: 0, status: "APPROVED" },
  { id: "e", supplier: "Beta", dueDate: "2026-09-01", total: 500, amountPaid: 500, status: "PAID" },
  { id: "f", supplier: "Gamma", dueDate: "2026-08-01", total: 600, amountPaid: 0, status: "VOID" },
  { id: "g", supplier: "", dueDate: null, total: 75, amountPaid: 0, status: "PENDING" },
];
const s = oweSummary(rows, today);
assert.equal(s.owed, 100 + 150 + 300 + 400 + 75);
assert.equal(s.pastDue, 250);
assert.equal(s.dueSoon, 300);
assert.equal(s.waiting, 2);
assert.equal(s.waitingAmount, 375);
assert.equal(s.count, 5);
assert.equal(s.byBucket.D60_PLUS.owed, 100);
assert.equal(s.byBucket.D1_30.owed, 150);
assert.equal(s.byBucket.CURRENT.count, 3);
const t = supplierTotals(rows, today);
assert.deepEqual(t.map((x) => [x.supplier, x.owed, x.pastDue, x.count]), [["Beta", 700, 0, 2], ["Alpha", 250, 250, 2], ["Unnamed supplier", 75, 0, 1]]);
assert.equal(attentionCount(rows, today), 4); // a, b past due; c, g waiting

// the email to the supplier
const e = supplierNoticeEmail({ contact: "Dana", reference: "INV-9", poNumber: "PO-1001", amount: 1234.5, paidOn: "2026-10-09", method: "ACH", paymentReference: "TRX55", balance: 0, note: null, from: "Acme LLC" });
assert.equal(e.subject, "Payment sent - INV-9 - Acme LLC");
assert.ok(e.text.startsWith("Hello Dana,"));
assert.ok(e.text.includes("We paid $1,234.50 on Oct 9, 2026 by ACH (reference TRX55) for invoice INV-9 (our purchase order PO-1001)."));
assert.ok(e.text.includes("This invoice is now paid in full."));
assert.ok(e.text.endsWith("Thank you,\nAcme LLC"));
const e2 = supplierNoticeEmail({ contact: null, reference: "PO-1001", poNumber: "PO-1001", amount: 10, paidOn: "2026-10-09", method: null, paymentReference: null, balance: 90, note: "  Remittance sent separately.  ", from: "Acme LLC" });
assert.ok(e2.text.startsWith("Hello,"));
assert.ok(e2.text.includes("We paid $10.00 on Oct 9, 2026 for invoice PO-1001."));
assert.ok(e2.text.includes("still open on this invoice is $90.00."));
assert.ok(e2.text.includes("\n\nRemittance sent separately.\n\nThank you,"));

// readiness and window
assert.ok(supplierNoticeReadiness({ to: "a@b.co", handled: false, billVoid: false }).ready);
assert.ok(!supplierNoticeReadiness({ to: "nope", handled: false, billVoid: false }).ready);
assert.equal(supplierNoticeReadiness({ to: "a@b.co", handled: true, billVoid: true }).blockers.length, 2);
assert.ok(inSupplierNoticeWindow("2026-09-01", "2026-10-10"));
assert.ok(!inSupplierNoticeWindow("2026-06-01", "2026-10-10"));

console.log("payable-rules: all checks passed");
