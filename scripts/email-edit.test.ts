import assert from "node:assert/strict";
import { validateEditedEmail } from "../src/lib/email-templates";
import { textToHtml, plain } from "../src/lib/receiving-emails";

// a finished email passes
assert.deepEqual(validateEditedEmail("Order received", "Hi Sam,\n\nThanks!"), []);
// empty or multi-line subject, empty body
assert.ok(validateEditedEmail("", "Hi")[0].includes("subject can't be empty"));
assert.ok(validateEditedEmail("Line one\nLine two", "Hi").some((e) => e.includes("single line")));
assert.ok(validateEditedEmail("Hi", "   ").some((e) => e.includes("text can't be empty")));
// too long
assert.ok(validateEditedEmail("x".repeat(500), "Hi").some((e) => e.includes("too long")));
assert.ok(validateEditedEmail("Hi", "x".repeat(9000)).some((e) => e.includes("too long")));
// a placeholder left unfilled is caught, an unknown {word} is left alone
assert.ok(validateEditedEmail("Hi {customerName}", "ok").some((e) => e.includes("{customerName}")));
assert.ok(validateEditedEmail("Hi", "Your {finalAmount} and {note}").some((e) => e.includes("{finalAmount}")));
assert.deepEqual(validateEditedEmail("Hi", "curly {braces} are fine"), []);
// what the agent types is what is sent: links, bold, escaping
assert.ok(textToHtml("[Our site](https://example.com) **bold** <b>").includes('<a href="https://example.com">Our site</a>'));
assert.ok(textToHtml("<script>").includes("&lt;script&gt;"));
assert.equal(plain("[Our site](https://example.com) **bold**"), "Our site: https://example.com bold");
console.log("email-edit: ok");
