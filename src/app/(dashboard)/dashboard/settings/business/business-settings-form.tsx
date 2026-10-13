"use client";

import { AddressSettingsForm, type AddressValues } from "@/components/address-settings-form";

type ActionState = { error?: string; success?: boolean } | undefined;

/** The Shipping department address (we are the sender). Kept under this name for the Settings page. */
export function BusinessSettingsForm({ action, values }: { action: (state: ActionState, formData: FormData) => Promise<ActionState>; values: AddressValues | null }) {
  return <AddressSettingsForm prefix="shipFrom" action={action} values={values} testId="shipfrom-form" />;
}
