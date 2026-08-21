// Payment tracking and sample orders: the money maths, kept out of the
// dashboard component for the same reason forecast.js is — these numbers get
// read off a screen and acted on, so they need to be testable without
// rendering anything.
//
// TWO INDEPENDENT AXES, and keeping them apart is the point:
//
//   order_type      what the order IS      — 'sale' | 'sample'
//   payment_status  where the money IS     — 'pending' | 'paid' | 'not_applicable'
//
// A sample is free by definition, so the database forces it to
// 'not_applicable' and a total of 0 (see the orders_payment_normalise trigger
// and the orders_sample_is_free_check constraint). Nothing here has to defend
// against a chargeable sample; it cannot exist.
//
// THE BUG THIS FIXES. The Excel tracker divided sales revenue by ALL paneer
// made, samples included, and so understated the blended price per kg by
// around 30%. Free paneer in the denominator makes every kilo look cheaper
// than it was sold for. Samples are an acquisition cost, not a discount on
// revenue, so they are reported as their own figure and never netted into
// either side of the price. That separation is the whole reason this module
// exists — do not "simplify" it by folding sample grams back into paneer sold.
//
// Pass orders in RAW, cancelled ones included, exactly as forecast.js takes
// them. The filters live here so no call site can disagree about them.

export const SALE = "sale";
export const SAMPLE = "sample";

export const PENDING = "pending";
export const PAID = "paid";
export const NOT_APPLICABLE = "not_applicable";

export const PAYMENT_METHODS = ["cash", "upi"];
export const METHOD_LABEL = { cash: "Cash", upi: "UPI" };

// order_type defaults to 'sale' in the database and is NOT NULL, so an order
// that isn't explicitly a sample is a sale. Written this way round so a row
// read before the column existed — or a select that forgot to ask for it —
// counts as a sale rather than vanishing from revenue.
export const isSample = (o) => o?.order_type === SAMPLE;
export const isSale = (o) => !isSample(o);

export const isCancelled = (o) => o?.status === "cancelled";
export const isPaid = (o) => o?.payment_status === PAID;
// A sample is never "unpaid" — there is nothing to collect. The database says
// so with 'not_applicable', and this predicate simply reads it.
export const isPending = (o) => o?.payment_status === PENDING;

const num = (v) => Number(v) || 0; // PostgREST hands numerics back as strings

export function orderGrams(order) {
  let grams = 0;
  for (const item of order?.items ?? []) {
    grams += num(item.weight_grams) * num(item.quantity);
  }
  return grams;
}

// What the paneer in this order would have sold for at list price. For a sale
// that is simply its subtotal; for a sample it is the acquisition cost, which
// is why it is read from the items rather than from total (forced to 0) —
// subtotal is kept in step by manual entry, but the items are the fact.
export function orderListValue(order) {
  const items = order?.items ?? [];
  if (items.length === 0) return num(order?.subtotal);
  let value = 0;
  for (const item of items) value += num(item.unit_price) * num(item.quantity);
  return value;
}

/* ---------------------------------------------------------------- dates */

// Calendar-day arithmetic on plain YYYY-MM-DD strings, never Date objects
// crossing a timezone — same rule the rest of the admin follows, so an age
// can't come out a day wrong because the laptop is not in Chennai.
export function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

// How long an order has been waiting for its money, counted from the day it
// was due to be delivered rather than from when it was placed: an order for
// next Sunday is not overdue today. Negative means not due yet, 0 means due
// today, and the caller decides how to say that.
export function pendingDays(order, todayISO) {
  if (!isPending(order)) return null;
  return daysBetween(order?.delivery_date, todayISO);
}

/* ------------------------------------------------------------- the maths */

export function computeMoney(orders, todayISO) {
  const live = (orders ?? []).filter((o) => !isCancelled(o));
  const sales = live.filter(isSale);
  const samples = live.filter(isSample);

  const paid = sales.filter(isPaid);
  const pending = sales.filter(isPending);

  // Money that has actually arrived. Not billings, not the order book.
  const revenue = paid.reduce((sum, o) => sum + num(o.total), 0);

  // Every gram sold, paid for or not — and NOT one gram given away. This is
  // the denominator the Excel tracker got wrong.
  const gramsSold = sales.reduce((sum, o) => sum + orderGrams(o), 0);
  const kgSold = gramsSold / 1000;

  const outstanding = pending.reduce((sum, o) => sum + num(o.total), 0);

  // The oldest unpaid order, by delivery day. Only orders whose delivery day
  // has arrived can be old: one for next week is waiting, not overdue.
  let oldest = null;
  for (const order of pending) {
    const days = pendingDays(order, todayISO);
    if (days === null || days < 0) continue;
    if (!oldest || days > oldest.days) {
      oldest = { days, reference: order.reference, id: order.id };
    }
  }

  const sampleGrams = samples.reduce((sum, o) => sum + orderGrams(o), 0);
  const sampleValue = samples.reduce((sum, o) => sum + orderListValue(o), 0);

  return {
    revenue,
    paidCount: paid.length,

    outstanding,
    pendingCount: pending.length,
    oldestPending: oldest, // { days, reference, id } or null

    gramsSold,
    kgSold,
    // Revenue actually collected per kilo actually sold. Samples are in
    // neither term.
    //
    // Null, not a number, until BOTH terms exist. kgSold > 0 alone is not
    // enough: paneer sold but not yet paid for makes the numerator 0 and
    // renders "₹0 per kg", which reads as "we sell paneer for nothing"
    // rather than "nobody has paid yet". A screen that has no answer must
    // say so. Do not relax this to kgSold > 0.
    //
    // Note the asymmetry this leaves, which is deliberate and specified:
    // the numerator counts only money collected while the denominator counts
    // every gram sold, so while there is money outstanding this figure runs
    // low and catches up as the money arrives. The outstanding total sits
    // directly above it on the dashboard for exactly that reason.
    blendedPerKg: kgSold > 0 && paid.length > 0 ? revenue / kgSold : null,

    samplesGiven: samples.length,
    sampleGrams,
    // Reported beside revenue, never inside it: this is what the samples cost
    // us at list price, i.e. an acquisition spend.
    sampleValue,

    saleCount: sales.length,
  };
}
