"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWriteShipping } from "@/lib/permissions";
import { createContact, importContacts, setContactHidden, updateContact, type ContactInput } from "@/lib/shipping-contacts";
import {
  addBox, createOtherShipment, makeLabels, setShipTo, addFile, createShipment, followBoxAuto, refreshShipment, removeBox, removeFile, sendShippedEmail, setBoxStatusManual, setFileAttach, shippingOn, skipShippedEmail, updateShipment,
} from "@/lib/shipping-service";

export type ShipResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const OFF = "Shipping isn't turned on for your company yet.";
const LOOK_ONLY = "You are looking at this company's account, so nothing can be changed.";
const NO_WRITE = "Only the Shipping team, Sales, an Admin or the Owner can make changes in Shipping.";

const refresh = () => {
  revalidatePath("/dashboard/shipping", "layout");
  revalidatePath("/dashboard/sales", "layout");
};

async function writer(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: LOOK_ONLY };
  if (!(await shippingOn(org.organizationId))) return { error: OFF };
  if (!canWriteShipping(org.role, org.access)) return { error: NO_WRITE };
  return { org };
}

const str = (v: unknown) => String(v ?? "");

/** Start a shipment for a sent sales order (or invoice). */
export async function startShipmentAction(documentId: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await createShipment(w.org, str(documentId));
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id };
}

export async function updateShipmentAction(shipmentId: string, patch: { shipDate?: string; buyerEmail?: string; buyerContact?: string }): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await updateShipment(w.org, str(shipmentId), { shipDate: patch?.shipDate, buyerEmail: patch?.buyerEmail, buyerContact: patch?.buyerContact });
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function addBoxAction(shipmentId: string, trackingNumber: string, carrier: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await addBox(w.org, str(shipmentId), { trackingNumber: str(trackingNumber), carrier: str(carrier) || null });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: `Added (${res.carrier}).` };
}

export async function removeBoxAction(boxId: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await removeBox(w.org, str(boxId));
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function setBoxStatusAction(boxId: string, status: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await setBoxStatusManual(w.org, str(boxId), str(status));
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function followBoxAction(boxId: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await followBoxAuto(w.org, str(boxId));
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function refreshShipmentAction(shipmentId: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await refreshShipment(w.org, str(shipmentId));
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Tracking refreshed." };
}

/** Upload a label photo, an order/invoice photo or a PDF to a shipment. */
export async function uploadShipmentFileAction(shipmentId: string, kind: string, formData: FormData): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo or PDF to add." };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: "That file is over 4 MB. Choose a smaller one." };
  const res = await addFile(w.org, str(shipmentId), { kind: str(kind), filename: file.name || "photo", bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id };
}

export async function removeShipmentFileAction(fileId: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await removeFile(w.org, str(fileId));
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function setFileAttachAction(fileId: string, attach: boolean): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await setFileAttach(w.org, str(fileId), !!attach);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

/** Emails the buyer that the order shipped. Nothing is sent by itself: this runs only when a person presses Send. */
export async function sendShippedEmailAction(shipmentId: string, p: { to: string; note: string; attachOrder: boolean; attachInvoice: boolean }): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await sendShippedEmail(w.org, str(shipmentId), { to: str(p?.to), note: str(p?.note), attachOrder: !!p?.attachOrder, attachInvoice: !!p?.attachInvoice });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: `Sent to ${res.to}.` };
}

export async function skipShippedEmailAction(shipmentId: string, reason: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await skipShippedEmail(w.org, str(shipmentId), str(reason));
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Set aside. No email was sent." };
}

// ---- where it goes, and labels ----

/** A return (or any shipment with no order) to a saved address profile. */
export async function startOtherShipmentAction(contactId: string, kind: string, reason: string): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await createOtherShipment(w.org, { contactId: str(contactId), kind: str(kind), reason: str(reason) });
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id };
}

type AddressForm = { name?: string; company?: string; street1?: string; street2?: string; city?: string; state?: string; zip?: string; phone?: string; email?: string; isResidential?: boolean };

/** Use a saved profile's address, or the address typed on the page (optionally saved as a new profile of that kind). */
export async function setShipToAction(shipmentId: string, p: { contactId?: string | null; address?: AddressForm; saveAs?: string | null }): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await setShipTo(w.org, str(shipmentId), { contactId: p?.contactId ? str(p.contactId) : null, address: p?.address, saveAs: p?.saveAs ? str(p.saveAs) : null });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Address saved." };
}

/** Buys labels (one per box) from the company's own Shippo account. Runs only when a person presses the button. */
export async function makeLabelsAction(shipmentId: string, p: { service: string; count: number; lengthIn: string; widthIn: string; heightIn: string; weightLb: string }): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await makeLabels(w.org, str(shipmentId), { service: p?.service, count: p?.count, parcel: { lengthIn: p?.lengthIn, widthIn: p?.widthIn, heightIn: p?.heightIn, weightLb: p?.weightLb } });
  refresh();
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.error };
}

// ---- address profiles ----

export async function saveContactAction(id: string | null, input: ContactInput): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = id ? await updateContact(w.org, str(id), input ?? {}) : await createContact(w.org, input ?? {});
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: "id" in res ? String(res.id) : (id ?? undefined) };
}

export async function hideContactAction(id: string, hidden: boolean): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await setContactHidden(w.org, str(id), !!hidden);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

/** Brings contacts over from Sales buyers, Purchasing sellers and Purchasing suppliers. Copies only; nothing there is changed. */
export async function importContactsAction(groups: string[]): Promise<ShipResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await importContacts(w.org, Array.isArray(groups) ? groups.map(str) : []);
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: res.added === 0 ? "Everyone was already here." : `Brought over ${res.added} ${res.added === 1 ? "profile" : "profiles"}.` };
}
