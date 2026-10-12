import assert from "node:assert/strict";
import { checkPlannedAddress, companyDomain, domainOf, emailDeptsFor, suggestedAddress } from "../src/lib/email-setup-rules";

assert.deepEqual(emailDeptsFor({ wholesale: true, distribution: false }), ["purchasing", "receiving", "accounts", "customer-service"]);
assert.equal(emailDeptsFor({ wholesale: true, distribution: true }).length, 6);
assert.equal(domainOf("Ana@Acme-Supply.com "), "acme-supply.com");
assert.equal(domainOf("nope"), null);
assert.equal(companyDomain(["me@gmail.com", "owner@acme.com"]), "acme.com");
assert.equal(companyDomain(["me@gmail.com"]), null);
assert.equal(suggestedAddress("customer-service", "acme.com"), "support@acme.com");
assert.equal(suggestedAddress("purchasing", null), "purchasing@yourcompany.com");

assert.deepEqual(checkPlannedAddress("Purchasing@Acme.com", "acme.com", []), { ok: true, email: "purchasing@acme.com" });
assert.equal(checkPlannedAddress("", "acme.com", []).ok, false);
assert.equal(checkPlannedAddress("not an email", "acme.com", []).ok, false);
const dup = checkPlannedAddress("a@acme.com", "acme.com", ["A@acme.com"]);
assert.equal(dup.ok, false);
const free = checkPlannedAddress("me@gmail.com", "acme.com", []);
assert.ok(free.ok && free.warning && /personal gmail\.com/.test(free.warning));
const other = checkPlannedAddress("x@other.com", "acme.com", []);
assert.ok(other.ok && other.warning && /other\.com/.test(other.warning));
const noDomain = checkPlannedAddress("x@other.com", null, []);
assert.ok(noDomain.ok && !noDomain.warning);
console.log("email-setup-rules ok");
