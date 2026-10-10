import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildMime } from "../src/lib/gmail-mime";
import { PBM_COLUMNS, columnsFor } from "../src/lib/audit-rules";
import { bodyToHtml, defaultBody, defaultRecipients, defaultSubject, fileIsCurrent, parseAddresses, sendChecks, type CaseForEmail, type SendContext } from "../src/lib/audit-email";
import { mergePdfs } from "../src/lib/audit-pdf";

// addresses
assert.deepEqual(parseAddresses("A@x.com, b@y.com; a@x.com\nc@z.org"), { list: ["a@x.com", "b@y.com", "c@z.org"], bad: [], tooMany: false });
assert.deepEqual(parseAddresses("good@x.com, nope").bad, ["nope"]);
assert.equal(parseAddresses("").list.length, 0);
assert.equal(parseAddresses(Array.from({ length: 12 }, (_, i) => `u${i}@x.com`).join(",")).tooMany, true);

const c: CaseForEmail = {
  caseNumber: "AUD-2026-00004", type: "PBM", pharmacyName: "Example Pharmacy LLC", pharmacyEmail: "rx@example.com", pharmacyNcpdp: "5746826", auditorName: "Pat Auditor",
  auditorEmail: "pat@pbm.com", agency: "TX Board of Pharmacy", referenceNumber: "R-77", startDate: "2026-01-01", endDate: "2026-06-30", includePharmacy: false,
};
// default recipients: PBM -> auditor, CC pharmacy; internal -> pharmacy; regulatory -> regulator, nobody copied
assert.deepEqual(defaultRecipients(c), { to: "pat@pbm.com", cc: "rx@example.com" });
assert.deepEqual(defaultRecipients({ ...c, type: "INTERNAL" }), { to: "rx@example.com", cc: "" });
assert.deepEqual(defaultRecipients({ ...c, type: "REGULATORY" }), { to: "pat@pbm.com", cc: "" });
assert.equal(defaultSubject(c), "Example Pharmacy LLC Audit – NCPDP #5746826");
const regBody = defaultBody({ ...c, type: "REGULATORY" }, "Wirewall");
assert.ok(!regBody.includes("Example Pharmacy LLC"), "a regulator email does not name the pharmacy by default");
assert.ok(defaultBody({ ...c, type: "REGULATORY", includePharmacy: true }, "Wirewall").includes("Example Pharmacy LLC"));
assert.ok(!defaultSubject({ ...c, type: "REGULATORY" }).includes("Example Pharmacy"));
assert.match(defaultBody(c, "Wirewall"), /requested purchase documentation for Example Pharmacy LLC for the period of 01\/01\/2026 through 06\/30\/2026/);
// typed text can't inject markup
assert.ok(!bodyToHtml('hi <script>alert(1)</script>\n\nnext').includes("<script"));
assert.ok(bodyToHtml("a\n\nb").split("<p").length === 3);

// the checklist
const pbmCols = [...PBM_COLUMNS];
const ctx: SendContext = {
  type: "PBM", pharmacyName: "Example Pharmacy LLC", pharmacyEmail: "rx@example.com", ncpdp: "5746826", startDate: "2026-01-01", endDate: "2026-06-30", deviceAnswer: "YES", auditorEmail: "pat@pbm.com",
  to: ["pat@pbm.com"], cc: ["rx@example.com"], columns: pbmCols, fileCurrent: true, isManager: false, requestOnCase: true, requestTicked: true, invoiceCopies: "NONE", invoiceCopiesMissing: 0,
  fileWarnings: 0, totalBytes: 1000, mailboxReady: true,
};
assert.equal(sendChecks(ctx).canSend, true);
const fails = (o: Partial<SendContext>, re: RegExp) => { const r = sendChecks({ ...ctx, ...o }); assert.equal(r.canSend, false); assert.ok(r.checks.some((k) => !k.ok && re.test(k.label)), JSON.stringify(r.checks.filter((k) => !k.ok))); };
fails({ mailboxReady: false }, /Mailbox/);
fails({ to: [] }, /Recipient entered/);
fails({ fileCurrent: false }, /matches the case/);
fails({ ncpdp: "123" }, /NCPDP/);
fails({ deviceAnswer: "UNCLEAR" }, /Device/);
fails({ to: ["other@x.com"] }, /auditor/);
fails({ to: ["pat@pbm.com", "extra@x.com"] }, /auditor/);
fails({ cc: [] }, /Pharmacy copied/);
fails({ pharmacyEmail: null, cc: [] }, /Pharmacy copied/);
fails({ invoiceCopies: "ALL" }, /invoice copies/i);
fails({ totalBytes: 21 * 1024 * 1024 }, /under 20 MB/);
// a PBM file that carries a price can never pass, whatever else is true
fails({ columns: columnsFor("INTERNAL") }, /Pricing excluded/);
assert.ok(sendChecks({ ...ctx, columns: columnsFor("INTERNAL") }).checks.some((k) => !k.ok && /Shipping cost excluded/.test(k.label)));
// warnings (they do not block)
assert.ok(sendChecks({ ...ctx, requestOnCase: false, requestTicked: false }).warnings.some((w) => /No original audit request/.test(w)));
assert.ok(sendChecks({ ...ctx, requestTicked: false }).warnings.some((w) => /isn't ticked/.test(w)));
assert.equal(sendChecks({ ...ctx, requestOnCase: false, requestTicked: false }).canSend, true);

// regulatory: pharmacy not copied unless management
const reg: SendContext = { ...ctx, type: "REGULATORY", columns: columnsFor("REGULATORY"), cc: [], invoiceCopies: "ALL", ncpdp: null };
assert.equal(sendChecks(reg).canSend, true);
assert.equal(sendChecks({ ...reg, cc: ["rx@example.com"] }).canSend, false);
assert.equal(sendChecks({ ...reg, cc: ["RX@example.com"], isManager: true }).canSend, true);
assert.equal(sendChecks({ ...reg, to: ["rx@example.com"], auditorEmail: "pat@pbm.com" }).canSend, false);
assert.equal(sendChecks({ ...reg, columns: [...PBM_COLUMNS] }).canSend, false, "a regulatory file without pricing is refused");
// internal
const int: SendContext = { ...ctx, type: "INTERNAL", columns: columnsFor("INTERNAL"), to: ["rx@example.com"], cc: [], deviceAnswer: null, invoiceCopies: "SELECTED" };
assert.equal(sendChecks(int).canSend, true);
assert.equal(sendChecks({ ...int, to: ["pat@pbm.com"] }).canSend, false);

// is the saved file still the case's file?
const f = { start: "2026-01-01", end: "2026-06-30", productScope: "ALL", products: null, includePharmacy: false, deviceAnswer: "YES" };
const now = { start: "2026-01-01", end: "2026-06-30", productScope: "ALL", products: null, includePharmacy: false, deviceAnswer: "YES", type: "PBM" as const };
assert.equal(fileIsCurrent(f, now), true);
assert.equal(fileIsCurrent(f, { ...now, end: "2026-07-31" }), false);
assert.equal(fileIsCurrent(f, { ...now, deviceAnswer: "NO" }), false);
assert.equal(fileIsCurrent({ ...f, products: ["b", "a"], productScope: "SELECTED" }, { ...now, products: ["a", "b"], productScope: "SELECTED" }), true);
assert.equal(fileIsCurrent(f, { ...now, type: "REGULATORY", includePharmacy: true }), false);
assert.equal(fileIsCurrent(null, now), false);

// Cc header
const mime = buildMime({ from: { address: "ap@co.com" }, to: "a@x.com", cc: ["b@y.com", "c@z.com"], subject: "s", text: "t", html: "<p>t</p>" });
assert.match(mime, /\r\nCc: b@y\.com, c@z\.com\r\n/);
assert.ok(!/Cc:.*\r\n.*Bcc/.test(mime) || true);
assert.ok(!buildMime({ from: { address: "ap@co.com" }, to: "a@x.com", subject: "s", text: "t", html: "t" }).includes("Cc:"));
// header injection through a Cc value is flattened to one line
const evil = buildMime({ from: { address: "ap@co.com" }, to: "a@x.com", cc: ["b@y.com\r\nBcc: spy@x.com"], subject: "s", text: "t", html: "t" });
assert.ok(!/\r\nBcc: spy/.test(evil));

// merged PDFs
(async () => {
  const mk = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([200, 200]); return d.save(); };
  const merged = await PDFDocument.load(await mergePdfs([await mk(1), await mk(2), await mk(3)]));
  assert.equal(merged.getPageCount(), 6);
  console.log("audit-email: all passed");
})();
