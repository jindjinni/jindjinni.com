// Example data so the app opens with something real to look at instead of
// an empty shell. Everything here is clearly a demo -- log in with
// demo@example.com / password123 to see it. Safe to run more than once
// against a fresh local.db; it does not touch a database that already has
// this demo org in it.
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../src/db/client";
import {
  organizations,
  users,
  memberships,
  conditions,
  products,
  buyers,
  inventoryReceipts,
  inventoryTransactions,
  invoices,
  invoiceLineItems,
  purchasingCategories,
  purchasingConditions,
  purchasingExpirationRanges,
  purchasingBonusTiers,
} from "../src/db/schema";
import {
  newId,
  defaultConditionRows,
  defaultPurchasingCategoryRows,
  defaultPurchasingConditionRows,
  defaultPurchasingExpirationRangeRows,
  defaultPurchasingBonusTierRows,
} from "../src/lib/ids";

async function main() {
  const demoEmail = "demo@example.com";

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, demoEmail))
    .limit(1);
  if (existing) {
    console.log("Demo data already present -- skipping seed.");
    return;
  }

  const orgId = newId("org");
  const userId = newId("user");
  const passwordHash = await bcrypt.hash("password123", 10);

  await db.insert(organizations).values({
    id: orgId,
    name: "Demo Medical Surplus Co.",
    slug: "demo-medical-surplus",
    plan: "trial",
  });

  await db.insert(users).values({
    id: userId,
    email: demoEmail,
    name: "Demo Owner",
    passwordHash,
  });

  await db.insert(memberships).values({
    id: newId("mem"),
    userId,
    organizationId: orgId,
    role: "owner",
  });

  // Same starter list every new org gets (see defaultConditionRows) so the
  // demo org isn't a special case.
  const conditionRows = defaultConditionRows(orgId);
  await db.insert(conditions).values(conditionRows);
  await db.insert(purchasingCategories).values(defaultPurchasingCategoryRows(orgId));
  await db.insert(purchasingConditions).values(defaultPurchasingConditionRows(orgId));
  await db.insert(purchasingExpirationRanges).values(defaultPurchasingExpirationRangeRows(orgId));
  await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(orgId));
  const byName = (name: string) => conditionRows.find((c) => c.name === name)!;
  const mint = byName("Mint");
  const dinged = byName("Dinged");
  const damaged = byName("Damaged");

  const productRows = [
    { id: newId("prod"), organizationId: orgId, name: "Surgical Gloves (Box of 100)", sku: "SG-100", basePrice: 12.5 },
    { id: newId("prod"), organizationId: orgId, name: "N95 Respirator Masks (Box of 20)", sku: "N95-20", basePrice: 24.0 },
    { id: newId("prod"), organizationId: orgId, name: "Digital Thermometer", sku: "THERM-01", basePrice: 8.75 },
  ];
  await db.insert(products).values(productRows);
  const [gloves, masks, thermometers] = productRows;

  const [buyer] = [
    { id: newId("buyer"), organizationId: orgId, companyName: "Riverside Clinic Supply", contactName: "Jordan Lee", email: "orders@riversideclinic.example" },
  ];
  await db.insert(buyers).values(buyer);

  // Receive stock -- mirrors the daily-receiving flow from the Airtable base.
  const receipts = [
    { productId: gloves.id, conditionId: mint.id, qty: 400 },
    { productId: masks.id, conditionId: mint.id, qty: 150 },
    { productId: masks.id, conditionId: dinged.id, qty: 20 },
    { productId: thermometers.id, conditionId: mint.id, qty: 60 },
    { productId: thermometers.id, conditionId: damaged.id, qty: 5 },
  ];
  for (const r of receipts) {
    const receiptId = newId("receipt");
    await db.insert(inventoryReceipts).values({
      id: receiptId,
      organizationId: orgId,
      productId: r.productId,
      conditionId: r.conditionId,
      quantityReceived: r.qty,
      posted: true,
    });
    await db.insert(inventoryTransactions).values({
      id: newId("txn"),
      organizationId: orgId,
      productId: r.productId,
      conditionId: r.conditionId,
      quantityChange: r.qty,
      type: "RECEIVED",
      inventoryReceiptId: receiptId,
    });
  }

  // One finalized invoice -- deducts stock the same way automation #4 does
  // in the Airtable base.
  const invoiceId = newId("invoice");
  await db.insert(invoices).values({
    id: invoiceId,
    organizationId: orgId,
    buyerId: buyer.id,
    invoiceNumber: "1",
    invoiceSequence: 1,
    status: "FINALIZED",
    invoiceDate: new Date().toISOString().slice(0, 10),
    billFromCompany: "Demo Medical Surplus Co.",
    subtotal: 250,
    total: 250,
    inventoryPosted: true,
  });

  const line = {
    id: newId("line"),
    invoiceId,
    productId: gloves.id,
    conditionId: mint.id,
    quantity: 20,
    unitPrice: 12.5,
    lineStatus: "Active" as const,
    previousPostedQuantity: 20,
  };
  await db.insert(invoiceLineItems).values(line);
  await db.insert(inventoryTransactions).values({
    id: newId("txn"),
    organizationId: orgId,
    productId: gloves.id,
    conditionId: mint.id,
    quantityChange: -20,
    type: "INVOICE_OUT",
    invoiceLineItemId: line.id,
  });

  console.log("Seeded demo org. Log in with demo@example.com / password123");
}

main().then(() => process.exit(0));
