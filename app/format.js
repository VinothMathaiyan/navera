// Date and money formatting shared by the order page and the private
// /my/<token> page. Pulled out of OrderFlow.js when the confirmation moved to
// its own route: the two screens quote the same order back to the same person
// minutes apart, so they must not drift in how they write a date or a pack.

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const MON = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Plain YYYY-MM-DD in, local Date out. Never `new Date(iso)`, which parses a
// bare date as UTC and lands on the previous day for anyone west of Greenwich.
export const parseDate = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

export const shiftDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

// "Sunday, 16 Aug"
export const longDate = (d) => `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;

// "Sun, 16 Aug"
export const shortDate = (d) => `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;

// get_ordering_info formats the cutoff with to_char(...'HH12:MI AM'), which
// pads to "06:00 PM". Nobody writes the hour that way.
export const clock = (t) => (t ?? "").replace(/^0/, "");

/* One way of writing an order out in words — "1 × 500g, 2 × 200g", biggest pack
   first, the way you'd say it aloud. Used by the live summary, the confirmation
   and the WhatsApp messages so all of them always agree.

   Takes rows that already carry their own weight, which is what both
   order_items and get_my_orders hand back. The order page's own form state does
   not, so it resolves products to weights first — see packBreakdown there. */
export function packLine(items, sep = " × ") {
  return (items ?? [])
    .map((i) => ({ grams: Number(i.weight_grams), qty: Number(i.quantity) }))
    .filter((i) => i.grams > 0 && i.qty > 0)
    .sort((a, b) => b.grams - a.grams)
    .map((i) => `${i.qty}${sep}${i.grams}g`)
    .join(", ");
}
