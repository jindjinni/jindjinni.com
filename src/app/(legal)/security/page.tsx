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
      "Forgot password sends a one-time link to the account's email address. It works once, expires in 60 minutes, only the newest link works, and we store only a fingerprint of it. The page answers the same whether or not an account exists, so it can't be used to find out who has one. Staff logins without an email are reset by their admin.",
      "Too many wrong passwords in a row pauses sign-in for that account for 15 minutes.",
      "Invitation links are long, random and single-purpose. They expire after 7 days, only work for the invited email address, and can be cancelled by an admin. We store only a fingerprint of each link, not the link itself.",
      "Each sign-in is recorded, and you can review your own on the Security & activity page. Admins can also see each team member's last sign-in.",
      "Anyone can turn on two-step sign-in (a 6-digit code from an authenticator app, with one-time backup codes) under Settings, My account. Our own platform login uses it.",
      "We look inside a company's workspace for support only when an Owner or Admin allows it on a support request. The look is read-only, limited to 30 minutes at a time, closed to team chat, employee records and downloads, emailed to the requester and listed in the company's Support access log.",
    ],
  },
  {
    heading: "Connected accounts and mailboxes",
    paras: [
      "When a company connects its own mailbox, shipping account, accounting software or AI account, the key or token is stored encrypted, used only for that company, and shown back only as its last few characters. Incoming mail is read only: we never change or delete anything in the real mailbox, and mail is never shown to anyone outside the company, including us. A mailbox that needs reconnecting stops the email instead of sending from another address. Wholesale and Distribution operations of one company are separate workspaces, and the only thing visible across them is a read-only page of totals for the Owners and Admins of both.",
    ],
  },
  {
    heading: "A record of what changed",
    paras: [
      "Changes to prices, quantities, totals, customer details and receiving checks are written to an audit log with who made them and when. Team changes, such as invitations, role changes and access being turned off or on, are recorded as well. Orders are voided by reversing them, not by deleting them, and a quotation with received items, payments or labels is archived rather than deleted.",
    ],
  },
  {
    heading: "Files and photos",
    paras: [
      "Photos taken in Receiving and files shared in chat are kept in private storage. They are never public links. They are only opened through the signed-in app, after checking that the person belongs to the company that owns them.",
    ],
  },
  {
    heading: "Sellers' direct-deposit details",
    paras: [
      "When a company's storefront or a payment-details link takes a seller's routing and account numbers, they are encrypted before they are saved, each one tied to the company and the order it belongs to, so a copy moved to another record or company cannot be read. Staff see only the last four digits. The full details are shown only to the company's Owner, Admins and people with Accounts access, and every time they are shown it is recorded in the audit log. They are never sent in emails, written to logs or included in exports, and the company can erase them once the seller is paid. Customer order pages open only with a private link and are marked so search engines do not list them. Public storefront forms are limited by how often one address can try them, and a company's own website connects with keys that are stored only in scrambled form.",
    ],
  },
  {
    heading: "Payment-details links",
    items: [
      "Each link is made for one order and one company. It is a long random code (not guessable), and we keep only a one-way fingerprint of it to find it; an encrypted copy lets the company's staff copy the link again and nobody else.",
      "A link works one time. Once the seller sends their details the page cannot be used again, nothing on it can be changed, and a correction needs a new link, which ends the old one and erases what it held. Links stop working after 14 days, when the order is paid, or when a newer link is made.",
      "The page that opens shows the company's name as printed on its quotation receipt, and nothing else about the company. A link that is wrong, ended or expired shows the same plain message and no company name. If the company is closed, suspended or not approved, or the feature is switched off, its links stop working at once.",
      "The page uses a human check, a hidden trap for automated programs and a limit on how often one network address can try, is marked so search engines do not list it, and does not pass the link on to other websites.",
      "The seller's details are encrypted, tied to the company and the link, and shown to staff only as the kind of account and its last four digits. Only the Owner, Admins and people with Accounts access can open the full details, each look is recorded in the audit log without any number in it, and the screen hides them again after 60 seconds.",
      "They are erased automatically when the order is marked Paid (the last four digits and the dates stay), or sooner by the company. They are never sent in emails, written to logs or included in exports, and the email that carries the link never contains them.",
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
    heading: "Protecting the Service itself",
    paras: [
      "How jindjinni is built is protected too. Our source code is kept in a private repository and runs on our servers, so it is never sent to your browser. Signed-in pages are marked so that search engines and AI crawlers are told not to collect them, and the Service cannot be shown inside another website. Sign-in, sign-up, invitation, forgot-password and affiliate pages, public storefront forms and payment-details links use a human check and a hidden trap for automated programs, and slow down repeated wrong tries from one network address. We log activity, watch for automated or bulk access, and may block or suspend accounts that copy or scrape the Service. Our Terms of Service and Acceptable Use Policy forbid copying, reverse engineering and using AI tools to clone the Service, and we will enforce them.",
    ],
  },
  {
    heading: "What we ask of you",
    items: [
      "Use a strong password you don't use anywhere else, and don't share logins. Each person on your team should have their own.",
      "Don't give outside developers, agencies or AI tools access to your account or to screens of the Service.",
      "Invite people with the role they need and no more, and turn access off when someone leaves.",
      "Keep patient health information, payment card numbers and similar highly sensitive data out of the workspace.",
      "Send a payment-details link only to the person you are paying, never share or forward it, and check the details with the person (for example by calling a number you already trust) before you pay, especially when someone says their banking details have changed. Erase details you no longer need.",
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
