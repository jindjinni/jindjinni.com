import Link from "next/link";
import { listContacts } from "@/lib/shipping-contacts";
import { addressReady, kindLabel } from "@/lib/shipping-address-rules";
import { operationsOf } from "@/lib/operations-service";
import { wordsFor } from "@/lib/operations-rules";
import { card } from "@/components/sales-ui";
import { requireShipping } from "../gate";
import { NewShipmentForm } from "./new-form";

export const dynamic = "force-dynamic";

// Returns & Labels: a shipment that has no sales order, such as a return to a seller or a supplier. Pick the address, then make its label.
export default async function NewShipmentPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const { org, canWrite } = await requireShipping();
  const [contacts, sides] = await Promise.all([listContacts(org.organizationId), operationsOf(org.organizationId)]);
  const buyers = wordsFor(sides).buyers;
  const initial = (await searchParams).contact ?? "";
  return (
    <div className="max-w-3xl" data-testid="new-shipment-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Returns &amp; Labels</h1>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Sending something back to a seller or a supplier, or shipping anything that has no sales order? Pick the saved address, then make the label on the next page. Orders for your {buyers.toLowerCase()} start from To Ship.
      </p>
      {!canWrite ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`}>You can look at Shipping. Only the Shipping team, Sales, an Admin or the Owner can start a shipment.</p>
      ) : contacts.length === 0 ? (
        <p className={`${card} text-sm text-slate-700 dark:text-slate-300`} data-testid="new-shipment-empty">
          There are no saved addresses yet. <Link href="/dashboard/shipping/addresses" className="font-medium text-emerald-800 underline dark:text-emerald-300">Add or bring over addresses</Link> first.
        </p>
      ) : (
        <NewShipmentForm
          options={contacts.map((c) => ({ id: c.id, label: c.company ? `${c.company}${c.name !== c.company ? ` - ${c.name}` : ""}` : c.name, kind: c.kind, ready: addressReady(c) }))}
          initial={contacts.some((c) => c.id === initial) ? initial : ""}
          kinds={{ BUYER: kindLabel("BUYER", buyers.endsWith("s") ? buyers.slice(0, -1) : buyers), SELLER: "Seller", SUPPLIER: "Supplier", OTHER: "Other" }}
        />
      )}
    </div>
  );
}
