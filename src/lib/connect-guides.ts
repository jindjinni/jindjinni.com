// The plain "Connect it" guide for every outside connection: what it does and why, what it costs, numbered steps, how to check it
// worked, text to share with the team, and where to get help. One shape for all of them (see CLAUDE.md: every outside connection
// needs one). The words live here, as data, so they are written once and tested once; the screen is `components/connect-guide.tsx`.
//
// Rules: plain words; steps name the exact button a person will press; nothing here states a price (providers change them), only
// who charges and how to keep an eye on it.

import { PROVIDER_CONSOLE, PROVIDER_LABEL, PROVIDER_MAKER, type AiProvider } from "@/lib/ai-provider";

export type GuideKey = "shippo" | "email" | "ai-anthropic" | "ai-openai" | "cron-ping" | "quickbooks" | "quickbooks-desktop" | "quickbooks-platform";

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
    what: "Lets your Purchasing and Shipping teams buy UPS and USPS shipping labels from any quotation, sales order or shipment, and follows each package so its status updates by itself. Labels are bought in your own Shippo account.",
    cost: "Shippo's account is free to open. You pay Shippo for each label (the postage at your carrier rates, plus any per-label fee Shippo's own price list shows), using the payment method on your Shippo account. We never see your card.",
    steps: [
      "Sign in at goshippo.com, or create your free Shippo account.",
      "In Shippo open Settings, then Carriers, and switch on UPS and USPS. Add your payment method there too.",
      "In Shippo open Settings, then API, and copy your Live token. Use the Test token first if you only want to practise: test labels cost nothing and nothing ships.",
      "Come back to this page (Purchasing or Shipping, then Connectors; it is one connection that both use), paste the token in the box, and press Connect Shippo.",
      "If you used a Test token and want real labels later, paste your Live token and press Replace token.",
    ],
    check: "We check the token with Shippo the moment you press Connect. You should see Connected, whether it is Test or Live, and which carriers are switched on. Press Check again whenever you want to be sure.",
    ifBroken: "If it says Needs attention, Shippo is not accepting the saved token (it was changed or deleted in Shippo). Copy a current token from Shippo and press Replace token. No labels can be bought until then.",
    share: (c) => `Hi team, ${c} is now connected to Shippo. You can generate UPS and USPS shipping labels from any quotation, and the package status updates by itself. Labels are billed to our own Shippo account, so please only create one when it is really needed.`,
    help: { subject: "Help connecting Shippo", body: "I'm trying to connect our Shippo token under Connectors (Purchasing or Shipping) and I'm stuck. Here is what I see on the screen:\n" },
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
  quickbooks: {
    key: "quickbooks",
    title: "How to connect QuickBooks Online",
    what: "Lets Sales and Accounts see reports from your own QuickBooks Online here: who has paid, who owes you, and your profit and loss. The platform only reads. It never adds, changes or deletes anything in QuickBooks.",
    cost: "Nothing from us. It uses the QuickBooks Online account you already pay Intuit for. Intuit does not charge extra for a connected app to read your reports.",
    steps: [
      "Sign in to this platform as an owner or admin. Only they can connect QuickBooks.",
      "Read the notice on this page and tick the box that says you have read it.",
      "Press Connect QuickBooks. You are taken to QuickBooks' own page. We never see your QuickBooks password.",
      "Sign in to QuickBooks, choose the company file you want to share, and press Connect. QuickBooks will say the app can read and write. That is QuickBooks' only permission setting; this platform only reads.",
      "You come back to this page and it says Connected with your company's name. Open Accounts or Sales, then QuickBooks, and press Pull from QuickBooks on a report.",
    ],
    check: "After you connect, this page shows Connected and your QuickBooks company name. In Accounts → QuickBooks, press Pull from QuickBooks on Who has paid. The rows should match the payments you see in QuickBooks for the last 90 days.",
    ifBroken: "If it says Needs attention, QuickBooks took the permission back (a password change, a removed app, or about 100 days without use can do this). Press Connect QuickBooks again. Reports already saved stay here. You can disconnect at any time here, or in QuickBooks under your connected apps.",
    share: (c) => `Hi team, ${c}'s QuickBooks is now connected for reading only. Accounts and Sales can open the QuickBooks tab to see who has paid and who owes us. Nothing here changes anything in QuickBooks. The reports are copies from when they were pulled, so please check anything important in QuickBooks itself.`,
    help: { subject: "Help connecting QuickBooks Online", body: "I'm trying to connect our QuickBooks Online in Settings → Connectors and I'm stuck. Here is what I see on the screen:\n" },
  },
  "quickbooks-desktop": {
    key: "quickbooks-desktop",
    title: "QuickBooks Desktop or Enterprise: upload a report",
    what: "QuickBooks Desktop and Enterprise live on your own computer, so they cannot be connected directly. Instead you export a report from QuickBooks as a CSV file and upload it here, and Sales and Accounts see it like any other report.",
    cost: "Nothing. You do not install anything and nothing connects to your computer.",
    steps: [
      "In QuickBooks open the report: Reports, then Customers & Receivables (Who has paid: Transaction List by Customer. Who owes: A/R Aging Summary) or Company & Financial (Profit & Loss Standard).",
      "Choose the dates you want and press Customize Report if you need to.",
      "Press Excel at the top, then Create New Worksheet, and in the box that opens choose Create a comma separated values (.csv) file. Save it where you can find it.",
      "In this platform open Accounts or Sales, then QuickBooks. On the report you exported, press Choose file, pick the CSV, and press Upload.",
      "Repeat whenever you want the numbers refreshed. Each upload is saved as the newest copy.",
    ],
    check: "After you upload, the report shows the file's name, who uploaded it and when, and the rows from your file. Compare the totals with the report on your screen in QuickBooks.",
    ifBroken: "If it says the file does not look like a QuickBooks report, make sure you saved a CSV (not an Excel file) and that the report has at least a heading row and one data row. A file over 5 MB is too large: choose a shorter period.",
    share: (c) => `Hi team, ${c} uses QuickBooks on a computer, so to see its reports here someone exports a report from QuickBooks as a CSV file and uploads it under Accounts or Sales, then QuickBooks. The numbers are copies from when the file was exported.`,
    help: { subject: "Help uploading a QuickBooks report", body: "I'm trying to upload a QuickBooks report and I'm stuck. Here is what I see on the screen:\n" },
  },
  "quickbooks-platform": {
    key: "quickbooks-platform",
    title: "Platform setup for the QuickBooks connection",
    what: "Before any company can press Connect QuickBooks, the platform needs one registered app with Intuit (the company that makes QuickBooks). This is done once by the platform owner, not by each company.",
    cost: "Free to register. Intuit reviews an app before it can be used with real companies' data (their production keys), so allow time for that. Until then only a sandbox (practice) company works.",
    steps: [
      "Sign in at developer.intuit.com, create an app, and choose the QuickBooks Online Accounting scope.",
      "Under the app's Keys settings add this redirect address: your website address followed by /api/quickbooks/callback.",
      "Copy the Client ID and Client Secret for the environment you are using (Development keys for the practice company, Production keys for real companies).",
      "In your hosting settings add QBO_CLIENT_ID and QBO_CLIENT_SECRET with those values. Add QBO_ENV with the value sandbox while practising; leave it out for production. Then redeploy.",
      "Switch the QuickBooks feature on for your own company first in the Lamp, try Connect QuickBooks with a practice company, then roll it out.",
    ],
    check: "On Settings → Connectors the QuickBooks card shows a Connect QuickBooks button. If it says the platform has not set up QuickBooks yet, the two keys are missing from the hosting settings.",
    ifBroken: "If QuickBooks shows an error page after sign-in, the redirect address in Intuit's settings does not exactly match your website address. Fix it there. Never share the Client Secret in chat or email.",
    share: (c) => `Platform note for ${c}: QuickBooks needs QBO_CLIENT_ID and QBO_CLIENT_SECRET in the hosting settings and the redirect address /api/quickbooks/callback registered with Intuit.`,
    help: { subject: "Help with the platform's QuickBooks setup", body: "I'm registering the platform's QuickBooks app with Intuit and I'm stuck. Here is what I see:\n" },
  },
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
