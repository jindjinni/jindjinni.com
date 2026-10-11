import assert from "node:assert/strict";
import { cleanSellRequest } from "../src/lib/storefront-rules";
import {
  API_STATUS, REFERENCE_PATTERN, bearerOf, cleanItems, cleanKeyLabel, cleanOrigins, hashApiKey, hintOf, itemsToText, kindOfKey, looksLikeApiKey,
  mayDo, newApiKey, originAllowed, sellInputFromBody,
} from "../src/lib/storefront-api-rules";
import { makeReference } from "../src/lib/storefront-rules";

let n = 0;
const t = (name: string, ok: boolean) => { n++; assert.ok(ok, name); };

// keys
const sk = newApiKey("secret", Buffer.alloc(30, 7));
const pk = newApiKey("public", Buffer.alloc(30, 9));
t("secret and public keys have their own prefix and a fixed shape", sk.key.startsWith("jjsk_") && pk.key.startsWith("jjpk_") && looksLikeApiKey(sk.key) && looksLikeApiKey(pk.key) && sk.key.length === 45);
t("kind is read from the prefix", kindOfKey(sk.key) === "secret" && kindOfKey(pk.key) === "public");
t("real keys are random and different every time", newApiKey("secret").key !== newApiKey("secret").key);
t("only the hash is derived from the key, and it is not the key", sk.hash === hashApiKey(sk.key) && !sk.hash.includes(sk.key.slice(5, 15)) && sk.hash.length === 64);
t("the hint shows the start and the last 4 but never the whole key", sk.hint === hintOf(sk.key) && sk.hint.length < sk.key.length && sk.hint.endsWith(sk.key.slice(-4)));
t("junk is not a key", !looksLikeApiKey("") && !looksLikeApiKey("jjsk_short") && !looksLikeApiKey(null) && !looksLikeApiKey("xxsk_" + "a".repeat(40)) && !looksLikeApiKey("jjsk_" + "a".repeat(39) + "!"));
t("bearer header parsing", bearerOf(`Bearer ${sk.key}`) === sk.key && bearerOf(`bearer   ${sk.key}`) === sk.key && bearerOf(sk.key) === null && bearerOf("") === null && bearerOf(null) === null && bearerOf("Bearer a b") === null);
t("key names need 2 characters and are trimmed", !cleanKeyLabel("a").ok && !cleanKeyLabel(null).ok && (() => { const r = cleanKeyLabel("  Main   website "); return r.ok && r.label === "Main website"; })());

// permissions
t("a secret key may do everything", (["info", "sell-request-create", "sell-request-read", "application-create"] as const).every((a) => mayDo("secret", a)));
t("a public key may only send new things and check the connection", mayDo("public", "info") && mayDo("public", "sell-request-create") && mayDo("public", "application-create") && !mayDo("public", "sell-request-read"));

// website addresses
const o = cleanOrigins("https://www.Example.com/\nhttps://shop.example.com, http://localhost:3000\nhttps://www.example.com");
t("addresses are tidied, lower-cased and de-duplicated", o.ok && o.origins.join(" ") === "https://www.example.com https://shop.example.com http://localhost:3000");
t("empty is fine (none listed)", cleanOrigins("").ok && cleanOrigins("  \n ").ok);
t("wildcards, paths, queries and credentials are refused", !cleanOrigins("https://*.example.com").ok && !cleanOrigins("https://example.com/page").ok && !cleanOrigins("https://example.com?x=1").ok && !cleanOrigins("https://u:p@example.com").ok);
t("http is only for localhost; junk is refused", !cleanOrigins("http://example.com").ok && !cleanOrigins("example.com").ok && !cleanOrigins("https://intranet").ok && !cleanOrigins("javascript:alert(1)").ok && cleanOrigins("http://127.0.0.1:5173").ok);
t("at most 10 addresses", !cleanOrigins(Array.from({ length: 11 }, (_, i) => `https://s${i}.example.com`).join("\n")).ok && cleanOrigins(Array.from({ length: 10 }, (_, i) => `https://s${i}.example.com`).join("\n")).ok);
t("origin match is exact", originAllowed("https://www.example.com", ["https://www.example.com"]) && !originAllowed("https://example.com", ["https://www.example.com"]) && !originAllowed("https://www.example.com.evil.test", ["https://www.example.com"]) && !originAllowed(null, ["https://www.example.com"]) && !originAllowed("", []));

// product lines
const good = [{ name: "Dexcom G6 Sensor 3-pack", quantity: 4, ndc: "08627-0016-01", expiration: "2027-03", note: "sealed" }, { name: "Omnipod 5 Pods", quantity: "2" }];
const items = cleanItems(good);
t("product lines are checked and cleaned", items.ok && items.items.length === 2 && items.items[1].quantity === 2 && items.items[1].ndc === null);
t("no lines is fine", cleanItems(undefined).ok && cleanItems([]).ok);
t("bad lines are refused in plain words", !cleanItems("x").ok && !cleanItems([{ name: "", quantity: 1 }]).ok && !cleanItems([{ name: "A", quantity: 0 }]).ok && !cleanItems([{ name: "A", quantity: 1.5 }]).ok && !cleanItems([{ name: "A", quantity: 1, ndc: "abc" }]).ok && !cleanItems([{ name: "A", quantity: 1, expiration: "soon" }]).ok && !cleanItems([null]).ok);
t("at most 100 lines", !cleanItems(Array.from({ length: 101 }, () => ({ name: "A", quantity: 1 }))).ok);
t("lines become one readable line each", items.ok && itemsToText(items.items) === "4 x Dexcom G6 Sensor 3-pack (NDC 08627-0016-01, exp 2027-03, sealed)\n2 x Omnipod 5 Pods");

// a whole request
const base = { businessName: "Main St Rx", contactName: "Pat Lee", email: "pat@mainst.test", street1: "1 Main St", city: "Houston", state: "tx", zip: "77002" };
const m = sellInputFromBody({ ...base, items: good, donation: true, notes: "Thanks" });
t("a request with lines and a donation flag maps onto the storefront's own checks", m.ok && m.isDonation && /DONATION/.test(String(m.input.notes)) && /Thanks/.test(String(m.input.notes)) && cleanSellRequest(m.input).ok);
t("words only also works", (() => { const r = sellInputFromBody({ ...base, itemsText: "About 40 boxes of Libre 2 sensors, expiry 2027" }); return r.ok && !r.isDonation && cleanSellRequest(r.input).ok; })());
t("lines and words together are both kept", (() => { const r = sellInputFromBody({ ...base, items: good, itemsText: "Plus loose strips" }); return r.ok && /Dexcom/.test(String(r.input.itemsText)) && /loose strips/.test(String(r.input.itemsText)); })());
t("nothing to sell is refused by the same check as the page", (() => { const r = sellInputFromBody({ ...base }); return r.ok && !cleanSellRequest(r.input).ok; })());
t("a bad line stops the request", !sellInputFromBody({ ...base, items: [{ name: "A", quantity: 0 }] }).ok);
t("the company can't be chosen in the body", (() => { const r = sellInputFromBody({ ...base, itemsText: "ten boxes of strips", organizationId: "org_other", status: "QUOTED", price: 1 }); return r.ok && !("organizationId" in r.input) && !("status" in r.input) && !("price" in r.input); })());
t("status words for websites", API_STATUS.NEW === "received" && API_STATUS.QUOTED === "quotation_made" && API_STATUS.DECLINED === "declined");
t("a real reference matches the pattern and junk doesn't", REFERENCE_PATTERN.test(makeReference()) && !REFERENCE_PATTERN.test("WEB-0O1I23") && !REFERENCE_PATTERN.test("web-abc") && !REFERENCE_PATTERN.test("WEB-ABCDEFG"));

console.log(`storefront-api-rules: ${n} checks passed`);
