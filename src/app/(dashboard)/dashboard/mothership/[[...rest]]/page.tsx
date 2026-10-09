import { redirect } from "next/navigation";

// The mothership is now called the Lamp. Old links keep working.
export default async function OldMothershipLink({ params }: { params: Promise<{ rest?: string[] }> }) {
  const { rest } = await params;
  redirect(`/dashboard/lamp${rest?.length ? `/${rest.map(encodeURIComponent).join("/")}` : ""}`);
}
