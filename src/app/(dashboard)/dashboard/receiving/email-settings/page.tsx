import { redirect } from "next/navigation";

// Customer emails will live in the Customer Service department. Until then there is nothing to set here.
export default function EmailSettingsMoved() {
  redirect("/dashboard/receiving");
}
