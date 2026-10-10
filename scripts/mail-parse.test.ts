import assert from "node:assert/strict";
import { cleanText, decodeMimeWords, htmlToText, MAX_IN_BODY, parseAddressList, parseGmailMessage, parseGraphMessage, quotedText, replyRecipients, replySubject } from "../src/lib/mail-parse";

const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64url");

// html -> text: nothing active survives
const evil = `<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><p>Hello&nbsp;<b>Pat</b> &amp; team</p><img src="http://track/x.gif"><a href="javascript:x()">click</a><!-- hidden --><br>Line two<ul><li>one</li><li>two</li></ul></body></html>`;
const t = htmlToText(evil);
assert.ok(!/script|alert|style|img|http|javascript|hidden|<|>/.test(t.replace("&", "")), t);
assert.match(t, /Hello Pat & team/);
assert.match(t, /click/);
assert.match(t, /Line two/);
assert.match(t, /- one\n- two/);
assert.equal(htmlToText("&#x41;&#66;&bogus;&#0;"), "AB&bogus;");

// size cap and cleanup
assert.ok(cleanText("x".repeat(MAX_IN_BODY + 500)).length < MAX_IN_BODY + 80);
assert.equal(cleanText("a  \r\n\r\n\r\n\r\nb\u0000"), "a\n\nb");

// encoded words
assert.equal(decodeMimeWords("=?UTF-8?B?" + Buffer.from("Café order").toString("base64") + "?="), "Café order");
assert.equal(decodeMimeWords("=?UTF-8?Q?Caf=C3=A9_menu?="), "Café menu");
assert.equal(decodeMimeWords("=?ISO-8859-1?Q?Caf=E9?= =?ISO-8859-1?Q?_bar?="), "Café bar");
assert.equal(decodeMimeWords("plain"), "plain");

// addresses
assert.deepEqual(parseAddressList('Pat Lee <PAT@X.com>, other@y.com; "Doe, John" <jd@z.org>'), [
  { name: "Pat Lee", address: "pat@x.com" },
  { name: null, address: "other@y.com" },
  { name: "Doe, John", address: "jd@z.org" },
]);
assert.deepEqual(parseAddressList("not an address"), []);
assert.deepEqual(parseAddressList(null), []);

// Gmail message
const gm = parseGmailMessage({
  id: "m1",
  threadId: "t1",
  internalDate: String(Date.parse("2026-10-09T15:30:00Z")),
  labelIds: ["INBOX", "UNREAD"],
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "=?UTF-8?B?" + Buffer.from("Zoë Smith").toString("base64") + "?= <Zoe@Cust.com>" },
      { name: "To", value: "purchasing@us.com, b@us.com" },
      { name: "Cc", value: "c@us.com" },
      { name: "Subject", value: "=?UTF-8?B?" + Buffer.from("Order é 55").toString("base64") + "?=" },
      { name: "Message-ID", value: "<abc@cust.com>" },
    ],
    parts: [
      { mimeType: "multipart/alternative", parts: [
        { mimeType: "text/plain", body: { data: b64u("Please ship 5 boxes.\n\nThanks") } },
        { mimeType: "text/html", body: { data: b64u("<p>Please ship <b>5</b> boxes.</p>") } },
      ] },
      { mimeType: "application/pdf", filename: "po.pdf", body: { attachmentId: "att1", size: 1234 } },
      { mimeType: "image/png", filename: "", headers: [{ name: "Content-Disposition", value: "inline" }], body: { attachmentId: "att2", size: 10 } },
    ],
  },
});
assert.ok(gm);
assert.equal(gm!.fromName, "Zoë Smith");
assert.equal(gm!.fromAddress, "zoe@cust.com");
assert.equal(gm!.subject, "Order é 55");
assert.equal(gm!.to, "purchasing@us.com, b@us.com");
assert.equal(gm!.cc, "c@us.com");
assert.equal(gm!.bodyText, "Please ship 5 boxes.\n\nThanks");
assert.equal(gm!.threadKey, "g:t1");
assert.equal(gm!.rfcMessageId, "abc@cust.com");
assert.equal(gm!.at, "2026-10-09T15:30:00.000Z");
assert.equal(gm!.unread, true);
assert.equal(gm!.hasFiles, true);
assert.deepEqual(gm!.files.map((f) => f.filename), ["po.pdf"]);

// Gmail: html only, read, no payload
const gh = parseGmailMessage({ id: "m2", labelIds: ["INBOX"], payload: { mimeType: "text/html", headers: [{ name: "From", value: "a@b.com" }], body: { data: b64u("<div>Only <i>html</i></div>") } } });
assert.equal(gh!.bodyText, "Only html");
assert.equal(gh!.unread, false);
assert.equal(gh!.fromName, null);
assert.equal(parseGmailMessage({ id: "m3" }), null);

// Gmail: latin-1 text
const lat = parseGmailMessage({ id: "m4", payload: { mimeType: "text/plain", headers: [{ name: "Content-Type", value: 'text/plain; charset="iso-8859-1"' }], body: { data: Buffer.from([0x43, 0x61, 0x66, 0xe9]).toString("base64url") } } });
assert.equal(lat!.bodyText, "Café");

// Microsoft message
const mm = parseGraphMessage({
  id: "AAMk1", conversationId: "conv9", internetMessageId: "<id9@cust.com>", subject: "  Quote  request ", from: { emailAddress: { name: "Ann", address: "Ann@Cust.com" } },
  toRecipients: [{ emailAddress: { name: "us@co.com", address: "us@co.com" } }], ccRecipients: [{ emailAddress: { address: "x@y.com" } }],
  receivedDateTime: "2026-10-09T10:00:00Z", body: { contentType: "html", content: "<p>Need <b>10</b></p>" }, hasAttachments: true, isRead: false,
});
assert.equal(mm!.fromName, "Ann");
assert.equal(mm!.fromAddress, "ann@cust.com");
assert.equal(mm!.to, "us@co.com");
assert.equal(mm!.cc, "x@y.com");
assert.equal(mm!.subject, "Quote request");
assert.equal(mm!.bodyText, "Need 10");
assert.equal(mm!.threadKey, "m:conv9");
assert.equal(mm!.rfcMessageId, "id9@cust.com");
assert.equal(mm!.unread, true);
assert.equal(mm!.hasFiles, true);
assert.equal(parseGraphMessage({ id: "" } as never), null);
assert.equal(parseGraphMessage({ id: "z", body: { contentType: "text", content: "plain <b>text</b>" } })!.bodyText, "plain <b>text</b>"); // stored as text; shown as text

// replies
assert.equal(replySubject("Order 55"), "Re: Order 55");
assert.equal(replySubject("RE: Order 55"), "RE: Order 55");
assert.equal(replySubject(""), "Re: (no subject)");
assert.match(quotedText("Pat", "Oct 9, 2026", "line1\nline2"), /^\n\nOn Oct 9, 2026, Pat wrote:\n> line1\n> line2$/);
const m = { fromAddress: "cust@x.com", toAddresses: "Me <me@us.com>, b@us.com", ccAddresses: "c@us.com, cust@x.com" };
assert.deepEqual(replyRecipients(m, "me@us.com", false), { to: "cust@x.com", cc: "" });
assert.deepEqual(replyRecipients(m, "ME@us.com", true), { to: "cust@x.com", cc: "b@us.com, c@us.com" });
// answering our own sent mail goes to the people we wrote to
const sent = { fromAddress: "me@us.com", toAddresses: "a@x.com, b@x.com", ccAddresses: "c@x.com" };
assert.deepEqual(replyRecipients(sent, "me@us.com", false), { to: "a@x.com", cc: "" });
assert.deepEqual(replyRecipients(sent, "me@us.com", true), { to: "a@x.com, b@x.com", cc: "c@x.com" });

console.log("mail-parse: ok");
