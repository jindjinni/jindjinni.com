// One place for the facts every legal page and the signup checkbox rely on.
// Bump TERMS_VERSION whenever the Terms or Privacy Policy change in a way
// people should re-accept; anyone whose recorded version is older is asked
// to agree again (see /accept-terms).

export const TERMS_VERSION = "2026-10-04";
export const LEGAL_UPDATED = "October 4, 2026";
export const SERVICE_NAME = "jindjinni";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@jindjinni.com";
export const CLOSE_GRACE_DAYS = 30;
export const SIGN_IN_HISTORY_MONTHS = 12;

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/security", label: "Security" },
] as const;
