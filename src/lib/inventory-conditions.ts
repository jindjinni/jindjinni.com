import { RECEIVING_CONDITIONS } from "@/db/schema";

/** Conditions that can be added by hand: everything Receiving uses except "Expired" (expired stock isn't stock). Server-side only. */
export const MANUAL_CONDITIONS = RECEIVING_CONDITIONS.filter((c) => c !== "Expired");
