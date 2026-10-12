import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CLOSE_GRACE_DAYS, CONTACT_EMAIL, OPERATOR_NAME, OPERATOR_STATE, SIGN_IN_HISTORY_MONTHS } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "Who we are and what this covers",
    paras: [
      `jindjinni ("we", "us") is owned and operated by ${OPERATOR_NAME}, located in ${OPERATOR_STATE}, United States. We provide business software that companies use to run purchasing, receiving, accounts, customer service, inventory, sales, shipping, marketing, HR and team chat, as a Wholesale operation, a Distribution operation or both. This policy explains what information we collect, how we use it, who we share it with and the choices you have. It covers our website and the software (the "Service"). It is part of our Terms of Service.`,
      "There are two kinds of information, and we treat them differently. Account and company information is information about you and your company that we collect to run the Service, and we decide how it is used. Workspace data is the business records your company enters, such as customers, prices, quotations, receiving records, messages and time records. Your company decides what goes in, and we process it on the company's behalf.",
    ],
  },
  {
    heading: "Information we collect",
    items: [
      "Account details: your name, work email address, and a password, which we store only in scrambled (hashed) form so nobody at jindjinni can read it.",
      "Company details: your company's legal name, logo, business and shipping addresses, phone numbers and email addresses, a primary contact, and optionally a website, tax ID and registration number.",
      "Business verification: to open a workspace we require your company's legal name, EIN, state of registration, state file number, year formed, kind of business and an uploaded proof document. Our platform team reviews them, and the proof document is shown only to our platform owner's login. We may check the state's public registry to see whether the business is active.",
      "Free-trial record: so a free trial is used once per business, we keep a one-way (hashed) record built from the EIN, state and file number, with the number of trial days used. It cannot be turned back into those details and it stays after a company is closed.",
      "Connected accounts: when your company connects a mailbox, shipping account, accounting software or AI account, we store the key or token encrypted and show only its last few characters. For a connected mailbox we also save the messages we fetch, as plain text, in your workspace. We only read them; we never change or delete anything in the real mailbox.",
      "Affiliates: if you apply to be an affiliate, your name, email address and what you tell us about how you will refer people. A referral link saves a cookie for 30 days. An approved affiliate signs in to a private portal with a one-time link sent to their email; it shows only the name of each company they referred, when it became active and how many of its first 3 billed months are done, and a company disappears from that list once the affiliate's payout for it has been paid. They never see a company's people, records, plan or prices.",
      "Team details: the email addresses, roles and department access of people invited to a workspace, and whether an invitation has been accepted.",
      `Sign-in records: the time of each successful sign-in, kept for about ${SIGN_IN_HISTORY_MONTHS} months, and the time of your last sign-in. We do not store your IP address, location or device details in these records.`,
      "Workspace data: whatever your team enters, uploads or imports. Depending on the departments you use, this includes your customers' names, addresses, phone numbers and email addresses, product and pricing information, quotations, receiving records, photos and scans of packages, lot and serial numbers, tracking numbers, accounting and payment records, inventory, sales documents, marketing contacts and campaign content, emails sent through the Service, chat messages and shared files, and employee clock-in and clock-out times and activity.",
      "Storefront visitors: when a company turns on a public storefront, a visitor who asks to sell to it or places an order gives their name, email address, phone number, shipping address and what they are selling or buying, and, for a seller who wants to be paid by direct deposit, the account owner's name and the routing and account numbers. This is described under \"Visitors to a company's storefront\" below.",
      "Choices you make: when you agreed to our Terms and which version, and the preferences you set.",
      "Technical information: like most websites, our servers and hosting providers see basic request information (such as IP address and browser type) in routine logs used to keep the Service running and secure.",
    ],
  },
  {
    heading: "Cookies",
    paras: [
      "We use essential cookies only. One keeps you signed in; if you choose \"Remember me\" when signing in it lasts up to 90 days, otherwise one day. One remembers which operation (Wholesale or Distribution) you are working in. If you arrive through an affiliate's link, one remembers the affiliate's code for 30 days so the referral can be credited. An affiliate who signs in to the affiliate portal gets one that keeps them signed in for 7 days. They are needed for the Service to work and are not used for advertising or tracking across other websites. We do not use advertising cookies. Because we do not track you across websites, we do not respond to \"do not track\" signals.",
    ],
  },
  {
    heading: "How we use information",
    items: [
      "To provide the Service: sign you in, show your company's data to the people you have authorised, and produce quotations, receipts, labels, reports and messages you ask for.",
      "To send messages that are part of the Service, such as team invitations, account and security notices, password reset links and, when it is turned on, the code that verifies your email.",
      "To keep the Service safe: detect misuse, investigate problems and enforce our Terms and Acceptable Use Policy.",
      "To support you, and to improve and fix the Service, using information about how it is used.",
      "To meet legal obligations and to protect our rights.",
    ],
    after: ["We do not sell your information, we do not share it for advertising, and we do not use workspace data, including your customers' and contacts' details, to market to anyone."],
  },
  {
    heading: "Your customers', contacts' and employees' information",
    paras: [
      "When your team enters details about customers, contacts or employees, your company is responsible for having a proper reason to hold them, for telling those people how you use them, and for answering their requests. We use that information only to run your workspace and produce the documents and messages you ask for. If one of those people asks you to correct or delete their details, you can do it in the workspace, and if you need our help, contact us. If someone contacts us directly about information in a company's workspace, we may direct them to that company.",
    ],
  },
  {
    heading: "Who we share information with",
    paras: ["We share information only with the following, and only as needed:"],
    items: [
      "Service providers that help us run jindjinni, such as website hosting, the database where records are stored, private file storage for photos and attachments, email delivery and email sign-in connections (for example Google and Microsoft, when your company connects its mailbox), a shipping provider that creates and sells labels and follows shipments, and an address-search service that suggests street addresses as you type. They may only use the information to provide their service to us or to you. When you create a shipping label, the sender and receiver names and addresses (and phone or email if provided) go to the shipping provider and the carrier. When you type an address, the text you type is sent to the address-search service.",
      "AI providers, for features your company uses. For the Home screen's industry news, brand names and public news headlines may be sent to an AI provider to sort and summarise them. For photo reading in Receiving, an image of a label or package that you choose to scan may be sent to an AI provider to suggest lot and serial numbers. When you ask Jin, the built-in assistant, a question, your question, the recent messages of that conversation and the company records Jin looks up to answer it (limited to what your role may open, for example a few quotation, shipment or stock lines) are sent to an AI provider, using your company's own AI key (Claude or ChatGPT) if it connected one, otherwise the platform's Claude account. We store only how many questions each person asks per day to keep a fair limit, not the questions or the answers, unless you press \"Helpful\" or \"Not right\" on an answer: then that question, Jin's answer, your optional note, your company and your account are saved and read by the jindjinni team to improve Jin, and we may turn what we learn into general industry notes with all customer, company and price details removed. If you use the microphone button, your browser's own speech service turns your voice into text (depending on your browser, that service may be run by the browser's maker, such as Google or Apple, under its own privacy terms); the audio does not come to us and is not stored by us. Read-aloud uses your device's own voice. We send only what the feature needs.",
      "A bot-protection provider (Cloudflare Turnstile), when it is switched on. It checks that the person using the sign-in, sign-up and invitation pages is not an automated program, and it may receive your network address and basic browser details for that check. We also keep short-lived, scrambled counters of recent tries from a network address to slow down abuse.",
      "Public information sources, such as government recall databases, news search and state business registries, which receive the brand and product names or the company name or file number used in a search, not your customers' details.",
      "A payment provider, once billing is switched on, to take automatic payments. We will name it here before any charge begins.",
      "Other people in your company, according to the roles your Owner and Admins assign. Owners and Admins can see team members' names, emails, roles and sign-in times, and the company's workspace data.",
      "Authorities or other parties when we believe the law requires it, or when needed to protect people, the Service or our rights.",
      "A buyer or successor if jindjinni is involved in a merger, sale or similar change, who must honour this policy.",
    ],
  },
  {
    heading: "Visitors to a company's storefront",
    paras: [
      "Some companies turn on a public storefront, a checkout or a connection for their own website. If you use one, you are dealing with that company, not with jindjinni. We process what you enter for that company, as its service provider, so the company decides why it is collected and how long it is kept, and you should ask the company about your information and read its notice. The details are kept in that company's own workspace, apart from every other company's.",
      "What we do with it: show the company your request or order, make the quotation, send you an order email and a link to a page showing your order, and, if the company allows it, buy a shipping label, which sends the shipping addresses to the company's shipping provider and a tracking number back. We use no advertising or tracking cookies for this, and we do not sell or share a visitor's details for marketing.",
      "Direct-deposit details are stored encrypted, shown to the company's staff only with the last four digits visible, and shown in full only to the company's Owner, Admins and people with Accounts access, with a record of each time. They are never included in emails, logs or exports. The company can erase them after paying you, and it should; ask the company to erase them if you want them removed. You can also ask the company to correct or delete your other details.",
    ],
  },
  {
    heading: "Chat and workplace records",
    paras: [
      "Chat messages, shared files, status, clock-in and clock-out times and activity logs are stored in your company's workspace and are controlled by your company. Your company may be able to see them, and we may access them where needed to provide support, keep the Service secure, enforce our Terms or meet legal duties. Private messages are visible to the people in the conversation and are not shown to other team members.",
    ],
  },
  {
    heading: "Support requests and support access",
    paras: [
      "When you send a support request, from the Support page or by email, we keep the request, the replies, the sender's name and email address, your company's name and company ID, and a summary of your account standing (such as whether it is active and whether payments are current), so we can help you and see who is asking. Internal notes our team writes about a request are not shown to you. Support requests are kept for as long as your company is open and as needed to resolve disputes.",
      "We open the inside of your workspace for support only if an Owner or Admin allows it on that request. The permission is limited to 1, 3 or 7 days, can be taken back at any time, and each look is read-only, lasts up to 30 minutes and is limited to our platform owner's login, which is protected with two-step sign-in. Team chat, employee records, downloads and exports are not available in that view. Each look is emailed to the person who made the request and listed in your Support access log.",
    ],
  },
  {
    heading: "How long we keep information",
    items: [
      "While your company is open, we keep your account and workspace data so you can use the Service, until your company deletes it.",
      `When the Owner closes the company, we keep everything for ${CLOSE_GRACE_DAYS} days so it can be reopened, then permanently delete the company's data, including its team, records and uploaded files. People who belonged only to that company have their accounts deleted or anonymised.`,
      `Sign-in records are deleted after about ${SIGN_IN_HISTORY_MONTHS} months.`,
      "Copies in routine backups held by our hosting providers are removed on those providers' normal schedules. We may keep limited records we are legally required to keep, or need to resolve a dispute.",
    ],
  },
  {
    heading: "Security",
    paras: [
      "Each company's data is kept separate (and a company's Wholesale and Distribution operations are kept apart from each other) and can only be reached by people signed in with access to that company. Passwords are hashed, invitation and password reset links are single-purpose, expire and are stored only as one-way fingerprints, connection keys are encrypted, uploaded photos and files are kept private and are only opened through the signed-in app, and traffic to the Service is protected with HTTPS. No system is perfectly secure, so we cannot guarantee absolute security, and you should use a strong, unique password. More detail is on our Security page. If a breach affects your information, we will notify you as the law requires.",
    ],
  },
  {
    heading: "Your choices and rights",
    items: [
      "See and correct your information: your name and password are under Settings, My account. Company details are under Settings, Business profile.",
      "Download your company's data: Settings, Close company, \"Download my data\" (Owner and Admins).",
      "Delete your data: the Owner can close the company, which deletes its data after the grace period. To delete your own account or ask any other privacy question, contact us.",
      "Depending on where you live, such as certain US states, you may have rights to access, correct, delete or obtain a copy of personal information, to opt out of its sale or sharing (we do not sell or share it for advertising), and to not be treated differently for using these rights. You can use them by contacting us, and we will respond as the law requires. If your information is in a company's workspace, we may direct you to that company.",
    ],
  },
  {
    heading: "Children",
    paras: ["The Service is for businesses and is not directed to anyone under 18. We do not knowingly collect information from children. If you believe a child has given us information, contact us and we will delete it."],
  },
  {
    heading: "Where information is handled",
    paras: ["The Service is operated from the United States, and information may be processed and stored there or in other countries where our providers operate. By using the Service you understand that your information may be transferred to and handled in those places."],
  },
  {
    heading: "Changes to this policy",
    paras: ["We may update this policy. If the changes are material we will tell the Owner by email or in the Service. The date at the top shows when it last changed."],
  },
  {
    heading: "Contact us",
    paras: [`For privacy questions or requests, email ${CONTACT_EMAIL}, or write to ${OPERATOR_NAME}, ${OPERATOR_STATE}, USA.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Your business information, and your customers', contacts' and employees' information, deserve care. This page explains in plain language what jindjinni collects and what we do with it."
      sections={sections}
    />
  );
}
