import assert from "node:assert/strict";
import { cleanSubject, consentActive, emailSubject, minutesLeft, stripQuotedReply, ticketNoFromSubject, ticketProblem } from "../src/lib/support-rules";
import { nextCompanyNumber } from "../src/lib/company-code";
import { stageAllows } from "../src/lib/feature-stages";

assert.equal(ticketNoFromSubject("Re: [#1042] Printer"), 1042);
assert.equal(ticketNoFromSubject("Fwd: Re: [#7] x"), 7);
assert.equal(ticketNoFromSubject("About ticket #2045 please"), 2045);
assert.equal(ticketNoFromSubject("I have 12 apples"), null);
assert.equal(ticketNoFromSubject("order #12 is late"), null, "short numbers need the [#] form");
assert.equal(cleanSubject("Re: RE: [#1042]  Printer   jam \n"), "Printer jam");
assert.equal(emailSubject(5, "Hi"), "[#5] Hi");
assert.equal(ticketProblem("ab", "x") !== null, true);
assert.equal(ticketProblem("Printer", "") !== null, true);
assert.equal(ticketProblem("Printer", "x".repeat(5001)) !== null, true);
assert.equal(ticketProblem("Printer", "It jams"), null);
assert.equal(stripQuotedReply("Thanks, fixed!\n\nOn Tue, Oct 6, 2026 at 3:01 PM Support <s@x.com> wrote:\n> old stuff"), "Thanks, fixed!");
assert.equal(stripQuotedReply("Yes\n-- \nBob"), "Yes");
assert.equal(stripQuotedReply("Line1\nLine2\n> quoted"), "Line1\nLine2");

const now = Date.parse("2026-10-08T12:00:00Z");
assert.equal(consentActive("2026-10-08T12:00:01Z", now), true);
assert.equal(consentActive("2026-10-08T12:00:00Z", now), false);
assert.equal(consentActive(null, now), false);
assert.equal(consentActive("garbage", now), false);
assert.equal(minutesLeft("2026-10-08T12:10:01Z", now), 11);
assert.equal(minutesLeft("2026-10-08T11:00:00Z", now), 0);

assert.equal(nextCompanyNumber([]), 1001);
assert.equal(nextCompanyNumber(["JJ-1001", "JJ-1007", null, "junk"]), 1008);

assert.equal(stageAllows("off", true, true), false);
assert.equal(stageAllows("mothership", true, false), true);
assert.equal(stageAllows("mothership", false, true), false);
assert.equal(stageAllows("selected", false, true), true);
assert.equal(stageAllows("selected", false, false), false);
assert.equal(stageAllows("selected", true, false), true);
assert.equal(stageAllows("everyone", false, false), true);
console.log("support rules tests passed");

import { createHmac } from "node:crypto";
import { htmlToText, normalizeInbound, sharedSecretOk, splitFrom, verifySvix } from "../src/lib/support-inbound";
{
  const secretRaw = Buffer.from("super-secret-key-bytes").toString("base64");
  const secret = `whsec_${secretRaw}`;
  const body = '{"type":"email.received"}';
  const id = "msg_123";
  const nowMs = Date.parse("2026-10-08T12:00:00Z");
  const ts = String(Math.floor(nowMs / 1000));
  const sig = createHmac("sha256", Buffer.from(secretRaw, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body, nowMs), true);
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,AAAA v1,${sig}` }, body, nowMs), true, "any listed signature may match");
  assert.equal(verifySvix(secret, { id, timestamp: ts, signature: `v1,${sig}` }, body + " ", nowMs), false, "tampered body");
  assert.equal(verifySvix(secret, { id, timestamp: String(Number(ts) - 600), signature: `v1,${sig}` }, body, nowMs), false, "too old");
  assert.equal(verifySvix(secret, { id: null, timestamp: ts, signature: `v1,${sig}` }, body, nowMs), false);
  assert.equal(sharedSecretOk("s3cret", { header: "s3cret", authorization: null, query: null }), true);
  assert.equal(sharedSecretOk("s3cret", { header: null, authorization: "Bearer s3cret", query: null }), true);
  assert.equal(sharedSecretOk("s3cret", { header: "nope", authorization: null, query: null }), false);
  assert.equal(sharedSecretOk("", { header: "", authorization: null, query: "" }), false);
  assert.deepEqual(splitFrom('"Ann Lee" <ann@x.com>'), { address: "ann@x.com", name: "Ann Lee" });
  assert.deepEqual(splitFrom("bob@x.com"), { address: "bob@x.com", name: null });
  assert.equal(htmlToText("<p>Hi&nbsp;there</p><p>a &amp; b</p>"), "Hi there\na & b");
  const simple = normalizeInbound({ from: "Ann <ann@x.com>", subject: "Help", text: "It broke" });
  assert.equal(simple?.kind, "mail");
  const resend = normalizeInbound({ type: "email.received", data: { email_id: "e1", from: "ann@x.com", subject: "Help", message_id: "<m@x>" } });
  assert.equal(resend?.kind, "fetch");
  assert.equal(normalizeInbound({ nonsense: true }), null);
  assert.equal(normalizeInbound("x"), null);
}
console.log("inbound tests passed");
