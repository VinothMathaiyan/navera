// Production forecast maths, kept out of the dashboard component on purpose:
// these numbers decide how much milk gets bought and how many lemons get cut,
// so they need to be readable and testable on their own rather than buried in
// a useMemo next to the JSX.
//
// Everything here is derived from `settings` — litres per kg and lemons per
// litre are both admin-editable rows, never constants in the code. The
// fallbacks below exist only so a missing column can't render NaN on a kitchen
// screen at 5 a.m.; they are not the source of truth.

export const DEFAULT_LITRES_PER_KG = 0;
export const DEFAULT_LEMONS_PER_LITRE = 1;

export function computeForecast(orders, settings) {
  const all = orders ?? [];
  // A cancelled order must not pull milk into the forecast.
  const live = all.filter((o) => o.status !== "cancelled");

  const bySize = new Map();
  let grams = 0;
  let packs = 0;

  for (const order of live) {
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
    litres,
    lemons,
    perKg,
    perLitre,
    orderCount: live.length,
    cancelled: all.length - live.length,
  };
}
