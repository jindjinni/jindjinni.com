import Link from "next/link";

/** "I agree" box used on sign-up, invitation acceptance and the re-accept page. The server checks the value too. */
export function TermsCheckbox({ id = "accept-terms" }: { id?: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-sm font-semibold text-ink">
      <input id={id} name="acceptTerms" type="checkbox" required className="mt-1" />
      <span>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="underline decoration-brand decoration-2 underline-offset-4">
          Terms of Service
        </Link>
        ,{" "}
        <Link href="/privacy" target="_blank" className="underline decoration-brand decoration-2 underline-offset-4">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/acceptable-use" target="_blank" className="underline decoration-brand decoration-2 underline-offset-4">
          Acceptable Use Policy
        </Link>
        .
      </span>
    </label>
  );
}
