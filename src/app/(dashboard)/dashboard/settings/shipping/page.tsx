import { redirect } from "next/navigation";

// The Shippo connector moved into Purchasing -> Settings -> Connectors. Old bookmarks and links land there.
export default function ShippingSettingsMoved() {
  redirect("/dashboard/purchasing/connectors");
}
