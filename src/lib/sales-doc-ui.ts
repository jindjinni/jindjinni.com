// Small lookups the Sales screens share so a new kind of document is added in one place.
import { hasNdcColumn, kindWord, type SalesKind } from "@/lib/sales-rules";

export type DocKind = SalesKind;

export const DOC_BASE: Record<DocKind, string> = {
  QUOTATION: "/dashboard/sales/quotations",
  INVOICE: "/dashboard/sales/invoices",
  PURCHASE_ORDER: "/dashboard/sales/purchase-orders",
  SALES_ORDER: "/dashboard/sales/sales-orders",
};

/** Where "back to all ..." goes (quotations are the department's home page). */
export const DOC_BACK: Record<DocKind, string> = { ...DOC_BASE, QUOTATION: "/dashboard/sales" };

export const docWord = (kind: DocKind) => kindWord(kind);
export const docPlural = (kind: DocKind) => `${kindWord(kind)}s`;
export const docTitle = (kind: DocKind) => (kind === "INVOICE" ? "Invoices" : kind === "PURCHASE_ORDER" ? "Purchase Orders" : kind === "SALES_ORDER" ? "Sales Orders" : "Quotations");

/** What the date field next to the due date means on each kind of document. */
export const dueLabel = (kind: DocKind) => (kind === "INVOICE" ? "Due date" : kind === "PURCHASE_ORDER" ? "Needed by" : kind === "SALES_ORDER" ? "Ship by" : "Valid until");
export const dueShort = (kind: DocKind) => (kind === "INVOICE" ? "Due" : kind === "SALES_ORDER" ? "Ship by" : kind === "PURCHASE_ORDER" ? "Needed by" : "Until");
export const dateLabel = (kind: DocKind) => (kind === "INVOICE" ? "Invoice date" : kind === "PURCHASE_ORDER" ? "Date received" : kind === "SALES_ORDER" ? "Order date" : "Quotation date");
export const refLabel = (kind: DocKind) => (hasNdcColumn(kind) ? "Buyer's PO number" : "Reference (optional)");
export const refShort = (kind: DocKind) => (hasNdcColumn(kind) ? "Buyer's PO #" : "Reference");
