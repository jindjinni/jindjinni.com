// The emails an affiliate receives: the sign-in link for the portal, and the details / terms follow-up the platform owner sends by
// pressing Send in the Lamp. Pure (no database, no sending), so the exact words can be tested and shown to the owner before they send.
import { AFFILIATE_MONTHLY_PERCENT, AFFILIATE_MONTHS, AFFILIATE_YEARLY_PERCENT, REFERRED_DISCOUNT_PERCENT } from "@/lib/affiliate-program";
import { LOGIN_VALID_MINUTES } from "@/lib/affiliate-portal-rules";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) => text.split("\n").map((l) => `<p>${esc(l) || "&nbsp;"}</p>`).join("");

export type Mail = { subject: string; text: string; html: string };

export function affiliateLoginEmail(url: string): Mail {
  const text = `Someone asked to sign in to the Jindjinni affiliate portal with this email. To sign in, open this link within ${LOGIN_VALID_MINUTES} minutes:\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`;
  return { subject: "Your Jindjinni affiliate portal sign-in link", text, html: toHtml(text) };
}

/** The follow-up that tells a new affiliate every rule and what to look out for. */
export function affiliateDetailsEmail(i: { name: string; code: string | null; link: string | null; portalUrl: string; termsUrl: string }): Mail {
  const lines = [
    `Hi ${i.name},`,
    "",
    "Welcome to the Jindjinni affiliate program. Here is everything in one place, so you know exactly how it works and what to look out for.",
    "",
    ...(i.code && i.link ? [`Your code: ${i.code}`, `Your link: ${i.link}`, ""] : []),
    "HOW YOU EARN",
    "- There is one kind of affiliate and one rate for each plan.",
    `- The company you refer gets ${REFERRED_DISCOUNT_PERCENT}% off. On a monthly plan, that is off each of its first ${AFFILIATE_MONTHS} full monthly payments. On a yearly plan, it is off the year's payment. A promo code and an affiliate code do not stack: the company gets whichever is bigger.`,
    `- For each company you refer, you earn a one-time payout: ${AFFILIATE_MONTHLY_PERCENT}% of one month's subscription if the company pays monthly, or ${AFFILIATE_YEARLY_PERCENT}% of the yearly subscription if it pays yearly. Both are worked out on the plan's regular price, before the company's ${REFERRED_DISCOUNT_PERCENT}% off.`,
    `- It is earned only after the company has been billed on Jindjinni for ${AFFILIATE_MONTHS} months. On a monthly plan, that means its third full monthly payment has gone through. On a yearly plan, it has paid for the year and stayed ${AFFILIATE_MONTHS} months.`,
    "- If the company cancels or is suspended before then, or its payment is reversed or charged back, no payout is earned. If a payout was already paid for a payment that is later reversed, we may take it off a future payout.",
    "- It is paid once for each company. It is not ongoing.",
    "- You cannot refer your own company.",
    "",
    "HOW YOU GET PAID",
    "- We pay by direct deposit only. No checks, no cards, no other methods.",
    "- We pay after the qualifying payment has been received.",
    "- We will contact you privately to set up your direct deposit. Never send bank details by email, text or chat unless we have told you how to share them securely.",
    "",
    "YOUR PORTAL",
    `- Sign in any time at ${i.portalUrl} with this email address. We email you a one-time sign-in link, so there is no password to remember.`,
    `- You can see the companies you referred, since when each has been active, and how many of the ${AFFILIATE_MONTHS} months are done.`,
    "- Once your payout for a company has been paid, that company disappears from your portal for good.",
    "",
    "WHAT TO LOOK OUT FOR",
    "- Be honest. Do not mislead anyone or promise results, discounts or prices we have not given you.",
    "- Do not send unwanted messages or spam. Only contact people who would reasonably expect it.",
    "- Do not claim to speak for Jindjinni or to be part of the company.",
    "- A company counts only if it signs up through your link or types your code at sign-up.",
    "- We may end an affiliate and keep back anything earned through a breach of these rules or the Terms.",
    "",
    `The full wording is in our Terms and Conditions, under "Referrals and affiliates": ${i.termsUrl}`,
    "",
    "Thank you for spreading the word.",
  ];
  const text = lines.join("\n");
  return { subject: "Jindjinni affiliate program: how it works and what to look out for", text, html: toHtml(text) };
}
