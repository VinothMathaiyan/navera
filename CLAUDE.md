# Navera — Fresh Paneer Ordering Site

Read this before doing anything. It carries context from the build so far —
without it you'd be starting blind. `docs/NAVERA_WEBSITE_MASTER_SPEC.md` is
the full locked specification; this file is the working summary.

## What this is

A made-to-order fresh paneer business in Koliyanur, Viluppuram, delivering to
apartment communities in Chennai. Milk + fresh lemon only — no vinegar, no
preservatives, no additives. Prepared after the order is placed, not stocked.
Operated by Gowri. FSSAI 22426358000260.

The milk is described to customers as **"From free-roaming cared cows, around
100 km away from Chennai."** — see the sourcing rule under Business rules.
"Country cow milk" is the old wording and must not go back on the site.

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
  creates the order and items, returns the reference + access_token. Also
  takes optional `p_time_preference` / `p_address_note` (see the delivery-time
  rule below). Both are conveniences, so an unrecognised preference is coerced
  to null and the note is trimmed and capped at 200 chars, rather than
  refusing the order over a cosmetic field.
  - Note for future changes: adding a parameter means a **new signature**, so
    the function has to be dropped and recreated, not `CREATE OR REPLACE`d —
    otherwise the old overload lingers and a call becomes ambiguous. Grants
    are lost on drop, so re-`grant execute` to `anon`, `authenticated` and
    `service_role` afterwards (`PUBLIC` stays revoked).

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
- The masthead logo (`Masthead()` in `app/OrderFlow.js`) reads
  `public/navera-logo.png`, rendered with `next/image`, `fill` +
  `object-fit: contain`, boxed at `min(230px, 58vw)` (`.masthead .logo-wrap`
  in `globals.css`). The source file supplied for it was a flat white PNG, no
  alpha — placed as-is it would have shown a white box on the green header.
  It was reprocessed into a proper transparent PNG before being committed:
  flood-fill from the border for the outer background (safe against the
  cow's white fur, since fur is enclosed by the illustration's outline and
  never touches the border), plus a second pass restricted to the wordmark's
  y-range that fills enclosed letter counters (the loops in "a"/"e") without
  going near the illustration. If the logo ever needs replacing, a plain
  export from Canva/Figma will almost certainly be flat white again — expect
  to repeat this, not just drop the new file in.
- **Day 3:** the admin dashboard (`app/admin/`). Production forecast (litres
  of milk as the hero number, packs by size, kg paneer), orders list for a
  chosen delivery date, manual WhatsApp order entry, and per-order Confirm /
  Dispatch `wa.me` links. Dispatch also sets `status='dispatched'`. See the
  Admin section below for the access pattern. Verified end-to-end in a
  browser against the live database — login, forecast, manual entry for both
  a new and a returning customer, and the dispatch status write.
- **Day 4:** customer-page polish, responsive and accessibility pass. No new
  features and no schema change — see the "Customer page" rules below for what
  is now locked. Verified in a browser at 360 / 414 / 768 px: no horizontal
  scroll at any width, no tap target under 44 px, every text/background pair
  at or above WCAG AA, and all 20 focusable controls carrying a visible ring.
  A throwaway order (NAV-003) was placed against the live database to check the
  confirmation screen, then deleted along with its items and test customer —
  `order_reference_seq` is consequently one ahead, so the next real order is
  NAV-004. That gap is expected, not a bug.
- `.claude/launch.json` already carries a `navera-dev` config, so
  `preview_start` can run the dev server by that name. Note that `npm run
  build` and `next dev` share `.next/`: running a build while the dev server
  is up makes it serve 404s for its own chunks until it is restarted.
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

### Customer page — decisions that are load-bearing, not taste

- **One selected look for every choice.** Packs, delivery days and time bands
  all share `[aria-pressed="true"]` → filled `--green`, white text, plus a
  tick (`.chosen` badge on packs and dates, a `::before` tick on the pills).
  The tick is not decoration: it is what keeps the selected state from being
  carried by colour alone. The earlier white-background-plus-inset-border
  treatment was too weak to read on a cream page — do not go back to it.
- **`--muted` and `--mustard-dk` were darkened for contrast, not for looks.**
  `#6A7266` → `#5F6659` (4.53:1 → 5.4:1 on cream) and `#C9971A` → `#8A6410`
  (2.41:1 → 4.88:1). The old gold failed AA badly at the 11.5–12 px sizes it
  is used at, and it is also the focus-ring colour, where 2.41:1 fell under
  the 3:1 non-text minimum. A prettier, lighter gold will fail again.
- **The date row bleeds past `.wrap` on purpose** (`margin-inline` of
  `-1 * --pad`) and cards are sized `clamp(84px, (100% + var(--pad) - 30px) /
  3.5, 108px)` so roughly three and a half fit at any width. The half-card
  cut off by the screen edge is the only cue that the row scrolls. A fixed
  card width landed at 98% of a card on a 414 px phone, which reads as a
  rendering glitch rather than an invitation to swipe.
- **The timeline dot and its connector both derive from `--dot` / `--gut` /
  `--lw` / `--top` on `.moments`.** The connector is per-step (`.moment::after`,
  suppressed on the last), running dot-bottom to next-dot-top, rather than one
  line down the whole column — that older version overshot the first and last
  dots and drifted whenever a step's text wrapped.
- **Packs are written "1 × 500g, 2 × 200g", biggest first, everywhere**:
  the live order summary, the confirmation card, the customer's WhatsApp
  message and both admin templates. `packBreakdown()` in `app/OrderFlow.js`
  is the one implementation; the admin has its own two-line equivalent because
  it reads from `order_items` rather than from form state.
- **A customer-side "message us" link carries exactly one order** — the one
  on screen. Worth knowing before hunting for a bug here: the founder saw a
  WhatsApp draft reading "…NAV-001 … NAV-002" and reported it as
  concatenation, but nothing in this repo has ever joined references. Each
  link is built from a single `reference`. WhatsApp itself **appends** a
  `wa.me?text=` payload to whatever unsent draft is already sitting in that
  chat, and the two test orders had been opened one after the other without
  sending. The site cannot clear WhatsApp's composer. What it can do — and now
  does — is make each message self-contained (reference + packs + day +
  amount), so even an appended draft stays readable. If this is reported
  again, check the composer before changing code.
- **Every WhatsApp link on the customer page opens in a new tab.** Not just
  "Not listed?" — leaving the site mid-order throws away a half-filled form
  from any of them.
- `clock()` trims the leading zero off `cutoff_time`, because
  `get_ordering_info` formats it with `to_char(...'HH12:MI AM')` and renders
  "06:00 PM". Done in the page so no function signature has to change.
- The masthead lede is the page's `<h1>` and the confirmation's "Thank you"
  is an `<h2>`. Before this there was no `h1` at all. The lede also no longer
  says "Fresh paneer" — the logo image directly above it already does.

## Business rules currently in effect

- Cutoff: 6:00 PM the day before delivery — governs ordering, and will
  govern change/skip once those exist. One rule, no exceptions without
  updating `settings`.
- Delivery days: Tue/Fri/Sun seeded as a **placeholder** — confirmed
  changeable, expected to be revised once real order patterns are known.
- **Delivery time: no fixed window is promised to customers any more.**
  This replaced the earlier rule ("6:30–8:30 AM, single window, deliberately
  not offering a choice of slots"). Changed on 2026-08-12 as a deliberate
  founder decision, not a regression — if you find the old window missing
  from the customer page, that is correct and must not be "restored".
  - The customer optionally states a rough preference — *Earlier morning* /
    *Later morning* / *No preference* — and the real time is agreed
    human-to-human on WhatsApp.
  - These are **preferences, not bookable slots.** Never show clock times
    against them and never word them as a guarantee. The helper line is
    "We'll try to match it and confirm on WhatsApp."
  - `settings.delivery_window` still exists in the database and is still
    admin-editable, but nothing customer-facing may present it as a promise.
    That includes the admin WhatsApp templates: Confirm/Dispatch used to
    quote it, and no longer do, because a pre-filled "between 6:30 and 8:30"
    puts the retired promise straight back — just over WhatsApp instead of
    the site. Confirm now echoes the customer's own stated preference and
    says the time will be confirmed closer to the day.
  - Stored on `orders.time_preference` (`'earlier'` / `'later'` / null, with
    a check constraint) and `orders.address_note` (free text). Both nullable
    and both genuinely optional — an order with neither must always place
    exactly as before.
  - **Extended 2026-08-13: the word "morning" is gone from the customer page
    and from the admin WhatsApp templates too.** It used to appear in the
    cutoff bar, the date step, the timeline and the confirmation ("delivered
    Friday morning"), which is still a time promise even without clock times.
    The page now commits to a *day* and nothing more. The only surviving
    "morning" is inside the two preference labels — *Earlier morning* /
    *Later morning* — which are the customer's own words for what they'd
    prefer, not ours for what we'll do. Those two stay.
- **Sourcing claim (founder-confirmed, 2026-08-13).** The customer-facing
  wording is exactly: **"From free-roaming cared cows, around 100 km away from
  Chennai."** It replaced "Country cow milk and fresh lemon. Nothing else." in
  the masthead, and "Country cow milk, brought in for your order." in the
  timeline (now "Milk from free-roaming cared cows, brought in for your
  order."), and the `<meta name="description">` in `app/layout.js`. "Nothing
  else goes in" survives on the timeline's paneer-making step, so the
  no-additives promise is not lost. Do not reintroduce "country cow".
- **The footer line "Made in Koliyanur, Viluppuram. Delivered in Chennai." is
  pending replacement.** The founder owes exact wording and asked for it to be
  left alone until then. It is marked with a PENDING comment in
  `app/OrderFlow.js`. Do not invent a substitute.
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
