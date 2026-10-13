import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { publicLinkByToken } from "@/lib/payout-link-service";
import { companySlug } from "@/lib/payout-link-rules";
import { PaymentDetailsForm } from "./payment-form";

/** The address is /payment-details/<token> (older links) or /payment-details/<company-name>/<token>. The LAST piece is the token; anything longer is not a link. */
function split(parts: string[] | undefined): { token: string; company?: string } {
  const p = (parts ?? []).map((x) => { try { return decodeURIComponent(x); } catch { return ""; } });
  if (p.length === 1) return { token: p[0] };
  if (p.length === 2) return { token: p[1], company: p[0] };
  return { token: "" };
}
const PRIVATE = { robots: { index: false, follow: false }, referrer: "no-referrer" } as const;
/** The browser tab says "Payment details - <company>" for a real link and just "Payment details" for anything else. */
export async function generateMetadata({ params }: { params: Promise<{ parts: string[] }> }): Promise<Metadata> {
  const { token } = split((await params).parts);
  const link = await publicLinkByToken(token);
  return { title: link ? `Payment details - ${link.companyName}` : "Payment details", ...PRIVATE };
}
export const dynamic = "force-dynamic";

/**
 * The page a customer reaches from the private link we sent. The company, the order and the customer's name come from the link's token only.
 * A link that is wrong, ended, expired or already used for a paid order shows a plain message and never says which company it belonged to.
 */
export default async function PaymentDetailsPage({ params }: { params: Promise<{ parts: string[] }> }) {
  const { token, company } = split((await params).parts);
  const link = await publicLinkByToken(token);
  // The address always names the company the customer deals with (the name printed on the quotation): an older plain link or a wrong name is sent to it.
  if (link && company !== companySlug(link.companyName)) redirect(`/payment-details/${companySlug(link.companyName)}/${token}`);
  const shell = (name: string | null, body: React.ReactNode) => (
    <div className="auth-theme relative flex min-h-full flex-1 flex-col overflow-x-clip bg-white">
      <header className="border-b border-line/70 bg-white">
        <div className="mx-auto flex h-[68px] max-w-3xl items-center px-4 sm:px-6">
          <span className="truncate text-lg font-extrabold tracking-tight text-ink" data-testid="pl-company">{name ?? "Payment details"}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{body}</main>
      <footer className="px-4 pb-8 text-center text-xs font-semibold text-muted" data-testid="pl-footer">{name ? `Private and encrypted. ${name} is the only company that can see what you send.` : ""}</footer>
    </div>
  );
  const message = (title: string, text: string) => shell(link?.companyName ?? null, (
    <div className="rounded-2xl border border-line p-6" data-testid="pl-message">
      <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
      <p className="mt-2 text-base text-muted">{text}</p>
    </div>
  ));
  if (!link || link.state === "invalid") return message("This link isn't valid", "Please check that you opened the whole link from our email, or ask us to send it again.");
  if (link.state === "expired") return message("This link has expired", "For your safety these links stop working after 14 days. Please ask us for a new one.");
  if (link.state === "received") return message("We already received your details", `Thank you. This link can only be used once, so it can't be used again${link.receivedLine ? ` (we have your ${link.receivedLine})` : ""}. If something needs fixing, please contact us and we will send you a new link.`);
  if (link.state === "closed") return message("This link is closed", "We don't need anything more from you through this link. If you still need to send your details, please ask us for a new link.");
  return shell(link.companyName, (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Where should we pay you?</h1>
      <p className="mt-2 text-base text-muted">
        For order <span className="font-mono font-extrabold text-ink" data-testid="pl-order">{link.quotationNumber}</span>. This page is private and encrypted. Only the people at {link.companyName} who pay you can see what you send.
      </p>
      <PaymentDetailsForm token={token} />
    </>
  ));
}
