"use client";

import { useActionState } from "react";
import { signInWithLink } from "@/app/actions/affiliate-portal";
import { AuthError, authBtnPrimary } from "@/components/auth/auth-ui";

export function SigninButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(signInWithLink, undefined);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={authBtnPrimary} data-testid="aff-signin-go">{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
