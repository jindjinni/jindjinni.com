import { redirect } from "next/navigation";

// Moved into Settings -- keeps old bookmarks working.
export default function AdminRedirect() {
  redirect("/dashboard/settings/team");
}
