import { cookies } from "next/headers";
import { signupNeedsEmailVerification } from "@/lib/signup-settings";
import { currentBook, findActiveAffiliateByCode } from "@/lib/pricing-service";
import { REF_COOKIE } from "@/lib/pricing-rules";
import { featureOn } from "@/lib/features";
import { SignupForm } from "./signup-form";

// The server decides whether the signup form asks for an emailed code (see lib/signup-settings.ts), what a new company pays
// (the newest price the Lamp set), and whether the visitor came through an affiliate's link.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const [book, ref] = await Promise.all([currentBook(), cookies().then((c) => c.get(REF_COOKIE)?.value)]);
  const referred = ref ? !!(await findActiveAffiliateByCode(ref).catch(() => null)) : false;
  // The "same LLC?" question only matters when Wholesale and Distribution are separate workspaces (the same switch the sign-up action uses).
  const askSecond = await featureOn("operations", "__new__").catch(() => false);
  return <SignupForm needsVerification={signupNeedsEmailVerification()} book={book} referred={referred} askSecond={askSecond} />;
}
