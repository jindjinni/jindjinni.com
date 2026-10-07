"use client";

import { useState, useTransition } from "react";
import { unsubscribeAction } from "@/app/actions/marketing-public";
import { authBtnPrimary } from "@/components/auth/auth-ui";

export function UnsubscribeButton({ token, company, address, channel, already }: { token: string; company: string; address: string; channel: "EMAIL" | "TEXT"; already: boolean }) {
  const [done, setDone] = useState(already);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const what = channel === "EMAIL" ? "emails" : "texts";
  if (done)
    return (
      <>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="unsub-title">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-base text-muted" data-testid="unsub-done">{address} won&apos;t get marketing {what} from {company} anymore.</p>
      </>
    );
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="unsub-title">Unsubscribe from {company}?</h1>
      <p className="mt-3 text-base text-muted">Stop marketing {what} to <span className="font-semibold">{address}</span>.</p>
      <button
        className={`${authBtnPrimary} mt-8`}
        disabled={pending}
        data-testid="unsub-button"
        onClick={() =>
          start(async () => {
            const r = await unsubscribeAction(token);
            if (r.ok) setDone(true);
            else setFailed(true);
          })
        }
      >
        Yes, unsubscribe me
      </button>
      {failed && <p role="alert" className="mt-3 text-sm text-red-700">That didn&apos;t work. Please try again.</p>}
    </>
  );
}
