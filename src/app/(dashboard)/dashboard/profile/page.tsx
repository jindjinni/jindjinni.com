import { redirect } from "next/navigation";

// Moved into Settings -- keeps old bookmarks working.
export default function ProfileRedirect() {
  redirect("/dashboard/settings/business-profile");
}
