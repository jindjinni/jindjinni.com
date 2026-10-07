import { redirect } from "next/navigation";

// Customer emails now live in the Customer Service department; this old address just forwards there.
export default function EmailSettingsMoved() {
  redirect("/dashboard/customer-service/email-settings");
}
