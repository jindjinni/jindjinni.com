"use client";

import { useActionState } from "react";
import { buyerSignInAction } from "@/app/actions/storefront-buyers";
import { AuthError, authBtnPrimary } from "@/components/auth/auth-ui";

export function SigninButton({ handle, token }: { handle: string; token: string }) {
  const [state, action, pending] = useActionState(buyerSignInAction.bind(null, handle), undefined);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending} className={`${authBtnPrimary} !w-auto`} data-testid="buyer-signin-go">{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
