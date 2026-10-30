// Customer-level figures for the admin's Customers view: one row per phone
// number, built from the same order rows the All Orders tab already holds.
//
// Pulled out of the component for the same reason forecast.js is — the numbers
// that say who has converted and who has gone quiet should be checkable
// without rendering anything. Pure functions, no imports, no clock: "today" is
// always passed in, resolved through settings.timezone by the caller.
//
// RULES THIS MODULE HOLDS (each was a decision, not a default):
//
//  * Samples and sales are never blended. Every pack count, order count and
//    date is kept as a separate sample / sale value from the order up.
//  * Unique customer = phone number. customers.phone is unique in the database,
//    so for every saved customer this is the same thing as name + flat + phone
//    together; a name on its own is NEVER an identity. Two people called
//    Aishwarya on different phones (F304 and F301) are two rows and stay two
//    rows. If one phone shows up under more than one name it is FLAGGED, never
//    merged.
//  * Cancelled orders are left out of every count and every date. They are a
//    record of something that did not happen.
//  * Dates are the order's delivery_date, a plain YYYY-MM-DD calendar string,
//    compared as strings and subtracted as UTC day numbers. Never `new
//    Date(iso)` against the local zone, which can slide a day.
//  * "Paid order" means an order tagged Sale, as the business reckons it. It is
//    NOT filtered on payment_status: a delivered sale still marked 'pending' is
//    a sale. Payment is tracked on the All Orders tab, not here.
//  * Pack sizes are whatever the data contains. Nothing here lists 100 / 200 /
//    500, so a new pack appears as a new column group with no code change.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dayNum = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const validDate = (s) => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(dayNum(s));

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const cmpStr = (a, b) => {
  const x = String(a ?? "").toLowerCase();
  const y = String(b ?? "").toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/* ------------------------------------------------ recency buckets */

// Exclusive bands, counted in days from the last SALE to today. "never" is its
// own bucket for anyone with no sale at all — a sample-only customer is not
// "new" and not "lapsed", they simply have not bought yet.
export const BUCKETS = [
  { id: "d30", label: "Last 30 days", short: "0–30 days" },
  { id: "d60", label: "31–60 days", short: "31–60 days" },
  { id: "d90", label: "61–90 days", short: "61–90 days" },
  { id: "lapsed", label: "Lapsed (over 90 days)", short: "Lapsed (90+ days)" },
  { id: "never", label: "Never purchased", short: "Never purchased" },
];

export function bucketFor(lastSale, daysSince) {
  if (lastSale === null) return "never";
  return daysSince <= 30 ? "d30" : daysSince <= 60 ? "d60" : daysSince <= 90 ? "d90" : "lapsed";
}

/* ------------------------------------------------ the model */

/**
 * @param orders  rows as AdminDashboard's ALL_ORDERS_SELECT returns them:
 *   { id, reference, delivery_date, status, order_type, payment_status,
 *     delivery_name, delivery_area_id,
 *     customer: { name, phone, area: { name } },
 *     items: [{ quantity, weight_grams }] }
 * @param opts.areaNames  { [delivery_area_id]: name } — for the community an
 *   order was placed under, which can differ from the customer's saved one.
 * @param opts.today      YYYY-MM-DD in the business's timezone.
 */
export function buildCustomerModel(orders, { areaNames = {}, today } = {}) {
  const todayN = dayNum(today);
  const badDates = [];

  const all = (orders ?? []).map((o) => {
    const date = o.delivery_date;
    if (!validDate(date)) badDates.push(o.reference ?? o.id);
    return {
      id: o.id,
      ref: o.reference ?? String(o.id),
      phone: o.customer?.phone ? String(o.customer.phone) : null,
      customerName: o.customer?.name ?? null,
      customerArea: o.customer?.area?.name ?? null,
      orderArea: o.delivery_area_id ? areaNames[o.delivery_area_id] ?? null : null,
      orderName: o.delivery_name ?? null,
      type: o.order_type === "sample" ? "sample" : "sale",
      status: o.status,
      pay: o.payment_status,
      date: validDate(date) ? date : null,
      items: (o.items ?? [])
        .map((i) => ({ grams: Number(i.weight_grams), qty: Number(i.quantity) }))
        .filter((i) => i.grams > 0 && i.qty > 0),
    };
  });

  const active = all.filter((o) => o.status !== "cancelled");
  const sizes = [...new Set(active.flatMap((o) => o.items.map((i) => i.grams)))].sort((a, b) => a - b);

  // Group by phone. An order with no customer cannot be attributed to anyone,
  // so it stays its own "customer" rather than vanishing from the counts.
  const people = new Map();
  for (const o of all) {
    const key = o.phone ?? `order:${o.id}`;
    if (!people.has(key)) {
      people.set(key, { key, phone: o.phone ?? "—", name: o.customerName ?? "(no name)", customerArea: o.customerArea, names: new Map(), orders: [] });
    }
    const p = people.get(key);
    for (const n of [o.customerName, o.orderName]) {
      if (n && norm(n) && !p.names.has(norm(n))) p.names.set(norm(n), n.trim());
    }
    if (!p.customerArea && o.customerArea) p.customerArea = o.customerArea;
    p.orders.push(o);
  }

  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
  const rows = [];

  for (const p of people.values()) {
    const mine = p.orders.filter((o) => o.status !== "cancelled");
    const dated = mine.filter((o) => o.date !== null).sort(byDate);

    const bySize = {};
    sizes.forEach((g) => { bySize[g] = { sample: 0, sale: 0 }; });
    for (const o of mine) for (const i of o.items) bySize[i.grams][o.type] += i.qty;

    const samples = mine.filter((o) => o.type === "sample");
    const sales = mine.filter((o) => o.type === "sale");
    const dateOf = (list) => list.filter((o) => o.date !== null).map((o) => o.date);
    const lo = (a) => (a.length ? a.reduce((x, y) => (x < y ? x : y)) : null);
    const hi = (a) => (a.length ? a.reduce((x, y) => (x > y ? x : y)) : null);

    const firstSample = lo(dateOf(samples));
    const firstSale = lo(dateOf(sales));
    const lastSale = hi(dateOf(sales));
    const lastActivity = hi(dateOf(mine));
    // Floored at 0: an order dated after "today" is an upcoming delivery, and
    // it must not read as "-3 days since last purchase".
    const daysSince = lastSale === null ? null : Math.max(0, todayN - dayNum(lastSale));

    const packsSample = sizes.reduce((t, g) => t + bySize[g].sample, 0);
    const packsSale = sizes.reduce((t, g) => t + bySize[g].sale, 0);

    // Community the customer actually received at: the latest order's own
    // community if it carries one, else the saved customer record's.
    const latest = dated[dated.length - 1];
    const communityOf = (o) => o.orderArea ?? p.customerArea;
    const communities = new Set(mine.map(communityOf).filter(Boolean));
    const community = (latest && communityOf(latest)) || p.customerArea || "(none)";

    const flags = [];
    if (p.names.size > 1) {
      flags.push({ code: "multi_name", sev: "warn", label: "Two names", detail: `This phone appears under: ${[...p.names.values()].join(" / ")}. Not merged.` });
    }
    if (firstSale && firstSample && firstSale < firstSample) {
      flags.push({ code: "sale_before_sample", sev: "crit", label: "Sale before sample", detail: `First paid order (${firstSale}) is earlier than first sample (${firstSample}).` });
    }
    if (communities.size > 1) {
      flags.push({ code: "multi_community", sev: "warn", label: "Two communities", detail: `Orders list: ${[...communities].join(" / ")}. Showing the latest.` });
    }
    if (mine.length === 0) {
      flags.push({ code: "cancelled_only", sev: "warn", label: "All orders cancelled", detail: "Every order for this phone is cancelled." });
    }

    rows.push({
      key: p.key,
      phone: p.phone,
      name: p.name,
      community,
      bySize,
      packsSample,
      packsSale,
      packsTotal: packsSample + packsSale,
      orders: mine.length,
      sampleOrders: samples.length,
      paidOrders: sales.length,
      firstSample,
      firstSale,
      lastSale,
      daysSince,
      lastActivity,
      // Received a sample, no paid sale. Not a column any more; it drives the
      // "Sample only" filter, which is the list of who has not bought yet.
      sampleOnly: samples.length > 0 && sales.length === 0,
      flags,
      bucket: bucketFor(lastSale, daysSince),
    });
  }

  // Whole-dataset notes. These do not follow the table's filters.
  //
  // Only things that are WRONG when they appear, so the notes stay empty on a
  // healthy day: a phone under two names, a sale dated before its sample, an
  // unreadable date. Counts that are true of any working week (unpaid sales,
  // orders dated for an upcoming delivery, older orders not yet closed, two
  // customers sharing a name) were reviewed on 2026-10-30 and taken out — they
  // would otherwise sit there permanently and teach the reader to ignore the box.
  const hasFlag = (r, code) => r.flags.some((f) => f.code === code);

  const notes = {
    cancelled: all.length - active.length,
    multiName: rows.filter((r) => hasFlag(r, "multi_name")).map((r) => ({ phone: r.phone, text: r.flags.find((f) => f.code === "multi_name").detail })),
    anomalies: rows.filter((r) => hasFlag(r, "sale_before_sample")),
    badDates,
  };

  return { rows, sizes, notes, orderCount: active.length };
}

/* ------------------------------------------------ filters */

export const DEFAULT_FILTERS = { community: "all", size: "all", type: "all", bucket: "all" };

// Pack size and order type are ONE question, not two: "100g + sale" means a
// customer who bought 100g, not one who sampled 100g and bought something
// else. So they are resolved together against the per-size counts.
export function matchesFilters(r, f) {
  if (f.community !== "all" && r.community !== f.community) return false;
  if (f.bucket !== "all" && r.bucket !== f.bucket) return false;
  const sz = f.size === "all" ? null : Number(f.size);
  const packs = (t) => (sz === null ? (t === "sample" ? r.packsSample : r.packsSale) : r.bySize[sz]?.[t] ?? 0);
  switch (f.type) {
    case "sample": return packs("sample") > 0;
    case "sale": return packs("sale") > 0;
    case "sampleonly": return r.sampleOnly && packs("sample") > 0;
    default: return sz === null ? true : packs("sample") + packs("sale") > 0;
  }
}

/* ------------------------------------------------ summary and charts */

export function summarize(rows, sizes) {
  const s = { customers: rows.length, ordSample: 0, ordSale: 0, packSample: 0, packSale: 0, bySize: {} };
  sizes.forEach((g) => { s.bySize[g] = { sample: 0, sale: 0 }; });
  for (const r of rows) {
    s.ordSample += r.sampleOrders;
    s.ordSale += r.paidOrders;
    s.packSample += r.packsSample;
    s.packSale += r.packsSale;
    for (const g of sizes) {
      if (r.bySize[g].sample > 0) s.bySize[g].sample++;
      if (r.bySize[g].sale > 0) s.bySize[g].sale++;
    }
  }
  return s;
}

export function frequencyCounts(rows) {
  const out = { one: 0, two: 0, threePlus: 0, none: 0 };
  for (const r of rows) {
    if (r.paidOrders === 0) out.none++;
    else if (r.paidOrders === 1) out.one++;
    else if (r.paidOrders === 2) out.two++;
    else out.threePlus++;
  }
  return out;
}

export function bucketCounts(rows) {
  const out = {};
  BUCKETS.forEach((b) => { out[b.id] = 0; });
  rows.forEach((r) => { out[r.bucket]++; });
  return out;
}

export function topByPaidPacks(rows, n = 10) {
  return rows
    .filter((r) => r.packsSale > 0)
    .sort((a, b) => b.packsSale - a.packsSale || cmpStr(a.name, b.name) || cmpStr(a.phone, b.phone))
    .slice(0, n);
}

/* ------------------------------------------------ sorting */

// Sort keys: any row field, and "s:<grams>:sample" / "s:<grams>:sale" for a
// pack column. Blank values (no sale yet, no sample, ...) ALWAYS
// sort to the bottom whichever way the column is turned, so a customer who has
// never purchased is grouped at the end and never mistaken for a new one.
export function sortValue(r, key) {
  if (key.startsWith("s:")) {
    const [, g, t] = key.split(":");
    return r.bySize[g]?.[t] ?? 0;
  }
  const v = r[key];
  return v === undefined ? null : v;
}

export function sortRows(rows, key = "lastSale", dir = "desc") {
  // Ties fall to the most recent activity, then name, then phone: stable and
  // deterministic, and it keeps sample-only customers in the order a person
  // would expect (latest sample first) inside their blank group.
  const tie = (a, b) => cmpStr(b.lastActivity ?? "", a.lastActivity ?? "") || cmpStr(a.name, b.name) || cmpStr(a.phone, b.phone);
  return rows.slice().sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const na = va === null;
    const nb = vb === null;
    if (na || nb) return na && nb ? tie(a, b) : na ? 1 : -1;
    const c = typeof va === "string" ? cmpStr(va, vb) : va - vb;
    return c ? (dir === "asc" ? c : -c) : tie(a, b);
  });
}
