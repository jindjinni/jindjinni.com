import assert from "node:assert/strict";
import { applyMenuEdit, applyTopEdit, parseSidebarMenus, resolveMenu, resolveTop, DEPARTMENT_MENUS } from "../src/lib/sidebar-menu";

// ---- hiding a department tab ----
const q = (id: string, label = id, hidden = false) => ({ id, label, hidden });
const plain = resolveMenu("purchasing", {});
assert.ok(plain.items.every((i) => !i.hidden));
const edited = applyMenuEdit("purchasing", {}, { items: [q("dashboard", "Dashboard"), q("quotations", "Quotations", true), q("customers", "Customers")], setupLabel: "" });
assert.deepEqual(edited.purchasing?.hidden, ["quotations"]);
const menu = resolveMenu("purchasing", edited);
assert.equal(menu.items.find((i) => i.id === "quotations")?.hidden, true);
assert.equal(menu.items.find((i) => i.id === "customers")?.hidden, false);
// the first tab (the department's home page) can never be hidden, even if asked
const tryHome = applyMenuEdit("purchasing", {}, { items: [q("dashboard", "Dashboard", true)], setupLabel: "" });
assert.equal(tryHome.purchasing?.hidden, undefined);
// unhiding removes it again; tabs the editor couldn't see keep their hidden state
const keep = applyMenuEdit("purchasing", edited, { items: [q("customers", "Customers")], setupLabel: "" });
assert.deepEqual(keep.purchasing?.hidden, ["quotations"]);
const unhide = applyMenuEdit("purchasing", edited, { items: [q("quotations", "Quotations", false)], setupLabel: "" });
assert.equal(unhide.purchasing?.hidden, undefined);
// saved JSON round trip, and junk is ignored (unknown tab, the home tab, wrong types)
const raw = JSON.stringify({ purchasing: { hidden: ["quotations", "dashboard", "nope", 7] }, top: { hidden: ["hr", "home", "x"], order: ["accounts", "bogus"] } });
const parsed = parseSidebarMenus(raw);
assert.deepEqual(parsed.purchasing?.hidden, ["quotations"]);
assert.deepEqual(parsed.top?.hidden, ["hr"]);
assert.deepEqual(parsed.top?.order, ["accounts"]);
assert.deepEqual(parseSidebarMenus("not json"), {});
// every department's first tab is its locked home
for (const d of Object.keys(DEPARTMENT_MENUS) as (keyof typeof DEPARTMENT_MENUS)[]) assert.ok(DEPARTMENT_MENUS[d].items[0].exact, d);

// ---- the top bar ----
const present = [
  { id: "home", label: "Home" }, { id: "purchasing", label: "Purchasing" }, { id: "receiving", label: "Receiving" }, { id: "accounts", label: "Accounts" },
  { id: "hr", label: "HR" }, { id: "chat", label: "Chat" }, { id: "lamp", label: "Lamp (2)" }, { id: "settings", label: "Settings" },
];
assert.deepEqual(resolveTop(present, {}).map((r) => r.id), present.map((p) => p.id));
const top = applyTopEdit({}, { items: [
  { id: "home", label: "Home", hidden: true }, { id: "accounts", label: "Money", hidden: false }, { id: "purchasing", label: "Purchasing", hidden: false },
  { id: "receiving", label: "Receiving", hidden: false }, { id: "hr", label: "HR", hidden: true }, { id: "settings", label: "Hacked", hidden: true },
] });
const rows = resolveTop(present, top);
// Home first, Lamp then Settings last, the rest in the company's order, nothing locked is hidden or renamed
assert.deepEqual(rows.map((r) => r.id), ["home", "accounts", "purchasing", "receiving", "hr", "chat", "lamp", "settings"]);
assert.equal(rows.find((r) => r.id === "accounts")?.label, "Money");
assert.equal(rows.find((r) => r.id === "hr")?.hidden, true);
assert.equal(rows.find((r) => r.id === "home")?.hidden, false);
assert.equal(rows.find((r) => r.id === "settings")?.hidden, false);
assert.equal(rows.find((r) => r.id === "settings")?.label, "Settings");
assert.equal(rows.find((r) => r.id === "lamp")?.label, "Lamp (2)");
// a person without Accounts just doesn't have that link: the saved order still works for the rest
const noAcc = resolveTop(present.filter((p) => p.id !== "accounts"), top);
assert.deepEqual(noAcc.map((r) => r.id), ["home", "purchasing", "receiving", "hr", "chat", "lamp", "settings"]);
// ...and an admin editing without seeing Accounts doesn't lose its place or name
const again = applyTopEdit(top, { items: noAcc.map((r) => ({ id: r.id, label: r.label, hidden: r.hidden })) });
assert.ok(again.top?.order?.includes("accounts"));
assert.equal(again.top?.labels?.accounts, "Money");
// a renamed link that is renamed back to the original drops the saved name
const back = applyTopEdit(top, { items: [{ id: "accounts", label: "Accounts", hidden: false }] });
assert.equal(back.top?.labels?.accounts, undefined);
// the sidebar edits are kept when the top bar is saved, and the other way round
const both = applyTopEdit(edited, { items: [{ id: "hr", label: "HR", hidden: true }] });
assert.deepEqual(both.purchasing?.hidden, ["quotations"]);
const both2 = applyMenuEdit("receiving", top, { items: [], setupLabel: "" });
assert.deepEqual(both2.top?.hidden, top.top?.hidden);
console.log("menu-customize ok");
