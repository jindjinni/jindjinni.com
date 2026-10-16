import assert from "node:assert/strict";
import { autoSendDecision, emailReadiness, templateWarnings, csMatches, groupOrdersByDay, isEmailAddress, type ReadinessInput } from "../src/lib/customer-service-rules";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("PASS", name); };
const base: ReadinessInput = { emailsEnabled: true, hasWebsiteLink: true, senderProblem: null, toEmail: "a@b.co", status: "RECEIVING_COMPLETE", accountsStatus: "PAID", hasPaymentReceipt: true, adjustmentNeeded: "NO", customerNote: null, adjustmentDetails: null, adjustedOrderTotal: null, adjustmentAmountEmail: null, hasRevisedInvoice: false };
t("a standard paid order with a receipt is ready", () => assert.deepEqual(emailReadiness(base), { blockers: [], ready: true }));
t("emails off blocks", () => assert.match(emailReadiness({ ...base, emailsEnabled: false }).blockers[0], /turned off/));
t("no website link blocks", () => assert.ok(emailReadiness({ ...base, hasWebsiteLink: false }).blockers.some((b) => /website link/.test(b))));
t("a mailbox that needs reconnecting blocks", () => assert.ok(emailReadiness({ ...base, senderProblem: "reconnect it" }).blockers.includes("reconnect it")));
t("in progress blocks", () => assert.ok(emailReadiness({ ...base, status: "IN_PROGRESS" }).blockers.some((b) => /submitted/.test(b))));
t("not paid blocks", () => assert.ok(emailReadiness({ ...base, accountsStatus: "IN_REVIEW" }).blockers.some((b) => /Paid/.test(b))));
t("bad address blocks", () => assert.ok(emailReadiness({ ...base, toEmail: "nope" }).blockers.some((b) => /email address/.test(b))));
t("no receipt blocks", () => assert.ok(emailReadiness({ ...base, hasPaymentReceipt: false }).blockers.some((b) => /receipt/.test(b))));
t("an adjustment needs note, payout and revised invoice", () => assert.equal(emailReadiness({ ...base, adjustmentNeeded: "YES" }).blockers.length, 3));
t("a complete adjustment is ready", () => assert.ok(emailReadiness({ ...base, adjustmentNeeded: "YES", customerNote: "x", adjustedOrderTotal: 5, hasRevisedInvoice: true }).ready));
t("adjustment details can stand in for the note", () => assert.ok(emailReadiness({ ...base, adjustmentNeeded: "YES", adjustmentDetails: "x", adjustmentAmountEmail: -3, hasRevisedInvoice: true }).ready));
t("email regex", () => { assert.ok(isEmailAddress(" a@b.co ")); assert.ok(!isEmailAddress("a@b")); assert.ok(!isEmailAddress(null)); });
t("search matches name, number, email", () => { const o = { customerName: "Jason Lee", quotationNumber: "REF-1", email: "j@x.com" }; assert.ok(csMatches(o, "jason") && csMatches(o, "ref-1") && csMatches(o, "J@X") && !csMatches(o, "zzz") && csMatches(o, " ")); });
t("grouping: days ordered, no-date last, totals in cents", () => {
  const os = [{ d: "2026-10-05", amount: 0.1 }, { d: "2026-10-03", amount: 0.2 }, { d: "", amount: 1 }, { d: "2026-10-05", amount: 0.2 }];
  const g = groupOrdersByDay(os, (o) => o.d, false);
  assert.deepEqual(g.map((x) => x.day), ["2026-10-03", "2026-10-05", ""]);
  assert.equal(g[1].total, 0.3);
  assert.deepEqual(groupOrdersByDay(os, (o) => o.d, true).map((x) => x.day), ["2026-10-05", "2026-10-03", ""]);
});
// ---- choosing a template (feature cs-email-edit): the checks follow the template that will be sent ----
const adj: ReadinessInput = { ...base, adjustmentNeeded: "YES", emailEditable: true };
t("editable: an order with an adjustment is not stopped for a missing note", () => assert.ok(!emailReadiness({ ...adj, adjustedOrderTotal: 5, hasRevisedInvoice: true }).blockers.some((b) => /note/.test(b))));
t("an Adjustment template on a clean order needs the payout and the revised invoice", () => {
  const r = emailReadiness({ ...base, emailEditable: true, template: "ADJUSTMENT_ONLY" });
  assert.equal(r.blockers.length, 2);
  assert.ok(r.blockers.some((b) => /adjusted payout/.test(b)) && r.blockers.some((b) => /revised invoice/.test(b)));
});
t("a Standard template on an adjusted order asks for no adjustment documents", () => assert.ok(emailReadiness({ ...adj, template: "STANDARD" }).ready));
t("with no template chosen the order's own answer decides, as before", () => assert.equal(emailReadiness({ ...base, adjustmentNeeded: "YES" }).blockers.length, 3));
t("warnings: the recommended template has none", () => assert.deepEqual(templateWarnings({ template: "STANDARD", recommended: "STANDARD", adjustmentNeeded: "NO", packagingNotAcceptable: false }), []));
t("warnings: Standard on an adjusted order is called out", () => {
  const w = templateWarnings({ template: "STANDARD", recommended: "ADJUSTMENT_ONLY", adjustmentNeeded: "YES", packagingNotAcceptable: false });
  assert.ok(w.some((x) => /isn't the template/.test(x)) && w.some((x) => /nothing was adjusted/.test(x)));
});
t("warnings: a packaging notice on acceptable packaging, and a missing one on bad packaging", () => {
  assert.ok(templateWarnings({ template: "STANDARD_PACKAGING_NOTICE", recommended: "STANDARD", adjustmentNeeded: "NO", packagingNotAcceptable: false }).some((x) => /packaging was acceptable/i.test(x)));
  assert.ok(templateWarnings({ template: "STANDARD", recommended: "STANDARD_PACKAGING_NOTICE", adjustmentNeeded: "NO", packagingNotAcceptable: true }).some((x) => /doesn't mention it/.test(x)));
});
// ---- automatic payment email ----
const okReady = { blockers: [], ready: true };
const notReady = { blockers: ["This customer has no valid email address on the order."], ready: false };
t("auto: everything ready, feature and switch on -> send", () => assert.deepEqual(autoSendDecision({ featureOn: true, settingOn: true, alreadyEmailed: false, readiness: okReady }), { action: "send" }));
t("auto: feature off -> quiet hold, nothing said", () => assert.deepEqual(autoSendDecision({ featureOn: false, settingOn: true, alreadyEmailed: false, readiness: okReady }), { action: "hold", quiet: true, message: "" }));
t("auto: the company's switch off -> quiet hold", () => assert.equal((autoSendDecision({ featureOn: true, settingOn: false, alreadyEmailed: false, readiness: okReady }) as { quiet: boolean }).quiet, true));
t("auto: already emailed -> never again", () => assert.equal(autoSendDecision({ featureOn: true, settingOn: true, alreadyEmailed: true, readiness: okReady }).action, "hold"));
t("auto: something missing -> holds and says what and where it waits", () => {
  const d = autoSendDecision({ featureOn: true, settingOn: true, alreadyEmailed: false, readiness: notReady });
  assert.ok(d.action === "hold" && !d.quiet && /no valid email/.test(d.message) && /To Be Emailed/.test(d.message));
});
t("auto: never sends when the manual send would be blocked", () => {
  for (const r of [notReady, { blockers: ["x", "y"], ready: false }]) assert.equal(autoSendDecision({ featureOn: true, settingOn: true, alreadyEmailed: false, readiness: r }).action, "hold");
});
console.log(n + " passed");
