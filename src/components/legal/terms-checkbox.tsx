import Link from "next/link";

const link = "underline decoration-brand decoration-2 underline-offset-4";

/**
 * The "before you start" notice and the "I agree" box used on sign-up, invitation acceptance and the re-accept page.
 * People are told, in plain words and before they agree, that the software is protected and what that means for them.
 * The server checks the box value too.
 */
export function TermsCheckbox({ id = "accept-terms" }: { id?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div role="note" data-testid="protection-notice" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">Before you start: this software is protected</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>jindjinni is original, proprietary software owned by Plantarz Property Solutions LLC. Its screens, rules and workflows come from years of hands-on experience running this business.</li>
          <li>You may use it to run your own company. You may not copy, scrape, record or screenshot it to rebuild it, reverse engineer it or clone it, and you may not ask an AI tool to do any of that for you.</li>
          <li>If you or your team break these rules, we can end your access at once and take legal action, including a court order and damages.</li>
          <li>You are responsible for what your team, and any AI tools using your logins, do with the software.</li>
        </ul>
      </div>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm font-semibold text-ink">
        <input id={id} name="acceptTerms" type="checkbox" required className="mt-1" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className={link}>
            Terms of Service
          </Link>
          ,{" "}
          <Link href="/privacy" target="_blank" className={link}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/acceptable-use" target="_blank" className={link}>
            Acceptable Use Policy
          </Link>
          , and I understand that copying or cloning this software, including with AI tools, is prohibited.
        </span>
      </label>
    </div>
  );
}
