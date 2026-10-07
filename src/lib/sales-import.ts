// Reading a spreadsheet of buyers (e.g. an Airtable "Buyers" export) into buyers. Pure apart from the shared parser.

import { findColumn, type ParsedSheet } from "@/lib/spreadsheet-import";
import type { BuyerInput } from "@/lib/sales-service";

const COLS = {
  company: ["company name", "company", "buyer", "buyer name", "name", "customer"],
  contact: ["contact name", "contact", "contact person"],
  billing: ["billing address", "address", "bill to", "street address"],
  shipping: ["shipping address", "ship to", "shipping"],
  city: ["city"],
  state: ["state"],
  zip: ["zip code", "zip", "postal code", "zipcode"],
  phone: ["phone", "phone number", "telephone"],
  email: ["email", "email address", "e-mail"],
  terms: ["payment terms", "terms"],
  tax: ["tax information", "tax id", "resale certificate"],
  taxExempt: ["tax exempt", "tax-exempt"],
  notes: ["default invoice notes", "notes", "default notes"],
} as const;

const truthy = (v: string) => /^(yes|y|true|1|checked|x)$/i.test(v.trim());

export function buyersFromSheet(sheet: ParsedSheet): { buyers: BuyerInput[]; blank: number; error?: string } {
  const col = (k: keyof typeof COLS) => findColumn(sheet.headers, [...COLS[k]]);
  const company = col("company");
  if (!company) return { buyers: [], blank: 0, error: "I couldn't find a Company Name column. Name one column \"Company Name\"." };
  const c = { contact: col("contact"), billing: col("billing"), shipping: col("shipping"), city: col("city"), state: col("state"), zip: col("zip"), phone: col("phone"), email: col("email"), terms: col("terms"), tax: col("tax"), taxExempt: col("taxExempt"), notes: col("notes") };
  const buyers: BuyerInput[] = [];
  let blank = 0;
  for (const r of sheet.rows) {
    const name = (r[company] ?? "").trim();
    if (!name) {
      if (Object.values(r).some((v) => (v ?? "").trim())) blank += 1;
      continue;
    }
    const city = c.city ? (r[c.city] ?? "").trim() : "";
    const state = c.state ? (r[c.state] ?? "").trim() : "";
    const zip = c.zip ? (r[c.zip] ?? "").trim() : "";
    let billing = c.billing ? (r[c.billing] ?? "").trim() : "";
    // Add "City, ST ZIP" only when the address column doesn't already carry it.
    const tail = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (tail && !(zip && billing.includes(zip)) && !(city && billing.toLowerCase().includes(city.toLowerCase()))) billing = [billing, tail].filter(Boolean).join("\n");
    buyers.push({
      companyName: name,
      contactName: c.contact ? r[c.contact] : null,
      billingAddress: billing || null,
      shippingAddress: c.shipping ? r[c.shipping] || null : null,
      phone: c.phone ? r[c.phone] : null,
      email: c.email ? r[c.email] : null,
      paymentTerms: c.terms ? r[c.terms] : null,
      taxInfo: c.tax ? r[c.tax] : null,
      taxExempt: c.taxExempt ? truthy(r[c.taxExempt] ?? "") : false,
      defaultNotes: c.notes ? r[c.notes] : null,
    });
  }
  return { buyers, blank };
}
