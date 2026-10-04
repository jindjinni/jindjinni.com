import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CLOSE_GRACE_DAYS, CONTACT_EMAIL, SIGN_IN_HISTORY_MONTHS } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "Who we are and what this covers",
    paras: [
      "jindjinni (\"we\", \"us\") provides a business workspace used by companies to run purchasing and related operations. This policy explains what information we collect, how we use it, who we share it with and the choices you have. It covers our website and the workspace (the \"Service\").",
      "There are two kinds of information, and we treat them differently. Account and company information is information about you and your company that we collect to run the Service, and we decide how it is used. Workspace data is the business records your company enters, such as customers, prices and quotations. Your company decides what goes in, and we process it on the company's behalf.",
    ],
  },
  {
    heading: "Information we collect",
    items: [
      "Account details: your name, work email address, and a password, which we store only in scrambled (hashed) form so nobody at jindjinni can read it.",
      "Company details: your company's legal name, logo, business and shipping addresses, phone numbers and email addresses, a primary contact, and optionally a website, tax ID and registration number.",
      "Team details: the email addresses and roles of people invited to a workspace, and whether an invitation has been accepted.",
      `Sign-in records: the time of each successful sign-in, kept for about ${SIGN_IN_HISTORY_MONTHS} months, and the time of your last sign-in. We do not store your IP address, location or device details in these records.`,
      "Workspace data: whatever your team enters or imports, including your customers' names, addresses, phone numbers and email addresses, product and pricing information, quotations, receipts, notes and tracking numbers.",
      "Choices you make: when you agreed to our Terms and which version.",
      "Technical information: like most websites, our servers and hosting providers see basic request information (such as IP address and browser type) in routine logs used to keep the Service running and secure.",
    ],
  },
  {
    heading: "Cookies",
    paras: [
      "We use one essential cookie to keep you signed in. It is needed for the Service to work and is not used for advertising or tracking across other websites. If you choose \"Remember me\" when signing in, the cookie lasts up to 90 days; otherwise one day. We do not use advertising cookies.",
    ],
  },
  {
    heading: "How we use information",
    items: [
      "To provide the Service: sign you in, show your company's data to the people you have authorised, and produce quotations, receipts and shipping labels.",
      "To send messages that are part of the Service, such as the code that verifies your email, team invitations and notices about your account or company.",
      "To keep the Service safe: detect misuse, investigate problems and enforce our Terms and Acceptable Use Policy.",
      "To improve and fix the Service, using information about how it is used.",
      "To meet legal obligations.",
    ],
    after: ["We do not sell your information, we do not share it for advertising, and we do not use workspace data, including your customers' details, to market to anyone."],
  },
  {
    heading: "Your customers' information",
    paras: [
      "When your team enters a customer's details, your company is responsible for having a proper reason to hold them and for telling your customers how you use them. We use that information only to run your workspace and produce the documents you ask for, such as a quotation or a shipping label sent to your customer. If one of your customers asks you to correct or delete their details, you can do it in the workspace, and if you need our help, contact us.",
    ],
  },
  {
    heading: "Who we share information with",
    paras: [
      "We share information only with the following, and only as needed:",
    ],
    items: [
      "Service providers that help us run jindjinni: website hosting, the database where records are stored, email delivery, a shipping provider that creates and sells shipping labels, and an address-search service that suggests street addresses as you type. They may only use the information to provide their service to us. When you create a shipping label, the sender and receiver names and addresses (and phone or email if you provided them) go to the shipping provider and the carrier. When you type an address, the text you type is sent to the address-search service.",
      "Other people in your company, according to the roles your Owner and Admins assign. Owners and Admins can see team members' names, emails, roles and sign-in times.",
      "Authorities or other parties when we believe the law requires it, or when needed to protect people, the Service or our rights.",
      "A buyer or successor if jindjinni is involved in a merger, sale or similar change, who must honour this policy.",
    ],
  },
  {
    heading: "How long we keep information",
    items: [
      "While your company is open, we keep your account and workspace data so you can use the Service.",
      `When the Owner closes the company, we keep everything for ${CLOSE_GRACE_DAYS} days so it can be reopened, then permanently delete the company's data, including its team, records and files. People who belonged only to that company have their accounts deleted or anonymised.`,
      `Sign-in records are deleted after about ${SIGN_IN_HISTORY_MONTHS} months.`,
      "Copies in routine backups held by our hosting providers are removed on those providers' normal schedules. We may keep limited records we are legally required to keep.",
    ],
  },
  {
    heading: "Security",
    paras: [
      "Each company's data is kept separate and can only be reached by people signed in with access to that company. Passwords are hashed, invitation links are single-purpose and expire, and traffic to the Service is protected with HTTPS. No system is perfectly secure, so please use a strong, unique password. More detail is on our Security page.",
    ],
  },
  {
    heading: "Your choices and rights",
    items: [
      "See and correct your information: your name and password are under Settings, My account. Company details are under Settings, Business profile.",
      "Download your company's data: Settings, Close company, \"Download my data\" (Owner and Admins).",
      "Delete your data: the Owner can close the company, which deletes its data after the grace period. To delete your own account or ask any other privacy question, contact us.",
      "Depending on where you live, such as certain US states, you may have additional rights to access, correct, delete or obtain a copy of personal information, and to not be discriminated against for using them. You can exercise them by contacting us, and we will respond as the law requires. If your information is in a company's workspace, we may direct you to that company.",
    ],
  },
  {
    heading: "Children",
    paras: ["The Service is for businesses and is not directed to anyone under 18. We do not knowingly collect information from children."],
  },
  {
    heading: "Where information is handled",
    paras: ["The Service is operated from the United States, and information may be processed and stored there or in other countries where our providers operate."],
  },
  {
    heading: "Changes to this policy",
    paras: ["We may update this policy. If the changes are material we will tell the Owner by email or in the Service. The date at the top shows when it last changed."],
  },
  {
    heading: "Contact us",
    paras: [`For privacy questions or requests, email ${CONTACT_EMAIL}.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Your business information, and your customers' information, deserve care. This page explains in plain language what jindjinni collects and what we do with it."
      sections={sections}
    />
  );
}
