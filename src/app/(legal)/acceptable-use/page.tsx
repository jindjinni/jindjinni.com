import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Acceptable Use Policy | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "What this policy is for",
    paras: [
      "This policy sets the ground rules for using jindjinni. It is part of our Terms of Service. It exists to keep the Service safe, lawful and fair for every company that uses it.",
    ],
  },
  {
    heading: "Use the Service for legitimate business",
    items: [
      "Use it to run lawful business operations, such as pricing, quoting, receiving, shipping and invoicing.",
      "Give accurate information about yourself, your company and the people you invite.",
      "Make sure you have the right to enter the information you put in, including your customers' details.",
    ],
  },
  {
    heading: "Goods and transactions",
    paras: ["Because the Service is used for buying and selling supplies, including medical supplies, you must not use it to:"],
    items: [
      "Buy, sell, quote or ship goods that are stolen, counterfeit, adulterated, recalled, diverted from their intended channel, or that you are not legally allowed to hold or sell.",
      "Misrepresent the condition, expiry date or source of goods, or alter lot numbers, labels or dates.",
      "Take part in fraud, money laundering or any scheme to deceive customers, suppliers, carriers or authorities.",
    ],
  },
  {
    heading: "Information you must not enter",
    items: [
      "Protected health information, such as patient names linked to conditions, prescriptions or medical records. The Service is not built to hold it.",
      "Payment card numbers, bank account numbers or full government ID numbers of customers.",
      "Passwords or secret keys for other services.",
    ],
    after: ["Product, price and customer contact information needed for a purchase are fine."],
  },
  {
    heading: "Protect other people's data and accounts",
    items: [
      "Don't try to see, change or take another company's data or another person's account.",
      "Don't share a login or give people more access than they need. Turn off access when someone leaves.",
      "Don't use invitations to send unwanted messages, or invite people who haven't agreed to be on your team.",
    ],
  },
  {
    heading: "Keep the Service working",
    items: [
      "Don't probe, scan or test the Service for weaknesses, bypass its access controls, or interfere with it, without our written permission.",
      "Don't use bots, scrapers or scripts to pull data from the Service in bulk, other than the data download we provide.",
      "Don't overload the Service, including the shipping-label and address-search features.",
      "Don't upload malware or other harmful code.",
      "Don't copy, resell, white-label or reverse engineer the Service.",
    ],
  },
  {
    heading: "What happens if the rules are broken",
    paras: [
      "We may warn, limit, suspend or end access for a person or a company, and remove content, depending on how serious the problem is. We may report unlawful activity to the authorities. Our Terms of Service explain notice and how data can be downloaded.",
    ],
  },
  {
    heading: "Reporting a problem",
    paras: [`If you see misuse or find a security weakness, tell us at ${CONTACT_EMAIL}. Please give us a reasonable chance to fix a weakness before telling anyone else, and don't access other people's data while looking.`],
  },
];

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      intro="Simple rules for a workspace that many companies share."
      sections={sections}
    />
  );
}
