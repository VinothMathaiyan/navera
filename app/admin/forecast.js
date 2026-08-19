// Production forecast maths, kept out of the dashboard component on purpose:
// these numbers decide how much milk gets bought and how many lemons get cut,
// so they need to be readable and testable on their own rather than buried in
// a useMemo next to the JSX.
//
// Everything here is derived from `settings` — litres per kg and lemons per
// litre are both admin-editable rows, never constants in the code. The
// fallbacks below exist only so a missing column can't render NaN on a kitchen
// screen at 5 a.m.; they are not the source of truth.
//
// THE COUNTING RULE lives here, and here only:
//
//   still to make   = status 'confirmed'
//   already handled = 'preparing' | 'dispatched' | 'delivered'
//   excluded        = 'cancelled'
//
// Milk, lemons, paneer and pack counts are computed from STILL TO MAKE alone.
// A figure that silently includes finished batches is worse than no figure,
// because it looks authoritative while telling Gowri to buy the same milk
// twice — which is exactly what the dashboard did until 2026-08-19, when it
// asked for 10.2 litres for a batch that had already been dispatched.
//
// The rule sits in this module rather than in each screen because it used to
// sit in neither: the production tab filtered, the dashboard did not, and both
// called this file, so the maths agreed while the inputs did not. Any screen
// that wants these numbers passes its orders in RAW — cancelled ones included —
// and reads the fields below. Do not filter by status before calling in, and do
// not re-implement the predicates at a call site.

export const DEFAULT_LITRES_PER_KG = 0;
export const DEFAULT_LEMONS_PER_LITRE = 1;

export const CANCELLED = "cancelled";

export const isCancelled = (o) => o.status === CANCELLED;
export const isToMake = (o) => o.status === "confirmed";
export const isDone = (o) =>
  o.status === "preparing" || o.status === "dispatched" || o.status === "delivered";

// The arithmetic for one set of orders. Private: callers get it through
// computeForecast, which decides which orders belong in the set.
function tally(orders, settings) {
  const bySize = new Map();
  let grams = 0;
  let packs = 0;

  for (const order of orders) {
    for (const item of order.items ?? []) {
      const qty = Number(item.quantity) || 0;
      bySize.set(item.weight_grams, (bySize.get(item.weight_grams) ?? 0) + qty);
      grams += Number(item.weight_grams) * qty;
      packs += qty;
    }
  }

  const kg = grams / 1000;
  const perKg = Number(settings?.litres_per_kg ?? DEFAULT_LITRES_PER_KG) || 0;
  const litres = kg * perKg;

  // Always round UP to a whole lemon. Founder's call, from a real batch: five
  // lemons did not set 8.5 L, seven to eight did. One-per-litre rounded up puts
  // 8.5 L at nine — deliberately a little over. Short fails the batch; over
  // costs a few rupees. Do not "improve" this to Math.round.
  const perLitre =
    Number(settings?.lemons_per_litre ?? DEFAULT_LEMONS_PER_LITRE) ||
    DEFAULT_LEMONS_PER_LITRE;
  const lemons = litres > 0 ? Math.ceil(litres * perLitre) : 0;

  return {
    bySize: [...bySize.entries()].sort((a, b) => a[0] - b[0]),
    kg,
    packs,
    // The exact figure, kept because kg × yield is what the arithmetic
    // produces and a test should be able to see it. It is NOT what any screen
    // shows — see `milk`.
    litres,
    // What Gowri actually buys, and the only milk figure any screen may
    // render. Whole litres, always up: you cannot buy 0.2 of a litre, and a
    // dashboard reading 10.2 next to a production tab reading 11 for the same
    // evening is two numbers for one purchase.
    milk: Math.ceil(litres),
    lemons,
    perKg,
    perLitre,
  };
}

export function computeForecast(orders, settings) {
  const all = orders ?? [];
  const live = all.filter((o) => !isCancelled(o));
  const toMake = live.filter(isToMake);
  const done = live.filter(isDone);

  return {
    // The headline figures — still to make, i.e. what has yet to be bought for.
    ...tally(toMake, settings),

    // The same arithmetic over every live order, finished ones included. Only
    // for a screen that labels it as such; it is never the purchasing number.
    gross: tally(live, settings),

    orderCount: live.length, // cancelled excluded, as the counts always were
    toMakeCount: toMake.length,
    doneCount: done.length,
    cancelled: all.length - live.length,
  };
}
