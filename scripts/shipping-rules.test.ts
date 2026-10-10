import assert from "node:assert/strict";
import {
  canShipFrom, checkTracking, cleanTracking, docLabel, emailReadiness, guessCarrier, isOrderKind, MAX_EMAIL_FILES, pickAttachments, shipmentStatus, shippedEmail, stageOf, STAGES,
} from "../src/lib/shipping-rules";
import { addressLines, addressProblems, addressReady, checkParcel, cleanAddress, kindLabel, kindOne, parseUsAddress, stateCode } from "../src/lib/shipping-address-rules";
import { candidatesFrom } from "../src/lib/shipping-contacts";

// which orders ship
assert.ok(canShipFrom("SALES_ORDER", "SENT") && canShipFrom("SALES_ORDER", "ACCEPTED") && canShipFrom("SALES_ORDER", "CONVERTED"));
assert.ok(!canShipFrom("SALES_ORDER", "DRAFT") && !canShipFrom("SALES_ORDER", "VOID"));
assert.ok(canShipFrom("INVOICE", "PAID") && canShipFrom("INVOICE", "SENT") && !canShipFrom("INVOICE", "DRAFT"));
assert.ok(!canShipFrom("QUOTATION", "SENT") && !canShipFrom("PURCHASE_ORDER", "SENT"));
assert.ok(isOrderKind("SALES_ORDER") && !isOrderKind("RETURN"));
assert.equal(docLabel("RETURN", ""), "Return");
assert.equal(docLabel("SALES_ORDER", "SO-3"), "Sales order SO-3");

// tracking numbers
assert.equal(cleanTracking(" 1z 999-aa1.0123456784 "), "1Z999AA10123456784");
assert.ok(checkTracking("1Z999AA10123456784").ok);
assert.ok(!checkTracking("").ok && !checkTracking("12").ok && !checkTracking("ab#12345678").ok && !checkTracking("1".repeat(41)).ok);
assert.equal(guessCarrier("1Z999AA10123456784"), "UPS");
assert.equal(guessCarrier("9400111899223197428490"), "USPS");
assert.equal(guessCarrier("123456789012"), "FedEx");
assert.equal(guessCarrier("hello"), null);

// the one status of a shipment
assert.equal(shipmentStatus([]).status, "Not shipped");
const now = "2026-10-01T10:00:00Z";
assert.equal(shipmentStatus([{ status: "Delivered", deliveredAt: now, statusAt: now }, { status: "In Transit", deliveredAt: null, statusAt: now }]).status, "In Transit");
assert.equal(shipmentStatus([{ status: "Delivered", deliveredAt: now, statusAt: now }]).status, "Delivered");

// stages
assert.equal(stageOf({ status: "Exception", boxCount: 1, emailStatus: "SENT" }), "Problem");
assert.equal(stageOf({ status: "Not shipped", boxCount: 0, emailStatus: null }), "Preparing");
assert.equal(stageOf({ status: "In Transit", boxCount: 1, emailStatus: null }), "Ready to send");
assert.equal(stageOf({ status: "In Transit", boxCount: 1, emailStatus: "SENDING" }), "Ready to send");
assert.equal(stageOf({ status: "In Transit", boxCount: 1, emailStatus: "SENT" }), "On the way");
assert.equal(stageOf({ status: "In Transit", boxCount: 1, emailStatus: "SKIPPED" }), "On the way");
assert.equal(stageOf({ status: "Delivered", boxCount: 2, emailStatus: "SENT" }), "Delivered");
assert.equal(STAGES.length, 5);

// the order email: items and NDCs, tracking links, never a price
const base = {
  company: "Main St Pharmacy", contact: "Dana", docKind: "SALES_ORDER", docNumber: "SO-12", reference: "PO-778", shipDate: "Oct 4, 2026",
  boxes: [{ carrier: "UPS", trackingNumber: "1Z999AA10123456784" }, { carrier: "USPS", trackingNumber: "9400111899223197428490" }],
  items: [{ name: "Dexcom G7 Sensor", quantity: 3, ndc: "08627-0016-01" }, { name: "Test strips", quantity: 10 }],
  attachmentNames: ["label.jpg"], note: "Call us if anything is damaged.", senderName: "Plantarz",
};
const m = shippedEmail(base);
assert.equal(m.subject, "Your order has shipped - PO PO-778 - Main St Pharmacy");
assert.match(m.text, /^Hello Dana,/);
assert.match(m.text, /Good day\. Your order has shipped\./);
assert.match(m.text, /Tracking numbers \(2 boxes\):/);
assert.match(m.text, /Box 1 - UPS 1Z999AA10123456784\n {4}https:\/\/www\.ups\.com\/track\?tracknum=1Z999AA10123456784/);
assert.match(m.text, /Box 2 - USPS 9400111899223197428490/);
assert.match(m.text, /3 x Dexcom G7 Sensor \(NDC 08627-0016-01\)/);
assert.match(m.text, /10 x Test strips\n/);
assert.match(m.text, /Attached: label\.jpg/);
assert.match(m.text, /Call us if anything is damaged\./);
assert.ok(!/\$|price|total|charge/i.test(m.text), "no money in the shipped email");
assert.match(shippedEmail({ ...base, boxes: [base.boxes[0]], reference: null, contact: null }).text, /^Hello,\n[\s\S]*Tracking number:\n {2}UPS 1Z/);
assert.equal(shippedEmail({ ...base, reference: null }).subject, "Your order has shipped - Sales order SO-12 - Main St Pharmacy");
// a return: different wording, no order line
const ret = shippedEmail({ ...base, docKind: "RETURN", docNumber: "", reference: null, items: [], reason: "Damaged items sent back", attachmentNames: [] });
assert.equal(ret.subject, "A shipment is on its way - Damaged items sent back - Main St Pharmacy");
assert.match(ret.text, /A shipment is on its way to you\./);
assert.match(ret.text, /About: Return - Damaged items sent back/);
assert.ok(!/Order:/.test(ret.text));

// ready to send?
assert.ok(emailReadiness({ to: "a@b.com", boxCount: 1, emailStatus: null }).ready);
assert.ok(!emailReadiness({ to: "a@b.com", boxCount: 0, emailStatus: null }).ready);
assert.ok(!emailReadiness({ to: "nope", boxCount: 1, emailStatus: null }).ready);
assert.ok(!emailReadiness({ to: "a@b.com", boxCount: 1, emailStatus: "SENT" }).ready);
assert.ok(!emailReadiness({ to: "a@b.com", boxCount: 1, emailStatus: "SENDING" }).ready);

// attachments within the mail limits
const files = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, filename: `f${i}.jpg`, sizeBytes: 100, attach: i !== 3 }));
const p = pickAttachments(files);
assert.equal(p.use.length, MAX_EMAIL_FILES);
assert.ok(!p.use.includes("f3") && p.left.length === 1);
assert.equal(pickAttachments([{ id: "a", filename: "a.pdf", sizeBytes: 5 * 1024 * 1024, attach: true }, { id: "b", filename: "b.pdf", sizeBytes: 5 * 1024 * 1024, attach: true }]).left[0], "b.pdf");

// addresses
assert.deepEqual(parseUsAddress("123 Main St, Suite 4, Austin, TX 78701"), { street1: "123 Main St", street2: "Suite 4", city: "Austin", state: "TX", zip: "78701" });
assert.deepEqual(parseUsAddress("500 Elm Ave\nDallas, Texas 75001-1234\nUSA"), { street1: "500 Elm Ave", street2: null, city: "Dallas", state: "TX", zip: "75001-1234" });
assert.deepEqual(parseUsAddress("9 Oak Rd Plano TX 75074"), { street1: "9 Oak Rd", street2: null, city: "Plano", state: "TX", zip: "75074" });
assert.deepEqual(parseUsAddress("1 Broadway, New York, New York 10004"), { street1: "1 Broadway", street2: null, city: "New York", state: "NY", zip: "10004" });
assert.equal(parseUsAddress("somewhere nice"), null);
assert.equal(parseUsAddress(""), null);
assert.equal(parseUsAddress(null), null);
assert.equal(stateCode("texas"), "TX");
assert.equal(stateCode("tx."), "TX");
assert.equal(stateCode("ZZ"), null);
assert.ok(addressReady({ name: "A", street1: "1 Main", city: "Austin", state: "tx", zip: "78701" }));
assert.ok(!addressReady({ name: "A", street1: "1 Main", city: "Austin", state: "tx", zip: "7870" }));
assert.match(addressProblems({ name: "", company: "", street1: "", city: "", state: "", zip: "" })[0], /name.*street.*city.*state.*ZIP/);
assert.deepEqual(addressLines({ company: "Main St Pharmacy", name: "Dana", street1: "1 Main", city: "Austin", state: "texas", zip: "78701" }), ["Main St Pharmacy", "Dana", "1 Main", "Austin, TX 78701"]);
const c = cleanAddress({ name: "  Dana   Lee ", street1: " 1 Main ", city: "Austin", state: "texas", zip: "78701", country: "us", email: " " });
assert.equal(c.name, "Dana Lee");
assert.equal(c.state, "TX");
assert.equal(c.country, "US");
assert.equal(c.email, null);
assert.equal(kindLabel("BUYER", "Pharmacies"), "Pharmacies");
assert.equal(kindOne("BUYER", "Pharmacies"), "Pharmacy");
assert.equal(kindLabel("SUPPLIER"), "Suppliers");

// the box
assert.ok(checkParcel({ lengthIn: "12", widthIn: "9", heightIn: "6", weightLb: "2.5" }).ok);
assert.ok(!checkParcel({ lengthIn: "0", widthIn: "9", heightIn: "6", weightLb: "2" }).ok);
assert.ok(!checkParcel({ lengthIn: "abc", widthIn: "9", heightIn: "6", weightLb: "2" }).ok);
assert.ok(!checkParcel({ lengthIn: "61", widthIn: "9", heightIn: "6", weightLb: "2" }).ok);
assert.ok(!checkParcel({ lengthIn: "12", widthIn: "9", heightIn: "6", weightLb: "71" }).ok);

// bringing contacts over
const t = "2026-01-01";
const cand = candidatesFrom({
  buyers: [{ id: "b1", organizationId: "o", companyName: "Main St Pharmacy", contactName: "Dana", email: "d@x.com", phone: "555", billingAddress: null, shippingAddress: "1 Main St, Austin, TX 78701", paymentTerms: null, taxInfo: null, taxExempt: false, defaultNotes: null, ncpdp: null, npi: null, active: true, createdAt: t, updatedAt: t }],
  sellers: [{ id: "c1", organizationId: "o", firstName: "Sam", lastName: "Lee", customerReferenceNumber: null, email: null, phone: null, addressStreet1: "2 Oak", addressStreet2: null, addressCity: "Plano", addressState: "TX", addressZip: "75074", addressCountry: "US", isResidential: true, notes: null, active: true, archivedAt: null, createdAt: t, updatedAt: t }],
  suppliers: [{ id: "s1", organizationId: "o", name: "Big Wholesale", contactName: null, email: null, phone: null, address: "somewhere without a zip", licenseNumber: null, licenseExpires: null, notes: null, archivedAt: null, createdAt: t, updatedAt: t }],
});
assert.equal(cand.length, 3);
assert.deepEqual([cand[0].values.kind, cand[0].values.company, cand[0].values.name, cand[0].values.city, cand[0].values.zip], ["BUYER", "Main St Pharmacy", "Dana", "Austin", "78701"]);
assert.deepEqual([cand[1].values.kind, cand[1].values.name, cand[1].values.isResidential, cand[1].values.zip], ["SELLER", "Sam Lee", true, "75074"]);
assert.equal(cand[2].values.kind, "SUPPLIER");
assert.equal(cand[2].values.street1, null, "an address that can't be read is kept as a note, not guessed");
assert.equal(cand[2].values.notes, "somewhere without a zip");

console.log("shipping rules: ok");
