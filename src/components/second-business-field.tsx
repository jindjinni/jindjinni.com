"use client";

import { useState } from "react";
import { BusinessVerificationFields } from "@/components/business-verification-fields";
import { SAME_BUSINESS_DIFFERENT, SAME_BUSINESS_HELP, SAME_BUSINESS_QUESTION, SAME_BUSINESS_SAME, SECOND_PREFIX, type SameBusiness } from "@/lib/second-business-rules";

/**
 * "Are your Wholesale and Distribution businesses the same LLC?" When the answer is no, the second business's own papers are
 * asked for right here (EIN, state, state file number, proof document, and so on), with every field named `second_...`.
 * Used on the sign-up page (when "Both" is chosen) and where an existing company adds its second operation.
 */
export function SecondBusinessField({ onChange, secondKindLabel = "Distribution" }: { onChange?: (v: SameBusiness | null) => void; secondKindLabel?: string }) {
  const [answer, setAnswer] = useState<SameBusiness | null>(null);
  const pick = (v: SameBusiness) => {
    setAnswer(v);
    onChange?.(v);
  };
  const card = (on: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm text-ink ${on ? "border-brand-deep bg-mint" : "border-line bg-white hover:border-ink"}`;
  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2" data-testid="same-business-field">
      <legend className="text-sm font-extrabold text-ink">{SAME_BUSINESS_QUESTION} <span className="text-red-600" aria-hidden="true">*</span></legend>
      <label className={card(answer === "same")} data-testid="same-business-same-card">
        <input type="radio" name="sameBusiness" value="same" required checked={answer === "same"} onChange={() => pick("same")} data-testid="same-business-same" className="mt-0.5" />
        <span className="font-bold">{SAME_BUSINESS_SAME}</span>
      </label>
      <label className={card(answer === "different")} data-testid="same-business-different-card">
        <input type="radio" name="sameBusiness" value="different" required checked={answer === "different"} onChange={() => pick("different")} data-testid="same-business-different" className="mt-0.5" />
        <span className="font-bold">{SAME_BUSINESS_DIFFERENT}</span>
      </label>
      <p className="text-xs text-muted">{SAME_BUSINESS_HELP}</p>
      {answer === "different" && (
        <div className="flex flex-col gap-4" data-testid="second-business-papers">
          <BusinessVerificationFields
            prefix={SECOND_PREFIX}
            title={`Verify your ${secondKindLabel} business`}
            description={`This is the business that runs your ${secondKindLabel} operation. It needs its own EIN, state registration and proof document. A person reviews them, and the ${secondKindLabel} operation opens once they are approved.`}
          />
        </div>
      )}
    </fieldset>
  );
}
