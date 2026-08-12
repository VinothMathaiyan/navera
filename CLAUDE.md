# Navera — Fresh Paneer Ordering Site

Read this before doing anything. It carries context from the build so far —
without it you'd be starting blind. `docs/NAVERA_WEBSITE_MASTER_SPEC.md` is
the full locked specification; this file is the working summary.

## What this is

A made-to-order fresh paneer business in Koliyanur, Viluppuram, delivering to
apartment communities in Chennai. Country cow milk + fresh lemon only — no
vinegar, no preservatives, no additives. Prepared after the order is placed,
not stocked. Operated by Gowri. FSSAI 22426358000260.

This repo is the customer-facing ordering site: Next.js (App Router), talking
directly to Supabase via two RPC functions, no ORM, no auth SDK on the public
side. Deployed on Vercel.

**Voice:** warm, honest, plain, never hyped. Canonical phrasing: "Prepared
after your order." Never use "Made to Order" or "Subscription" — the brand
says "Fresh Paneer, Every Week" instead of subscription.

## Division of labour (do not drift from this without asking)

- **Claude builds.** Stay within P0/P1 scope (see master spec §33) unless
  there's a stated business reason to go further.
- **Never change a locked business rule silently.** If a decision in the spec
  conflicts with what's being asked, say so — don't quietly resolve it.
- **Never claim a feature works until it has been tested** against the real
  database, not just "the code should do X."
- **No further planning/spec-revision rounds.** The 28-day plan is frozen.
  Build, or test with a real person. If asked to re-review the plan, say so
  and propose building instead.

## Supabase — already live, do not recreate

- Project: **Navera**, ref `vslcxoshqwlomdrdpmqx`, region `ap-south-1` (Mumbai)
- URL: `https://vslcxoshqwlomdrdpmqx.supabase.co`
- Publishable/anon key (safe to be public — RLS is what protects data, not
  key secrecy): `sb_publishable_af0TFU_gi3U84MgLIDhc3A_LEUlCVZV`
- These are already inlined as defaults in `lib/db.js`, so the site runs with
  no `.env` file required. Override with `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_KEY` if ever needed.
- If you have the Supabase MCP connector available in this session, it can
  reach this same project directly for schema work. If not, schema changes
  can also be made from the Claude.ai chat where this was built — that
  session has the connector configured.

### Schema (8 tables, RLS on all of them)

`settings` (single row — cutoff, delivery days, window, litres/kg, min order,
delivery charge — all admin-editable, never hardcode these), `delivery_areas`,
`products`, `customers` (phone is identity, `access_token` is the private
"My Navera" link — no passwords, no OTP), `orders` (NAV-001 style reference),
`order_items`, `subscriptions`, `subscription_skips`.

**RLS is deny-by-default.** Public (anon) role has zero direct read access to
customers, orders, order_items, subscriptions. It can only read `settings`,
active `delivery_areas`, active `products`. All public writes go through two
`SECURITY DEFINER` functions:

- `get_ordering_info()` — returns everything the order page needs: cutoff,
  delivery dates already computed server-side, areas, products, prices.
- `place_order(...)` — the only public write path. Validates phone format,
  recomputes the cutoff server-side (never trust a date from the browser),
  checks the area exists and is active, prices items from the `products`
  table (never from client input), creates/updates the customer by phone,
  creates the order and items, returns the reference + access_token.

**Keep this pattern for every future public-facing feature** (Order Again,
Change Tomorrow's Order, subscriptions, skip/pause): a narrow
`SECURITY DEFINER` function that does its own validation, never a direct
table grant to `anon`. This was tested against 7 refusal cases (bad phone,
empty name, past date, after-cutoff, unknown area, no items, missing flat)
plus a valid mixed-pack order — all passed before this was trusted.

## What's built (Days 1–2 of 28)

- **Day 1:** schema, RLS, seed data, security advisor scan clean.
- **Day 2:** the order page (`app/page.js` → `app/OrderFlow.js`). Pack
  selection, date picker (cutoff-aware), delivery details, order summary,
  submission, confirmation screen, WhatsApp deep links (customer help +
  post-order). Includes a 5-step "why tomorrow" timeline matching the
  existing print banner's sequence (You order → We procure fresh milk → We
  prepare fresh paneer → Carefully packed → Delivered fresh).
- Design tokens in `app/globals.css` are derived from the existing Navera
  banner (deep green, cream, mustard, cocoa) for visual consistency across
  print and web. Fonts: Fraunces (display) + Instrument Sans (body), loaded
  via a `<link>` tag in `app/layout.js` rather than `next/font`, because the
  sandbox this was built in couldn't reach Google Fonts to verify a
  `next/font` build — this works but could be switched to `next/font` for a
  small perf gain if you can verify the build with network access.
- **Day 3:** the admin dashboard (`app/admin/`). Production forecast (litres
  of milk as the hero number, packs by size, kg paneer), orders list for a
  chosen delivery date, manual WhatsApp order entry, and per-order Confirm /
  Dispatch `wa.me` links. Dispatch also sets `status='dispatched'`. See the
  Admin section below for the access pattern. Verified end-to-end in a
  browser against the live database — login, forecast, manual entry for both
  a new and a returning customer, and the dispatch status write.
- **Not yet deployed.** A Vercel deploy attempt hit `403: You don't have
  permission to create a project` — the connected Vercel account could read
  the existing `wellness-connect` project but not create a new one. Likely a
  team-role restriction. Resolve via the Vercel dashboard (create an empty
  project named `navera` manually, or fix account/team permissions) before
  the first deploy.

### Admin — a different access pattern on purpose

`/admin` does **not** go through `SECURITY DEFINER` functions. That pattern
exists to make the *public* path safe for `anon`; it has no job once there is
a real signed-in user. Admin signs in with Supabase Auth and queries the
tables directly — the `admin manages X` policies (`ALL` / `to authenticated`
/ `USING true`) plus full table GRANTs to `authenticated` cover every table.
**Do not add SECURITY DEFINER functions for admin features.**

- `lib/admin.js` — password sign-in against `/auth/v1/token`, session in
  `localStorage`, proactive refresh a minute before expiry plus one retry on a
  401, and a `db()` helper for authenticated PostgREST calls. No SDK, matching
  `lib/db.js`.
- `anon` has **no table GRANT at all** on customers/orders/order_items — a
  direct REST read fails with `42501` before RLS is even consulted. Worth
  knowing: it means a broken RLS policy alone cannot leak those tables.
- **Manual entry deliberately ignores the 6 PM cutoff.** The cutoff governs
  what *customers* may do; a WhatsApp order has already arrived, and refusing
  to record it is what breaks the milk forecast in the first place. This is
  the one place the cutoff is intentionally not applied.
- Manual entry writes in four steps (customer → order → items). If the items
  insert fails the order is deleted again — an order with no items would
  silently under-count milk, which is worse than no order.
- Admin dates are handled as plain `YYYY-MM-DD` strings and "today" is
  resolved through `settings.timezone`, so the forecast can't slide a day if
  the browser is in another zone.
- **Confirm and Dispatch must stay real `<a href>` elements.** Dispatch fires
  its status write from `onClick` and lets the anchor navigate on its own. The
  obvious alternative — `await` the PATCH, then `window.open()` — is broken:
  the await spends the click's user-gesture window and the browser silently
  blocks the popup, so the WhatsApp thread never opens. That was measured in
  this project, not guessed. If either link ever needs to do more work, keep
  the navigation on the anchor and put the work in `onClick`.
- The first table read straight after sign-in can come back `401` while the
  new token propagates. `lib/admin.js` refreshes and retries once, which
  absorbs it; expect to see that 401 in the network log even on a healthy
  login. It is not a bug to chase.

## Business rules currently in effect

- Cutoff: 6:00 PM the day before delivery — governs ordering, and will
  govern change/skip once those exist. One rule, no exceptions without
  updating `settings`.
- Delivery days: Tue/Fri/Sun seeded as a **placeholder** — confirmed
  changeable, expected to be revised once real order patterns are known.
- Delivery window: 6:30–8:30 AM, single window (deliberately not offering a
  choice of slots — one operator, one window).
- Areas: Casagrand, Castle, Airview, Navins Jayram. "Casagrand" is known to
  possibly need a more specific name (e.g. "Casagrand Irena") later — left
  as-is for now, flagged, not yet changed.
- Packs: **200g ₹170 and 500g ₹390 only.** A 100g ₹90 pack appears on the
  existing print banner but was confirmed dropped — do not add it back
  without an explicit new instruction.
- No delivery charge, no minimum order (both editable in `settings` if that
  changes).
- **No "A2 protein" claim anywhere on the site.** It appears on the existing
  banner but was deliberately excluded here — A2 is a breed-specific,
  substantiation-requiring claim and the decision was to drop it, not to
  reintroduce it from old marketing material.

## Admin login

One admin user exists (`jesinth.nalini@gmail.com`, confirmed), created by hand
in the Supabase dashboard. Creating admin users stays a manual dashboard step —
no service-role key is stored in this repo and none should be. There is no
signup route and no password reset UI on the site; both are done from the
dashboard.

## Next steps (Day 4 onward — see docs/NAVERA_WEBSITE_MASTER_SPEC.md §41)

Next: Order Again (highest-value single feature — lands on the private
`access_token` link, action-first not a history page), My Navera, Change
Tomorrow's Order (same cutoff as ordering), then Weekly Delivery with
skip/pause. Full sequence in the spec §41.

## Deploy

```
npm install
npm run dev      # local preview
npm run build    # verify before shipping
npx vercel --prod
```

No environment variables required — see the Supabase section above.
