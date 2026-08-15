"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { rpc } from "../lib/db";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parseDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

const shiftDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "Sunday, 16 Aug"
const longDate = (d) => `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;

// get_ordering_info formats the cutoff with to_char(...'HH12:MI AM'), which
// pads to "06:00 PM". Nobody writes the hour that way. Trimmed here rather than
// in the database, so no settings or function signature has to change.
const clock = (t) => (t ?? "").replace(/^0/, "");

/* One way of writing an order out in words — "1 × 500g, 2 × 200g", biggest pack
   first, the way you'd say it aloud. Used by the summary, the confirmation card
   and the WhatsApp message so all three always agree, spaced × throughout. */
function packBreakdown(items, products, sep = " × ") {
  return items
    .map((it) => {
      const p = products.find((x) => x.id === it.product_id);
      return p ? { grams: Number(p.weight_grams), qty: it.quantity } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.grams - a.grams)
    .map((l) => `${l.qty}${sep}${l.grams}g`)
    .join(", ");
}

export default function OrderFlow({ info, loadError }) {
  const [qty, setQty] = useState({});
  const [date, setDate] = useState(info?.delivery_dates?.[0] ?? null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [flat, setFlat] = useState("");
  const [addressNote, setAddressNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [minsLeft, setMinsLeft] = useState(null);

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
      // Snapshot what was ordered alongside the server's answer. place_order
      // returns the reference, date, total, community and flat but not the
      // packs, and this is the one order the confirmation screen is ever
      // allowed to speak about. community/flat come from the response rather
      // than form state so a re-render can't desync them.
      setDone({ ...res, packs: packBreakdown(items, info.products, " × ") });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e.message);
    } finally {
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

  /* ------------------------------------------------ confirmation */

  if (done) {
    const d = parseDate(done.delivery_date);
    const dayName = DOW_LONG[d.getDay()];
    const dateStr = longDate(d);
    // Every delivery is prepared the evening before — derived, never a lookup
    // table, so it stays right if the delivery days ever change again.
    const prepDayName = DOW_LONG[shiftDays(d, -1).getDay()];

    // Exactly one order — this one, never a running list. No price: it goes
    // stale and a support chat doesn't need it. And no access_token: that is a
    // private credential and WhatsApp messages get forwarded.
    const enquiry =
      `Hi Navera, I've placed order ${done.reference} for ${done.packs} paneer on ${dateStr}.`;

    return (
      <main>
        <Masthead />
        <div className="wrap done">
          <div className="tick" aria-hidden="true">
            ✓
          </div>
          <h2 className="done-h">Thank you, {done.name.split(" ")[0]}</h2>
          <p className="msg">
            Your paneer will be prepared on {prepDayName} evening and delivered
            on {dayName}. We&apos;ll confirm the delivery details with you on
            WhatsApp.
          </p>

          <div className="card">
            <div className="k">Delivery</div>
            <div className="v">{dateStr}</div>
            {done.packs && (
              <>
                <div className="k">Pack</div>
                <div className="v">{done.packs}</div>
              </>
            )}
            {/* Straight from the place_order response, not from form state. */}
            {(done.community || done.flat) && (
              <>
                <div className="k">Deliver to</div>
                <div className="v">
                  {[done.community, done.flat].filter(Boolean).join(", ")}
                </div>
              </>
            )}
            <div className="k">To pay on delivery</div>
            <div className="v">{rupees(done.total)}</div>
            <div className="ordid">Order {done.reference}</div>
          </div>

          <div className="foot">
            <a className="wa" href={waLink(enquiry)} {...newTab}>
              Message us about this order
              <NewTabNote />
            </a>
            <p className="fssai">
              Keep this page — you can reorder from it next time.
            </p>
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
        <section className="step">
          <div className="step-head">
            <span className="step-num">1</span>
            <h2>What would you like?</h2>
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
        <section className="step">
          <div className="step-head">
            <span className="step-num">2</span>
            <h2>When would you like it?</h2>
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
        <section className="step">
          <div className="step-head">
            <span className="step-num">3</span>
            <h2>Where should we deliver?</h2>
          </div>

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

        {/* summary */}
        <div className="summary">
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

function Masthead() {
  return (
    <header className="masthead">
      {/* public/Logo.png is the founder's finished artwork on its own cream
          ground — opaque, not transparent, and deliberately left unprocessed.
          The masthead background is set to that same cream (see --masthead in
          globals.css) so the image has no visible edge. Do not run this file
          through background removal; that was only ever needed for the old
          logo, which had to sit on a dark green header. */}
      <div className="logo-wrap">
        <Image
          src="/Logo.png"
          alt="Navera Fresh Paneer"
          fill
          priority
          sizes="(max-width: 599px) 78vw, 340px"
          style={{ objectFit: "contain" }}
        />
      </div>
      <div className="rule" />
      {/* "Fresh paneer" is already in the logo above — saying it again here read
          as a stutter, so the lede is just the promise. */}
      <h1 className="lede">
        <em>Prepared after your order.</em>
      </h1>
      <p className="two">From free-roaming cared cows, around 100 km away from Chennai.</p>
    </header>
  );
}
