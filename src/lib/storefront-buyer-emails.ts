// The emails a pharmacy gets from a company's storefront: the sign-in link and the "you're approved" note. Pure (no database, no sending)
// so the exact words can be tested. They come in the COMPANY's name; the platform only carries them.
import { LOGIN_VALID_MINUTES } from "@/lib/affiliate-portal-rules";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) => text.split("\n").map((l) => `<p>${esc(l) || "&nbsp;"}</p>`).join("");

export type Mail = { subject: string; text: string; html: string };

export function buyerSigninEmail(company: string, url: string): Mail {
  const text = `Someone asked to sign in to the ${company} ordering page with this email. To sign in, open this link within ${LOGIN_VALID_MINUTES} minutes:\n\n${url}\n\nIt works once. If you didn't ask for this, you can ignore this email.`;
  return { subject: `Your ${company} sign-in link`, text, html: toHtml(text) };
}

export function buyerApprovedEmail(i: { company: string; contactName: string; pharmacy: string; accountUrl: string }): Mail {
  const text = [
    `Hi ${i.contactName},`,
    "",
    `${i.company} has approved the account for ${i.pharmacy}.`,
    "",
    `To sign in, go to ${i.accountUrl} and type this email address. We will email you a one-time sign-in link, so there is no password to remember.`,
    "",
    `${i.company}`,
  ].join("\n");
  return { subject: `Your ${i.company} account is approved`, text, html: toHtml(text) };
}
