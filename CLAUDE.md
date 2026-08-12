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
- **Not yet deployed.** A Vercel deploy attempt hit `403: You don't have
  permission to create a project` — the connected Vercel account could read
  the existing `wellness-connect` project but not create a new one. Likely a
  team-role restriction. Resolve via the Vercel dashboard (create an empty
  project named `navera` manually, or fix account/team permissions) before
  the first deploy.

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

## Next steps (Day 3 onward — see docs/NAVERA_WEBSITE_MASTER_SPEC.md §41)

Day 3 is the admin view + production forecast, and — critically — **manual
WhatsApp order entry**, phone-number-first (existing customers autofill from
phone, ~15–20 seconds per order). Without that screen, WhatsApp orders never
reach the database and the milk forecast is wrong by however many orders
arrived that way. It is not optional scope, it's load-bearing.

After that: Order Again (highest-value single feature — lands on the private
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
