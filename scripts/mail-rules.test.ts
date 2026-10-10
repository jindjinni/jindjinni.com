import assert from "node:assert/strict";
import { partsInZone, afterFailure, blockedFile, checkCompose, checkSchedule, cleanMailboxName, formatInZone, isMailDept, MAX_ATTEMPTS, MAX_MAIL_BYTES, safeFileName, shortWhen, snippetOf, validZone, zonedToUtc } from "../src/lib/mail-rules";

// departments
assert.ok(isMailDept("purchasing") && isMailDept("customer-service"));
assert.ok(!isMailDept("hr") && !isMailDept("") && !isMailDept(null));

// names
assert.equal(cleanMailboxName("  Sales   <b>team</b> "), "Sales b team /b");
assert.equal(cleanMailboxName("x".repeat(100)).length, 60);

// compose checks
const ok = checkCompose({ to: "a@x.com, B@y.com", cc: "c@z.org", subject: "Hello", body: "Hi" });
assert.ok(ok.ok);
assert.deepEqual(ok.to, ["a@x.com", "b@y.com"]);
assert.deepEqual(ok.cc, ["c@z.org"]);
assert.ok(!checkCompose({ to: "", subject: "S", body: "b" }).ok);
assert.match(checkCompose({ to: "nope", subject: "S", body: "b" }).errors.join(" "), /isn't an email address/);
assert.match(checkCompose({ to: "a@x.com", subject: "", body: "b" }).errors.join(" "), /subject/);
assert.match(checkCompose({ to: "a@x.com", subject: "S", body: "  " }).errors.join(" "), /message or attach/);
assert.ok(checkCompose({ to: "a@x.com", subject: "S", body: "" }, [{ name: "po.pdf", bytes: 1000 }]).ok, "a file alone is enough");
assert.equal(checkCompose({ to: "a@x.com", subject: "Line1\r\nBcc: evil@x.com", body: "b" }).subject, "Line1 Bcc: evil@x.com", "a subject is one line");
assert.match(checkCompose({ to: "a@x.com", subject: "S", body: "b" }, [{ name: "run.exe", bytes: 10 }]).errors.join(" "), /block/);
assert.match(checkCompose({ to: "a@x.com", subject: "S", body: "b" }, [{ name: "big.pdf", bytes: MAX_MAIL_BYTES + 1 }]).errors.join(" "), /limit/);
assert.ok(!checkCompose({ to: "a@x.com", subject: "S", body: "b" }, Array.from({ length: 9 }, (_, i) => ({ name: `f${i}.pdf`, bytes: 10 }))).ok);
assert.match(checkCompose({ to: Array.from({ length: 21 }, (_, i) => `u${i}@x.com`).join(","), subject: "S", body: "b" }).errors.join(" "), /at most 20/i);
assert.ok(blockedFile("x.EXE") && !blockedFile("x.pdf"));
assert.ok(!safeFileName("../../etc/passwd").includes("/"), "no folder tricks in a file name");
assert.equal(safeFileName("...hidden.txt"), "hidden.txt");
assert.ok(!safeFileName("a/b\\c:d.pdf").includes("/") && !safeFileName("a/b\\c:d.pdf").includes("\\"));
assert.equal(safeFileName(""), "attachment");

// snippet
assert.equal(snippetOf("  hello \n  world  "), "hello world");
assert.equal(snippetOf("x".repeat(200)).length, 140);

// zones
assert.equal(validZone("America/New_York"), "America/New_York");
assert.equal(validZone("Mars/Base"), null);
assert.equal(validZone(""), null);
// New York is UTC-4 in October (daylight time) and UTC-5 in January
assert.equal(zonedToUtc("2026-10-12", "09:30", "America/New_York"), "2026-10-12T13:30:00.000Z");
assert.equal(zonedToUtc("2026-01-12", "09:30", "America/New_York"), "2026-01-12T14:30:00.000Z");
assert.equal(zonedToUtc("2026-10-12", "09:30", "Asia/Kolkata"), "2026-10-12T04:00:00.000Z");
assert.equal(zonedToUtc("2026-10-12", "09:30", "UTC"), "2026-10-12T09:30:00.000Z");
// the clocks change: 2026-11-01 01:30 happens twice in New York; either answer is fine but it must be one of the two real moments
const dup = zonedToUtc("2026-11-01", "01:30", "America/New_York");
assert.ok(dup === "2026-11-01T05:30:00.000Z" || dup === "2026-11-01T06:30:00.000Z");
// and across the change the offset flips: 2026-11-01 12:00 is already UTC-5
assert.equal(zonedToUtc("2026-11-01", "12:00", "America/New_York"), "2026-11-01T17:00:00.000Z");
assert.equal(zonedToUtc("2026-02-30", "09:00", "UTC"), null, "no 30th of February");
assert.equal(zonedToUtc("2026-10-12", "25:00", "UTC"), null);
assert.equal(zonedToUtc("12/10/2026", "09:00", "UTC"), null);
assert.equal(zonedToUtc("2026-10-12", "09:00", "Nope/Zone"), null);

// scheduling window
const now = Date.parse("2026-10-10T12:00:00Z");
const good = checkSchedule("2026-10-12", "09:30", "America/New_York", now);
assert.ok(good.ok && good.iso === "2026-10-12T13:30:00.000Z");
assert.ok(!checkSchedule("2026-10-10", "08:00", "America/New_York", now).ok, "the past");
assert.ok(!checkSchedule("2026-10-10", "08:01", "America/New_York", now).ok, "less than two minutes ahead is refused");
assert.ok(checkSchedule("2026-10-10", "08:05", "America/New_York", now).ok, "12:00Z is 8:00 in New York; 8:05 is five minutes ahead");
assert.ok(!checkSchedule("2028-10-12", "09:30", "America/New_York", now).ok, "more than a year ahead");
assert.ok(!checkSchedule("", "09:30", "UTC", now).ok);
const fallback = checkSchedule("2026-10-12", "09:30", "Bad/Zone", now);
assert.ok(fallback.ok && fallback.zone === "America/New_York", "a bad zone falls back to Eastern");

// display
assert.match(formatInZone("2026-10-12T13:30:00.000Z", "America/New_York"), /Mon, Oct 12, 9:30 AM EDT/);
assert.equal(formatInZone("", "UTC"), "");
assert.match(shortWhen("2026-10-10T13:30:00Z", "America/New_York", now), /9:30 AM/);
assert.match(shortWhen("2026-10-08T13:30:00Z", "America/New_York", now), /Oct 8/);
assert.match(shortWhen("2025-10-08T13:30:00Z", "America/New_York", now), /2025/);
assert.match(shortWhen("2026-10-10 13:30:00", "America/New_York", now), /9:30 AM/, "database timestamps without a T or Z are UTC");

// editing a scheduled email shows the clock time it was picked in
assert.deepEqual(partsInZone("2026-10-12T13:30:00.000Z", "America/New_York"), { date: "2026-10-12", time: "09:30" });
assert.deepEqual(partsInZone("2026-10-12T13:30:00.000Z", "Asia/Kolkata"), { date: "2026-10-12", time: "19:00" });
assert.equal(partsInZone(null, "UTC"), null);
const back = partsInZone("2026-11-03T17:15:00.000Z", "America/Los_Angeles")!;
assert.equal(zonedToUtc(back.date, back.time, "America/Los_Angeles"), "2026-11-03T17:15:00.000Z", "round trip");

// retry policy
assert.equal(afterFailure(1, now).status, "SCHEDULED");
assert.equal(afterFailure(MAX_ATTEMPTS, now).status, "FAILED");
assert.equal(afterFailure(1, now).retryAt, "2026-10-10T12:05:00.000Z");

console.log("mail-rules: ok");
