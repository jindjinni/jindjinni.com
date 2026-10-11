import assert from "node:assert/strict";
import { cleanApplication, deaOk, luhnOk, mayUseAccount, nextBuyerStatus, npiOk } from "../src/lib/storefront-buyer-rules";

let n = 0;
const t = (name: string, ok: boolean) => { n++; assert.ok(ok, name); };

// identifiers
t("luhn known good", luhnOk("79927398713") && !luhnOk("79927398710") && !luhnOk("") && !luhnOk("12a4"));
t("a real-format NPI passes", npiOk("1234567893"));
t("a mistyped NPI fails", !npiOk("1234567890") && !npiOk("123456789") && !npiOk("12345678934") && !npiOk("abcdefghij"));
t("a DEA number with a good check digit passes", deaOk("AB1234563"));
t("a DEA number with a wrong check digit fails", !deaOk("AB1234567") && !deaOk("A12345678") && !deaOk("ab1234563"));

// application
const good = {
  businessName: "Main St Pharmacy", contactName: "Pat Lee", email: "Pat@MainSt.test", phone: "(713) 555-0100",
  street1: "1 Main St", street2: "", city: "Houston", state: "tx", zip: "77002",
  npi: "1234567893", deaNumber: "ab 1234563", licenseNumber: "ph 12345", licenseState: "tx", notes: "",
};
const ok = cleanApplication(good);
t("a good application passes", ok.ok);
t("cleaned: lowercase email, upper states, DEA without spaces, upper license", ok.ok && ok.value.email === "pat@mainst.test" && ok.value.state === "TX" && ok.value.npi === "1234567893" && ok.value.deaNumber === "AB1234563" && ok.value.licenseNumber === "PH 12345" && ok.value.licenseState === "TX");
t("an NCPDP number is never part of an application", !("ncpdp" in (ok.ok ? ok.value : {})));
t("DEA is required and checked", !cleanApplication({ ...good, deaNumber: "" }).ok && !cleanApplication({ ...good, deaNumber: "AB1234567" }).ok && cleanApplication({ ...good, deaNumber: "ab1234563" }).ok);
t("needs a name", !cleanApplication({ ...good, businessName: " " }).ok && !cleanApplication({ ...good, contactName: "" }).ok);
t("bad email", !cleanApplication({ ...good, email: "nope" }).ok && !cleanApplication({ ...good, email: "x@staff.invalid" }).ok);
t("NPI must pass the check", !cleanApplication({ ...good, npi: "1234567890" }).ok);
t("license needed", !cleanApplication({ ...good, licenseNumber: "" }).ok && !cleanApplication({ ...good, licenseNumber: "!!" }).ok && !cleanApplication({ ...good, licenseState: "Texas" }).ok);
t("address needed and checked", !cleanApplication({ ...good, street1: "" }).ok && !cleanApplication({ ...good, zip: "77" }).ok && !cleanApplication({ ...good, state: "Texas" }).ok);
t("bad phone", !cleanApplication({ ...good, phone: "12" }).ok && cleanApplication({ ...good, phone: "" }).ok);
t("link pile in notes refused", !cleanApplication({ ...good, notes: "http://a.test http://b.test http://c.test" }).ok);
t("odd input types do not throw", !cleanApplication({ ...good, email: { a: 1 }, deaNumber: null }).ok);

// moves
t("pending -> approved or declined", nextBuyerStatus("PENDING", "approve") === "APPROVED" && nextBuyerStatus("PENDING", "decline") === "DECLINED");
t("a declined application can still be approved later", nextBuyerStatus("DECLINED", "approve") === "APPROVED");
t("approved -> suspended -> approved", nextBuyerStatus("APPROVED", "suspend") === "SUSPENDED" && nextBuyerStatus("SUSPENDED", "reactivate") === "APPROVED");
t("nonsense moves are refused", nextBuyerStatus("APPROVED", "approve") === null && nextBuyerStatus("PENDING", "suspend") === null && nextBuyerStatus("SUSPENDED", "approve") === null && nextBuyerStatus("APPROVED", "decline") === null && nextBuyerStatus("PENDING", "reactivate") === null);
t("only approved accounts may sign in", mayUseAccount("APPROVED") && !mayUseAccount("PENDING") && !mayUseAccount("DECLINED") && !mayUseAccount("SUSPENDED") && !mayUseAccount(""));

console.log(`storefront-buyer-rules: ${n} checks passed`);
