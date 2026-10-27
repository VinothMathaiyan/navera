// Unique-customer counting, kept out of the screens for the same reason
// forecast.js and payments.js are: it is a number read off a screen and acted
// on, and three screens show it, so there has to be exactly one definition.
//
// A "unique customer" is a distinct person who appears on at least one of the
// orders handed in — not a count of orders, and not a count of rows in the
// `customers` table (which also holds anyone whose only order was later
// deleted). The count therefore always describes the list it is derived from:
// pass it the orders a screen is showing and it answers "how many different
// people are in what I am looking at".
//
// Pass orders in RAW, exactly as they are shown. Cancelled orders and samples
// are NOT filtered out here: the order count beside this figure includes them,
// and a customers figure that silently disagreed with the orders figure next to
// it would be the same trap the two production screens fell into on
// 2026-08-19 (one rule, two call sites quietly differing). If the business ever
// wants "customers excluding cancelled", change it here and every screen
// follows.
//
// Identity is the customer's id, with phone as the fallback for a row that was
// read without one. Phone is unique in `customers` (it is the identity — see
// CLAUDE.md), so either key names the same person.

export function customerKey(order) {
  const c = order?.customer;
  if (!c) return null;
  return c.id ?? c.phone ?? null;
}

export function countUniqueCustomers(orders) {
  const seen = new Set();
  for (const o of orders ?? []) {
    const key = customerKey(o);
    // An order with no resolvable customer cannot be attributed to anyone, so
    // it adds nothing rather than inventing a person.
    if (key !== null) seen.add(key);
  }
  return seen.size;
}
