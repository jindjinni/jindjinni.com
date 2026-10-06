// Back-tracing: from a lot or serial number (or a product) to the customers who sent it. Groups tracker lines by customer so
// that, when a recall comes out, the answer to "who do we call?" is one short list with contact details and what each
// customer sent. Pure function.

type TraceLot = { lot: string; productName: string; quantity: number; day: string; orderNumber: string; customer: string; customerEmail: string | null; customerPhone: string | null };
type TraceSerial = { serial: string; lot: string | null; productName: string; day: string; orderNumber: string; customer: string; customerEmail: string | null; customerPhone: string | null };

export type TraceCustomer = {
  customer: string;
  email: string | null;
  phone: string | null;
  orders: string[];
  firstDay: string;
  lastDay: string;
  lots: { lot: string; productName: string; units: number }[];
  serials: { serial: string; productName: string }[];
  units: number;
};

export function traceByCustomer(lots: TraceLot[], serials: TraceSerial[]): TraceCustomer[] {
  const map = new Map<string, TraceCustomer>();
  const get = (name: string, email: string | null, phone: string | null) => {
    const key = `${name.trim().toLowerCase()}|${(email ?? "").trim().toLowerCase()}`;
    let c = map.get(key);
    if (!c) map.set(key, (c = { customer: name.trim() || "Unknown customer", email: email || null, phone: phone || null, orders: [], firstDay: "", lastDay: "", lots: [], serials: [], units: 0 }));
    if (!c.phone && phone) c.phone = phone;
    return c;
  };
  const touch = (c: TraceCustomer, day: string, order: string) => {
    if (order && !c.orders.includes(order)) c.orders.push(order);
    if (day && (!c.firstDay || day < c.firstDay)) c.firstDay = day;
    if (day && day > c.lastDay) c.lastDay = day;
  };
  for (const l of lots) {
    const c = get(l.customer, l.customerEmail, l.customerPhone);
    touch(c, l.day, l.orderNumber);
    const hit = c.lots.find((x) => x.lot.toLowerCase() === l.lot.toLowerCase() && x.productName === l.productName);
    if (hit) hit.units += l.quantity;
    else c.lots.push({ lot: l.lot, productName: l.productName, units: l.quantity });
    c.units += l.quantity;
  }
  for (const s of serials) {
    const c = get(s.customer, s.customerEmail, s.customerPhone);
    touch(c, s.day, s.orderNumber);
    c.serials.push({ serial: s.serial, productName: s.productName });
  }
  return [...map.values()].sort((a, b) => b.units + b.serials.length - (a.units + a.serials.length) || a.customer.localeCompare(b.customer));
}
