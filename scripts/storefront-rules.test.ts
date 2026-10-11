import assert from "node:assert/strict";
import {
  canMoveTo, cleanSellRequest, cleanStorefrontSettings, handleError, linkCount, makeReference, normalizeHandle, quotationNoteFor, splitName, HANDLE_MAX,
} from "../src/lib/storefront-rules";

let n = 0;
const t = (name: string, ok: boolean) => { n++; assert.ok(ok, name); };

// handles
t("normalizes spaces and case", normalizeHandle("  Acme Wholesale ") === "acme-wholesale");
t("drops odd characters", normalizeHandle("Acme & Sons!") === "acme-sons");
t("collapses hyphens", normalizeHandle("a---b") === "a-b");
t("trims hyphens", normalizeHandle("-abc-") === "abc");
t("caps the length", normalizeHandle("a".repeat(100)).length === HANDLE_MAX);
t("accepts a good handle", handleError("acme-wholesale") === null);
t("too short", handleError("ab") !== null);
t("reserved word", handleError("login") !== null && handleError("dashboard") !== null && handleError("lamp") !== null);
t("no double hyphen", handleError("a--b") !== null);
t("no uppercase", handleError("Acme") !== null);
t("settings need a name", !cleanStorefrontSettings({ handle: "acme", displayName: "  ", welcomeText: "" }).ok);
const s = cleanStorefrontSettings({ handle: "Acme Co", displayName: "Acme Supplies", welcomeText: "  Hello\r\n\r\n\r\n\r\nthere " });
t("settings clean", s.ok && s.value.handle === "acme-co" && s.value.welcomeText === "Hello\n\nthere");
t("empty welcome is null", (() => { const r = cleanStorefrontSettings({ handle: "acme", displayName: "A", welcomeText: "" }); return r.ok && r.value.welcomeText === null; })());
t("bad handle is refused in settings", !cleanStorefrontSettings({ handle: "x", displayName: "A", welcomeText: "" }).ok);

// sell requests
const good = {
  businessName: "Main St Pharmacy", contactName: "Pat Lee", email: "Pat@MainSt.test", phone: "(713) 555-0100",
  street1: "1 Main St", street2: "", city: "Houston", state: "tx", zip: "77002",
  itemsText: "Dexcom G7 sensors, 40 boxes, exp 05/2027", notes: "",
};
const ok = cleanSellRequest(good);
t("good request passes", ok.ok);
t("email lowercased, state upper, empty optional is null", ok.ok && ok.value.email === "pat@main-st.test".replace("main-st", "mainst") && ok.value.state === "TX" && ok.value.street2 === null && ok.value.notes === null);
t("needs business name", !cleanSellRequest({ ...good, businessName: " " }).ok);
t("needs contact", !cleanSellRequest({ ...good, contactName: "" }).ok);
t("bad email", !cleanSellRequest({ ...good, email: "nope" }).ok);
t("staff-style email refused", !cleanSellRequest({ ...good, email: "x@staff.invalid" }).ok);
t("bad phone", !cleanSellRequest({ ...good, phone: "12" }).ok);
t("phone optional", cleanSellRequest({ ...good, phone: "" }).ok);
t("bad state", !cleanSellRequest({ ...good, state: "Texas" }).ok);
t("bad zip", !cleanSellRequest({ ...good, zip: "770" }).ok);
t("zip+4 ok", cleanSellRequest({ ...good, zip: "77002-1234" }).ok);
t("needs address", !cleanSellRequest({ ...good, street1: "" }).ok);
t("items too short", !cleanSellRequest({ ...good, itemsText: "stuff" }).ok);
t("items capped", (() => { const r = cleanSellRequest({ ...good, itemsText: "x".repeat(9000) }); return r.ok && r.value.itemsText.length === 4000; })());
t("link pile refused", !cleanSellRequest({ ...good, itemsText: "buy now http://a.test http://b.test www.c.test cheap" }).ok);
t("one link fine", cleanSellRequest({ ...good, itemsText: "see http://a.test for photos of 40 boxes of G7" }).ok);
t("link counter", linkCount("http://a https://b www.c") === 3);
t("newlines in names flattened", (() => { const r = cleanSellRequest({ ...good, businessName: "A\nB" }); return r.ok && r.value.businessName === "A B"; })());
t("non-string input does not throw", !cleanSellRequest({ ...good, email: { a: 1 }, businessName: null as unknown as string }).ok);

// references
const ref = makeReference(() => 0);
t("reference shape", /^WEB-[A-Z2-9]{6}$/.test(ref) && ref === "WEB-AAAAAA");
t("reference never has look-alikes", Array.from({ length: 200 }, () => makeReference()).every((r) => /^WEB-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(r)));

// status moves
t("new -> quoted", canMoveTo("NEW", "QUOTED"));
t("new -> declined", canMoveTo("NEW", "DECLINED"));
t("declined -> new (reopen)", canMoveTo("DECLINED", "NEW"));
t("quoted is final", !canMoveTo("QUOTED", "NEW") && !canMoveTo("QUOTED", "DECLINED"));
t("no self move", !canMoveTo("NEW", "NEW"));

// quotation note + names
const note = quotationNoteFor({ reference: "WEB-ABC234", businessName: "Main St Pharmacy", itemsText: "40 boxes G7", notes: "Call after 3" });
t("note carries reference, items and note", note.includes("WEB-ABC234") && note.includes("40 boxes G7") && note.includes("Call after 3"));
t("note without their note", !quotationNoteFor({ reference: "WEB-ABC234", businessName: "X", itemsText: "40 boxes G7 sensors", notes: null }).includes("Their note"));
t("split name", splitName("Pat Lee").firstName === "Pat" && splitName("Pat Lee").lastName === "Lee" && splitName("Cher").lastName === null && splitName("Mary Ann Smith").lastName === "Ann Smith");

console.log(`storefront-rules: ${n} checks passed`);
