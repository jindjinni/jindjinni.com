"use client";

import { createContext, useContext, type ReactNode } from "react";

// A red asterisk beside every field the person must fill in. It only shows inside <RequiredMarks> (the sign-up page), so
// forms elsewhere (sign-in, for example) stay clean. Screen readers hear "required".
const Ctx = createContext(false);

export function RequiredMarks({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={true}>{children}</Ctx.Provider>;
}

export function RequiredStar({ required }: { required?: boolean }) {
  const on = useContext(Ctx);
  if (!on || !required) return null;
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 font-bold text-red-600" data-testid="required-star">*</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

/** "* Required" key shown once, near the top of a form. */
export function RequiredLegend() {
  const on = useContext(Ctx);
  if (!on) return null;
  return (
    <p className="text-sm font-semibold text-muted" data-testid="required-legend">
      <span aria-hidden="true" className="font-bold text-red-600">*</span> Required field
    </p>
  );
}
