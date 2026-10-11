import type { Metadata } from "next";
import { OperationPage } from "@/components/landing/operation-page";
import { DISTRIBUTION } from "@/lib/landing-content";
import { currentBook } from "@/lib/pricing-service";

export const metadata: Metadata = {
  title: "Distribution | jindjinni",
  description: "Buy from wholesalers with purchase orders, check every delivery for recalls and counterfeits, sell to pharmacies, and answer audits from one record.",
};

// The prices come from the price book the Lamp sets, never from this file.
export const revalidate = 60;

export default async function DistributionPage() {
  const book = await currentBook();
  return <OperationPage content={DISTRIBUTION} book={book} />;
}
