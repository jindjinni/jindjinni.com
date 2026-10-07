// The platform's connectors: every service that carries a company's own identity or costs money per use is plugged in
// by that company with its own login or token (see the "every company brings its own accounts" principle in CLAUDE.md).
//
//  - A connector that serves ONE department is managed in that department: Settings -> Connectors.
//  - A connector that serves the whole company (the mailbox customers hear from, the Claude key) is managed in the
//    company's Settings -> Connectors. A department that depends on it shows its status and links there.
//
// To add a connector: add it to CONNECTORS, list it under the departments that need it in DEPT_CONNECTORS, give it a
// status in connectorStatuses(), and build its card on the page named by `manageHref`.

import { aiConnectionView } from "@/lib/ai-connection";
import { getConnection } from "@/lib/email-connector";
import { shippoConnectionView } from "@/lib/shippo-connection";
import type { MenuDept } from "@/lib/sidebar-menu";

export type ConnectorKey = "shippo" | "email" | "ai" | "text";

export type ConnectorInfo = {
  key: ConnectorKey;
  title: string;
  /** What it lets people do, in plain words. */
  what: string;
  /** "department": managed in one department's Connectors tab. "company": managed in the company's Settings. */
  scope: "department" | "company";
  /** The page where an owner or admin plugs it in. */
  manageHref: string;
  /** Where it is managed, in words ("Purchasing → Settings → Connectors"). */
  manageWhere: string;
};

export const CONNECTORS: Record<ConnectorKey, ConnectorInfo> = {
  shippo: {
    key: "shippo",
    title: "Shippo connector",
    what: "Buy UPS and USPS shipping labels in your own Shippo account and follow your packages.",
    scope: "department",
    manageHref: "/dashboard/purchasing/connectors",
    manageWhere: "Purchasing → Settings → Connectors",
  },
  email: {
    key: "email",
    title: "Company email",
    what: "The mailbox your customers hear from: quotes, payment confirmations, receiving notices and campaigns are sent from your own address.",
    scope: "company",
    manageHref: "/dashboard/settings/connectors",
    manageWhere: "Settings → Connectors",
  },
  ai: {
    key: "ai",
    title: "Claude (AI)",
    what: "Reads lot and serial numbers from label photos in Receiving, and gives Jin, the built-in helper, a much higher daily limit. Usage is billed to your own Anthropic account. (Jin and the industry news on Home work without it, with a fair daily limit.)",
    scope: "company",
    manageHref: "/dashboard/settings/connectors",
    manageWhere: "Settings → Connectors",
  },
  text: {
    key: "text",
    title: "Text messages",
    what: "Send text campaigns from your own number.",
    scope: "company",
    manageHref: "/dashboard/marketing/connectors",
    manageWhere: "Marketing → Settings → Connectors",
  },
};

/** Which connectors each department depends on. A department without an entry has no Connectors tab. */
export const DEPT_CONNECTORS: Partial<Record<MenuDept, ConnectorKey[]>> = {
  purchasing: ["shippo"],
  receiving: ["email", "ai"],
  "customer-service": ["email"],
  sales: ["email"],
  marketing: ["email", "text"],
};

/** The connectors that serve the whole company, in the order Settings -> Connectors shows them. */
export const COMPANY_CONNECTORS: ConnectorKey[] = ["email", "ai", "text"];

export type ConnectorState = "connected" | "test" | "attention" | "not_connected" | "platform" | "coming_soon";

export type ConnectorStatus = { key: ConnectorKey; state: ConnectorState; detail: string };

export const STATE_LABEL: Record<ConnectorState, string> = {
  connected: "Connected",
  test: "Connected (test mode)",
  attention: "Needs attention",
  not_connected: "Not connected",
  platform: "Using the platform's account",
  coming_soon: "Not available yet",
};

/** Pure: the label, colors-by-meaning and whether a person must act. */
export const needsAction = (s: ConnectorState) => s === "attention" || s === "not_connected";

/** The live state of each connector for one company. Reads only that company's own rows. */
export async function connectorStatuses(organizationId: string): Promise<Record<ConnectorKey, ConnectorStatus>> {
  const [shippo, mail, ai] = await Promise.all([shippoConnectionView(organizationId), getConnection(organizationId), aiConnectionView(organizationId)]);

  const shippoStatus: ConnectorStatus =
    shippo.source === "company"
      ? shippo.status === "ACTIVE"
        ? { key: "shippo", state: shippo.isTest ? "test" : "connected", detail: `Token ending ${shippo.keyHint}${shippo.carriers.usps || shippo.carriers.ups ? "" : ". No carriers are switched on in Shippo yet"}.` }
        : { key: "shippo", state: "attention", detail: shippo.lastError ?? "Shippo isn't accepting the saved token." }
      : shippo.source === "platform"
        ? { key: "shippo", state: "platform", detail: "Labels are bought in the platform's own Shippo account." }
        : { key: "shippo", state: "not_connected", detail: "Labels can't be bought until your Shippo token is added." };

  const emailStatus: ConnectorStatus = mail
    ? mail.status === "ACTIVE"
      ? { key: "email", state: "connected", detail: `Customer emails are sent from ${mail.accountEmail}.` }
      : { key: "email", state: "attention", detail: `The sign-in for ${mail.accountEmail} expired. Reconnect it.` }
    : { key: "email", state: "not_connected", detail: "Until you connect your mailbox, customer emails go out from the platform's shared address." };

  const aiStatus: ConnectorStatus =
    ai.source === "company"
      ? ai.status === "ACTIVE"
        ? { key: "ai", state: "connected", detail: `Key ending ${ai.keyHint}.` }
        : { key: "ai", state: "attention", detail: ai.lastError ?? "Anthropic isn't accepting the saved key." }
      : ai.source === "platform"
        ? { key: "ai", state: "platform", detail: "Label-photo reading and Jin use the platform's own Claude account." }
        : { key: "ai", state: "not_connected", detail: "Label-photo reading is off. Jin (with a daily limit) and the industry news on Home work without it." };

  return {
    shippo: shippoStatus,
    email: emailStatus,
    ai: aiStatus,
    text: { key: "text", state: "coming_soon", detail: "Text campaigns can't be sent yet. Texting needs a provider connector that isn't built yet; nothing is sent in the meantime." },
  };
}
