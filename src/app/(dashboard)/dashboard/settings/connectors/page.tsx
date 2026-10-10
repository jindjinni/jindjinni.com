import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getConnection, OAUTH } from "@/lib/email-connector";
import { aiConnectionView } from "@/lib/ai-connection";
import { connectorStatuses } from "@/lib/connectors";
import { ConnectorSummaryCard } from "@/components/connector-card";
import { ConnectGuide } from "@/components/connect-guide";
import { accountingView, qboConfigured } from "@/lib/quickbooks";
import { quickbooksOn } from "@/lib/quickbooks-service";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { QuickBooksConnector } from "./quickbooks-connector";
import { EmailConnectorCard, type ConnectionView } from "./email-connector-card";
import { SmtpConnectForm } from "./smtp-connect-form";
import { AiConnector } from "./ai-connector";

export const dynamic = "force-dynamic";

/**
 * Settings -> Connectors: the accounts the whole company runs on, each one the company's own. The mailbox customers hear
 * from and the AI key (Claude or ChatGPT) are plugged in here; department-specific ones (Shippo) are in that department's own
 * Settings -> Connectors tab and are listed below with their state. Owner and Admin only.
 */
export default async function CompanyConnectorsPage({ searchParams }: { searchParams: Promise<{ connected?: string; connect_error?: string; qb_connected?: string; qb_error?: string }> }) {
  const sp = await searchParams;
  const org = await requireOrg();
  if (!isAdmin(org.role)) notFound();

  const [statuses, conn, ai, qbOn, qb] = await Promise.all([connectorStatuses(org.organizationId), getConnection(org.organizationId), aiConnectionView(org.organizationId), quickbooksOn(org.organizationId), accountingView(org.organizationId)]);
  const platformAdmin = qbOn && !qboConfigured() ? await isPlatformAdmin(org) : false;
  let connection: ConnectionView | null = null;
  if (conn) {
    const [by] = conn.connectedByUserId ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, conn.connectedByUserId)).limit(1) : [];
    connection = { provider: conn.provider, email: conn.accountEmail, status: conn.status, connectedAt: conn.connectedAt, lastUsedAt: conn.lastUsedAt, connectedByName: by ? by.name || by.email : null, lastError: conn.lastError };
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL || "";
  const hasKey = !!process.env.RESEND_API_KEY;

  return (
    <div className="flex max-w-3xl flex-col gap-8" data-testid="company-connectors">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Connectors</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every company on the platform brings its own accounts. Plug in {org.organizationName}&apos;s logins here and they are used for {org.organizationName} only; nothing is shared with any other company.
        </p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="company-wide">
        <h3 id="company-wide" className="text-lg font-semibold text-slate-900 dark:text-slate-50">For the whole company</h3>
        <div data-testid="email-connector">
          <EmailConnectorCard
            connection={connection}
            flash={{ connected: sp.connected === "1", error: sp.connect_error }}
            providers={[
              { key: "GOOGLE", label: "Gmail or Google Workspace", sub: "Includes company addresses hosted by Google", configured: OAUTH.GOOGLE.configured(), href: "/api/email-connect/google/start" },
              { key: "MICROSOFT", label: "Outlook or Microsoft 365", sub: "Includes company addresses hosted by Microsoft", configured: OAUTH.MICROSOFT.configured(), href: "/api/email-connect/microsoft/start" },
            ]}
          >
            <SmtpConnectForm googleHref="/api/email-connect/google/start" microsoftHref="/api/email-connect/microsoft/start" googleOn={OAUTH.GOOGLE.configured()} microsoftOn={OAUTH.MICROSOFT.configured()} />
          </EmailConnectorCard>
          {!connection && (!hasKey || !fromEmail) && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="cs-sender-warning">
              {!hasKey
                ? "The email service isn't connected yet (no Resend key on the server), so emails can't be sent."
                : "No sending address is set on the server yet. Until your company's domain is verified in Resend, emails go out from a test address that real customers can't receive."}
            </p>
          )}
        </div>
        <ConnectGuide guideKey="email" open={!connection || connection.status !== "ACTIVE"} />
        <AiConnector source={ai.source} provider={ai.provider} status={ai.status} keyHint={ai.keyHint} lastError={ai.lastError} companyName={org.organizationName} />
        <ConnectGuide guideKey="ai-anthropic" open={(ai.source !== "company" || ai.status !== "ACTIVE") && ai.provider === "anthropic"} />
        <ConnectGuide guideKey="ai-openai" open={(ai.source !== "company" || ai.status !== "ACTIVE") && ai.provider === "openai"} />
        {qbOn && (
          <>
            <QuickBooksConnector
              connected={qb.connected}
              status={qb.status}
              companyName={qb.companyName}
              connectedByName={qb.connectedByName}
              connectedAt={qb.connectedAt}
              lastUsedAt={qb.lastUsedAt}
              lastError={qb.lastError}
              configured={qboConfigured()}
              justConnected={sp.qb_connected === "1"}
              error={sp.qb_error ?? null}
            />
            <ConnectGuide guideKey="quickbooks" open={!qb.connected || qb.status !== "ACTIVE"} />
            <ConnectGuide guideKey="quickbooks-desktop" />
            {platformAdmin && <ConnectGuide guideKey="quickbooks-platform" open />}
          </>
        )}
        <ConnectorSummaryCard status={statuses.text} canManage />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="by-dept">
        <div>
          <h3 id="by-dept" className="text-lg font-semibold text-slate-900 dark:text-slate-50">Plugged in inside a department</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            These belong to one department, so they are plugged in under that department&apos;s <strong>Settings → Connectors</strong>. Open the department to manage them.
          </p>
        </div>
        <ConnectorSummaryCard status={statuses.shippo} canManage />
      </section>
    </div>
  );
}
