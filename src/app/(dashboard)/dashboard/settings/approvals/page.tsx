import { redirect } from "next/navigation";

/** The old address of the platform owner's company list. */
export default function ApprovalsMoved() {
  redirect("/dashboard/mothership/companies");
}
