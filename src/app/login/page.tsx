"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { AuthCard, AuthError, AuthField, AuthShell, BrandPanel, authBtnPrimary } from "@/components/auth/auth-ui";
import { Icon } from "@/components/landing/icons";
import { HumanCheck } from "@/components/human-check";

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
  // Controlled fields: React clears an uncontrolled form after every press of the button, and the second step (the two-step code)
  // needs the same email and password sent again.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");
  const codeStep = !!state?.needCode;

  return (
    <AuthShell headerLink={{ prompt: "New to jindjinni?", label: "Get Started", href: "/signup" }}>
      <AuthCard className="max-w-4xl lg:grid lg:grid-cols-[0.9fr_1.1fr]">
        <BrandPanel
          title="Run your business from one place."
          points={["Purchasing, inventory and invoicing together", "Your team, with the right access", "Your data, kept separate and private"]}
        />

        <div className="p-7 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{codeStep ? "Enter your code" : "Welcome back"}</h1>
          <p className="mt-2 text-base text-muted">
            {codeStep ? "Open your authenticator app and type the 6-digit code. Lost your phone? Type one of your backup codes instead." : "Sign in to pick up where you left off."}
          </p>

          <form action={action} className="mt-8 flex flex-col gap-5">
            <input type="hidden" name="next" value={next} />
            {/* Kept in the form on the code step too (hidden), so they are sent again with the code. */}
            <div className={codeStep ? "hidden" : "contents"}>
              <AuthField label="Email or username">
                <input name="email" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@company.com, or name_yourcompany" value={email} onChange={(e) => setEmail(e.target.value)} />
              </AuthField>
              <AuthField label="Password">
                <input name="password" type="password" required autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </AuthField>

              <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                <input name="rememberMe" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
            </div>

            {codeStep && (
              <AuthField label="Code from your authenticator app">
                <input name="code" type="text" required autoFocus inputMode="text" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} placeholder="123456" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} data-testid="login-code" />
              </AuthField>
            )}

            <HumanCheck />

            {state?.error && <AuthError>{state.error}</AuthError>}

            <button type="submit" disabled={pending} className={authBtnPrimary}>
              {pending ? "Signing in..." : codeStep ? "Verify and sign in" : "Sign in"}
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
