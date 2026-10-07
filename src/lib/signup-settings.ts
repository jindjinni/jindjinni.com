// Whether a new company must prove its email address with an emailed 6-digit code before its account is created.
//
// ON HOLD for now: our sending email is not fully active yet, so signing up does not ask for a code. To turn the check back on
// (when the email is ready), set REQUIRE_SIGNUP_EMAIL_VERIFICATION=1 in Vercel and redeploy. Nothing else needs to change: the
// code sending and checking (lib/signup-verification.ts) and the signup page's code field are all still in place.
export function signupNeedsEmailVerification(): boolean {
  return process.env.REQUIRE_SIGNUP_EMAIL_VERIFICATION === "1";
}
