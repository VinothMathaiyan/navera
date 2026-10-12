// Which price a customer pays for a pack.
//
// Two prices per pack, both on the `products` row:
//
//   price             what everyone pays — the order page, WhatsApp orders for
//                     customers not flagged, anyone typing a phone number into
//                     the public form
//   subscriber_price  what customers flagged is_subscriber pay when the order
//                     is entered here in the admin. Null means no special
//                     price for that pack, so the standard one applies.
//
// THE SUBSCRIBER PRICE IS NEVER OFFERED ON THE PUBLIC ORDER PAGE, and that is
// on purpose rather than something left to build. A phone number typed into a
// public form is not proof of who is typing it, so "show the lower price when
// the number belongs to a subscriber" would let anyone find out who is a
// subscriber and claim the discount. The database holds the same line:
// place_order only applies subscriber_price to a signed-in admin session, never
// to the anon role, whatever p_source says.
//
// Kept in its own module, like forecast.js and payments.js, so the rule that
// decides what a customer is charged can be run without rendering a screen.

export function unitPrice(product, isSubscriber) {
  const standard = Number(product.price);
  if (!isSubscriber) return standard;

  const sub = product.subscriber_price;
  // PostgREST hands numerics back as strings, and null for "no special price".
  if (sub === null || sub === undefined || sub === "") return standard;

  const n = Number(sub);
  return Number.isFinite(n) && n >= 0 ? n : standard;
}

// True when this pack really is cheaper for a subscriber, so a screen only
// mentions a subscriber price where there is one to mention.
export function hasSubscriberPrice(product) {
  return unitPrice(product, true) !== Number(product.price);
}
