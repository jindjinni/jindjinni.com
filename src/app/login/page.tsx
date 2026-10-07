"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { AuthCard, AuthError, AuthField, AuthShell, BrandPanel, authBtnPrimary } from "@/components/auth/auth-ui";
import { Icon } from "@/components/landing/icons";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const [state, action, pending] = useActionState(login, undefined);
  const next = useSearchParams().get("next") ?? "";

  return (
    <AuthShell headerLink={{ prompt: "New to jindjinni?", label: "Get Started", href: "/signup" }}>
      <AuthCard className="max-w-4xl lg:grid lg:grid-cols-[0.9fr_1.1fr]">
        <BrandPanel
          title="Run your business from one place."
          points={["Purchasing, inventory and invoicing together", "Your team, with the right access", "Your data, kept separate and private"]}
        />

        <div className="p-7 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-2 text-base text-muted">Sign in to pick up where you left off.</p>

          <form action={action} className="mt-8 flex flex-col gap-5">
            <input type="hidden" name="next" value={next} />
            <AuthField label="Email or username">
              <input name="email" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@company.com, or name_yourcompany" />
            </AuthField>
            <AuthField label="Password">
              <input name="password" type="password" required autoComplete="current-password" placeholder="Your password" />
            </AuthField>

            <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <input name="rememberMe" type="checkbox" defaultChecked />
              Remember me
            </label>

            {state?.error && <AuthError>{state.error}</AuthError>}

            <button type="submit" disabled={pending} className={authBtnPrimary}>
              {pending ? "Signing in..." : "Sign in"}
              {!pending && <Icon name="arrow" className="h-5 w-5" />}
            </button>
          </form>

          <p className="mt-8 border-t border-line pt-6 text-sm font-semibold text-muted">
            New company?{" "}
            <Link href="/signup" className="font-extrabold text-ink underline decoration-brand decoration-2 underline-offset-4 hover:decoration-ink">
              Create an account
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
