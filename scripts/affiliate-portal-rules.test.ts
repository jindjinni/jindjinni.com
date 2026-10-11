import assert from "node:assert/strict";
process.env.AUTH_SECRET = "test-secret-for-affiliate-portal";
import {
  AFFILIATE_COOKIE, LOGIN_VALID_MINUTES, SESSION_DAYS, hashLoginToken, loginCooldownOver, loginStatus, loginUrl, looksLikeLoginToken, newLoginToken, portalReferrals,
} from "../src/lib/affiliate-portal-rules";
import { readAffiliateSession, signAffiliateSession } from "../src/lib/affiliate-session";
import { affiliateDetailsEmail, affiliateLoginEmail } from "../src/lib/affiliate-emails";

const now = Date.parse("2026-10-11T12:00:00Z");

// login links
const a = newLoginToken(now);
const b = newLoginToken(now);
assert.notEqual(a.token, b.token);
assert.ok(looksLikeLoginToken(a.token));
assert.equal(a.tokenHash, hashLoginToken(a.token));
assert.notEqual(a.tokenHash, a.token);
assert.equal(Date.parse(a.expiresAt) - now, LOGIN_VALID_MINUTES * 60000);
assert.equal(loginUrl("https://jindjinni.com/", a.token), `https://jindjinni.com/affiliate/signin/${a.token}`);
assert.equal(loginCooldownOver(null, now), true);
assert.equal(loginCooldownOver(new Date(now - 10_000).toISOString(), now), false);
assert.equal(loginCooldownOver(new Date(now - 120_000).toISOString(), now), true);
assert.equal(loginStatus({ expiresAt: a.expiresAt, usedAt: null }, now), "valid");
assert.equal(loginStatus({ expiresAt: a.expiresAt, usedAt: null }, now + 31 * 60000), "expired");
assert.equal(loginStatus({ expiresAt: a.expiresAt, usedAt: new Date(now).toISOString() }, now), "used");

// the signed session
const s = signAffiliateSession("aff_1", now);
assert.equal(s.maxAgeSec, SESSION_DAYS * 86400);
assert.equal(readAffiliateSession(s.value, now + 1000)?.a, "aff_1");
assert.equal(readAffiliateSession(s.value, now + (SESSION_DAYS * 86400 + 5) * 1000), null, "expires");
assert.equal(readAffiliateSession(null, now), null);
assert.equal(readAffiliateSession("garbage", now), null);
const [payload, sig] = s.value.split(".");
const forged = Buffer.from(JSON.stringify({ a: "aff_2", exp: now + 99999999 })).toString("base64url");
assert.equal(readAffiliateSession(`${forged}.${sig}`, now), null, "payload swapped");
assert.equal(readAffiliateSession(`${payload}.${sig.slice(0, -2)}xx`, now), null, "signature changed");
assert.equal(AFFILIATE_COOKIE, "jj_affiliate");

// what the portal shows
const rows = [
  { company: "Waiting Co", activeSince: "2026-09-01", monthsDone: 1, status: "waiting" as const, cutCents: 48850, extra: "SECRET", plan: "yearly", orgId: "org_1" },
  { company: "Owed Co", activeSince: "2026-06-01", monthsDone: 3, status: "owed" as const, cutCents: 48850 },
  { company: "Paid Co", activeSince: "2026-03-01", monthsDone: 3, status: "paid" as const, cutCents: 48850 },
  { company: "Ended Co", activeSince: "2026-08-01", monthsDone: 1, status: "void" as const, cutCents: null },
  { company: "New Co", activeSince: null, monthsDone: 0, status: "waiting" as const, cutCents: 48850 },
];
const out = portalReferrals(rows);
assert.deepEqual(out.map((r) => r.company), ["Waiting Co", "Owed Co", "Ended Co", "New Co"], "paid is gone");
assert.ok(!JSON.stringify(out).includes("Paid Co"));
assert.deepEqual(out.map((r) => r.state), ["waiting", "qualified", "ended", "waiting"]);
assert.equal(out[1].monthsDone, 3);
assert.equal(out[3].activeSince, null);
const allowed = ["company", "activeSince", "monthsDone", "monthsNeeded", "state", "label", "payoutCents"].sort();
for (const r of out) assert.deepEqual(Object.keys(r).sort(), allowed, "only the allowed fields");
assert.ok(!JSON.stringify(out).includes("SECRET") && !JSON.stringify(out).includes("org_1"));
assert.equal(portalReferrals([{ company: "X", activeSince: "2026-01-01", monthsDone: 9, status: "waiting", cutCents: 1 }])[0].monthsDone, 3, "never above 3");
assert.deepEqual(portalReferrals([]), []);

// emails
const login = affiliateLoginEmail("https://jindjinni.com/affiliate/signin/abc");
assert.ok(login.text.includes("https://jindjinni.com/affiliate/signin/abc") && login.html.includes("https://jindjinni.com/affiliate/signin/abc"));
const d = affiliateDetailsEmail({ name: "Ann", code: "ANN10", link: "https://jindjinni.com/?ref=ANN10", portalUrl: "https://jindjinni.com/affiliate", termsUrl: "https://jindjinni.com/terms" });
for (const need of [/ANN10/, /direct deposit/i, /40%/, /15%/, /10% off/, /do not stack/i, /3 months/, /\/affiliate/, /\/terms/, /never send/i]) assert.ok(need.test(d.text), String(need));
assert.ok(!/<script/i.test(d.html));
const xss = affiliateDetailsEmail({ name: "<img src=x onerror=1>", code: "A", link: null, portalUrl: "https://x/affiliate", termsUrl: "https://x/terms" });
assert.ok(!xss.html.includes("<img src=x"), "name is escaped in html");

console.log("affiliate-portal-rules: ok");
