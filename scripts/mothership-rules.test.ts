import assert from "node:assert/strict";
import { GRANTABLE_LEVELS, isFullLevel, isLevel, isStaffLevel, mayManageLevel, mayOpenSettings, mayOpenStaffPage, type StaffLevel } from "../src/lib/mothership-rules";

const all: (StaffLevel | null)[] = ["owner", "co_owner", "admin", "support", null];

// Full access: owner, co-owner, admin. Customer support is staff but not full. Nobody else is staff.
assert.deepEqual(all.map(isFullLevel), [true, true, true, false, false]);
assert.deepEqual(all.map(isStaffLevel), [true, true, true, true, false]);

// Settings: everyone except customer support (a non-staff person's settings follow their normal company role).
assert.deepEqual(all.map(mayOpenSettings), [true, true, true, false, true]);

// The Staff page: the three full levels only.
assert.deepEqual(all.map(mayOpenStaffPage), [true, true, true, false, false]);

// Managing people: nobody can touch the Owner; owner and co-owner manage the rest; admin manages only customer support; support nobody.
for (const target of ["owner"] as const) for (const a of all) assert.equal(mayManageLevel(a, target), false, `nobody manages the owner (${a})`);
for (const target of GRANTABLE_LEVELS) {
  assert.equal(mayManageLevel("owner", target), true);
  assert.equal(mayManageLevel("co_owner", target), true);
  assert.equal(mayManageLevel("support", target), false);
  assert.equal(mayManageLevel(null, target), false);
}
assert.equal(mayManageLevel("admin", "support"), true);
assert.equal(mayManageLevel("admin", "admin"), false, "an admin can't make another admin (or themselves a co-owner)");
assert.equal(mayManageLevel("admin", "co_owner"), false);

assert.equal(isLevel("support"), true);
assert.equal(isLevel("boss"), false);
assert.equal(isLevel(null), false);
console.log("mothership-rules: ok");
