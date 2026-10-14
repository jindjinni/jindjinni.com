"use client";

import { describeExpiry, parseExpiryInput } from "@/lib/expiry-range-rules";

const base = "w-full rounded-lg border bg-white px-2.5 py-2 text-sm dark:bg-slate-900";

/**
 * One box for an expiration: a month range ("8/2027-6/2028"), one month ("8/2027") or one day ("8/15/2027"). Under the box the
 * words it was read as are shown ("Aug 2027 through Jun 2028"), so a person can check it before saving. It is only a box:
 * the text goes to the server, which reads it again with the same rules (`parseExpiryInput`).
 */
export function ExpiryField({
  id, value, onChange, disabled, testid, className, noExpiration,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  testid?: string;
  className?: string;
  /** A product that never expires: the box is off. */
  noExpiration?: boolean;
}) {
  const read = parseExpiryInput(value);
  const bad = !read.ok;
  return (
    <div className={className}>
      <input
        id={id}
        value={noExpiration ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || noExpiration}
        placeholder={noExpiration ? "Never expires" : "8/2027-6/2028, 8/2027 or 8/15/2027"}
        autoComplete="off"
        inputMode="text"
        aria-invalid={bad}
        aria-describedby={`${id}-read`}
        data-testid={testid}
        className={`${base} ${bad ? "border-red-500" : "border-slate-300 dark:border-slate-700"} disabled:opacity-60`}
      />
      <p id={`${id}-read`} className={`mt-1 min-h-4 text-xs ${bad ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400"}`} data-testid={testid ? `${testid}-read` : undefined}>
        {noExpiration ? "" : value.trim() ? describeExpiry(read) : "Leave empty for no date."}
      </p>
    </div>
  );
}
