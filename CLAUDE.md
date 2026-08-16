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

`settings` (single row — cutoff, delivery days, window, litres/kg, lemons/litre,
min order, delivery charge — all admin-editable from `/admin` → Settings since
2026-08-14, never hardcode these), `delivery_areas`,
`products`, `customers` (phone is identity, `access_token` is the private
"My Navera" link — no passwords, no OTP), `orders` (NAV-001 style reference),
`order_items`, `subscriptions`, `subscription_skips`.

**RLS is deny-by-default.** Public (anon) role has zero direct read access to
customers, orders, order_items, subscriptions. It can only read `settings`,
active `delivery_areas`, active `products`. All public reads of private data
and all public writes go through three `SECURITY DEFINER` functions:

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
  - **`PUBLIC` really is revoked now, on all three functions** — the founder
    revoked it on `place_order` directly on 2026-08-16. Until then this note
    described the intent and `place_order` alone still carried the default
    `PUBLIC` grant it was created with. Not a hole (`anon` has the same
    capability and the function is meant to be public), but the drift is worth
    knowing about because a **newly created function is granted to `PUBLIC` by
    default** — the `revoke` is a required step, not a tidy-up. Check with
    `has_function_privilege('public', oid, 'EXECUTE')`, which should be
    `false` for all three while `anon` stays `true`.
- `get_my_orders(p_token)` — added 2026-08-16, the read behind `/my/<token>`
  (spec §15). Takes the customer's `access_token` and returns only that
  customer's own name, community, flat and last 20 orders with their items.
  **It never returns the phone, the token, customer notes, or any id.**
  - **Every failure returns SQL `null`, and that uniformity is the feature.**
    Unknown token, truncated token, one character altered, a rotated token, a
    blocked customer, and a real customer with no orders are all
    indistinguishable — there is deliberately no "not found" error and no
    empty-but-present payload, because either would confirm that a guessed
    token exists. The page above it says one identical thing for all of them
    too; verified by fingerprinting the rendered HTML for six bad-token
    variants, all byte-identical (1388 bytes, same digest) against a different
    valid response. **Do not add a distinguishing error message here.**
  - Revocation needs no schema change: rotating the column
    (`update customers set access_token = encode(gen_random_bytes(24),'hex')`)
    makes the old link return null like any other unknown token. `is_blocked`
    also suppresses the whole payload.
  - There is a cheap `length(p_token) between 24 and 128` guard before the
    lookup. It exists to stop a megabyte of text reaching the query, not as
    validation — it returns the same null as everything else.

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
- **The masthead logo is `public/Logo.png`, and it must not be processed.**
  `Masthead()` in `app/OrderFlow.js` renders it with `next/image`, `fill` +
  `object-fit: contain`, boxed by `.masthead .logo-wrap`. It is the founder's
  finished artwork — cow, barn, sun, leaves, brown "Navera", green "FRESH
  PANEER" — on its own **opaque** cream ground (alpha 255 throughout). It is
  committed byte-for-byte as supplied.
  - **There used to be a `public/navera-logo.png`, deleted 2026-08-14, and the
    note here used to describe flood-filling it transparent.** That was a hack
    for the old *dark green* masthead, where an opaque light background would
    have shown as a white box. The masthead is light now, so the hack is not
    just unnecessary — the founder explicitly ruled it out. Do not make this
    file transparent, and do not "restore" the old one. There is one logo file.
  - The image is **1114 × 601 (1.85358)**. `.masthead .logo-wrap` must carry
    that `aspect-ratio`. It was `1 / 1` for the old square logo; leaving a
    square box around a landscape mark letterboxes it and adds ~50 px of dead
    space under the artwork, which was most of the gap the founder complained
    about.
  - Every pixel of the file's 1-pixel border is exactly **`#F8F6F0`**, flat and
    opaque — which is why `--masthead` can match it outright and the artwork
    has no edge. Using the page's `--cream` there instead puts most of that
    border visibly off-colour, i.e. a box around the logo.
  - The artwork carries its own whitespace — 3.7% of height above, **7.7%
    below**, and under 1% at each side (the "FRESH PANEER" flourishes run
    nearly edge to edge). So the visible gap under the mark is that baked-in
    space *plus* the CSS margin, and the box width is effectively the mark's
    width on screen. Tune the CSS against the rendered result, not on paper.
  - **The founder uploads this file through the GitHub web UI** ("Add files via
    upload" commits), so it can arrive on `origin/main` without ever being in
    the local working copy. If a new logo is mentioned and `public/` doesn't
    have it, `git fetch` before concluding it is missing — and re-sample the
    background and ratio, because a re-export changes both.
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
  A throwaway order was placed against the live database to check the
  confirmation screen, then deleted.
- **The database was wiped clean on 2026-08-14**, after the last round of
  testing: every customer, order and order_item deleted, and
  `order_reference_seq` restarted at 1. Verified — the next `nextval()` returns
  1, so **the first real customer gets NAV-001**. There is no reference gap any
  more; earlier notes in this file about the sequence running ahead are
  superseded. `settings`, `products` and `delivery_areas` were untouched.
- **Day 5:** the admin **Settings** screen (`app/admin/Settings.js`) and a
  **lemon** figure on the forecast. `/admin` now has two tabs, Dashboard and
  Settings. Settings edits cutoff time, delivery days, litres per kg, lemons
  per litre, minimum order, delivery charge and the internal delivery-window
  note, writing straight to the `settings` singleton. Forecast maths moved out
  of the component into `app/admin/forecast.js` so it can be exercised on its
  own. Verified: 8 maths cases pass including the founder's measured batch
  (1 kg → 8.5 L → 9 lemons), the same module re-run against real database rows
  agrees with the SQL answer, and a committed delivery-day change was seen to
  add and then remove Wednesday on the live customer page with no redeploy.
  Admin CSS checked at 360 and 768 px — no overflow, seven weekday cells on one
  row, 11 text/background pairs all at WCAG AA.
- **2026-08-16 — first hand-testing round.** Five fixes from the founder's own
  pass over the built site. See the "Private link" and "Order card" sections
  below for the rules each one established.
  - **The confirmation is now a real route, `/my/<token>`** (spec §15), not
    React state. This was a genuine bug: refreshing the confirmation dropped
    the delivery address and returned to step 1, which made the page's own
    "keep this page" line untrue.
  - **The customer's details are remembered on their own device** and offered
    back for review, with a "Not you?" link that clears them.
  - **The order summary doubles as a review step**, with a Change control per
    step that moves focus back to it.
  - **The admin order card was split into two axes** — status, and messages.
  - Verified end to end against the live database: an order placed through the
    browser (NAV-009) landed on its private page, survived a hard refresh and a
    cold load with every cookie and storage key cleared; six bad-token variants
    rendered byte-identical pages; `anon` still gets `42501` on orders,
    order_items, customers and subscriptions over real HTTP. Contrast and tap
    targets re-checked at 360 px on every new control.
- `.claude/launch.json` already carries a `navera-dev` config, so
  `preview_start` can run the dev server by that name. Note that `npm run
  build` and `next dev` share `.next/`: running a build while the dev server
  is up makes it serve 404s for its own chunks until it is restarted.
- **A folder under `app/` whose name starts with `_` is private to Next and
  gets no route** — `app/admin/__cardtest/` 404s, `app/admin/cardtest/` does
  not. Worth knowing before debugging a "missing" page for ten minutes.
- **Deployed and live.** The old note here said "not yet deployed" and
  described a `403: You don't have permission to create a project`. That was
  resolved long ago — the `navera` project exists on Vercel and every push to
  `main` has auto-deployed since. Corrected 2026-08-16 after confirming 18
  deployments against the repo.
  - Production: **https://navera-rouge.vercel.app** (aliases also include
    `navera-vinothm13579-7150s-projects.vercel.app` and the branch alias
    `navera-git-main-…`). Team `vinothm13579-7150's projects`, project
    `prj_mUpNLTIUiVSxZfFSdYahx9rKs3Fb`, framework auto-detected as Next.js,
    region `iad1`.
  - There is no `.vercel/project.json` in the repo and none is needed —
    deploys come from the GitHub integration, not from `npx vercel`.
  - **`READY` is not proof the change shipped.** It means the build finished.
    Verify the deployed artefact itself: fetch the production URL and check
    for markup only the new code emits, and for old markup that should be
    gone. `/` and `/my/<token>` are server-rendered so their HTML shows it
    directly; `/admin` is a client component, so pull the
    `/_next/static/chunks/*.js` it references and grep those, plus
    `/_next/static/css/*` for style changes.

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
- **`settings`, `products` and `delivery_areas` are now hardened the same way**
  (fixed 2026-08-14). They used to grant `anon` the full DML set
  (INSERT/UPDATE/DELETE/TRUNCATE) with only a SELECT policy, so RLS alone stood
  between the public key and those tables — an anon `PATCH /settings` returned
  `200 []` (zero rows, nothing written) rather than being refused outright.
  `products` made it worth fixing: `place_order` prices every order from that
  table, so one mis-scoped policy would have meant free paneer.
  `insert, update, delete, truncate` were revoked from `anon` on all three.
  - `anon` now holds only `REFERENCES, SELECT, TRIGGER` on them. Verified over
    real HTTP: PATCH on all three, plus DELETE on products and INSERT on
    delivery_areas, every one refused with `42501 permission denied` **before
    RLS is consulted** — the same belt-and-braces posture as
    customers/orders/order_items.
  - Reads are untouched and must stay that way: `GET settings`, `products`,
    `delivery_areas` all still `200`, and `get_ordering_info()` still returns
    its full payload. The public path only ever reads, which is why nothing
    needed those write grants.
  - **Admin is unaffected** — `authenticated` keeps full DML, re-tested after
    the revoke by updating `settings` as that role. If the Settings screen ever
    starts failing with `42501`, the revoke was applied too broadly; it should
    only ever have touched `anon`.
  - Note when testing this: a `PATCH` with an empty `{}` body is a PostgREST
    no-op that returns `204` **without** reaching the permission check. Send a
    real column value or the test proves nothing.
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
- **Every WhatsApp control stays a real `<a href>`.** They open `wa.me` in a
  new tab and WhatsApp's own Send still has to be pressed, so nothing goes out
  without a human reading it. If one ever needs to do work as well, keep the
  navigation on the anchor and put the work in `onClick` — never `await`
  something and then `window.open()`. The await spends the click's
  user-gesture window and the browser silently blocks the popup, so the thread
  never opens. That was measured in this project, not guessed.
  - **Superseded 2026-08-16: no message control writes anything any more.** The
    note above used to say Dispatch fired a status write from `onClick`. It
    does not. See the order card section below.
- The first table read straight after sign-in can come back `401` while the
  new token propagates. `lib/admin.js` refreshes and retries once, which
  absorbs it; expect to see that 401 in the network log even on a healthy
  login. It is not a bug to chase.

#### The order card — two axes, and they must stay apart

Rebuilt 2026-08-16 after the founder found it confusing in hand testing. The
old card had five controls — Back / Preparing changed status, Confirm sent a
message, and **Dispatch quietly did both**. One control doing two unrelated
jobs is what made it unpredictable.

- **STATUS is the only thing on the card that writes `orders.status`.** One
  row, advance and back, along `confirmed → preparing → dispatched →
  delivered`. Cancel is separate and keeps its own confirmation and undo.
- **MESSAGE writes nothing, ever.** One WhatsApp button opening a menu of four
  templates — Confirm, Dispatch, Reminder (§21), Feedback (§27). All four are
  plain anchors to `wa.me`. **Dispatch no longer sets `status='dispatched'`.**
- The two touch in exactly one place and in one direction: `MESSAGE_FOR_STATUS`
  maps a status to the message that suits it, so **advancing the status offers
  the matching message and never sends it** — §20 and §21 both put a human in
  that loop deliberately: Gowri taps, reviews, sends. Sending never moves a
  status.
- The offer is captioned from the status just written, not from `order.status`.
  The prop only catches up when `onStatusChanged`'s reload returns, so reading
  it there captions the offer with the status just left.
- Verified by intercepting `fetch` in the browser: all four message templates
  opened WhatsApp and issued **zero** requests; walking the status chain up and
  back down issued **exactly one** `PATCH` per tap with the right body, and
  stopped at both ends.
- **Nothing in the app writes `orders.time_preference` any more.** The badge on
  the card went first (dead UI — the customer page had already stopped sending
  a preference), and the admin's Morning/Evening control in manual entry
  followed on the same day, because with no badge it was a field that silently
  discarded whatever Gowri typed. A field that throws away what you tell it is
  worse than no field.
  - **The column and `place_order`'s `p_time_preference` both stay**, nullable
    and defaulting to null, and the Confirm template still echoes a preference
    when a row happens to carry one — two legacy test rows do. Nothing new can
    set one. Reinstating the control means reinstating the badge in the same
    change, or the same trap comes back.
- `orders.created_at` is shown as "placed Sun 16 Aug, for Mon 17 Aug",
  converted to `settings.timezone` first — it is a `timestamptz`, and an order
  placed at 11:40 PM in Chennai is an earlier day in UTC. **Deliberately not
  added to the Production table**: that table aggregates by delivery date, and
  several orders on one row can have been placed on different days.

#### Settings screen (`app/admin/Settings.js`)

- It PATCHes `settings?id=eq.true` directly with the admin's JWT. That is the
  correct pattern here — **do not** wrap it in a `SECURITY DEFINER` function.
- `updated_at` is maintained by the `settings_touch` BEFORE UPDATE trigger, so
  the screen must not send it.
- `cutoff_time` is a `time` column: PostgREST returns `"18:00:00"`, and
  `<input type="time">` speaks `"HH:MM"`. `toTimeInput` / `toTimeColumn` convert
  in both directions — don't drop the seconds on the way back in.
- **Delivery days are 0=Sunday**, matching `extract(dow)` and the existing
  `settings.delivery_days` array. Do not renumber to Monday-first.
- Saving with **zero delivery days is blocked**, and that is a refusal rather
  than a warning: `get_ordering_info` would return an empty date list and no
  customer could order at all. Same for a non-positive litres-per-kg or
  lemons-per-litre, which would render a zero or NaN forecast.
- **`delivery_window` is an internal note and nothing more.** It is edited here
  for the founder's own reference, and the screen says so. The customer page
  does not read it and the WhatsApp templates no longer quote it — see the
  no-fixed-window rule. If anything ever starts rendering it to a customer,
  that is the retired promise coming back.
- **TODO(subscriptions), deliberately left as a hook:** removing a delivery day
  currently shows a warning only. Once weekly delivery exists it must become a
  real check — look for active subscriptions on the removed weekday and make
  the admin move or pause them before the save goes through. The comment sits
  on the `removed` computation in `Settings.js`, which is where the check
  belongs. There are no subscriptions today, so there is genuinely nothing to
  check yet; do not ship weekly delivery without turning that warning into a
  block.

#### Forecast maths (`app/admin/forecast.js`)

- Pulled out of `AdminDashboard` so the numbers that decide how much milk gets
  bought can be tested without rendering anything. `computeForecast(orders,
  settings)` takes the rows exactly as `ORDER_SELECT` returns them — note that
  PostgREST hands back numerics as **strings**, which is what the tests pin.
- Cancelled orders are excluded from every figure, as before.

#### Production tab (`app/admin/Production.js`)

- **The "Start" batch action lives in each table row**, as a small button in a
  final unlabelled column, and only on rows where `toMake > 0`. Rows with
  nothing left to make show a dash — a Start button that would do nothing is
  worse than no button.
  - It replaced six stacked full-width blocks below the table (2026-08-16).
    Those had to spell out their own date so you could match each one back to a
    row; in the row, the date *is* the row. The visible label is just "Start",
    so the accessible name carries the date and the count.
  - The row action still marks the **whole evening's batch**, not one order —
    that was never the problem with the old buttons, only where they sat.
  - `.ad-table` had its `min-width` raised 420 → 480 px for the extra column.
    The table scrolls inside `.ad-tablewrap`, so this widens that scroll and
    never the page.

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
- **The confirmation is `/my/<token>`, and it must stay a URL.** It is a server
  component with no client state at all, which is the only thing that makes
  "refresh it, bookmark it, come back next week" structurally true rather than
  a promise the client has to keep. Do not move it back into React state, and
  do not make it depend on localStorage.
  - The route sets `robots: noindex` and `referrer: no-referrer` in its
    metadata, and every outbound link carries `rel="noopener noreferrer"`.
    **Both are load-bearing, not boilerplate.** The token is a credential
    sitting in the URL: indexing it would publish it, and a Referer header
    would hand it to WhatsApp on the first tap of "Message us".
  - `?placed=NAV-00X` names which order the visit is about, so a refresh keeps
    showing that confirmation rather than a generic list. The token already
    grants everything the reference could reveal, so it adds no exposure.
  - **The token never goes into a WhatsApp message.** Same rule as before —
    those get forwarded. The page says "don't forward the link" for the same
    reason.
  - "Keep this page — you can reorder from it next time" stays, and the
    "Order again" button is what makes it true: it lands on the order form,
    which the device-local details then fill in. §14's one-tap same-again
    replaces that button; until it does, the sentence must not outrun what the
    page actually does.
- **The customer's details are remembered in `localStorage` under
  `navera.you.v1`, and that is the only place they may ever come from.**
  Name, phone, community and flat, written after a successful order.
  **Never add a server-side lookup by phone number to the customer page.**
  Typing ten digits must never return someone's stored address — that would
  hand a neighbour's name and flat to anyone willing to guess, which is the
  exact exposure the whole anon-deny-by-default posture exists to prevent.
  The admin's phone-first lookup is a different thing and stays: it is behind
  Supabase Auth.
  - Read in an effect after mount, never during render — localStorage does not
    exist on the server and seeding state from it desyncs the HTML.
  - Every access is wrapped in try/catch: Safari private mode throws rather
    than returning null, and not being able to remember must never break the
    order form.
  - The community is only restored if it is **still in `info.areas`**, or a
    retired area sits in the select as a stale id that fails at the very last
    step with nothing on screen explaining why.
  - **"Not you?" is required, not a nicety.** Families share a phone and a
    laptop. It clears the four fields and the stored record.
- **The summary is also the review step.** Packs, delivery day and address each
  carry a Change control that scrolls to its step and focuses it (the sections
  are `tabIndex={-1}` for exactly this). That is what "move back a step before
  confirming" means here — the page stayed one screen rather than becoming a
  wizard, because every step is editable in place and always was.
- **Packs are written "1 × 500g, 2 × 200g", biggest first, everywhere**:
  the live order summary, the confirmation card, the customer's WhatsApp
  message and every admin template. `packLine()` in **`app/format.js`** is the
  one implementation — moved there from `OrderFlow.js` on 2026-08-16 when the
  confirmation became its own route and two pages needed it. It takes rows that
  already carry `weight_grams`, which is what `order_items` and `get_my_orders`
  both return; the order form resolves product ids to weights first. The admin
  still has its own equivalent because it reads from `order_items`.
  - `app/format.js` and `app/Masthead.js` were both extracted in the same
    change, so the order page and the private page cannot drift on how they
    write a date, a price or a pack. `Masthead` takes `lede` — the order page
    passes it (that lede is the page's `<h1>`), the private page does not,
    because its own heading is the `<h1>` there.
- **A customer-side "message us" link carries exactly one order** — the one
  on screen. Worth knowing before hunting for a bug here: the founder saw a
  WhatsApp draft reading "…NAV-001 … NAV-002" and reported it as
  concatenation, but nothing in this repo has ever joined references. Each
  link is built from a single `reference`. WhatsApp itself **appends** a
  `wa.me?text=` payload to whatever unsent draft is already sitting in that
  chat, and the two test orders had been opened one after the other without
  sending. The site cannot clear WhatsApp's composer. What it can do — and now
  does — is make each message self-contained (reference + packs + delivery date
  + amount), so even an appended draft stays readable.
  - **It was reported a second time on 2026-08-14**, as a "duplicate greeting"
    ("Hi Navera, I have a question about your paneer.Hi Navera, about my order
    NAV-004 …"). Same root cause: that string is the *general enquiry* template
    followed by the *confirmation* template, i.e. two different links opened
    into one composer without sending. No single link in this repo has ever
    emitted two greetings — measured in the browser, every `wa.me` href on the
    page contains exactly one "Hi Navera". **Before changing any code for this,
    clear the WhatsApp composer and re-test.** A third report is still not a
    code bug.
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
  - The customer optionally states a rough preference — *Morning* / *Evening* /
    *No preference* — and the real time is agreed human-to-human on WhatsApp.
    (Renamed 2026-08-14 from *Earlier morning* / *Later morning*, which only
    ever offered two halves of the same morning. Evening is now a real choice.)
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
  - Stored on `orders.time_preference` (`'morning'` / `'evening'` / null, with
    a check constraint) and `orders.address_note` (free text). Both nullable
    and both genuinely optional — an order with neither must always place
    exactly as before.
  - **`place_order` coerces an unrecognised preference to null — it does not
    raise, and that is deliberate.** Verified again on 2026-08-14 by calling
    the function with `'afternoon'`: the order was accepted and the column
    stored **null**, never `'afternoon'`. This reads like a validation gap and
    has already been reported as one once. It is not. The rule is *never refuse
    an order over a cosmetic field* — the preference is re-agreed on WhatsApp
    anyway, so dropping it costs nothing while refusing costs a sale. The
    morning/evening rename is the exact scenario it protects: had the database
    migration lagged the frontend by a minute, hard rejection would have
    refused **every** website order instead of quietly dropping a soft
    preference. The table's `CHECK (time_preference = ANY (ARRAY['morning',
    'evening']))` is the real guard on what can be stored. Do not "fix" the
    coercion into a `raise` without a fresh founder decision.
  - **Extended 2026-08-13: the word "morning" is gone from the customer page
    and from the admin WhatsApp templates too.** It used to appear in the
    cutoff bar, the date step, the timeline and the confirmation ("delivered
    Friday morning"), which is still a time promise even without clock times.
    The page now commits to a *day* and nothing more. The only surviving
    "morning" is the *Morning* preference button — the customer's own word for
    what they'd prefer, not ours for what we'll do. That one stays.
- **The cutoff bar carries the date, not just the weekday** (2026-08-14):
  "Order before 6:00 PM for Sunday, 16 Aug". "for Sunday" alone was ambiguous
  between weeks. The date is derived from `info.delivery_dates[0]` — the same
  backend-computed value the date picker uses — so there is one source of
  truth and no second date calculation to drift.
- **Sourcing claim (founder-confirmed, 2026-08-13).** The customer-facing
  wording is exactly: **"From free-roaming cared cows, around 100 km away from
  Chennai."** It replaced "Country cow milk and fresh lemon. Nothing else." in
  the masthead, and "Country cow milk, brought in for your order." in the
  timeline (now "Milk from free-roaming cared cows, brought in for your
  order."), and the `<meta name="description">` in `app/layout.js`. "Nothing
  else goes in" survives on the timeline's paneer-making step, so the
  no-additives promise is not lost. Do not reintroduce "country cow".
- **The footer line "Made in Koliyanur, Viluppuram. Delivered in Chennai." was
  removed outright on 2026-08-14** and is not pending replacement any more. The
  founder decided against footer wording entirely. The footer is now the
  WhatsApp button and the FSSAI licence line, nothing else. Do not reinstate a
  location line or invent a substitute.
- Areas: Casagrand, Castle, Airview, Navins Jayram. "Casagrand" is known to
  possibly need a more specific name (e.g. "Casagrand Irena") later — left
  as-is for now, flagged, not yet changed.
- Packs: **200g ₹170 and 500g ₹390 only.** A 100g ₹90 pack appears on the
  existing print banner but was confirmed dropped — do not add it back
  without an explicit new instruction.
- No delivery charge, no minimum order (both editable in `settings` if that
  changes).
- **Lemons: 1 per litre of milk, always rounded UP to a whole lemon**
  (founder decision, 2026-08-14). Stored as `settings.lemons_per_litre` and
  editable from the Settings screen, because a forecast figure is exactly the
  kind of number that must not be hardcoded. The rounding direction is the
  point, not an accident: from a real batch, 5 lemons did **not** set 8.5 L and
  7–8 did, so one-per-litre rounded up puts 8.5 L at 9 — deliberately a little
  over. Running short fails the batch; a spare lemon costs a few rupees.
  **Do not "improve" `Math.ceil` to `Math.round`.** Tune the ratio in settings
  if real batches disagree, never the rounding.
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

## Next steps (see docs/NAVERA_WEBSITE_MASTER_SPEC.md §41)

Next: **Order Again** (highest-value single feature). The groundwork is now in
place — `/my/<token>` exists, `get_my_orders` already returns each order's
items, and the page already has an "Order again" button that only navigates to
a blank form. §14 replaces that button with the real thing: the last order's
packs, one tap, action-first rather than a history page. Follow it with Change
Tomorrow's Order (§16, same cutoff as ordering), then Weekly Delivery with
skip/pause. Full sequence in the spec §41.

Open, not decided:

- **Customer login / OTP** — under active founder consideration, deliberately
  not built. The private link is the whole auth story today.
- **The inline "Message us" link in the date step's paragraph is 16 px tall**,
  under the 44 px tap target every other control on the site holds to. It is
  inline in a sentence, so the fix is the `.notlisted` / `.notyou` treatment
  (`display: inline-flex; min-height: 44px`). Pre-existing, left alone as out
  of scope.

## Deploy

```
npm install
npm run dev      # local preview
npm run build    # verify before shipping
npx vercel --prod
```

No environment variables required — see the Supabase section above.
