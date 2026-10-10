import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewMailDept, mailboxesOn } from "@/lib/mail-access";
import { mailPath, partsInZone, type MailDept } from "@/lib/mail-rules";
import { quotedText, replyRecipients, replySubject } from "@/lib/mail-parse";
import { getMessage, getOutboxItem, listMailboxes } from "@/lib/mailbox-service";
import { card } from "@/components/sales-ui";
import { MailChrome } from "@/components/mail/mail-chrome";
import { ComposeForm, type ComposeDraft } from "@/components/mail/compose-form";

export type ComposeSearch = { box?: string; draft?: string; to?: string; subject?: string; body?: string; reply?: string; all?: string };

/** The "Write an email" page. Opened with ?draft= it continues a draft or a scheduled email; ?to= ?subject= ?body= start it filled in. */
export async function ComposePage({ dept, sp }: { dept: MailDept; sp: ComposeSearch }) {
  const org = await requireOrg();
  if (!(await mailboxesOn(org.organizationId)) || !canViewMailDept(dept, org)) notFound();
  const boxes = await listMailboxes(org, dept);
  const sendable = boxes.filter((b) => b.rights.send);
  const current = sendable.find((b) => b.id === sp.box) ?? sendable[0];
  if (!current) {
    return (
      <MailChrome dept={dept} boxes={boxes} current={boxes[0] ?? null}>
        <section className={card} data-testid="compose-blocked">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {boxes.length ? "You can read these mailboxes but not send from them." : "There is no mailbox to send from yet."}{" "}
            <Link href={mailPath(dept)} className="font-semibold underline">
              Back to Mail
            </Link>
          </p>
        </section>
      </MailChrome>
    );
  }

  let draft: ComposeDraft = { id: null, to: (sp.to ?? "").slice(0, 500), cc: "", bcc: "", subject: (sp.subject ?? "").slice(0, 200), body: (sp.body ?? "").slice(0, 5000), date: "", time: "08:00", zone: null, scheduled: false, files: [], replyTo: null };
  let box = current;
  if (sp.reply && !sp.draft) {
    // Reply (or Reply all) to a received email in this mailbox: addressed, titled and quoted for the person.
    const orig = await getMessage(org.organizationId, current.id, sp.reply);
    if (!orig) notFound();
    const rr = replyRecipients(orig.msg, current.accountEmail, sp.all === "1");
    const who = [orig.msg.fromName, orig.msg.fromAddress && `<${orig.msg.fromAddress}>`].filter(Boolean).join(" ") || "the sender";
    draft = { ...draft, to: rr.to, cc: rr.cc, subject: replySubject(orig.msg.subject), body: quotedText(who, new Date(orig.msg.at).toUTCString().replace(" GMT", " UTC"), orig.msg.bodyText ?? ""), replyTo: orig.msg.id };
  }
  if (sp.draft) {
    const found = await getOutboxItem(org.organizationId, current.id, sp.draft);
    if (!found) {
      // The draft may be in another of the person's mailboxes.
      for (const b of sendable) {
        const f = await getOutboxItem(org.organizationId, b.id, sp.draft);
        if (f) { box = b; break; }
      }
    }
    const item = (await getOutboxItem(org.organizationId, box.id, sp.draft)) ?? null;
    if (!item) notFound();
    if (!["DRAFT", "SCHEDULED", "FAILED"].includes(item.item.status)) redirect(`${mailPath(dept)}/o/${item.item.id}`);
    const parts = partsInZone(item.item.scheduledFor, item.item.scheduleZone);
    draft = {
      id: item.item.id, to: item.item.toAddresses, cc: item.item.ccAddresses, bcc: item.item.bccAddresses, subject: item.item.subject, body: item.item.bodyText,
      date: item.item.status === "SCHEDULED" && parts ? parts.date : "", time: item.item.status === "SCHEDULED" && parts ? parts.time : "08:00",
      zone: item.item.status === "SCHEDULED" ? item.item.scheduleZone : null, scheduled: item.item.status === "SCHEDULED",
      files: item.files.map((f) => ({ id: f.id, filename: f.filename, bytes: f.bytes })), replyTo: item.item.replyToMessageId,
    };
  }
  return (
    <MailChrome dept={dept} boxes={sendable.length > 1 ? sendable : []} current={null}>
      <section className={`${card} max-w-3xl`}>
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-50">{draft.id ? "Edit email" : "Write an email"}</h2>
        {sendable.length > 1 && !draft.id && (
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            Sending from <strong>{box.name}</strong>. Switch:{" "}
            {sendable.filter((b) => b.id !== box.id).map((b) => (
              <Link key={b.id} href={`${mailPath(dept)}/compose?box=${b.id}`} className="mr-2 font-semibold underline">
                {b.name}
              </Link>
            ))}
          </p>
        )}
        <ComposeForm key={`${box.id}-${draft.id ?? "new"}`} dept={dept} boxId={box.id} boxName={box.name} fromEmail={box.accountEmail} connected={box.status === "ACTIVE"} draft={draft} />
      </section>
    </MailChrome>
  );
}
