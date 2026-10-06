import { redirect } from "next/navigation";

// Serial numbers live in the Lot & Serial Tracker now; this address just forwards there.
export default function SerialNumbersMoved() {
  redirect("/dashboard/receiving/tracker?view=serials");
}
