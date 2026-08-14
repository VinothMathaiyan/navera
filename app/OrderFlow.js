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

// get_ordering_info formats the cutoff with to_char(...'HH12:MI AM'), which
// pads to "06:00 PM". Nobody writes the hour that way. Trimmed here rather than
// in the database, so no settings or function signature has to change.
const clock = (t) => (t ?? "").replace(/^0/, "");

/* One way of writing an order out in words — "1 × 500g, 2 × 200g", biggest pack
   first, the way you'd say it aloud. Used by the summary, the confirmation card
   and the WhatsApp messages so all three always agree. `sep` is the only thing
   that varies: WhatsApp gets the tighter "1×500g". */
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
  // "" = untouched, "none" = explicitly chose No preference. Both store null;
  // they are kept apart only so nothing looks pre-selected on first load.
  const [timePref, setTimePref] = useState("");
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
  // made without them. Only the time preference and the address note are
  // optional, and both are marked as such.
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
        p_time_preference: timePref === "morning" || timePref === "evening" ? timePref : null,
        p_address_note: addressNote.trim() || null,
      });
      // Snapshot what was ordered alongside the server's answer. place_order
      // returns the reference, date and total but not the packs, and this is
      // the one order the confirmation screen is ever allowed to speak about.
      setDone({
        ...res,
        packs: packBreakdown(items, info.products, " × "),
        packsCompact: packBreakdown(items, info.products, "×"),
      });
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
    const dateStr = `${dayName}, ${d.getDate()} ${MON[d.getMonth()]}`;

    // Exactly one order — this one. Never a running list of everything the
    // customer has ever ordered. The packs, day and amount travel with it so
    // the message reads whole on its own.
    const enquiry =
      `Hi Navera, about my order ${done.reference}` +
      `${done.packsCompact ? ` — ${done.packsCompact}` : ""}, ${dateStr}, ${rupees(done.total)}.`;

    return (
      <main>
        <Masthead />
        <div className="wrap done">
          <div className="tick" aria-hidden="true">
            ✓
          </div>
          <h2 className="done-h">Thank you, {done.name.split(" ")[0]}</h2>
          <p className="msg">
            Your paneer will be prepared fresh on {dayName}. We&apos;ll reach out
            on WhatsApp with more details.
          </p>

          <div className="card">
            <div className="k">Delivery</div>
            <div className="v">
              {dayName}, {d.getDate()} {MON[d.getMonth()]}
            </div>
            {done.packs && (
              <>
                <div className="k">Packs</div>
                <div className="v">{done.packs}</div>
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
  const firstDay = DOW_LONG[first.getDay()];

  return (
    <main>
      <Masthead />

      {/* No delivery time is promised here, only the day. The time is agreed on
          WhatsApp — see the delivery-time rule in CLAUDE.md. */}
      {info.past_cutoff ? (
        <div className="cutoff closed">
          Today&apos;s orders have closed. The next delivery day is {firstDay}, {first.getDate()} {MON[first.getMonth()]}.
        </div>
      ) : (
        <div className="cutoff">
          Order before {clock(info.cutoff_time)} for {firstDay}, {first.getDate()} {MON[first.getMonth()]}
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
            <h2>Which day would you prefer to deliver?</h2>
          </div>
          {/* Bleeds past the wrap so the next card is visibly cut off by the
              screen edge — that overhang is the cue that the row scrolls. */}
          <div className="dates" role="group" aria-label="Delivery day">
            {info.delivery_dates.map((iso) => {
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
          <p className="window">Prepared and delivered fresh on the day you choose.</p>
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

          {/* A preference, not a bookable slot — deliberately no clock times. */}
          <div className="field">
            <span className="lbl" id="tp-lbl">
              Preferred delivery time (optional)
            </span>
            <div className="bands" role="group" aria-labelledby="tp-lbl">
              {[
                ["morning", "Morning"],
                ["evening", "Evening"],
                ["none", "No preference"],
              ].map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  className="band"
                  aria-pressed={timePref === value}
                  onClick={() => setTimePref(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint">We&apos;ll try to match it and confirm on WhatsApp.</p>
          </div>

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

        {/* signature — why tomorrow */}
        <section className="thread">
          <h3>Why tomorrow, and not today</h3>
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
      <div className="logo-wrap">
        <Image
          src="/navera-logo.png"
          alt="Navera Fresh Paneer"
          fill
          priority
          sizes="(max-width: 480px) 58vw, 230px"
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
