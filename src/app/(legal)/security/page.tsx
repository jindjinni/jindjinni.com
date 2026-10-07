import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CLOSE_GRACE_DAYS, CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Security | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "Your company's data stays yours alone",
    paras: [
      "Every record in jindjinni belongs to exactly one company, and every request is checked against the signed-in person's own company before any data is read or changed. One company can't see or reach another's customers, prices, quotations, messages or files.",
    ],
  },
  {
    heading: "The right people see the right things",
    items: [
      "Roles control access by department. Every department, including Purchasing, Receiving, Accounts, Customer Service, Inventory, Sales, Marketing and HR, can be limited to the people who need it.",
      "Sensitive settings, the team page and the company's data download are limited to the Owner and Admins.",
      "These limits are enforced on our servers on every request and change, not just by hiding buttons.",
      "Owners and Admins can turn a person's access off instantly. Team size limits stop invitations from piling up unnoticed.",
      "Team chat rooms are shown only to the people who work in that department, and private messages are visible only to the people in them.",
    ],
  },
  {
    heading: "Sign-in and invitations",
    items: [
      "Passwords are stored only as one-way hashes. We can't read them, and we will never ask you for yours.",
      "When email verification is turned on for new accounts, the owner's email address is checked with a one-time code before the account is created.",
      "Invitation links are long, random and single-purpose. They expire after 7 days, only work for the invited email address, and can be cancelled by an admin. We store only a fingerprint of each link, not the link itself.",
      "Each sign-in is recorded, and you can review your own on the Security & activity page. Admins can also see each team member's last sign-in.",
    ],
  },
  {
    heading: "A record of what changed",
    paras: [
      "Changes to prices, quantities, totals, customer details and receiving checks are written to an audit log with who made them and when. Team changes, such as invitations, role changes and access being turned off or on, are recorded as well. Orders are voided by reversing them, not by deleting them.",
    ],
  },
  {
    heading: "Files and photos",
    paras: [
      "Photos taken in Receiving and files shared in chat are kept in private storage. They are never public links. They are only opened through the signed-in app, after checking that the person belongs to the company that owns them.",
    ],
  },
  {
    heading: "In transit and at our providers",
    paras: [
      "Traffic between your browser and jindjinni is protected with HTTPS. We run on established hosting, database, file storage, email and shipping providers, described in our Privacy Policy, and we limit what each of them receives to what the feature needs.",
    ],
  },
  {
    heading: "Your data, your exit",
    paras: [
      "Owners and Admins can download a copy of all company data at any time. Closing a company locks everyone out immediately, keeps the data for " +
        CLOSE_GRACE_DAYS +
        " days in case of a change of mind, and then permanently deletes it, including uploaded files.",
    ],
  },
  {
    heading: "What we ask of you",
    items: [
      "Use a strong password you don't use anywhere else, and don't share logins.",
      "Invite people with the role they need and no more, and turn access off when someone leaves.",
      "Keep patient health information, payment card numbers and similar highly sensitive data out of the workspace.",
      "Keep your own devices and email accounts secure.",
    ],
  },
  {
    heading: "What this page is, and is not",
    paras: [
      "This page describes in good faith how jindjinni is built and what we do today. It is not a guarantee, a certification or a warranty, and no system can be made perfectly secure. Our Terms of Service explain our responsibilities and the limits of them.",
    ],
  },
  {
    heading: "Reporting a vulnerability",
    paras: [
      `If you believe you've found a security problem, email ${CONTACT_EMAIL} with the details. Please don't access other people's data or disrupt the Service while investigating, and give us a reasonable chance to fix the issue before sharing it. We will not take action against people who report in good faith and follow these guidelines.`,
    ],
  },
];

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      intro="How jindjinni protects your company's information, and what we ask of you."
      sections={sections}
    />
  );
}
