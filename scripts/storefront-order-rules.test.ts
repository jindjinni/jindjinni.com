import assert from "node:assert/strict";
import { mayDo } from "../src/lib/storefront-api-rules";
import {
  ORDER_LIMITS, ORDER_REFERENCE_PATTERN, cleanOrderRequest, cleanReviewOver, linesFromForm, makeOrderReference, orderStateOf, outcomeFor, stockWord,
} from "../src/lib/storefront-order-rules";

let n = 0;
const t = (name: string, ok: boolean) => { n++; assert.ok(ok, name); };
const KEY = "abcdefgh12345678";

// references
t("order references have the ORD- shape and avoid look-alike characters", ORDER_REFERENCE_PATTERN.test(makeOrderReference()) && ORDER_REFERENCE_PATTERN.test(makeOrderReference(() => 0)) && ORDER_REFERENCE_PATTERN.test(makeOrderReference(() => 0.999999)));
t("lots of references are all valid", Array.from({ length: 300 }, () => makeOrderReference()).every((r) => ORDER_REFERENCE_PATTERN.test(r)));
t("a lookalike reference is refused", !ORDER_REFERENCE_PATTERN.test("ORD-OOO111") && !ORDER_REFERENCE_PATTERN.test("WEB-ABCDEF") && !ORDER_REFERENCE_PATTERN.test("ORD-ABC"));

// a good order
const ok = cleanOrderRequest({ key: KEY, lines: [{ itemId: "spi_1", quantity: 3 }, { id: "spi_2", quantity: "5" }], poNumber: "  PO   123 ", notes: "Please\r\n\r\n\r\n\r\nrush" });
t("a good order is accepted, PO tidied, notes kept", ok.ok && ok.value.lines.length === 2 && ok.value.poNumber === "PO 123" && ok.value.notes === "Please\n\nrush");
t("quantities typed as text digits are numbers", ok.ok && ok.value.lines[1].quantity === 5 && ok.value.lines[1].itemId === "spi_2");
const dup = cleanOrderRequest({ key: KEY, lines: [{ itemId: "a1b", quantity: 2 }, { itemId: "a1b", quantity: 4 }] });
t("the same line twice is added together", dup.ok && dup.value.lines.length === 1 && dup.value.lines[0].quantity === 6);
t("PO and notes are optional", (() => { const r = cleanOrderRequest({ key: KEY, lines: [{ itemId: "a1b", quantity: 1 }] }); return r.ok && r.value.poNumber === null && r.value.notes === null; })());

// bad orders
const bad = (raw: Parameters<typeof cleanOrderRequest>[0]) => !cleanOrderRequest(raw).ok;
t("a missing or short or odd key is refused", bad({ key: "", lines: [{ itemId: "a1b", quantity: 1 }] }) && bad({ key: "short", lines: [{ itemId: "a1b", quantity: 1 }] }) && bad({ key: "has spaces in it!!", lines: [{ itemId: "a1b", quantity: 1 }] }) && bad({ key: undefined, lines: [] }));
t("no lines is refused", bad({ key: KEY, lines: [] }) && bad({ key: KEY, lines: "x" }) && bad({ key: KEY, lines: null }));
t("zero, negative, fractional, huge and non-number quantities are refused", [0, -1, 1.5, ORDER_LIMITS.maxQuantity + 1, "abc", "1.5", "-2", null, NaN, Infinity, "1e3", " "].every((q) => bad({ key: KEY, lines: [{ itemId: "a1b", quantity: q }] })));
t("odd item ids are refused", ["", "a", "../x", "a b c", "x".repeat(81), "'; drop table", null].every((id) => bad({ key: KEY, lines: [{ itemId: id, quantity: 1 }] })));
t("a non-object line is refused", bad({ key: KEY, lines: [5] }) && bad({ key: KEY, lines: [null] }));
t("too many different items is refused", bad({ key: KEY, lines: Array.from({ length: ORDER_LIMITS.maxLines + 1 }, (_, i) => ({ itemId: `item_${i}`, quantity: 1 })) }));
t("exactly the limit is fine", !bad({ key: KEY, lines: Array.from({ length: ORDER_LIMITS.maxLines }, (_, i) => ({ itemId: `item_${i}`, quantity: 1 })) }));
t("adding the same line up past the limit is refused", bad({ key: KEY, lines: [{ itemId: "a1b", quantity: ORDER_LIMITS.maxQuantity }, { itemId: "a1b", quantity: 1 }] }));
t("price, status or company in the body are simply ignored (they are not part of the result)", (() => { const r = cleanOrderRequest({ key: KEY, lines: [{ itemId: "a1b", quantity: 1, price: 0.01, unitPrice: 0.01, organizationId: "org_x", status: "PAID" }] }); return r.ok && JSON.stringify(r.value) === JSON.stringify({ key: KEY, lines: [{ itemId: "a1b", quantity: 1 }], poNumber: null, notes: null }); })());
t("long PO and notes are cut", (() => { const r = cleanOrderRequest({ key: KEY, lines: [{ itemId: "a1b", quantity: 1 }], poNumber: "p".repeat(500), notes: "n".repeat(5000) }); return r.ok && r.value.poNumber!.length === ORDER_LIMITS.poMax && r.value.notes!.length === ORDER_LIMITS.notesMax; })());

// the hosted form
const f = linesFromForm([["key", "x"], ["q_spi_1", "2"], ["q_spi_2", ""], ["q_spi_3", "0"], ["poNumber", "7"], ["q_spi_4", " 3 "], ["Q_spi_5", "9"]]);
t("form fields named q_<id> become lines; blanks, zeros and other fields are skipped", f.length === 2 && f[0].itemId === "spi_1" && f[1].itemId === "spi_4");
t("a form line goes through the same checks", (() => { const r = cleanOrderRequest({ key: KEY, lines: linesFromForm([["q_spi_4", " 3 "]]) }); return r.ok && r.value.lines[0].quantity === 3; })());
t("a form line with a bad quantity is refused", bad({ key: KEY, lines: linesFromForm([["q_spi_1", "two"]]) }) && bad({ key: KEY, lines: linesFromForm([["q_spi_1", "-4"]]) }));

// confirm or review
t("with no review amount every order is confirmed", outcomeFor(1, null) === "CONFIRMED" && outcomeFor(9_999_999, undefined) === "CONFIRMED" && outcomeFor(500, 0) === "CONFIRMED");
t("an order above the review amount waits for staff; at or below is confirmed", outcomeFor(1000.01, 1000) === "REVIEW" && outcomeFor(1000, 1000) === "CONFIRMED" && outcomeFor(10, 1000) === "CONFIRMED");
t("review amount parsing", (() => { const a = cleanReviewOver(""), b = cleanReviewOver("$2,500.456"), c = cleanReviewOver("0"), d = cleanReviewOver("-5"), e = cleanReviewOver("abc"), g = cleanReviewOver("1e12"); return a.ok && a.value === null && b.ok && b.value === 2500.46 && !c.ok && !d.ok && !e.ok && !g.ok; })());

// words
t("stock is only ever In stock / Out of stock", stockWord(true) === "In stock" && stockWord(false) === "Out of stock");
t("an order's state follows the Sales order behind it", orderStateOf("ACCEPTED") === "confirmed" && orderStateOf("SENT") === "in_review" && orderStateOf("DRAFT") === "in_review" && orderStateOf("CONVERTED") === "invoiced" && orderStateOf("PAID") === "invoiced" && orderStateOf("VOID") === "cancelled" && orderStateOf("DECLINED") === "cancelled");

// who may use the order calls
t("ordering and pharmacy lookups are for the secret key only", (["pharmacy-read", "order-create", "order-read"] as const).every((a) => mayDo("secret", a) && !mayDo("public", a)));

console.log(`storefront-order-rules: ${n} checks passed`);
