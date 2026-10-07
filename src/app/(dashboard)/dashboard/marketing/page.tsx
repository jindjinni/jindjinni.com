import { requireOrg } from "@/lib/tenant";
import { listPeople, optoutKeys } from "@/lib/marketing-service";
import { normEmail, normPhone } from "@/lib/marketing-rules";
import { ContactsView, type PersonView } from "./contacts-view";

export const dynamic = "force-dynamic";

// Contacts: customers from quotations (read live, never copied) and the contacts typed in or uploaded, one list.
// Grouped under closed headings; a search opens them. An unsubscribe (by email or by text) is kept by address, so it
// holds for a person who is both a customer and an uploaded contact.
export default async function ContactsPage() {
  const org = await requireOrg();
  const [people, emailOut, textOut] = await Promise.all([listPeople(org.organizationId), optoutKeys(org.organizationId, "EMAIL"), optoutKeys(org.organizationId, "TEXT")]);
  const rows: PersonView[] = people.map((p) => {
    const email = normEmail(p.email);
    const phone = normPhone(p.phone);
    return {
      key: p.key,
      source: p.source,
      name: [p.firstName, p.lastName].filter(Boolean).join(" "),
      company: p.company ?? null,
      email: email ?? (p.email ?? "").trim() ?? null,
      emailOk: !!email,
      phone: phone ?? (p.phone ?? "").trim() ?? null,
      phoneOk: !!phone,
      emailOut: !!email && emailOut.has(email),
      textOut: !!phone && textOut.has(phone),
    };
  });
  return <ContactsView rows={rows} />;
}
