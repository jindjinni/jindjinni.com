import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CLOSE_GRACE_DAYS, CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Security | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "Your company's data stays yours alone",
    paras: [
      "Every record in jindjinni belongs to exactly one company, and every request is checked against the signed-in person's own company before any data is read or changed. One company can't see or reach another's customers, prices or quotations.",
    ],
  },
  {
    heading: "The right people see the right things",
    items: [
      "Roles control access by department: Owner, Admin, Purchasing Manager, Purchasing Agent, Receiver and Accountant.",
      "Accountants get view-only access to Purchasing, and Receivers can't open it. Sensitive settings and the team page are limited to the Owner and Admins.",
      "These limits are enforced on our servers on every change, not just by hiding buttons.",
      "Owners and Admins can turn a person's access off instantly. Team size limits stop invitations from piling up unnoticed.",
    ],
  },
  {
    heading: "Sign-in and invitations",
    items: [
      "Passwords are stored only as one-way hashes. We can't read them, and we will never ask you for yours.",
      "New company accounts verify the owner's email address with a one-time code.",
      "Invitation links are long, random and single-purpose. They expire after 7 days, only work for the invited email address, and can be cancelled by an admin. We store only a fingerprint of each link, not the link itself.",
      "Each sign-in is recorded, and you can review your own on the Security & activity page. Admins can also see each team member's last sign-in.",
    ],
  },
  {
    heading: "A record of what changed",
    paras: [
      "Changes to prices, quantities, totals and customer details are written to an audit log with who made them and when. Team changes, such as invitations, role changes and access being turned off or on, are recorded as well.",
    ],
  },
  {
    heading: "In transit and at our providers",
    paras: [
      "Traffic between your browser and jindjinni is protected with HTTPS. We run on established hosting, database, email and shipping providers, which are described in our Privacy Policy, and we limit what each of them receives to what the feature needs.",
    ],
  },
  {
    heading: "Your data, your exit",
    paras: [
      "Owners and Admins can download a copy of all company data at any time. Closing a company locks everyone out immediately, keeps the data for " +
        CLOSE_GRACE_DAYS +
        " days in case of a change of mind, and then permanently deletes it.",
    ],
  },
  {
    heading: "What we ask of you",
    items: [
      "Use a strong password you don't use anywhere else, and don't share logins.",
      "Invite people with the role they need and no more, and turn access off when someone leaves.",
      "Keep patient health information and payment card numbers out of the workspace.",
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
