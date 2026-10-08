import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { CLOSE_GRACE_DAYS, CONTACT_EMAIL, OPERATOR_NAME, OPERATOR_STATE, SERVICE_NAME } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service | jindjinni" };

const sections: LegalSection[] = [
  {
    heading: "Who these terms are between",
    paras: [
      `These Terms of Service (the "Terms") are a binding agreement between you and ${OPERATOR_NAME}, a business located in ${OPERATOR_STATE}, United States, which owns and operates jindjinni ("jindjinni", "we", "us", "our"). They cover your use of the jindjinni website and the business software we provide through it (the "Service").`,
      "jindjinni is business software for companies and organizations. It is not for consumers or personal use. If you create an account or accept an invitation on behalf of a company, you confirm that you have the authority to bind that company to these Terms, and \"you\" includes both you and that company. You must be at least 18 years old to use the Service.",
      "By creating an account, accepting an invitation, checking the agreement box or using the Service, you agree to these Terms, our Privacy Policy and our Acceptable Use Policy. If you do not agree, do not use the Service.",
    ],
  },
  {
    heading: "What the Service is",
    paras: [
      "jindjinni is an enterprise software platform that gives each company its own private workspace with connected departments. Depending on what we have released and what your company has turned on, the Service includes Purchasing (price lists, customers, quotations, shipping labels and shipment tracking), Receiving (package intake, photos, lot and serial number checks, recall checks and order adjustments), Accounts, Customer Service, Inventory, Sales, Marketing, HR, a company Home screen with industry news and company performance, a built-in team chat, and Jin, a built-in assistant.",
      "The Service is software that we provide. We do not buy, sell, hold, inspect, ship or insure goods. We do not hold or move money. We are not a party to any transaction between you and your customers, suppliers, carriers or employees. Nothing in the Service is legal, tax, accounting, employment, regulatory, financial, medical or other professional advice, and you should get that advice from a qualified professional.",
      "We are always building. Departments and features may be added, changed or removed, and some may be released as early or limited versions (\"Pre-release Features\"). Pre-release Features are provided as is, may contain errors and may change or end at any time.",
    ],
  },
  {
    heading: "Accounts, owners and team members",
    items: [
      "The person who creates a company workspace is its Owner. The Owner is responsible for the workspace, for who is invited to it, and for everything done in it by the people they invite.",
      "Business verification and approval. We work only with real, registered businesses. To open a company workspace you must give true, complete and current details about the business (its legal name, EIN, state of registration, state file number, year formed and what it does) and upload an official document that proves them. A new workspace is switched on only after we approve it, and we may approve, refuse, ask for more information, or suspend any workspace at our discretion. Giving false or misleading details, or using someone else's business information, is a breach of these Terms and lets us refuse or end your access and report the matter where the law allows. You must keep these details up to date. Your business must be active and in good standing with its state's Secretary of State (or equivalent registry) when you sign up and for as long as you use the Service. We check this, including against the state's public records from time to time, and we may suspend any workspace whose business is inactive, dissolved or not in good standing until it is active again.",
      "Free trial, fees and billing. Every new company gets a 7-day free trial that starts the day we approve it. Nothing is charged during the trial. When billing is switched on you pay by automatic payment only (credit card, debit card or ACH bank account), and we will tell the Owner by email before any charge begins. On the Monthly plan we bill on the 1st of every month, in advance for that month. The first day after your trial we charge only for the days left in that month (the monthly price multiplied by the days left and divided by the days in that month, rounded to the nearest cent), then the full monthly price on the 1st of each month after that. If your trial ends on the 1st, the first charge is the full month. On the Yearly plan we charge the full yearly price on the first day after your trial and again on the same date each year. Prices and dates are in US dollars and follow US Eastern time. If a payment does not go through you have a 3-day grace period to fix it, after which we may suspend the workspace until the payment succeeds. Plans renew automatically until cancelled.",
      "Cancelling and refunds. The Owner can cancel at any time in Settings. If you cancel during the free trial you will not be charged and you keep the service until the trial ends. On the Monthly plan there is no refund: you keep the service until the end of the month in which you cancel (that month is already paid), after which the workspace is switched off. On the Yearly plan you keep the service until the end of the month in which you cancel, after which the workspace is switched off, and we refund the unused part of the year to the original payment method, calculated by the day and rounded to the nearest cent; if you cancel in the last month of the year there is nothing to refund. If a payment never went through we refund nothing. After the service ends your data is kept, and you can return and pick up where you left off, with billing starting again from the day you return. This is separate from closing your company, which schedules your data for deletion.",
      "The Owner and Admins can invite people by email, give each person a role, choose which departments they can open, change roles and turn access off. Give people only the access they need. We are not responsible for what a person does with access you give them.",
      "Each company has a limit on the number of team members, counting pending invitations. We set a default and may change it for a company. The Service is designed for small and mid-sized companies of up to about 100 team members. That is a design goal. It is not a promise of capacity, speed, availability or fitness for any particular company or number of users.",
      "Keep your password private and use one you don't use anywhere else. Don't share a login between people. You are responsible for all activity under your logins, and you must tell us promptly if you think someone else has used one.",
      "Give us accurate information about yourself and your company, and keep your Business Profile up to date. We may rely on the contact details you give us.",
    ],
  },
  {
    heading: "Your data",
    paras: [
      "Everything you and your team enter into or upload to the Service, including customer records, prices, quotations, receiving records and photos, accounting entries, inventory, sales documents, contact lists, campaign content, chat messages, time records, uploaded files and your company profile (\"Your Data\"), belongs to you. We do not claim ownership of it.",
      "You give us a worldwide, non-exclusive licence to host, store, copy, process, display and transmit Your Data only as needed to provide, secure, support and improve the Service, to prevent misuse, to comply with the law and as described in our Privacy Policy. We do not sell Your Data and we do not use it to advertise to you or your customers.",
      "Your Data often includes personal information about other people, such as your customers, contacts and employees. You are responsible for having the legal right to collect, use and share that information, for giving any required notices, for getting any required consents, for keeping it accurate, and for answering requests from those people. In privacy terms, you decide why and how that information is used and we process it on your behalf.",
      "You are responsible for backing up anything you cannot afford to lose. You can download a copy of Your Data at any time from Settings, under Close company.",
      "We may create and use anonymous, combined information about how the Service is used (for example, how many shipments are received per day across all companies) to run and improve the Service. It does not identify you or your customers.",
    ],
  },
  {
    heading: "Information you must not enter",
    paras: [
      "The Service is not designed or approved to hold protected health information (such as patient records, diagnoses or prescriptions), payment card numbers, bank login details, full government ID numbers or other highly sensitive data. Do not enter them. You are solely responsible for any such information you choose to put in the Service, and we make no promise that the Service meets the rules that apply to it (for example HIPAA or PCI requirements).",
    ],
  },
  {
    heading: "Acceptable use",
    paras: [
      "You agree to follow our Acceptable Use Policy, which is part of these Terms. In short: use the Service lawfully and honestly, don't misuse other people's data, don't send unwanted messages, and don't try to break or overload it.",
    ],
  },
  {
    heading: "Products, recalls and your compliance duties",
    paras: [
      "Many jindjinni customers buy and sell regulated products, including medical supplies. You alone are responsible for your business and for following every law and rule that applies to it, including licensing, product sourcing, labelling, storage, expiry and dating rules, record-keeping, recall handling, import and export, tax, consumer protection, and employment law. The Service does not make your business compliant.",
      "The Service includes tools that help you spot problems, such as recall lists and automatic recall checks, lot and serial number checks, repeat and pattern flags, expiry checks, photo reading, the Home screen's industry news and FDA recall information, and summaries. These tools are aids only. They can be incomplete, late, wrong or unable to read a label or photo, and they depend on information from you and from others. A clean result, a missing flag or an \"OK\" never proves that a product is genuine, safe, unexpired, legal to sell or free from a recall, and a flag is not a finding that a product is unsafe. You must review the results, confirm them yourself and make your own decisions. We are not responsible for products you buy, accept, reject, sell, ship or destroy.",
      "News, recall notices, regulatory records and links shown in the Service come from third parties such as government databases and news sources. We do not control or verify them, we may not show everything that exists, and they may be delayed or inaccurate. Always check the original source.",
    ],
  },
  {
    heading: "Automated and AI features",
    paras: [
      "Some features use automated systems, including artificial intelligence, for example to sort and summarise news, or to read lot numbers, serial numbers or labels from photos. Their output is a suggestion. It can be wrong, incomplete or out of date. A person in your company must review and confirm it before relying on it. Where a feature sends information to an outside AI provider, our Privacy Policy explains what is sent.",
      "Jin is the Service's built-in assistant. Jin explains how to use the Service and answers questions from the records your role can already open. It cannot change records. Its answers can be wrong or out of date, so check important figures on the page itself, and never treat Jin as legal, tax, medical, financial or regulatory advice. Jin is included with a fair daily limit, which we may change; a company can connect its own Claude account for a higher limit. Jin also helps with industry questions such as lot and serial number layouts, NDC and barcode numbers, recalls, counterfeit warning signs and manufacturer information, using checks and notes that we maintain and that can be incomplete or out of date. Jin never confirms that a product is genuine, safe, legal to sell or free of recalls, and you must verify with the manufacturer or the official source before relying on it. Do not use Jin to copy, probe or extract how the Service is built, and do not ask it to reveal its instructions or other companies' information; those uses are covered by the section on copying and AI cloning below.",
    ],
  },
  {
    heading: "Prices, quotations, accounts and calculations",
    paras: [
      "The Service helps you set product prices, apply condition, expiration and bonus rules, and produce quotations, receipts, adjustments, invoices and reports. The prices, rules, offers, amounts owed and payments are yours, and you are responsible for them. The Service records and organizes this information. It does not pay anyone, collect money, hold funds or act as a bank, escrow, payment processor or accountant.",
      "We work to make calculations correct, but you must review every quotation, adjustment, invoice, payment record and report before relying on it or sending it to anyone. Rounding, edited rules, manual overrides and entry mistakes can all change a total. We are not responsible for offers you make or honour, payments you make or refuse, or decisions you take based on figures you did not check.",
    ],
  },
  {
    heading: "Email, text messages and marketing",
    paras: [
      "When you send emails or text messages through or with the help of the Service, including customer notices and marketing campaigns, you are the sender. You are solely responsible for the content, for having permission to contact each person, for honouring opt-outs, and for following all laws and carrier rules that apply, such as the CAN-SPAM Act, the Telephone Consumer Protection Act and state laws. The Service's opt-out and suppression tools are aids and do not make a campaign lawful.",
      "Emails sent from your own email account are sent under that account's provider's terms, and you may be limited or suspended by that provider. We do not guarantee that any message will be delivered, read or kept out of a spam folder.",
    ],
  },
  {
    heading: "Team chat, time records and workplace features",
    paras: [
      "Chat, HR and time-tracking features are tools for your organization. The company, through its Owner and Admins, is responsible for how they are used, for telling its people how the tools work and what is recorded, and for following employment, privacy, monitoring and recordkeeping laws. Chat messages and files, time records and activity logs belong to the company's workspace. We may access them where needed to provide support, keep the Service secure, enforce these Terms or meet legal duties.",
      "Do not use chat or any other part of the Service for emergencies. We do not monitor it for them.",
    ],
  },
  {
    heading: "Third-party services",
    paras: [
      "The Service relies on other companies' services, for example hosting, database and file storage providers, email delivery and sign-in providers, address lookup, shipping and tracking providers, and AI providers. When you use a feature that depends on them, the information needed to do the job (such as the addresses on a shipping label) is sent to them. Their terms and privacy practices apply to what they do, and we are not responsible for their acts, failures or outages.",
      "Shipping labels are bought through a shipping provider using the account and payment arrangements set up for your company or for the Service. Label charges, tracking information, delivery problems, lost or damaged goods and refunds follow that provider's and the carrier's terms. We are not a carrier and do not guarantee delivery, delivery times or the accuracy of tracking information.",
    ],
  },
  {
    heading: "Plans, fees and taxes",
    paras: [
      "At the time of these Terms the Service is offered without charge while it is being built. We may introduce or change plans and fees. We will tell the Owner by email or in the Service before anything is charged, and you can close your company instead of accepting them. Fees you have agreed to are non-refundable except where the law requires otherwise or we say so in writing, and you are responsible for any taxes that apply.",
    ],
  },
  {
    heading: "Our rights and what you may not do",
    paras: [
      `${SERVICE_NAME} is owned and operated by ${OPERATOR_NAME}. We and our licensors own the Service, including its software and source code, design, screens, layouts, menus and department structure, workflows and business rules, calculation methods, templates, wording, text, graphics, data structures, documentation, the jindjinni name and logo, and the way these are selected and arranged together, and everything we make for it, except Your Data. The Service reflects years of operating experience and a great deal of work by us. It is protected by copyright, trade secret and other laws. We give you a limited, non-exclusive, non-transferable, revocable right to use the Service for your own company's internal business during these Terms, and nothing more. We keep every right we do not expressly give you.`,
      "You may not copy, clone, imitate, resell, sublicense, white-label, host for others, or build a competing or similar product from the Service or from what you learn by using it, and you may not remove or hide notices from it. The next section sets out in detail what this includes.",
      "If you send us ideas or feedback, you give us the right to use them freely without payment or credit.",
    ],
  },
  {
    heading: "No copying, scraping, reverse engineering or AI cloning",
    paras: [
      "The non-public parts of the Service, meaning everything you can see only after signing in, how its screens are laid out and connected, how its departments and settings are organised, how its rules and calculations behave, and how it is built, are our confidential information and trade secrets. You are given access to use the Service for your business, not to learn from it in order to reproduce it. Whether done by a person, a script, or an artificial intelligence system, you agree that you and everyone you give access to will not:",
    ],
    items: [
      "copy, clone, recreate, mirror, frame or imitate the Service, any of its screens, layouts, menus, workflows, forms, templates, rules, calculations or look and feel, in whole or in part, for use anywhere other than your own use of the Service;",
      "reverse engineer, decompile, disassemble, deobfuscate, or otherwise try to discover or derive the source code, structure, database design, algorithms, business rules, prompts or inner workings of the Service, except to the limited extent the law does not allow us to forbid it;",
      "scrape, crawl, harvest, systematically record, screenshot, screen-capture or download the Service's pages, screens, settings, templates, field layouts or flows, other than the data download we provide for Your Data;",
      "use bots, scripts, browser-automation tools, AI agents, AI assistants or large language models to sign in to, explore, map, document, test or reproduce the Service, or to extract how it works;",
      "feed any non-public part of the Service (screens, screenshots, recordings, page content, settings, templates, layouts, workflows, rules, documentation, or outputs gathered in bulk) into any artificial intelligence or machine learning system, or use any of it to train, fine-tune, evaluate or prompt a model, or to generate software, designs or documents that replicate or resemble the Service. (Putting your own business data into your own tools is your choice and is not covered by this item);",
      "give anyone who builds, designs or sells software, including a competitor, a developer, a contractor, an agency or an AI tool, access to your account or to screens, recordings or descriptions of the Service for the purpose of building a similar product;",
      "share a login, an invitation or a connector with anyone outside your company, or with anyone you have no business reason to give access to, to get around the rules in this section;",
      "use the Service, its connectors or its accounts to build, train, benchmark or improve a competing product or service, or to compare it for a competitor; or",
      "help, encourage or allow anyone else to do any of the above.",
    ],
    after: [
      "Information that is public, such as our website's home page, may be viewed normally, but it remains protected by copyright and these Terms, and automated copying or AI cloning of it is not allowed.",
      "We log activity in the Service and may monitor use of it, including sign-ins, the pace and pattern of requests, and automated behaviour, to protect the Service and enforce these Terms. We may use technical measures to detect and block copying and automated access, and to identify the account responsible.",
      "Confidentiality. You will use our non-public information only to use the Service as allowed, protect it with at least the care you use for your own confidential information, tell us promptly if you learn of any misuse, and keep doing so after these Terms end.",
      "Ownership. The Service, including its design, screens, workflows, rules, wording, data structures, source code and the know-how behind them, is original work owned by Plantarz Property Solutions LLC and protected by copyright and trade-secret law. These Terms give you only a limited, revocable right to use the Service for your own company's operations. No ownership or other right passes to you, and nothing here lets you copy or recreate it.",
      "AI tools and automation used by you or your team. You are responsible for anything an AI assistant, browser agent, automation or script does with your account or your team's accounts, exactly as if you had done it yourself. If such a tool declines a request or warns you that it would break these Terms, you agree not to get around that by rewording the request, splitting it into smaller steps, giving the tool another login, or telling it that you have permission.",
      "Notices. We place notices of these rules in plain sight so no one can say they were not told: on sign-up and invitation screens, at the foot of every page, in text meant for AI systems on every page, in response headers, in our /ai-policy.txt and /llms.txt files, and in the code and licence files of our software. Anyone who goes on to copy or clone the Service after seeing these notices does so knowingly and willfully, and we may seek enhanced damages and fees where the law allows.",
      "Consequences. If you or anyone you gave access to breaks this section, we may suspend or end your access immediately without refund or notice, delete the accounts involved, and take legal action. Because this kind of harm cannot be fully repaired with money, we may ask a court for an immediate order (an injunction) to stop it without having to prove actual damages, and without posting a bond where the law allows. We may also seek every other remedy available, including damages, recovery of any profits gained, our costs and our reasonable attorneys' fees, under copyright law, trade secret law (including the Defend Trade Secrets Act and the Florida Uniform Trade Secrets Act), computer misuse laws (including the Computer Fraud and Abuse Act) and any other law that applies. You remain responsible for everything done through your accounts.",
    ],
  },
  {
    heading: "Closing your company and what happens to your data",
    paras: [
      `The Owner can close the company at any time from Settings. Closing locks every team member out immediately and cancels pending invitations. We keep Your Data for ${CLOSE_GRACE_DAYS} days so the Owner can change their mind and reopen the company with everything as it was. After ${CLOSE_GRACE_DAYS} days Your Data, including uploaded files and photos, is permanently deleted and cannot be recovered by you or by us.`,
      "Download a copy of Your Data before closing. Individual team members can be removed at any time by turning their access off, which keeps the company's records but ends that person's access.",
      "Copies in routine backups held by our hosting providers are removed on those providers' normal schedules. We may keep limited records we are legally required to keep, and records needed to resolve a dispute or enforce these Terms.",
    ],
  },
  {
    heading: "Suspension and ending by us",
    paras: [
      "We may suspend or end access, for a person or a whole company, immediately and without notice if we reasonably believe that these Terms or the Acceptable Use Policy have been broken, that an account is being used unlawfully or in a way that could harm others or the Service, that fees are unpaid, or that the law requires it. Where it is reasonable and safe to do so we will give notice and a chance to fix the problem first. If a company seriously or repeatedly breaks these Terms, we may ban it permanently, which means its workspace is closed and its EIN, and the people behind it, may not open another workspace. If we end a company's access for reasons other than a serious breach, we will give the Owner a reasonable opportunity to download Your Data. We may also stop offering the Service, or any part of it, with reasonable notice.",
    ],
  },
  {
    heading: "Availability, support and security",
    paras: [
      "We aim to keep the Service available, but it may be interrupted for maintenance, updates, provider outages, attacks or other reasons outside our control, and we do not promise it will be uninterrupted, timely, secure or error-free. We do not offer a service-level commitment unless we agree one with you in writing.",
      "We use reasonable measures to protect the Service, described on our Security page. No system is perfectly secure. If we learn of a breach of security that affects Your Data we will tell the Owner as the law requires.",
    ],
  },
  {
    heading: "Disclaimers",
    paras: [
      "THE SERVICE, AND EVERYTHING IN OR PROVIDED THROUGH IT, IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\". TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM ALL WARRANTIES AND CONDITIONS, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL MEET YOUR NEEDS OR REGULATORY OBLIGATIONS, THAT IT WILL BE UNINTERRUPTED OR ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, THAT DATA WILL NEVER BE LOST, OR THAT PRICES, TOTALS, RECALL AND SERIAL CHECKS, SUMMARIES, NEWS, TRACKING OR OTHER RESULTS WILL BE ACCURATE, COMPLETE OR CURRENT.",
    ],
  },
  {
    heading: "Limit on our liability",
    paras: [
      "TO THE FULLEST EXTENT THE LAW ALLOWS, JINDJINNI, ITS OWNERS, OFFICERS, EMPLOYEES, CONTRACTORS, AFFILIATES AND LICENSORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, LOST SAVINGS, LOST OR CORRUPTED DATA, LOSS OF GOODWILL, THE COST OF REPLACEMENT GOODS, RECALLED, COUNTERFEIT OR UNSAFE PRODUCTS, REGULATORY FINES, OR BUSINESS INTERRUPTION, ARISING FROM OR RELATED TO THE SERVICE OR THESE TERMS, UNDER ANY LEGAL THEORY (INCLUDING NEGLIGENCE), EVEN IF WE WERE TOLD THEY WERE POSSIBLE.",
      "OUR TOTAL LIABILITY FOR ALL CLAIMS RELATED TO THE SERVICE OR THESE TERMS IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU PAID US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT THAT GAVE RISE TO THE CLAIM AND (B) ONE HUNDRED US DOLLARS. THESE LIMITS APPLY EVEN IF A REMEDY FAILS OF ITS ESSENTIAL PURPOSE, AND THEY ARE A FAIR PART OF THE BARGAIN, WITHOUT WHICH THE SERVICE WOULD NOT BE OFFERED ON THESE TERMS. Some places do not allow certain limits, so parts of this section may not apply to you, and in that case our liability is limited as far as the law allows.",
    ],
  },
  {
    heading: "Your responsibility for claims",
    paras: [
      "You agree to defend, indemnify and hold harmless jindjinni, its owners, officers, employees, contractors and affiliates from and against any claims, demands, investigations, losses, liabilities, damages, fines, settlements and costs (including reasonable lawyers' fees) brought or imposed by a third party or authority that arise from or relate to: Your Data; goods you buy, sell, accept, reject, ship, store or destroy; messages you send; your employees and the way you use the workplace features; your use of the Service in breach of these Terms or the Acceptable Use Policy or in breach of any law; or the acts of people you give access to. We may take over the defence of a claim at our own cost, and you will cooperate.",
    ],
  },
  {
    heading: "Disputes: informal resolution, arbitration and no class actions",
    paras: [
      `Informal first. Before starting any formal proceeding, each side agrees to contact the other in writing (to ${CONTACT_EMAIL} for us) and try in good faith to resolve the matter for 30 days.`,
      `Binding arbitration. If a dispute is not resolved informally, you and we agree that it will be decided only by final and binding arbitration, not in court, before a single arbitrator under the commercial arbitration rules of the American Arbitration Association then in effect. The arbitration will be held in ${OPERATOR_STATE} (or by video if both sides agree), in English, and a court that has jurisdiction may enter judgment on the award. This applies to every claim between you and us related to the Service or these Terms, except that either side may (a) bring an individual claim in small-claims court if it qualifies and (b) ask a court for an injunction to stop misuse of intellectual property or confidential information.`,
      "Individual claims only. To the fullest extent the law allows, all claims must be brought in your or our individual capacity, and not as a plaintiff or member of any class, collective, consolidated or representative action. The arbitrator may not combine claims or award relief to anyone but the parties.",
      "No jury. To the fullest extent the law allows, each side gives up the right to a jury trial and to take part in a class action.",
      "Time limit. Any claim related to the Service or these Terms must be filed within one year after it arose, or it is permanently barred, to the extent the law allows.",
      "Protecting our intellectual property. Despite the arbitration and class-action terms above, we may go to any court that has jurisdiction at any time to stop or prevent the copying, misuse or disclosure of the Service, our intellectual property or our confidential information, and to enforce the section called No copying, scraping, reverse engineering or AI cloning.",
    ],
  },
  {
    heading: "Governing law",
    paras: [
      `These Terms and any dispute are governed by the laws of the State of ${OPERATOR_STATE} and the United States, without regard to conflict-of-law rules. For anything that is not sent to arbitration, the state and federal courts located in ${OPERATOR_STATE} have exclusive jurisdiction, and both sides agree to them.`,
    ],
  },
  {
    heading: "Notices and electronic communications",
    paras: [
      "You agree that we may give you notices by email to the address on your account, by a message in the Service, or by posting on our website, and that they count as written notice. Keep your email address current. You consent to doing business electronically, and electronic signatures, clicks and records have the same effect as paper ones.",
    ],
  },
  {
    heading: "Export and sanctions",
    paras: [
      "You may not use the Service if you are barred from receiving US services, or in or for any country, person or organization under US trade or economic sanctions, and you may not use it to break export or import laws.",
    ],
  },
  {
    heading: "Changes to these Terms",
    paras: [
      "We may update these Terms. When a change is material, we will tell the Owner by email or in the Service and ask people to agree again before they continue. Using the Service after a change takes effect means you accept it. The date at the top shows when the Terms last changed.",
    ],
  },
  {
    heading: "General",
    paras: [
      "If any part of these Terms cannot be enforced, that part is limited as far as needed and the rest still applies. Our not enforcing something right away does not waive it. You may not transfer your rights under these Terms without our written consent, and we may transfer ours in a merger, sale or reorganization. Neither side is responsible for a delay or failure caused by events beyond its reasonable control, such as outages of internet, hosting or carrier services, natural disasters, war, labour disputes or government action. Nothing in these Terms creates a partnership, agency, employment or fiduciary relationship, and there are no third-party beneficiaries other than the people we protect in these Terms. The sections that by their nature should continue after these Terms end (including data, disclaimers, liability limits, indemnity and disputes) do. These Terms, together with the Privacy Policy and Acceptable Use Policy, are the whole agreement between you and us about the Service and replace any earlier discussion.",
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
      intro="Please read these terms carefully. They are a legal agreement. By creating an account, accepting an invitation or using jindjinni, you agree to them."
      sections={sections}
    />
  );
}
