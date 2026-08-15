// Seven-day production summary. Pure maths, no React, so the numbers Gowri
// buys milk against can be tested on their own.
//
// Named with a hyphen rather than `production.js` on purpose: the component
// next to it is `Production.js`, and Windows filesystems are case-insensitive,
// so those two would be the same file.
//
// THE COUNTING RULE, which everything else depends on:
//   still to make   = status 'confirmed'
//   already handled = 'preparing' | 'dispatched' | 'delivered'
//   excluded        = 'cancelled'
// Milk and lemons are computed from STILL TO MAKE only. A gross figure that
// silently includes finished batches is worse than no figure, because it looks
// authoritative while telling her to buy the same milk twice.

import { computeForecast } from "./forecast";

// The order of orders.status, matching the CHECK constraint. 'cancelled' is
// deliberately not in this list — it is a departure from the flow, not a step
// along it, and is reached only through its own confirmed action.
export const STATUS_FLOW = ["confirmed", "preparing", "dispatched", "delivered"];
export const CANCELLED = "cancelled";

export const STATUS_LABEL = {
  confirmed: "Confirmed",
  preparing: "Preparing",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const isCancelled = (o) => o.status === CANCELLED;
export const isToMake = (o) => o.status === "confirmed";
export const isDone = (o) =>
  o.status === "preparing" || o.status === "dispatched" || o.status === "delivered";

export const nextStatus = (s) => {
  const i = STATUS_FLOW.indexOf(s);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
};
export const prevStatus = (s) => {
  const i = STATUS_FLOW.indexOf(s);
  return i > 0 ? STATUS_FLOW[i - 1] : null;
};

/* ---------------------------------------------- dates */

const parts = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// The next `count` delivery days, today included.
//
// Counted in DELIVERY days, not calendar days. A fixed seven-calendar-day
// window changed shape depending on which day it was opened — on a Saturday it
// covered one weekend run with the next one invisible, so a forward order on
// the following Sunday simply could not appear; on a Tuesday it covered a whole
// run with room to spare. An operational screen should look the same whenever
// it is opened.
//
// The delivery weekdays come from settings, and nothing here assumes how many
// there are per week: six dates are returned whether the business delivers on
// one day a week or on all seven.
//
// Days with no orders still get a row — a missing row reads exactly like a zero
// row, but hides the fact that the day was considered at all.
export function nextDeliveryDates(deliveryDays, fromISO, count = 6) {
  const set = new Set((deliveryDays ?? []).map(Number));
  const out = [];
  if (set.size === 0 || count <= 0) return out;

  const d = parts(fromISO);
  // A year of walking is far more than six deliveries can need — even at a
  // single delivery day a week that is 42 days — and it bounds the loop so a
  // bad settings row can never spin forever.
  for (let i = 0; i < 370 && out.length < count; i++) {
    if (set.has(d.getDay())) out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ---------------------------------------------- one day */

export function summariseDate(ordersForDate, settings) {
  const all = ordersForDate ?? [];
  const live = all.filter((o) => !isCancelled(o));
  const toMake = live.filter(isToMake);
  const done = live.filter(isDone);

  // Same arithmetic as the single-date forecast on the dashboard — the two
  // screens must never disagree about the same day, so there is one
  // implementation and only the set of orders fed into it differs.
  const f = computeForecast(toMake, settings);

  return {
    orders: live.length, // cancelled excluded from the headline count
    done: done.length,
    toMake: toMake.length,
    cancelled: all.length - live.length,
    kg: f.kg,
    litres: f.litres,
    // Whole units: you cannot buy 7.65 litres or 8.2 lemons. Always up.
    milk: Math.ceil(f.litres),
    lemons: f.lemons,
    bySize: f.bySize,
  };
}

/* ---------------------------------------------- the week */

export function buildProductionSummary(orders, settings, dates) {
  const rows = (dates ?? []).map((date) => ({
    date,
    ...summariseDate((orders ?? []).filter((o) => o.delivery_date === date), settings),
  }));

  // Milk and lemons total the per-day ROUNDED figures rather than rounding a
  // grand total: these are separate evening batches bought separately, so the
  // sum of what she actually buys is the honest number. kg stays exact.
  const totals = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      done: t.done + r.done,
      toMake: t.toMake + r.toMake,
      kg: t.kg + r.kg,
      milk: t.milk + r.milk,
      lemons: t.lemons + r.lemons,
    }),
    { orders: 0, done: 0, toMake: 0, kg: 0, milk: 0, lemons: 0 }
  );

  return { rows, totals };
}
