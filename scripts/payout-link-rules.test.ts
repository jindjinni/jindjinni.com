// "Where should we pay you?" links: the customer's fields, the three methods, the link token and the states.
import assert from "node:assert/strict";
import {
  companySlug, FINTECH_NOTE, METHOD_HELP, PAYOUT_METHODS, addressLine, cleanPayoutDetails, customerLinkState, detailsFromJson, detailsToJson, hashLinkToken, linkEmailContent, linkUrl,
  looksLikeLinkToken, maskedPayoutLine, LINK_REASONS, ONE_TIME_TEXT, cleanReason, reasonCustomerLine, reasonLabel, newLinkToken, staffLinkState, LINK_VALID_DAYS,
} from "../src/lib/payout-link-rules";

const good = { method: "paypal", holderName: "Jane Q Public", street1: "12 Main St", street2: "", city: "Austin", state: "tx", zip: "78701", phone: "(512) 555-0100", email: "Jane@Example.com", bankName: "Chase", accountNumber: "123456789", routingNumber: "021000021", accountType: "Checking" };

// the methods the company pays through
assert.deepEqual(PAYOUT_METHODS.map((m) => m.key), ["bank", "paypal", "cashapp", "venmo", "chime"]);
for (const m of ["bank", "paypal", "cashapp", "venmo", "chime"]) assert.ok(cleanPayoutDetails({ ...good, method: m }).ok, m);
for (const m of ["ach", "", "zelle"]) assert.equal(cleanPayoutDetails({ ...good, method: m }).ok, false, m);

// every method needs the same bank fields
const ok = cleanPayoutDetails(good);
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.value.state, "TX");
  assert.equal(ok.value.email, "jane@example.com");
  assert.equal(ok.value.accountType, "checking");
  assert.equal(addressLine(ok.value), "12 Main St, Austin, TX 78701");
}
for (const m of ["bank", "paypal", "cashapp", "venmo", "chime"]) {
  assert.equal(cleanPayoutDetails({ ...good, method: m, routingNumber: "" }).ok, false);
  assert.equal(cleanPayoutDetails({ ...good, method: m, accountNumber: "" }).ok, false);
}
const bad = (over: object, re: RegExp) => { const r = cleanPayoutDetails({ ...good, ...over }); assert.equal(r.ok, false); if (!r.ok) assert.match(r.error, re); };
bad({ holderName: "J" }, /full name/);
bad({ holderName: "Jane 2" }, /numbers/);
bad({ street1: "" }, /street/);
bad({ state: "Texas" }, /state/);
bad({ zip: "7870" }, /ZIP/);
bad({ phone: "555-0100" }, /phone/);
bad({ email: "nope" }, /email/);
bad({ bankName: "" }, /bank/);
bad({ routingNumber: "123456789" }, /routing/);
bad({ routingNumber: "02100002" }, /exactly 9 digits/);
bad({ routingNumber: "0210000211" }, /exactly 9 digits/);
bad({ routingNumber: "02100002a" }, /digits only/);
bad({ routingNumber: "" }, /exactly 9 digits/);
bad({ accountNumber: "12ab" }, /account number/);
bad({ accountType: "business" }, /checking or savings/);
// messages never echo a number
for (const over of [{ routingNumber: "123456789" }, { accountNumber: "12ab34" }]) { const r = cleanPayoutDetails({ ...good, ...over }); if (!r.ok) assert.ok(!/123456789|12ab34/.test(r.error)); }

// spaces and dashes in the numbers are fine
const spaced = cleanPayoutDetails({ ...good, routingNumber: "0210-0002 1", accountNumber: "1234-5678 9" });
assert.ok(spaced.ok && spaced.value.routingNumber === "021000021" && spaced.value.accountNumber === "123456789");

// storage round trip
if (ok.ok) { assert.deepEqual(detailsFromJson(detailsToJson(ok.value)), ok.value); }
assert.equal(detailsFromJson("{}"), null);
assert.equal(detailsFromJson("nope"), null);
assert.equal(maskedPayoutLine("chime", "checking", "1234"), "Chime - Checking account ending 1234");
assert.equal(maskedPayoutLine("cashapp", "savings", "6789"), "Cash App - Savings account ending 6789");

// the link
const t = newLinkToken(Date.UTC(2026, 9, 1));
assert.ok(looksLikeLinkToken(t.token));
assert.equal(t.tokenHash, hashLinkToken(t.token));
assert.notEqual(newLinkToken(1).token, t.token);
assert.equal(t.expiresAt, new Date(Date.UTC(2026, 9, 1) + LINK_VALID_DAYS * 86400000).toISOString());
assert.equal(LINK_VALID_DAYS, 14);
assert.equal(looksLikeLinkToken("short"), false);
assert.equal(looksLikeLinkToken("a".repeat(42) + "!"), false);
assert.equal(linkUrl("https://x.test/", t.token), `https://x.test/payment-details/${t.token}`);

// customer states
const now = Date.UTC(2026, 9, 5);
const row = (o: object = {}) => ({ status: "OPEN", expiresAt: new Date(now + 1000).toISOString(), erasedAt: null, ...o });
assert.equal(customerLinkState(null, false, now), "invalid");
assert.equal(customerLinkState(row(), false, now), "open");
assert.equal(customerLinkState(row({ status: "SUBMITTED" }), false, now), "received"); // one time: the page shows no form for it
assert.equal(customerLinkState(row({ status: "SUBMITTED" }), true, now), "closed"); // paid: locked
assert.equal(customerLinkState(row({ status: "CANCELLED" }), false, now), "closed");
assert.equal(customerLinkState(row({ erasedAt: "x" }), false, now), "closed");
assert.equal(customerLinkState(row({ expiresAt: new Date(now - 1).toISOString() }), false, now), "expired");
// staff states
assert.equal(staffLinkState(null, now), "none");
assert.equal(staffLinkState(row(), now), "waiting");
assert.equal(staffLinkState(row({ expiresAt: new Date(now - 1).toISOString() }), now), "expired");
assert.equal(staffLinkState(row({ status: "SUBMITTED" }), now), "received");
assert.equal(staffLinkState(row({ status: "SUBMITTED", erasedAt: "x" }), now), "erased");
assert.equal(staffLinkState(row({ status: "CANCELLED" }), now), "cancelled");

// the email carries the link and never asks for details by reply
const mail = linkEmailContent({ companyName: "Plantarz <Medical>", quotationNumber: "Q-1001", customerName: "Jane", url: "https://x.test/payment-details/abc" });
assert.match(mail.subject, /Q-1001/);
assert.match(mail.text, /https:\/\/x\.test\/payment-details\/abc/);
assert.match(mail.text, /do not reply/);
assert.match(mail.text, /ONE time/);
assert.match(ONE_TIME_TEXT, /ONE-TIME SUBMISSION/);
assert.ok(mail.html.includes("&lt;Medical&gt;"));
// why the link is sent
assert.deepEqual(LINK_REASONS.map((r) => r.key), ["new_customer", "never_paid", "new_banking", "other"]);
assert.deepEqual(cleanReason("new_banking", "ignored"), { ok: true, reason: "new_banking", note: null });
assert.deepEqual(cleanReason("other", "  Moved   banks "), { ok: true, reason: "other", note: "Moved banks" });
assert.equal(cleanReason("other", "").ok, false);
assert.equal(cleanReason("whatever", "").ok, false);
assert.equal(cleanReason(undefined, "").ok, false);
assert.match(reasonLabel("new_customer")!, /haven't worked/);
assert.equal(reasonLabel("zzz"), null);
const m2 = linkEmailContent({ companyName: "Co", quotationNumber: "Q-2", customerName: "Sam", url: "https://x.test/payment-details/z", reason: "new_customer" });
assert.ok(m2.text.includes(reasonCustomerLine("new_customer")) && m2.html.includes("first order together"));
// the explanations on the form
assert.match(FINTECH_NOTE, /PayPal, Cash App, Venmo and Chime/);
assert.match(FINTECH_NOTE, /customer service/);
assert.deepEqual(Object.keys(METHOD_HELP).sort(), PAYOUT_METHODS.map((m) => m.key).sort());
assert.equal(maskedPayoutLine("bank", "checking", "1234"), "Bank account - Checking account ending 1234");
assert.equal(companySlug("USA Test Strips Center"), "usa-test-strips-center");
assert.equal(companySlug("Receipt Name & Co."), "receipt-name-and-co");
assert.equal(companySlug("  Caf\u00e9 -- Ni\u00f1o!! "), "cafe-nino");
assert.equal(companySlug("***"), "company");
assert.equal(companySlug(null), "company");
assert.ok(companySlug("a".repeat(120)).length <= 50);
const tok = "A".repeat(43);
assert.equal(linkUrl("https://jindjinni.com/", tok, "USA Test Strips Center"), `https://jindjinni.com/payment-details/usa-test-strips-center/${tok}`);
assert.equal(linkUrl("https://jindjinni.com", tok), `https://jindjinni.com/payment-details/${tok}`);
console.log("payout-link-rules ok");
