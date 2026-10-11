import type { Metadata } from "next";
import { OperationPage } from "@/components/landing/operation-page";
import { WHOLESALE } from "@/lib/landing-content";
import { currentBook } from "@/lib/pricing-service";

export const metadata: Metadata = {
  title: "Wholesale | jindjinni",
  description: "Source supplies directly from sellers with automatic quotations and free shipping labels, check every package for recalls and counterfeits, and sell on to distributors, all in one place.",
};

// The prices come from the price book the Lamp sets, never from this file.
export const revalidate = 60;

export default async function WholesalePage() {
  const book = await currentBook();
  return <OperationPage content={WHOLESALE} book={book} />;
}
