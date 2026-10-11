import type { Metadata } from "next";
import { OperationPage } from "@/components/landing/operation-page";
import { BOTH } from "@/lib/landing-content";
import { currentBook } from "@/lib/pricing-service";

export const metadata: Metadata = {
  title: "Wholesale and Distribution together | jindjinni",
  description: "Run a Wholesale and a Distribution operation under one sign-in, each with its own customers, suppliers, products, orders and payments.",
};

// The "running both costs more" percentage comes from the price book the Lamp sets, never from this file.
export const revalidate = 60;

export default async function BothPage() {
  const book = await currentBook();
  return <OperationPage content={BOTH} priceNote={`Running both costs ${book.bothPercent}% more than running one operation. Each side keeps its own records.`} />;
}
