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

  const subtotal = useMemo(() => {
    if (!info) return 0;
    return items.reduce((sum, it) => {
      const p = info.products.find((x) => x.id === it.product_id);
      return sum + (p ? Number(p.price) * it.quantity : 0);
    }, 0);
  }, [items, info]);

  const total = subtotal + Number(info?.delivery_charge ?? 0);
  const ready = items.length > 0 && date && name.trim() && phone.trim() && areaId && flat.trim();

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
        p_time_preference: timePref === "earlier" || timePref === "later" ? timePref : null,
        p_address_note: addressNote.trim() || null,
      });
      setDone(res);
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
          <div className="err" style={{ marginTop: 28 }}>
            We couldn&apos;t load today&apos;s ordering details. Please refresh, or
            message us on WhatsApp and we&apos;ll take your order there.
          </div>
          <div className="foot">
            <a className="wa" href={waLink("Hi Navera, I'd like to place an order.")}>
              WhatsApp us
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
    return (
      <main>
        <Masthead />
        <div className="wrap done">
          <div className="tick">✓</div>
          <h1>Thank you, {done.name.split(" ")[0]}</h1>
          <div className="ref">{done.reference}</div>
          <p className="msg">
            Your paneer will be prepared fresh on {dayName} morning. We&apos;ll
            confirm your delivery time on WhatsApp.
          </p>

          <div className="card">
            <div className="k">Delivery</div>
            <div className="v">
              {dayName}, {d.getDate()} {MON[d.getMonth()]}
            </div>
            <div className="k">To pay on delivery</div>
            <div className="v">{rupees(done.total)}</div>
          </div>

          <div className="foot">
            <a
              className="wa"
              href={waLink(
                `Hi Navera, this is about my order ${done.reference}.`
              )}
            >
              Message us about this order
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

      {info.past_cutoff ? (
        <div className="cutoff closed">
          Today&apos;s orders have closed. Next delivery is {firstDay} morning.
        </div>
      ) : (
        <div className="cutoff">
          Order before {info.cutoff_time} for {firstDay} morning
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

          <div className="packs">
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
                <div className="size">{p.weight_grams}g</div>
                <div className="price">{rupees(p.price)}</div>
                <div className="per">
                  {rupees(Math.round((p.price / p.weight_grams) * 1000))}/kg
                </div>
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
            <h2>Which morning?</h2>
          </div>
          <div className="dates">
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
                  <div className="dow">{DOW[d.getDay()]}</div>
                  <div className="dnum">{d.getDate()}</div>
                  <div className="mon">{MON[d.getMonth()]}</div>
                </button>
              );
            })}
          </div>
          <p className="window">Delivered fresh that morning.</p>
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
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>

          <div className="field">
            <label htmlFor="ar">Community</label>
            <select id="ar" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Choose your community</option>
              {info.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <a
              className="notlisted"
              href={waLink(
                "Hi Navera, my community isn't on the list. Do you deliver to us?"
              )}
            >
              Not listed? WhatsApp us
            </a>
          </div>

          <div className="field">
            <label htmlFor="fl">Flat / block</label>
            <input
              id="fl"
              value={flat}
              placeholder="e.g. B-302"
              onChange={(e) => setFlat(e.target.value)}
            />
          </div>

          {/* A preference, not a bookable slot — deliberately no clock times. */}
          <div className="field">
            <span className="lbl">Preferred delivery time (optional)</span>
            <div className="bands" role="group" aria-label="Preferred delivery time (optional)">
              {[
                ["earlier", "Earlier morning"],
                ["later", "Later morning"],
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
          {items.map((it) => {
            const p = info.products.find((x) => x.id === it.product_id);
            return (
              <div className="line" key={it.product_id}>
                <span>
                  {p.weight_grams}g × {it.quantity}
                </span>
                <span>{rupees(Number(p.price) * it.quantity)}</span>
              </div>
            );
          })}
          {items.length === 0 && <div className="line">No packs chosen yet</div>}
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

        <button className="cta" disabled={!ready || busy} onClick={submit}>
          {busy ? "Placing your order…" : "Confirm fresh paneer"}
        </button>

        {error && <div className="err">{error}</div>}

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
              <div className="what">Before {info.cutoff_time}, for the morning you chose.</div>
            </div>
            <div className="moment">
              <div className="when">We procure fresh milk</div>
              <div className="what">Country cow milk, brought in for your order.</div>
            </div>
            <div className="moment">
              <div className="when">We prepare fresh paneer</div>
              <div className="what">Milk and lemon. Nothing else goes in.</div>
            </div>
            <div className="moment">
              <div className="when">Carefully packed</div>
              <div className="what">Packed the same morning it is made.</div>
            </div>
            <div className="moment">
              <div className="when">Delivered fresh</div>
              <div className="what">
                To your doorstep the morning you chose.
              </div>
            </div>
          </div>
        </section>

        <div className="foot">
          <a className="wa" href={waLink("Hi Navera, I have a question about your paneer.")}>
            Questions? WhatsApp us
          </a>
          <p className="fssai">FSSAI Lic. No. 22426358000260</p>
          <p className="made">Made in Koliyanur, Viluppuram. Delivered in Chennai.</p>
        </div>
      </div>
    </main>
  );
}

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
      <div className="lede">
        Fresh paneer,
        <br />
        <em>prepared after your order.</em>
      </div>
      <div className="two">Country cow milk and fresh lemon. Nothing else.</div>
    </header>
  );
}
