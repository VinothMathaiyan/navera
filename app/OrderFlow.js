"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rpc } from "../lib/db";
import Masthead from "./Masthead";
import {
  DOW,
  DOW_LONG,
  MON,
  clock,
  longDate,
  parseDate,
  rupees,
  shiftDays,
} from "./format";

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* ---------------------------------------------------------------- remembering

   Who you are, kept on your own device and nowhere else.

   This is deliberately localStorage and NOT a lookup by phone number against
   the database. A "type your number and we'll fill in the rest" field would
   hand anybody your neighbour's name, block and flat for the cost of guessing
   ten digits — the exact exposure the whole anon-deny-by-default posture exists
   to prevent. The admin's phone-first lookup is a different thing and stays:
   it sits behind Supabase Auth.

   So: no order history here and no server lookup. Four fields the customer
   typed themselves, on the device they typed them on, offered back for review.

   Since 2026-08-19 this also holds `accountToken` — the account-wide link, when
   the customer has one. That is a credential, and it is kept under exactly the
   same rules as the rest of this record: written only after an order the server
   answered with an account token, read only on this device, cleared by "Not
   you?" along with everything else. It may be used for one thing only — an
   internal link to /my/<token>, this site's own private page. It must never go
   into a WhatsApp message, an outbound href, or a query parameter, because
   those get forwarded, logged and pasted into chats.

   Why it is here at all: place_order hands an account-wide link to a brand-new
   customer and an order-scoped one to every returning customer, deliberately —
   a phone number on a public form is not proof of ownership. Without somewhere
   to keep the first link, a customer who reorders four times finishes with four
   isolated single-order pages and no history at all, which guts Order Again.
   The device remembers it; the server still never re-issues it.
*/
const REMEMBER_KEY = "navera.you.v1";

// 48 lowercase hex as issued, but bounded rather than pinned — the same cheap
// sanity check the database functions apply, for the same reason: it exists to
// keep nonsense out of a URL, not to validate anything.
const looksLikeToken = (t) => typeof t === "string" && /^[0-9a-f]{24,128}$/i.test(t);

function loadRemembered() {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const str = (x) => (typeof x === "string" ? x : "");
    const out = {
      name: str(v.name).slice(0, 80),
      phone: str(v.phone).replace(/\D/g, "").slice(0, 10),
      areaId: str(v.areaId),
      flat: str(v.flat).slice(0, 60),
      // Absent for every record written before 2026-08-19, and absent for a
      // device whose first order was a repeat one. Optional on purpose: the
      // form works exactly as before without it.
      accountToken: looksLikeToken(v.accountToken) ? v.accountToken : "",
    };
    // Half-empty saved details are worse than none: they look filled in while
    // still failing at the Confirm button.
    return out.name && out.phone ? out : null;
  } catch {
    // Safari in private mode throws on localStorage rather than returning null.
    // Not being able to remember is never a reason to break the order form.
    return null;
  }
}

function saveRemembered(v) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(v));
  } catch {
    /* ignore — see above */
  }
}

function forgetRemembered() {
  try {
    window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* ignore — see above */
  }
}

export default function OrderFlow({ info, loadError }) {
  const router = useRouter();

  const [qty, setQty] = useState({});
  const [date, setDate] = useState(info?.delivery_dates?.[0] ?? null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [flat, setFlat] = useState("");
  const [addressNote, setAddressNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [minsLeft, setMinsLeft] = useState(null);
  const [remembered, setRemembered] = useState(false);
  // The account-wide link, if this device has earned one. Never rendered as
  // text and never sent anywhere — it is only ever the href of an internal
  // link to this site's own private page.
  const [accountToken, setAccountToken] = useState("");

  // Minutes to cutoff, seeded from server time so a wrong phone clock can't lie.
  useEffect(() => {
    if (!info || info.past_cutoff) return;
    const [h, m] = info.cutoff_raw.split(":").map(Number);
    const t = new Date(info.server_time);
    const cut = new Date(t);
    cut.setHours(h, m, 0, 0);
    const seed = Math.round((cut - t) / 60000);
    setMinsLeft(seed);
    const id = setInterval(() => setMinsLeft((v) => (v === null ? null : v - 1)), 60000);
    return () => clearInterval(id);
  }, [info]);

  // Read after mount, never during render: localStorage does not exist on the
  // server, and seeding state from it would make the server and client HTML
  // disagree.
  useEffect(() => {
    const saved = loadRemembered();
    if (!saved) return;
    setName(saved.name);
    setPhone(saved.phone);
    setFlat(saved.flat);
    // Only if that community is still being served. A retired area would
    // otherwise sit in the select as a stale id that fails validation at the
    // very last step, with nothing on screen explaining why.
    if (saved.areaId && (info?.areas ?? []).some((a) => a.id === saved.areaId)) {
      setAreaId(saved.areaId);
    }
    setAccountToken(saved.accountToken);
    setRemembered(true);
  }, [info]);

  function notYou() {
    // forgetRemembered drops the whole record, the account link with it — a
    // shared laptop must not leave one person's order history one tap away
    // from the next person to use it.
    forgetRemembered();
    setName("");
    setPhone("");
    setAreaId("");
    setFlat("");
    setAccountToken("");
    setRemembered(false);
  }

  /* ------------------------------------------------ moving back a step */

  // Packs, day and details are all on one screen and all stay editable, but
  // "scroll back up and find it yourself" is not navigation. Each Change
  // control in the summary moves to its step and puts focus there, so the
  // journey back is the same one tap for a thumb and for a screen reader.
  const packsStep = useRef(null);
  const dateStep = useRef(null);
  const detailsStep = useRef(null);

  const backTo = useCallback((ref) => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    // preventScroll, or the browser's own focus scroll fights the smooth one
    // above and the page lands somewhere neither of them intended.
    el.focus({ preventScroll: true });
  }, []);

  const items = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity })),
    [qty]
  );

  const orderedLines = useMemo(() => {
    if (!info) return [];
    return items
      .map((it) => {
        const p = info.products.find((x) => x.id === it.product_id);
        return p ? { ...it, product: p } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.product.weight_grams) - Number(a.product.weight_grams));
  }, [items, info]);

  const subtotal = useMemo(
    () => orderedLines.reduce((sum, l) => sum + Number(l.product.price) * l.quantity, 0),
    [orderedLines]
  );

  const total = subtotal + Number(info?.delivery_charge ?? 0);

  // Name, phone, community and flat all stay required — a delivery cannot be
  // made without them. The address note is the only optional field, and is
  // marked as such.
  const missing = [
    items.length === 0 && "a pack",
    !date && "a delivery day",
    !name.trim() && "your name",
    !phone.trim() && "your WhatsApp number",
    !areaId && "your community",
    !flat.trim() && "your flat or block",
  ].filter(Boolean);
  const ready = missing.length === 0;

  const waLink = (text) =>
    `https://wa.me/${info?.whatsapp_number ?? "919843327406"}?text=${encodeURIComponent(text)}`;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await rpc("place_order", {
        p_phone: phone,
        p_name: name,
        p_area_id: areaId,
        p_flat: flat,
        p_delivery_date: date,
        p_items: items,
        p_source: "website",
        // p_time_preference is deliberately not sent. The control was removed
        // from the page; the parameter and the column both still exist,
        // nullable and defaulting to null, so nothing here depends on it.
        p_address_note: addressNote.trim() || null,
      });

      if (!res?.access_token || !res?.reference) {
        // The order itself did go in — place_order is one transaction — so this
        // must never read like a failure to the customer.
        throw new Error(
          "Your order is placed, but we couldn't open your order page. " +
            "WhatsApp us and we'll confirm it straight away."
        );
      }

      // Which kind of link came back? place_order does not say, and the two are
      // indistinguishable on sight — both are 48 hex characters. Only an
      // account token resolves through get_my_orders, so that is the question
      // we ask, and we ask it exactly once: on the order that first earns this
      // device a link. A returning customer's order-scoped token must never
      // replace an account link we already hold, so when we hold one we skip
      // the call entirely and keep what we have.
      let keepToken = accountToken;
      if (!keepToken && res.access_token) {
        try {
          const mine = await rpc("get_my_orders", { p_token: res.access_token });
          if (mine && Array.isArray(mine.orders)) keepToken = res.access_token;
        } catch {
          // A convenience, never a reason to sour a placed order. Without it
          // the customer simply keeps the order-scoped link they already have.
        }
      }

      // Saved only once an order has actually succeeded, and from the values
      // the server accepted rather than from whatever is in the boxes.
      saveRemembered({
        name: res.name ?? name.trim(),
        phone,
        areaId,
        flat: res.flat ?? flat.trim(),
        ...(keepToken ? { accountToken: keepToken } : {}),
      });

      // The confirmation is a real page now, not a piece of state. push, not
      // replace, so Back from the confirmation returns to a fresh order form
      // rather than dropping the customer off the site.
      router.push(`/my/${res.access_token}?placed=${encodeURIComponent(res.reference)}`);
      // busy is deliberately left set. The button must stay dead while the
      // private page loads, or an impatient second tap places a second order.
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  /* ------------------------------------------------ error / loading */

  if (loadError || !info) {
    return (
      <main>
        <Masthead />
        <div className="wrap">
          <div className="err" role="alert" style={{ marginTop: 28 }}>
            We couldn&apos;t load today&apos;s ordering details. Please refresh, or
            message us on WhatsApp and we&apos;ll take your order there.
          </div>
          <div className="foot">
            <a className="wa" href={waLink("Hi Navera, I'd like to place an order.")} {...newTab}>
              WhatsApp us<NewTabNote />
            </a>
          </div>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------ the order page */

  const first = parseDate(info.delivery_dates[0]);

  // Only three days are offered. get_ordering_info already returns the right
  // set for any given moment, so this is a slice and never a recalculation.
  const offered = info.delivery_dates.slice(0, 3);

  /* ---- cutoff line, derived entirely from get_ordering_info ----

     Every batch is prepared the evening before, so the cutoff that matters is
     6 PM on the day before delivery_dates[0] — which is only "today" when
     tomorrow happens to be a delivery day. On Sat/Sun that is true; from
     Monday to Thursday the next delivery is Saturday and the deadline is
     Friday, so saying "today" there would be plainly false. Three branches,
     all true, no hardcoded day names.

     Which weekdays we deliver on is not in the payload, so it is recovered
     from the dates themselves — six dates over a fortnight cover every
     delivery weekday. */
  const today = new Date(info.server_time);
  const deliveryWeekdays = new Set(info.delivery_dates.map((iso) => parseDate(iso).getDay()));
  const cutoffDay = shiftDays(first, -1);
  const cutoffIsToday = sameDay(cutoffDay, today);
  // After the cutoff, the day that just closed is tomorrow — but only if we
  // actually deliver then. On a Tuesday evening nothing has closed.
  const tomorrow = shiftDays(today, 1);
  const justClosed = info.past_cutoff && deliveryWeekdays.has(tomorrow.getDay()) ? tomorrow : null;

  const chosenArea = info.areas.find((a) => a.id === areaId);
  const addressSummary = [chosenArea?.name, flat.trim()].filter(Boolean).join(", ");

  return (
    <main>
      <Masthead />

      {/* No delivery time is promised here, only the day. The time is agreed on
          WhatsApp — see the delivery-time rule in CLAUDE.md. */}
      {justClosed ? (
        <div className="cutoff closed">
          {DOW_LONG[justClosed.getDay()]} is closed — the next available day is{" "}
          {longDate(first)}.
        </div>
      ) : !cutoffIsToday ? (
        <div className="cutoff">
          Order by {clock(info.cutoff_time)} {DOW_LONG[cutoffDay.getDay()]} for{" "}
          {longDate(first)}.
        </div>
      ) : (
        <div className="cutoff">
          Order by {clock(info.cutoff_time)} today for {longDate(first)}.
          {minsLeft !== null && minsLeft <= 60 && minsLeft > 0 && (
            <span className="soon">
              Orders close in {minsLeft} minute{minsLeft === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      <div className="wrap">
        {/* 1 — packs */}
        <section className="step" ref={packsStep} tabIndex={-1} aria-labelledby="step-packs">
          <div className="step-head">
            <span className="step-num">1</span>
            <h2 id="step-packs">What would you like?</h2>
          </div>

          <div className="packs" role="group" aria-label="Pack sizes">
            {info.products.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pack"
                aria-pressed={(qty[p.id] ?? 0) > 0}
                onClick={() =>
                  setQty((q) => ({ ...q, [p.id]: (q[p.id] ?? 0) > 0 ? 0 : 1 }))
                }
              >
                <span className="chosen" aria-hidden="true">
                  ✓
                </span>
                <span className="size">{p.weight_grams}g</span>
                <span className="price">{rupees(p.price)}</span>
              </button>
            ))}
          </div>

          {info.products
            .filter((p) => (qty[p.id] ?? 0) > 0)
            .map((p) => (
              <div className="qty" key={p.id}>
                <span className="lbl">{p.weight_grams}g packs</span>
                <div className="ctrls">
                  <button
                    type="button"
                    aria-label={`One less ${p.weight_grams}g pack`}
                    onClick={() =>
                      setQty((q) => ({ ...q, [p.id]: Math.max(0, (q[p.id] ?? 0) - 1) }))
                    }
                  >
                    −
                  </button>
                  <span className="n">{qty[p.id]}</span>
                  <button
                    type="button"
                    aria-label={`One more ${p.weight_grams}g pack`}
                    disabled={(qty[p.id] ?? 0) >= 20}
                    onClick={() =>
                      setQty((q) => ({ ...q, [p.id]: Math.min(20, (q[p.id] ?? 0) + 1) }))
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
        </section>

        {/* 2 — date */}
        <section className="step" ref={dateStep} tabIndex={-1} aria-labelledby="step-date">
          <div className="step-head">
            <span className="step-num">2</span>
            <h2 id="step-date">When would you like it?</h2>
          </div>
          {/* Three options only. get_ordering_info already returns the correct
              set for any moment, so this is a slice, not a recalculation. */}
          <div className="dates" role="group" aria-label="Delivery day">
            {offered.map((iso) => {
              const d = parseDate(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  className="date"
                  aria-pressed={date === iso}
                  onClick={() => setDate(iso)}
                >
                  <span className="chosen" aria-hidden="true">
                    ✓
                  </span>
                  <span className="dow">{DOW[d.getDay()]}</span>
                  <span className="dnum">{d.getDate()}</span>
                  <span className="mon">{MON[d.getMonth()]}</span>
                </button>
              );
            })}
          </div>
          <p className="window">
            Your paneer is made the evening before it reaches you. We do this
            three days a week for now, so nothing is rushed. Need another day?{" "}
            <a
              href={waLink(
                "Hi Navera, could I get paneer on a day that isn't listed?"
              )}
              {...newTab}
            >
              Message us
              <NewTabNote />
            </a>
            {/* Hugs the link — a newline here renders as "Message us ." */}.
          </p>
        </section>

        {/* 3 — details */}
        <section className="step" ref={detailsStep} tabIndex={-1} aria-labelledby="step-details">
          <div className="step-head">
            <span className="step-num">3</span>
            <h2 id="step-details">Where should we deliver?</h2>
          </div>

          {remembered && (
            <p className="remembered">
              These are the details you used last time.{" "}
              {/* Only when this device holds the account link. An internal
                  link to our own private page is the one place that token is
                  allowed to appear — never in a message, never outbound. */}
              {accountToken && (
                <>
                  <Link className="yourorders" href={`/my/${accountToken}`}>
                    See your orders
                  </Link>{" "}
                </>
              )}
              {/* Families share a phone and a laptop, so the way out has to be
                  on screen rather than buried in browser settings. */}
              <button type="button" className="notyou" onClick={notYou}>
                Not you?
              </button>
            </p>
          )}

          <div className="field">
            <label htmlFor="nm">Your name</label>
            <input
              id="nm"
              value={name}
              autoComplete="name"
              required
              aria-required="true"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="ph">WhatsApp number</label>
            <input
              id="ph"
              value={phone}
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              placeholder="10 digits"
              required
              aria-required="true"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>

          <div className="field">
            <label htmlFor="ar">Community</label>
            <select
              id="ar"
              value={areaId}
              required
              aria-required="true"
              onChange={(e) => setAreaId(e.target.value)}
            >
              <option value="">Choose your community</option>
              {info.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {/* New tab on purpose: tapping this must not throw away a
                half-filled order. */}
            <a
              className="notlisted"
              href={waLink(
                "Hi Navera, my community isn't on the list. Do you deliver to us?"
              )}
              {...newTab}
            >
              Not listed? WhatsApp us
              <NewTabNote />
            </a>
          </div>

          <div className="field">
            <label htmlFor="fl">Flat / block</label>
            <input
              id="fl"
              value={flat}
              placeholder="e.g. B-302"
              required
              aria-required="true"
              onChange={(e) => setFlat(e.target.value)}
            />
          </div>

          {/* The Morning / Evening / No preference control was removed on
              2026-08-15 (approved reversal of an earlier locked decision).
              orders.time_preference and place_order's p_time_preference both
              remain, nullable and defaulting to null — the page simply stops
              sending a value. The admin's manual-entry screen still offers it. */}

          <div className="field">
            <label htmlFor="an">Anything to help us find you? (optional)</label>
            <input
              id="an"
              value={addressNote}
              maxLength={200}
              placeholder="e.g. near the side gate, or call on arrival"
              onChange={(e) => setAddressNote(e.target.value)}
            />
          </div>
        </section>

        {/* summary — now also the review step. It shows the three things being
            committed to, each with its own way back, so nothing is confirmed
            that the customer hasn't had a last chance to change. */}
        <div className="summary">
          <div className="sum-head">
            <span>Your order</span>
            <button
              type="button"
              className="sum-change"
              aria-label="Change your packs"
              onClick={() => backTo(packsStep)}
            >
              Change
            </button>
          </div>

          {orderedLines.map((l) => (
            <div className="line" key={l.product_id}>
              <span>
                {l.quantity} × {l.product.weight_grams}g
              </span>
              <span>{rupees(Number(l.product.price) * l.quantity)}</span>
            </div>
          ))}
          {orderedLines.length === 0 && <div className="line">No packs chosen yet</div>}
          {Number(info.delivery_charge) > 0 && (
            <div className="line">
              <span>Delivery</span>
              <span>{rupees(info.delivery_charge)}</span>
            </div>
          )}

          <div className="sum-row">
            <span className="k">Delivery day</span>
            <span className="v">{date ? longDate(parseDate(date)) : "Not chosen yet"}</span>
            <button
              type="button"
              className="sum-change"
              aria-label="Change your delivery day"
              onClick={() => backTo(dateStep)}
            >
              Change
            </button>
          </div>

          <div className="sum-row">
            <span className="k">Deliver to</span>
            <span className="v">{addressSummary || "Not filled in yet"}</span>
            <button
              type="button"
              className="sum-change"
              aria-label="Change your delivery details"
              onClick={() => backTo(detailsStep)}
            >
              Change
            </button>
          </div>

          <div className="total">
            <span className="k">To pay on delivery</span>
            <span className="v">{rupees(total)}</span>
          </div>
        </div>

        <button
          className="cta"
          disabled={!ready || busy}
          aria-describedby={ready ? undefined : "cta-hint"}
          onClick={submit}
        >
          {busy ? "Placing your order…" : "Confirm fresh paneer"}
        </button>

        {/* A disabled button that says nothing is a dead end. Say what's left. */}
        {!ready && (
          <p className="cta-hint" id="cta-hint">
            Still needed: {missing.join(", ")}.
          </p>
        )}

        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}

        {/* signature — why we make it the night before.
            The heading used to read "Why tomorrow, and not today", which was
            true when every delivery was next-day. Under Sat/Sun/Mon the wait
            can be five days, but the preparation-to-delivery gap is always one
            night, so the new heading holds either way. The steps below were
            audited at the same time and none of them name a day or imply
            same-day preparation, so they are unchanged. */}
        <section className="thread">
          <h3>Why we make it the night before</h3>
          <p className="why">
            Your paneer never exists until you order it. Nothing sits in cold
            storage or on a shelf waiting for a buyer.
          </p>
          <div className="moments">
            <div className="moment">
              <div className="when">You order</div>
              <div className="what">Before {clock(info.cutoff_time)}, for the day you chose.</div>
            </div>
            <div className="moment">
              <div className="when">We procure fresh milk</div>
              <div className="what">
                Milk from free-roaming cared cows, brought in for your order.
              </div>
            </div>
            <div className="moment">
              <div className="when">We prepare fresh paneer</div>
              <div className="what">Milk and lemon. Nothing else goes in.</div>
            </div>
            <div className="moment">
              <div className="when">Carefully packed</div>
              <div className="what">Packed as soon as it is made.</div>
            </div>
            <div className="moment">
              <div className="when">Delivered fresh</div>
              <div className="what">To your door on the day you chose.</div>
            </div>
          </div>
        </section>

        <div className="foot">
          <a
            className="wa"
            href={waLink("Hi Navera, I have a question about your paneer.")}
            {...newTab}
          >
            Questions? WhatsApp us
            <NewTabNote />
          </a>
          <p className="fssai">FSSAI Lic. No. 22426358000260</p>
        </div>
      </div>
    </main>
  );
}

/* Every WhatsApp link leaves the site, and leaving mid-order would lose a
   half-filled form. They all open in a new tab, and say so for screen readers. */
const newTab = { target: "_blank", rel: "noopener noreferrer" };
const NewTabNote = () => <span className="sr-only"> (opens in a new tab)</span>;
