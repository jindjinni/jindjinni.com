import assert from "node:assert/strict";
process.env.AUTH_SECRET = "test-secret-for-bank-tests";
delete process.env.BANK_DATA_KEY;
import { cleanPayout, last4, maskedLine, payoutFromJson, payoutToJson, routingOk } from "../src/lib/bank-rules";
import { decryptBank, encryptBank } from "../src/lib/bank-crypto";
import { canRevealBankDetails } from "../src/lib/permissions";

let n = 0;
const t = (name: string, ok: boolean) => { n++; assert.ok(ok, name); };

// routing numbers (021000021 is a published, real-format example; 011401533 and 091000019 are also valid format)
t("valid routing numbers pass", routingOk("021000021") && routingOk("011401533") && routingOk("091000019"));
t("mistyped routing numbers fail", !routingOk("021000022") && !routingOk("12345678") && !routingOk("1234567890") && !routingOk("abcdefghi") && !routingOk(""));

const good = { ownerName: "  Pat   Lee ", routingNumber: "021 000-021", accountNumber: "0012-3456 789", accountType: "Checking" };
const ok = cleanPayout(good);
t("a good set is cleaned", ok.ok && ok.value.ownerName === "Pat Lee" && ok.value.routingNumber === "021000021" && ok.value.accountNumber === "00123456789" && ok.value.accountType === "checking");
t("the owner's name is needed and has no digits", !cleanPayout({ ...good, ownerName: "" }).ok && !cleanPayout({ ...good, ownerName: "P" }).ok && !cleanPayout({ ...good, ownerName: "Pat 2" }).ok);
t("bad routing is refused", !cleanPayout({ ...good, routingNumber: "021000022" }).ok);
t("account number must be 4 to 17 digits", !cleanPayout({ ...good, accountNumber: "123" }).ok && !cleanPayout({ ...good, accountNumber: "1".repeat(18) }).ok && !cleanPayout({ ...good, accountNumber: "12ab5678" }).ok && cleanPayout({ ...good, accountNumber: "1234" }).ok && cleanPayout({ ...good, accountNumber: "1".repeat(17) }).ok);
t("account type must be checking or savings", !cleanPayout({ ...good, accountType: "money market" }).ok && !cleanPayout({ ...good, accountType: "" }).ok && cleanPayout({ ...good, accountType: "SAVINGS" }).ok);
t("odd input types do not throw", !cleanPayout({ ownerName: { a: 1 }, routingNumber: null, accountNumber: undefined, accountType: 5 }).ok);
t("an error message never repeats a number", [{ ...good, routingNumber: "021000022" }, { ...good, accountNumber: "12ab5678" }].every((i) => { const r = cleanPayout(i); return !r.ok && !/021000022|12ab5678/.test(r.error); }));

t("the stored JSON round-trips and rejects junk", (() => { const p = ok.ok ? ok.value : null; return !!p && JSON.stringify(payoutFromJson(payoutToJson(p))) === JSON.stringify(p) && payoutFromJson("nope") === null && payoutFromJson('{"n":1}') === null; })());
t("masks show only the last 4", last4("00123456789") === "6789" && maskedLine("checking", "6789") === "Checking account ending 6789" && maskedLine("savings", "1") === "Savings account ending 1");

// encryption
const plain = payoutToJson(ok.ok ? ok.value : (null as never));
const enc = encryptBank(plain, "org_a|req_1");
t("the stored text does not contain the numbers or the name", !enc.includes("021000021") && !enc.includes("00123456789") && !enc.includes("Pat") && enc.startsWith("b1."));
t("it decrypts for the right owner", decryptBank(enc, "org_a|req_1") === plain);
t("it does not decrypt for another record or company", decryptBank(enc, "org_a|req_2") === null && decryptBank(enc, "org_b|req_1") === null);
t("tampering is detected", (() => { const parts = enc.split("."); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA"); return decryptBank(parts.join("."), "org_a|req_1") === null; })());
t("junk does not throw", decryptBank("", "x") === null && decryptBank("b1.a.b.c", "x") === null && decryptBank("v1.a.b.c", "x") === null);
t("the same text encrypts differently every time", encryptBank(plain, "a") !== encryptBank(plain, "a"));
process.env.BANK_DATA_KEY = "another-key";
t("a changed key can't read old values", decryptBank(enc, "org_a|req_1") === null);

// who may see the full details
t("owner, admin and the accountant may reveal bank details", canRevealBankDetails("owner") && canRevealBankDetails("admin") && canRevealBankDetails("accountant"));
t("purchasing, receiving, customer service and plain staff may not", ["purchasing_manager", "purchasing_agent", "receiver", "customer_service", "staff", "custom", ""].every((r) => !canRevealBankDetails(r)));

console.log(`bank-rules: ${n} checks passed`);
