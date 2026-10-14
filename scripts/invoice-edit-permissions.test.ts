// Who may change an invoice after it was sent.
import assert from "node:assert/strict";
import { canEditSentInvoices } from "../src/lib/permissions";

const yes = (role: string, access?: Parameters<typeof canEditSentInvoices>[1]) => assert.equal(canEditSentInvoices(role, access), true, `${role} should be allowed`);
const no = (role: string, access?: Parameters<typeof canEditSentInvoices>[1]) => assert.equal(canEditSentInvoices(role, access), false, `${role} should not be allowed`);

for (const r of ["owner", "admin", "purchasing_manager", "purchasing_agent", "staff", "accountant"]) yes(r);
yes("custom", { sales: "work" } as never);
yes("custom", { accounts: "work" } as never);
no("custom", { sales: "view" } as never);
no("custom", { accounts: "view" } as never);
no("customer_service");
no("custom");
console.log("invoice-edit-permissions: ok");
