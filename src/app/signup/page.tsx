import { signupNeedsEmailVerification } from "@/lib/signup-settings";
import { SignupForm } from "./signup-form";

// The server decides whether the signup form asks for an emailed code (see lib/signup-settings.ts).
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupForm needsVerification={signupNeedsEmailVerification()} />;
}
