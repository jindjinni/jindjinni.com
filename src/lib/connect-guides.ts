// The plain "Connect it" guide for every outside connection: what it does and why, what it costs, numbered steps, how to check it
// worked, text to share with the team, and where to get help. One shape for all of them (see CLAUDE.md: every outside connection
// needs one). The words live here, as data, so they are written once and tested once; the screen is `components/connect-guide.tsx`.
//
// Rules: plain words; steps name the exact button a person will press; nothing here states a price (providers change them), only
// who charges and how to keep an eye on it.

import { PROVIDER_CONSOLE, PROVIDER_LABEL, PROVIDER_MAKER, type AiProvider } from "@/lib/ai-provider";

export type GuideKey = "shippo" | "email" | "ai-anthropic" | "ai-openai" | "cron-ping";

export type Guide = {
  key: GuideKey;
  /** Heading of the card, e.g. "How to connect Shippo". */
  title: string;
  /** What it lets people do, and why a company would want it. */
  what: string;
  /** Who charges, and how to keep control of it. */
  cost: string;
  steps: string[];
  /** How a person knows it worked (names the button on the page). */
  check: string;
  /** What to do when it stops working. */
  ifBroken: string;
  /** Short text an owner can paste to tell the team it is ready; `company` is the company's name. */
  share: (company: string) => string;
  /** The words put in a Support ticket's title and body when someone asks for help from this guide. */
  help: { subject: string; body: string };
};

const AI = (p: AiProvider): Guide => ({
  key: p === "anthropic" ? "ai-anthropic" : "ai-openai",
  title: `How to connect ${PROVIDER_LABEL[p]}`,
  what: `Lets the platform read lot and serial numbers from label photos in Receiving, and gives Jin, the built-in helper, a much higher daily limit. It uses your own ${PROVIDER_MAKER[p]} account, so the work is done and billed there, never on anyone else's account.`,
  cost: `${PROVIDER_MAKER[p]} charges your account for what is used, and nothing else is charged by us. You can set a monthly spending limit in the ${PROVIDER_MAKER[p]} console. A chat subscription (the monthly plan for chatting) is not the same thing as an API key and does not work here.`,
  steps: [
    `Open ${PROVIDER_CONSOLE[p]} and sign in (or create your account).`,
    `Add a payment method there, because ${PROVIDER_MAKER[p]} bills you for use.`,
    `Open the page called API keys and create a new key. Give it a name you will recognise, such as “Jindjinni”.`,
    `Copy the key right away. ${PROVIDER_MAKER[p]} shows it only once.`,
    `Come back here, choose ${PROVIDER_LABEL[p]} above, paste the key, and press Connect ${PROVIDER_LABEL[p]}.`,
  ],
  check: `We check the key with ${PROVIDER_MAKER[p]} the moment you press Connect, and you can press Check again at any time. It should say Connected with the last 4 characters of your key.`,
  ifBroken: `If it says Needs attention, the key was probably deleted, ran out of credit, or hit your spending limit. Fix that in the ${PROVIDER_MAKER[p]} console, or create a new key and press Replace key.`,
  share: (c) => `Hi team, ${c} is now connected to ${PROVIDER_LABEL[p]}. In Receiving you can take a photo of a label and the lot and serial numbers are read for you. Please still check them before you save.`,
  help: { subject: `Help connecting ${PROVIDER_LABEL[p]}`, body: `I'm trying to connect our ${PROVIDER_LABEL[p]} key in Settings → Connectors and I'm stuck. Here is what I see on the screen:\n` },
});

export const GUIDES: Record<GuideKey, Guide> = {
  shippo: {
    key: "shippo",
    title: "How to connect Shippo",
    what: "Lets your Purchasing team buy UPS and USPS shipping labels for your customers from any quotation, and follows each package so its status updates by itself. Labels are bought in your own Shippo account.",
    cost: "Shippo's account is free to open. You pay Shippo for each label (the postage at your carrier rates, plus any per-label fee Shippo's own price list shows), using the payment method on your Shippo account. We never see your card.",
    steps: [
      "Sign in at goshippo.com, or create your free Shippo account.",
      "In Shippo open Settings, then Carriers, and switch on UPS and USPS. Add your payment method there too.",
      "In Shippo open Settings, then API, and copy your Live token. Use the Test token first if you only want to practise: test labels cost nothing and nothing ships.",
      "Come back to this page, paste the token in the box, and press Connect Shippo.",
      "If you used a Test token and want real labels later, paste your Live token and press Replace token.",
    ],
    check: "We check the token with Shippo the moment you press Connect. You should see Connected, whether it is Test or Live, and which carriers are switched on. Press Check again whenever you want to be sure.",
    ifBroken: "If it says Needs attention, Shippo is not accepting the saved token (it was changed or deleted in Shippo). Copy a current token from Shippo and press Replace token. No labels can be bought until then.",
    share: (c) => `Hi team, ${c} is now connected to Shippo. You can generate UPS and USPS shipping labels from any quotation, and the package status updates by itself. Labels are billed to our own Shippo account, so please only create one when it is really needed.`,
    help: { subject: "Help connecting Shippo", body: "I'm trying to connect our Shippo token in Purchasing → Settings → Connectors and I'm stuck. Here is what I see on the screen:\n" },
  },
  email: {
    key: "email",
    title: "How to connect your company email",
    what: "Makes the emails your customers receive (quotations, payment confirmations, receiving notices) come from your own company address, and replies come back to it. Without it, those emails go out from the platform's shared address.",
    cost: "Nothing extra. It uses the email account you already have. We only borrow permission to send for you; your emails stay with your provider.",
    steps: [
      "Decide which address customers should see, for example payables@yourcompany.com.",
      "Press Gmail or Google Workspace, or Outlook or Microsoft 365, whichever hosts that address. If it is hosted somewhere else, press Any other email.",
      "Sign in on the provider's own page with that address. We never see your password.",
      "Approve what the provider asks for (sending email for you). Leave every box ticked.",
      "You come back to this page. Press Send me a test email to check it.",
    ],
    check: "Press Send me a test email. A message arrives in that same mailbox within a minute or two. If it does, customers will see the same sender.",
    ifBroken: "If it says Needs to be reconnected, the provider took the permission back (a password change or a security setting can do this). Pick the provider again and sign in; nothing is sent from any other address in the meantime for departments that have their own mailbox.",
    share: (c) => `Hi team, ${c}'s company email is connected. Quotations, payment confirmations and notices to customers now come from our own address, and replies come back to it.`,
    help: { subject: "Help connecting our company email", body: "I'm trying to connect our company email in Settings → Connectors and I'm stuck. Here is what I see on the screen:\n" },
  },
  "ai-anthropic": AI("anthropic"),
  "ai-openai": AI("openai"),
  "cron-ping": {
    key: "cron-ping",
    title: "How to make scheduled emails go out on the minute",
    what: "Emails people schedule for later normally go out while someone has the Mail tab open and in a once-a-day safety check. A free “ping” service that visits one address every minute makes them leave on time even when nobody is looking at the screen.",
    cost: "Free. Several services do this at no charge (search for “free cron ping every minute”). If your hosting plan is upgraded to one that allows per-minute scheduled jobs, you do not need this at all.",
    steps: [
      "Sign up for a free ping or cron service that can send a web request every minute.",
      "Make a new job that calls this address every minute: your website address followed by /api/cron/mail-tick.",
      "Add one header to the request: Authorization with the value Bearer followed by a space and the CRON_SECRET from your hosting settings.",
      "Save the job and switch it on.",
    ],
    check: "Schedule a test email for two minutes from now to your own address from any Mail tab, then close the tab. It should still arrive on time.",
    ifBroken: "If scheduled emails are late, check that the job is switched on and that the secret in the header matches the one in your hosting settings. A wrong secret is refused on purpose.",
    share: (c) => `Platform note for ${c}: scheduled emails now go out on the minute from a free ping service. If they ever run late, check that the ping job is still switched on.`,
    help: { subject: "Help with the every-minute ping for scheduled email", body: "I'm setting up the every-minute ping for scheduled email and I'm stuck. Here is what I see:\n" },
  },
};

export const GUIDE_KEYS = Object.keys(GUIDES) as GuideKey[];

export const guideFor = (key: string | null | undefined): Guide | null => (key && Object.hasOwn(GUIDES, key) ? GUIDES[key as GuideKey] : null);

/** The anchor a "Show me how" link points at. */
export const guideAnchor = (key: GuideKey) => `connect-guide-${key}`;

/** The Support page address that opens a new ticket already filled in for this guide. */
export const helpHref = (key: GuideKey) => `/dashboard/support?about=${key}`;

/** What the Support form starts with when it is opened from a guide (or nothing, for an unknown value). */
export function supportPrefill(about: string | null | undefined): { subject: string; category: string; body: string } | null {
  const g = guideFor(about);
  return g ? { subject: g.help.subject, category: "Question: how do I...", body: g.help.body } : null;
}

/** A broken guide is one that has lost a part; the test calls this so a new guide can't ship half written. */
export function guideProblems(g: Guide): string[] {
  const out: string[] = [];
  if (g.what.trim().length < 40) out.push("what is too short");
  if (g.cost.trim().length < 20) out.push("cost is missing");
  if (g.steps.length < 3) out.push("needs at least 3 steps");
  if (g.steps.some((s) => !s.trim())) out.push("an empty step");
  if (!g.check.trim()) out.push("check is missing");
  if (!g.ifBroken.trim()) out.push("ifBroken is missing");
  if (!g.share("Acme").includes("Acme")) out.push("share text must name the company");
  if (g.help.subject.trim().length < 3) out.push("help subject too short");
  if (/\$\s?\d|\d\s?(cents|dollars)|\d+\s?%/.test([g.what, g.cost, ...g.steps].join(" "))) out.push("states a price (providers change them)");
  return out;
}
