import assert from "node:assert/strict";
import { canAddMailbox, mailRights } from "../src/lib/mail-access";

const org = (role: string, userId = "u1", extra: Record<string, unknown> = {}) => ({ userId, role: role as never, access: {}, ...extra }) as Parameters<typeof mailRights>[1];
const shared = { kind: "SHARED", ownerUserId: null, department: "purchasing" };

// shared: whoever can open the department reads; those who work in it send; only an admin manages
let r = mailRights(shared, org("purchasing_agent"), "purchasing");
assert.deepEqual(r, { read: true, send: true, manage: false, connect: false });
r = mailRights(shared, org("accountant"), "purchasing");
assert.equal(r.read, true);
assert.equal(r.send, false, "an accountant only looks at Purchasing");
r = mailRights(shared, org("admin"), "purchasing");
assert.deepEqual(r, { read: true, send: true, manage: true, connect: true });
r = mailRights(shared, org("customer_service"), "purchasing");
assert.equal(r.read, false, "customer service does not open Purchasing");

// the mailbox belongs to one department only
assert.equal(mailRights(shared, org("admin"), "sales").read, false);

// accounts: accountant and admin send; a receiver cannot even read
const acc = { kind: "SHARED", ownerUserId: null, department: "accounts" };
assert.equal(mailRights(acc, org("accountant"), "accounts").send, true);
assert.equal(mailRights(acc, org("receiver"), "accounts").read, false);

// personal: only the owner reads and sends; an admin can manage it but never read it
const mine = { kind: "PERSONAL", ownerUserId: "u1", department: "purchasing" };
assert.deepEqual(mailRights(mine, org("purchasing_agent", "u1"), "purchasing"), { read: true, send: true, manage: true, connect: true });
r = mailRights(mine, org("admin", "u2"), "purchasing");
assert.deepEqual(r, { read: false, send: false, manage: true, connect: false });
r = mailRights(mine, org("purchasing_manager", "u3"), "purchasing");
assert.deepEqual(r, { read: false, send: false, manage: false, connect: false });
// an accountant's own mailbox in Purchasing still sends (it is their own address)
assert.equal(mailRights({ ...mine, ownerUserId: "u5" }, org("accountant", "u5"), "purchasing").send, true);

// View as company: read-only, never sends or changes anything
const view = { id: "v" } as never;
r = mailRights(shared, org("admin", "u1", { viewAs: view }), "purchasing");
assert.deepEqual(r, { read: true, send: false, manage: false, connect: false });
assert.equal(mailRights(mine, org("purchasing_agent", "u1", { viewAs: view }), "purchasing").send, false);

// who can add mailboxes
assert.equal(canAddMailbox("SHARED", "purchasing", org("admin")), true);
assert.equal(canAddMailbox("SHARED", "purchasing", org("purchasing_agent")), false);
assert.equal(canAddMailbox("PERSONAL", "purchasing", org("purchasing_agent")), true);
assert.equal(canAddMailbox("PERSONAL", "accounts", org("purchasing_agent")), false, "no personal mailbox in a department you cannot open");
assert.equal(canAddMailbox("SHARED", "purchasing", org("admin", "u1", { viewAs: view })), false);

console.log("mail-access: ok");
