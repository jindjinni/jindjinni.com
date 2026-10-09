import { MANUAL_CONDITIONS } from "@/lib/inventory-conditions";
import { listBuyers, buyerPriceMap, resolveFrom, salesStockContext, sellableProducts } from "@/lib/sales-service";
import type { EditorBuyer, EditorProduct } from "./doc-editor";

/** Everything the editor needs that isn't the document itself: buyers, products, live stock, other drafts' holds, buyer prices. */
export async function loadEditorData(organizationId: string, excludeDocId: string | null) {
  const [buyers, products, ctx, prices, from] = await Promise.all([listBuyers(organizationId), sellableProducts(organizationId), salesStockContext(organizationId, excludeDocId), buyerPriceMap(organizationId), resolveFrom(organizationId)]);
  const editorBuyers: EditorBuyer[] = buyers
    .filter((b) => b.active)
    .map((b) => ({ id: b.id, name: b.companyName, contact: b.contactName ?? "", email: b.email ?? "", phone: b.phone ?? "", billing: b.billingAddress ?? "", shipping: b.shippingAddress ?? "", terms: b.paymentTerms ?? "", notes: b.defaultNotes ?? "" }));
  const editorProducts: EditorProduct[] = products.map((p) => ({ id: p.id, key: p.key, name: p.name, brand: p.brand, code: p.code }));
  // Stock for products that aren't in the catalog under that key (received by name) still needs a way to be chosen.
  const known = new Set(editorProducts.map((p) => p.key));
  for (const [key, s] of Object.entries(ctx.stock)) if (!known.has(key)) editorProducts.push({ id: "", key, name: s.productName, brand: s.brand });
  return { buyers: editorBuyers, products: editorProducts, conditions: [...MANUAL_CONDITIONS], stock: ctx.stock, reserved: ctx.reserved, today: ctx.today, buyerPrices: prices, from };
}
