import { QuickBooksReports } from "@/components/quickbooks-reports";

export const dynamic = "force-dynamic";

export default function SalesQuickBooksPage() {
  return <QuickBooksReports dept="sales" />;
}
