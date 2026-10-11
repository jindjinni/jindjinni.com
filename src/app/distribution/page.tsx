import type { Metadata } from "next";
import { OperationPage } from "@/components/landing/operation-page";
import { DISTRIBUTION } from "@/lib/landing-content";

export const metadata: Metadata = {
  title: "Distribution | jindjinni",
  description: "Buy from wholesalers with purchase orders, check every delivery for recalls and counterfeits, sell to pharmacies, and answer audits from one record.",
};

export default function DistributionPage() {
  return <OperationPage content={DISTRIBUTION} />;
}
