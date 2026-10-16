import assert from "node:assert/strict";
import { DEFAULT_SEAT_LIMIT, UNLIMITED, effectiveSeatLimit } from "../src/lib/seats";

// An ordinary company may have up to 100 people (active members plus pending invitations)
assert.equal(DEFAULT_SEAT_LIMIT, 100);
assert.equal(effectiveSeatLimit({ slug: "some-new-company", seatLimit: null }), 100);
// a limit set for one company still wins, and -1 stays unlimited
assert.equal(effectiveSeatLimit({ slug: "some-new-company", seatLimit: 12 }), 12);
assert.equal(effectiveSeatLimit({ slug: "some-new-company", seatLimit: UNLIMITED }), UNLIMITED);
// the platform's own companies stay unlimited
assert.equal(effectiveSeatLimit({ slug: "usa-test-strips-center", seatLimit: null }), UNLIMITED);
console.log("seats: ok");
