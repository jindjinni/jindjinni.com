import { QuickBooksReports } from "@/components/quickbooks-reports";

export const dynamic = "force-dynamic";

export default function AccountsQuickBooksPage() {
  return <QuickBooksReports dept="accounts" />;
}
