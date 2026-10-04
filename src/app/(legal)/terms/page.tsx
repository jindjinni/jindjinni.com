import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CLOSE_GRACE_DAYS, CONTACT_EMAIL, OPERATOR_NAME, OPERATOR_STATE } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "Who these terms are between",
    paras: [
      `These Terms of Service (the "Terms") are an agreement between you and ${OPERATOR_NAME}, a business located in ${OPERATOR_STATE}, United States, which owns and operates jindjinni ("jindjinni", "we", "us"). They cover your use of the jindjinni website and the business workspace we provide through it (the "Service").`,
      "jindjinni is for businesses. If you create an account or accept an invitation on behalf of a company, you confirm you have the authority to bind that company to these Terms, and \"you\" includes the company. You must be at least 18 years old to use the Service.",
    ],
  },
  {
    heading: "What the Service is",
    paras: [
      "jindjinni is a multi-company workspace for running a supply business: a purchasing department (product price lists, customer records, quotations, receipts and shipping labels), with receiving, inventory and invoicing being added over time. Each company's workspace is kept separate from every other company's.",
      "The Service is provided as software. We do not buy or sell goods, we are not a party to any transaction between you and your customers or suppliers, and nothing in the Service is legal, tax, accounting or regulatory advice.",
    ],
  },
  {
    heading: "Accounts, owners and team members",
    items: [
      "The person who creates a company workspace is its Owner. The Owner is responsible for the workspace, for who is invited to it, and for everything done in it by the people they invite.",
      "The Owner and Admins can invite people by email, give each person a role (such as Purchasing Manager, Purchasing Agent, Receiver or Accountant), change roles and turn someone's access off. Roles decide what a person can see and change. Give people only the access they need.",
      "Each company has a limit on the number of team members, counting pending invitations. We set a default and may adjust it for a company.",
      "Keep your password private and use a password you don't use anywhere else. Don't share a login between people. You are responsible for activity under your login, and you must tell us promptly if you think someone else has used it.",
      "Provide accurate information about yourself and your company, and keep your Business Profile up to date.",
    ],
  },
  {
    heading: "Your data",
    paras: [
      "Everything you and your team enter into the Service, including customer records, prices, quotations, receipts, uploaded files and your company profile (\"Your Data\"), belongs to you. We do not claim ownership of it.",
      "You give us permission to store, process, display and transmit Your Data only as needed to provide and secure the Service, to prevent misuse, to comply with the law and as described in our Privacy Policy. We do not sell Your Data and we do not use it to advertise to you or your customers.",
      "Your Data often includes personal information about your customers, such as names, addresses, phone numbers and email addresses. You are responsible for having the right to collect and use that information, for keeping it accurate, and for responding to your customers' requests about it. In privacy terms, you decide why and how that information is used and we process it on your behalf.",
      "The Service is not designed to hold protected health information (such as patient records or prescriptions) or payment card numbers. Do not enter them. See the Acceptable Use Policy.",
      "You can download a copy of Your Data at any time from Settings, under Close company.",
    ],
  },
  {
    heading: "Acceptable use",
    paras: [
      "You agree to follow our Acceptable Use Policy, which is part of these Terms. In short: use the Service lawfully and honestly, don't misuse other people's data, and don't try to break or overload it.",
    ],
  },
  {
    heading: "Prices, quotations and calculations",
    paras: [
      "The Service helps you set product prices, apply condition and expiration adjustments and bonus tiers, and produce quotations and receipts. The prices, rules and offers are yours, and you are responsible for them.",
      "We work to make the calculations correct, but you should review each quotation and receipt before relying on it or sending it to a customer. Rounding, edited rules and manual overrides can all change a total. We are not responsible for offers you make or honour based on figures you did not check.",
    ],
  },
  {
    heading: "Third-party services",
    paras: [
      "Some features rely on other companies' services, for example our hosting and database providers, email delivery, address lookup and the shipping provider used to buy labels. When you use those features, information needed to do the job (such as the addresses on a shipping label) is sent to the provider. Our Privacy Policy lists the kinds of providers we use.",
      "Shipping labels are bought through a shipping provider using the account and payment arrangements set up for your company or for the Service. Label charges, delivery problems and refunds follow that provider's terms. We are not the carrier and do not guarantee delivery.",
    ],
  },
  {
    heading: "Plans and fees",
    paras: [
      "At the time of these Terms the Service is offered without charge while it is being built. If we introduce fees, we will tell the Owner by email before anything is charged, and you can close your company instead of accepting them. Fees you have agreed to are non-refundable except where the law requires otherwise or we say so in writing.",
    ],
  },
  {
    heading: "Closing your company and what happens to your data",
    paras: [
      `The Owner can close the company at any time from Settings. Closing locks every team member out immediately and cancels pending invitations. We keep Your Data for ${CLOSE_GRACE_DAYS} days so the Owner can change their mind and reopen the company with everything as it was. After ${CLOSE_GRACE_DAYS} days Your Data is permanently deleted and cannot be recovered by you or by us.`,
      "Download a copy of Your Data before closing. Individual team members can be removed at any time by turning their access off, which keeps the company's records but ends that person's access.",
      "Copies of data in routine backups held by our hosting providers are removed on those providers' normal schedules. We may keep limited records we are legally required to keep, and records needed to resolve a dispute or enforce these Terms.",
    ],
  },
  {
    heading: "Suspension and ending by us",
    paras: [
      "We may suspend or end access, for a person or a whole company, if we reasonably believe these Terms or the Acceptable Use Policy have been broken, if it is needed to protect the Service or other users, or if the law requires it. Where it is reasonable and safe to do so we will give notice and a chance to fix the problem first. If we end a company's access for reasons other than a serious breach, we will give the Owner a reasonable opportunity to download Your Data.",
    ],
  },
  {
    heading: "Availability and changes to the Service",
    paras: [
      "We aim to keep the Service available, but it may be interrupted for maintenance, updates or reasons outside our control, and we do not promise it will be uninterrupted or error-free. We are continuing to build new departments and features and may change or remove features. If we remove something important, we will try to give notice.",
    ],
  },
  {
    heading: "Disclaimers",
    paras: [
      "The Service is provided \"as is\" and \"as available\". To the fullest extent the law allows, we disclaim all warranties, whether express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement. We do not warrant that the Service will meet your particular needs or that results from it, including prices and totals, will be accurate for your situation.",
    ],
  },
  {
    heading: "Limit on our liability",
    paras: [
      "To the fullest extent the law allows, jindjinni will not be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, lost revenue, lost data or business interruption, arising from your use of the Service, even if we were told it could happen.",
      "Our total liability to you for any claim related to the Service is limited to the greater of the amount you paid us for the Service in the 12 months before the claim and one hundred US dollars. Some places do not allow certain limits, so parts of this section may not apply to you.",
    ],
  },
  {
    heading: "Your responsibility for claims",
    paras: [
      "You agree to defend and reimburse jindjinni against claims, losses and costs brought by a third party that arise from Your Data, from your use of the Service in breach of these Terms or the Acceptable Use Policy, or from goods you buy, sell or ship using the Service.",
    ],
  },
  {
    heading: "Changes to these Terms",
    paras: [
      "We may update these Terms. When the changes are material, we will tell the Owner by email or in the Service and ask people to agree again. Continuing to use the Service after a change takes effect means you accept it. The date at the top shows when the Terms last changed.",
    ],
  },
  {
    heading: "Governing law and disputes",
    paras: [
      `These Terms are governed by the laws of the State of ${OPERATOR_STATE} and the United States, without regard to conflict-of-law rules. Before starting any formal claim, each side agrees to try to resolve the matter informally by contacting the other and allowing 30 days. Claims that are not resolved that way must be brought in the state or federal courts located in ${OPERATOR_STATE}, and both sides agree to those courts' jurisdiction.`,
    ],
  },
  {
    heading: "General",
    paras: [
      "If any part of these Terms cannot be enforced, the rest still applies. Our not enforcing something right away does not waive it. You may not transfer your rights under these Terms without our consent. These Terms, together with the Privacy Policy and Acceptable Use Policy, are the whole agreement between you and us about the Service.",
    ],
  },
  {
    heading: "Contact",
    paras: [`Questions about these Terms? Email ${CONTACT_EMAIL}. jindjinni is operated by ${OPERATOR_NAME}, ${OPERATOR_STATE}, USA.`],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="Please read these terms carefully. By creating an account, accepting an invitation or using jindjinni, you agree to them."
      sections={sections}
    />
  );
}
