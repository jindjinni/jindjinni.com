"use server";

// Settings -> Shipping: an owner or admin connects the company's OWN Shippo account (paste its token), checks it, turns
// on live tracking or disconnects it. Re-checked here on the server; hiding the buttons is never the guard.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { connectShippo, disconnectShippo, recheckShippo } from "@/lib/shippo-connection";
import { turnOnLiveTracking } from "@/lib/tracking-service";

export type ShippingActionState = { error?: string; message?: string; warning?: string } | undefined;

async function requireAdmin(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) throw new Error("Only an owner or admin can manage the Shippo connection.");
  return org;
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return process.env.APP_ORIGIN || `${proto}://${host}`;
}

function refresh() {
  revalidatePath("/dashboard/settings/shipping");
  revalidatePath("/dashboard/purchasing/tracking");
}

/** Saves the pasted token after Shippo accepts it, then (best effort) turns on live tracking so packages update themselves. */
export async function connectShippoAction(_prev: ShippingActionState, formData: FormData): Promise<ShippingActionState> {
  const org = await requireAdmin();
  const result = await connectShippo(org, String(formData.get("token") ?? ""));
  if (!result.ok) return { error: result.error };
  const live = await turnOnLiveTracking(org.organizationId, await origin());
  refresh();
  return {
    message: `Shippo connected (${result.isTest ? "test mode: practice labels only" : "live mode: real labels"}).${live.ok ? " Live tracking is on." : " Live tracking couldn't be switched on yet; you can try again below."}`,
    warning: result.warning,
  };
}

export async function recheckShippoAction(_prev: ShippingActionState, _formData: FormData): Promise<ShippingActionState> {
  const org = await requireAdmin();
  const res = await recheckShippo(org.organizationId);
  refresh();
  return res.ok ? { message: "Checked with Shippo. Everything is working." } : { error: res.error };
}

export async function enableTrackingAction(_prev: ShippingActionState, _formData: FormData): Promise<ShippingActionState> {
  const org = await requireAdmin();
  const res = await turnOnLiveTracking(org.organizationId, await origin());
  refresh();
  return res.ok ? { message: "Live tracking is on." } : { error: res.error };
}

export async function disconnectShippoAction(_prev: ShippingActionState, _formData: FormData): Promise<ShippingActionState> {
  const org = await requireAdmin();
  await disconnectShippo(org);
  refresh();
  return { message: "Shippo disconnected. Labels can't be bought until it is connected again." };
}
