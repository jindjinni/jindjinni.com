import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Acceptable Use Policy | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "What this policy is for",
    paras: [
      "This policy sets the ground rules for using jindjinni. It is part of our Terms of Service, and the words used there mean the same here. It exists to keep the Service safe, lawful and fair for every company that uses it. You are responsible for following it, and for making sure everyone you give access to follows it too.",
    ],
  },
  {
    heading: "Use the Service for legitimate business",
    items: [
      "Use it to run lawful business operations, such as purchasing, receiving, accounting, customer service, inventory, sales, marketing, HR and team communication.",
      "Give accurate information about yourself, your company and the people you invite, and never pretend to be someone else or another company.",
      "Make sure you have the right to enter the information you put in, including the details of your customers, contacts and employees.",
      "Follow every law and rule that applies to your business, including those for the products you buy and sell.",
    ],
  },
  {
    heading: "Goods and transactions",
    paras: ["Because the Service is used for buying and selling supplies, including medical supplies, you must not use it to:"],
    items: [
      "Buy, sell, quote, receive, store or ship goods that are stolen, counterfeit, adulterated, misbranded, recalled, expired beyond what the law allows, diverted from their intended channel, or that you are not legally allowed to hold or sell.",
      "Misrepresent the condition, expiry date, lot number, serial number, packaging or source of goods, or alter labels, dates or records, or help anyone else to.",
      "Hide a recall, a suspicious number, a flag or a problem from a customer, a supplier, a carrier or an authority.",
      "Take part in fraud, money laundering, tax evasion, sanctions or export violations, or any scheme to deceive customers, suppliers, carriers, employees or authorities.",
    ],
  },
  {
    heading: "Information you must not enter",
    items: [
      "Protected health information, such as patient names linked to conditions, prescriptions or medical records. The Service is not built to hold it.",
      "Payment card numbers, bank login details, full government ID numbers (such as Social Security numbers) or passport details of customers or staff.",
      "Passwords or secret keys for other services.",
      "Information about children under 13.",
    ],
    after: ["Product, price and contact information needed for a business purchase are fine."],
  },
  {
    heading: "Messages: email, text and chat",
    paras: ["When you send messages through or with the help of the Service, you must:"],
    items: [
      "Have permission to contact each person where the law requires it, identify yourself honestly, include any required notices and honour opt-outs promptly. This includes the CAN-SPAM Act, the Telephone Consumer Protection Act and similar laws and carrier rules.",
      "Not send spam, phishing, chain messages, deceptive or misleading messages, or anything that falsely claims to be from someone else.",
      "Not use team chat, or any part of the Service, to harass, threaten, bully, stalk or discriminate against anyone, or to share unlawful, hateful, sexually explicit or violent content.",
      "Not use chat to share malware, to leak other people's private information, or to share another company's confidential material you have no right to hold.",
    ],
  },
  {
    heading: "Employees and workplace features",
    items: [
      "Use HR, time-clock and chat features only in line with employment, privacy and monitoring laws, and tell your people what is recorded.",
      "Do not use the Service to make decisions about hiring, pay or firing that break discrimination or wage laws, and do not rely on it as a legal record without your own checks.",
    ],
  },
  {
    heading: "Protect other people's data and accounts",
    items: [
      "Don't try to see, change or take another company's data or another person's account.",
      "Don't share a login or give people more access than they need. Turn off access when someone leaves.",
      "Don't use invitations to send unwanted messages, or invite people who haven't agreed to be on your team.",
      "Don't create accounts automatically, in bulk, or with false details.",
    ],
  },
  {
    heading: "Keep the Service working",
    items: [
      "Don't probe, scan or test the Service for weaknesses, bypass its access controls or limits (including the team-size limit), or interfere with it, without our written permission.",
      "Don't use bots, scrapers or scripts to pull data from the Service in bulk, other than the data download we provide.",
      "Don't overload the Service, including the shipping-label, tracking, address-search, news and photo features.",
      "Don't upload malware or other harmful code, or files you have no right to share.",
      "Don't copy, resell, white-label, benchmark for a competitor or reverse engineer the Service (see the section on protecting our work below).",
    ],
  },
  {
    heading: "Protect our work: no copying, scraping or AI cloning",
    paras: [
      "jindjinni was designed and built over years by the company that runs it, and how it is organised and how it behaves are valuable, confidential work. The Terms of Service explain this in full (see the section called No copying, scraping, reverse engineering or AI cloning). In plain words, these are not allowed, whether you do them yourself, through a script, or with an AI tool:",
    ],
    items: [
      "Copying, cloning, imitating or reselling the Service, its screens, layouts, menus, workflows, templates, rules or look and feel.",
      "Reverse engineering it, or trying to work out how it is built or how its rules and calculations are done.",
      "Using bots, scrapers, browser automation, AI agents or AI assistants to sign in, explore, record, map or document the Service, or taking bulk screenshots or recordings of it.",
      "Putting screens, screenshots, settings, templates, layouts, documentation or other non-public parts of the Service into an AI tool, or using them to train or prompt a model, to build something similar.",
      "Letting a developer, agency, contractor, competitor or AI tool use your login, or look at the Service, so that they can build a similar product.",
      "Sharing logins or invitations with anyone who has no business reason to be on your team.",
      "Benchmarking the Service for a competitor, or using it to build, train or improve a competing product.",
    ],
    after: [
      "Your own business data is yours. You can download it and use it however you like. This policy is about the Service itself, not about your data.",
      "We log activity and may use technical measures to detect and block copying and automated access. If we find it, we may suspend or end access immediately and take legal action.",
    ],
  },
  {
    heading: "What happens if the rules are broken",
    paras: [
      "We may warn, limit, suspend or end access for a person or a company, remove content, hold back messages and preserve records, depending on how serious the problem is, and we may do so without notice where needed to protect people or the Service. We may report unlawful activity to the authorities and cooperate with their requests. Our Terms of Service explain notice, data download and the limits of our responsibility. Breaking this policy may also make you responsible for losses and claims as set out in the Terms.",
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
      intro="Simple rules for business software that many companies share."
      sections={sections}
    />
  );
}
