import { redirect } from "next/navigation";

// The old inventory/invoicing overview was retired. Purchasing is the home of
// the dashboard until the next department (Receiving) is built.
export default function DashboardIndexPage() {
  redirect("/dashboard/purchasing");
}
