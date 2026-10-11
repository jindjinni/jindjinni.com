import type { Metadata } from "next";
import { OperationPage } from "@/components/landing/operation-page";
import { WHOLESALE } from "@/lib/landing-content";

export const metadata: Metadata = {
  title: "Wholesale | jindjinni",
  description: "Source supplies directly from sellers with automatic quotations and free shipping labels, check every package for recalls and counterfeits, and sell on to distributors, all in one place.",
};

export default function WholesalePage() {
  return <OperationPage content={WHOLESALE} />;
}
