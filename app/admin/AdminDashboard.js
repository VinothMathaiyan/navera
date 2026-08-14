"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentSession, db, signIn, signOut, SessionExpired } from "../../lib/admin";
import { computeForecast } from "./forecast";
import Settings from "./Settings";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

/* Dates are handled as plain YYYY-MM-DD calendar strings throughout — never as
   Date objects crossing a timezone — so the forecast can't slide a day when the
   browser sits in a different zone from the kitchen. */

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "Today" as the business reckons it, not as the laptop's clock does.
function todayISO(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return toISO(new Date());
  }
}

function parts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = parts(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const dayName = (iso) => DOW_LONG[parts(iso).getDay()];
const shortDate = (iso) => {
  const d = parts(iso);
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
};

// The next `count` delivery days, starting with today if today is one — the
// morning of a delivery is exactly when the forecast matters most.
function upcomingDeliveryDates(deliveryDays, fromISO, count = 8) {
  const days = new Set((deliveryDays ?? []).map(Number));
  const out = [];
  for (let i = 0; out.length < count && i < 90; i++) {
    const iso = addDays(fromISO, i);
    if (days.has(parts(iso).getDay())) out.push(iso);
  }
  return out;
}

const SOURCE_LABEL = {
  website: "Website",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  qr: "QR",
  manual: "Manual",
  weekly: "Weekly",
};

const TIME_PREF_LABEL = { morning: "Morning", evening: "Evening" };

const ORDER_SELECT =
  "id,reference,delivery_date,status,source,subtotal,delivery_charge,total,notes," +
  "time_preference,address_note,created_at," +
  "customer:customers(id,name,phone,flat,area:delivery_areas(name))," +
  "items:order_items(quantity,weight_grams,unit_price)";

export default function AdminDashboard() {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState(null);

  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [areas, setAreas] = useState([]);

  const [date, setDate] = useState(null);
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [view, setView] = useState("dashboard");

  // localStorage can only be read after mount, or server and client HTML differ.
  useEffect(() => {
    setSession(currentSession());
    setBooted(true);
  }, []);

  const dropToLogin = useCallback(() => {
    setSession(null);
    setSettings(null);
    setOrders([]);
    setDate(null);
  }, []);

  /* ------------------------------------------------ reference data */

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsRows, productRows, areaRows] = await Promise.all([
          db("settings?select=*&limit=1"),
          db("products?select=id,name,weight_grams,price&is_active=eq.true&order=sort_order"),
          db("delivery_areas?select=id,name&is_active=eq.true&order=sort_order"),
        ]);
        if (cancelled) return;

        const s = settingsRows?.[0] ?? null;
        setSettings(s);
        setProducts(productRows ?? []);
        setAreas(areaRows ?? []);

        const today = todayISO(s?.timezone ?? "Asia/Kolkata");
        const upcoming = upcomingDeliveryDates(s?.delivery_days, today);
        setDate((d) => d ?? upcoming[0] ?? today);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof SessionExpired) dropToLogin();
        else setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, dropToLogin]);

  /* ------------------------------------------------ orders for the date */

  const loadOrders = useCallback(async () => {
    if (!session || !date) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await db(
        `orders?select=${ORDER_SELECT}&delivery_date=eq.${date}&order=created_at.asc`
      );
      setOrders(rows ?? []);
    } catch (e) {
      if (e instanceof SessionExpired) dropToLogin();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, date, dropToLogin]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  /* ------------------------------------------------ forecast */

  // Both litres-per-kg and lemons-per-litre are admin-editable rows, never
  // assumed here. See ./forecast.js for the maths and the rounding rule.
  const forecast = useMemo(() => computeForecast(orders, settings), [orders, settings]);

  /* ------------------------------------------------ render */

  if (!booted) {
    return <div className="ad-boot">Loading…</div>;
  }

  if (!session) {
    return <Login onSignedIn={setSession} />;
  }

  const today = todayISO(settings?.timezone ?? "Asia/Kolkata");
  const dates = upcomingDeliveryDates(settings?.delivery_days, today);

  return (
    <main className="ad">
      <header className="ad-top">
        <div className="ad-brand">
          <span className="ad-mark">Navera</span>
          <span className="ad-tag">Admin</span>
        </div>
        <button
          type="button"
          className="ad-signout"
          onClick={async () => {
            await signOut();
            dropToLogin();
          }}
        >
          Sign out
        </button>
      </header>

      <nav className="ad-tabs" aria-label="Admin sections">
        <button
          type="button"
          className="ad-tab"
          aria-pressed={view === "dashboard"}
          onClick={() => setView("dashboard")}
        >
          Dashboard
        </button>
        <button
          type="button"
          className="ad-tab"
          aria-pressed={view === "settings"}
          onClick={() => setView("settings")}
        >
          Settings
        </button>
      </nav>

      {view === "settings" ? (
        <div className="ad-wrap">
          {error && <div className="ad-err">{error}</div>}
          <Settings
            settings={settings}
            onExpired={dropToLogin}
            // Push the saved row straight back into state so the forecast and
            // the delivery-date row re-derive from it immediately, rather than
            // waiting for a reload to catch up with what was just saved.
            onSaved={setSettings}
          />
        </div>
      ) : (
      <div className="ad-wrap">
        {/* delivery date */}
        <section className="ad-section">
          <h2 className="ad-h">Delivery date</h2>
          <div className="ad-dates">
            {dates.map((iso) => (
              <button
                key={iso}
                type="button"
                className="ad-date"
                aria-pressed={date === iso}
                onClick={() => setDate(iso)}
              >
                <span className="dow">{DOW[parts(iso).getDay()]}</span>
                <span className="dnum">{parts(iso).getDate()}</span>
                <span className="mon">{MON[parts(iso).getMonth()]}</span>
                {iso === today && <span className="tdy">Today</span>}
              </button>
            ))}
          </div>
          <div className="ad-anydate">
            <label htmlFor="anydate">Or any date</label>
            <input
              id="anydate"
              type="date"
              value={date ?? ""}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
        </section>

        {error && <div className="ad-err">{error}</div>}

        {/* forecast */}
        <section className="ad-forecast">
          <div className="ad-fc-head">
            <h2>Production for {date ? dayName(date) : "—"}</h2>
            <span className="ad-fc-date">{date ? shortDate(date) : ""}</span>
          </div>

          {/* Two shopping numbers, equal weight — this is what gets bought. */}
          <div className="ad-hero">
            <div className="ad-hero-fig">
              <div className="ad-hero-n">
                {forecast.litres.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
              </div>
              <div className="ad-hero-l">litres of milk</div>
            </div>
            <div className="ad-hero-fig">
              <div className="ad-hero-n">{forecast.lemons}</div>
              <div className="ad-hero-l">
                lemon{forecast.lemons === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="ad-hero-sub">
            {forecast.kg.toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg paneer
            {forecast.perKg > 0 && <> · {forecast.perKg} litres per kg</>}
            {forecast.litres > 0 && <> · {forecast.perLitre} lemon per litre, rounded up</>}
          </div>

          <div className="ad-fc-grid">
            {forecast.bySize.length === 0 && (
              <div className="ad-fc-empty">No packs ordered for this date yet.</div>
            )}
            {forecast.bySize.map(([grams, count]) => (
              <div className="ad-fc-cell" key={grams}>
                <div className="n">{count}</div>
                <div className="l">
                  {grams}g pack{count === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>

          <div className="ad-fc-foot">
            {forecast.orderCount} order{forecast.orderCount === 1 ? "" : "s"} ·{" "}
            {forecast.packs} pack{forecast.packs === 1 ? "" : "s"} total
            {forecast.cancelled > 0 && (
              <> · {forecast.cancelled} cancelled, not counted</>
            )}
          </div>
        </section>

        {/* manual entry */}
        {entryOpen ? (
          <ManualEntry
            settings={settings}
            products={products}
            areas={areas}
            dates={dates}
            defaultDate={date}
            onClose={() => setEntryOpen(false)}
            onCreated={async (created) => {
              // Jump to the date the order was actually filed under, so the new
              // row is visible rather than silently landing on another day.
              if (created.delivery_date !== date) setDate(created.delivery_date);
              else await loadOrders();
            }}
            onExpired={dropToLogin}
          />
        ) : (
          <button type="button" className="ad-add" onClick={() => setEntryOpen(true)}>
            + Add a WhatsApp order
          </button>
        )}

        {/* orders */}
        <section className="ad-section">
          <div className="ad-orders-head">
            <h2 className="ad-h">Orders</h2>
            <button type="button" className="ad-refresh" onClick={loadOrders} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!loading && orders.length === 0 && (
            <div className="ad-empty">
              No orders for {date ? shortDate(date) : "this date"} yet.
            </div>
          )}

          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              settings={settings}
              onDispatched={(id) =>
                setOrders((prev) =>
                  prev.map((o) => (o.id === id ? { ...o, status: "dispatched" } : o))
                )
              }
              onExpired={dropToLogin}
            />
          ))}
        </section>
      </div>
      )}
    </main>
  );
}

/* ================================================== login */

function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signIn(email, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="ad-login">
      <form className="ad-login-box" onSubmit={submit}>
        <div className="ad-login-mark">Navera</div>
        <div className="ad-login-sub">Admin</div>

        <div className="field">
          <label htmlFor="em">Email</label>
          <input
            id="em"
            type="email"
            value={email}
            autoComplete="username"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="ad-err">{error}</div>}

        <button className="cta" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

/* ================================================== manual entry */

function ManualEntry({
  settings,
  products,
  areas,
  dates,
  defaultDate,
  onClose,
  onCreated,
  onExpired,
}) {
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState({ state: "idle", customer: null });

  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [flat, setFlat] = useState("");
  const [notes, setNotes] = useState("");
  // "" = untouched, "none" = explicitly chose No preference. Both store null.
  const [timePref, setTimePref] = useState("");
  const [addressNote, setAddressNote] = useState("");

  const [qty, setQty] = useState({});
  const [date, setDate] = useState(defaultDate);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  // The speed of this screen lives here: the moment the tenth digit lands we
  // already know whether the other four fields are needed.
  useEffect(() => {
    if (phone.length !== 10) {
      setLookup({ state: "idle", customer: null });
      return;
    }

    let cancelled = false;
    setLookup({ state: "searching", customer: null });

    (async () => {
      try {
        const rows = await db(
          `customers?select=id,name,phone,flat,delivery_area_id&phone=eq.${phone}&limit=1`
        );
        if (cancelled) return;

        const customer = rows?.[0] ?? null;
        setLookup({ state: customer ? "found" : "new", customer });
        if (customer) {
          setName(customer.name ?? "");
          setAreaId(customer.delivery_area_id ?? "");
          setFlat(customer.flat ?? "");
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof SessionExpired) onExpired();
        else setLookup({ state: "error", customer: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phone, onExpired]);

  const lines = useMemo(
    () =>
      products
        .filter((p) => (qty[p.id] ?? 0) > 0)
        .map((p) => ({
          product_id: p.id,
          quantity: qty[p.id],
          // Priced from the products table, never from anything typed in.
          unit_price: Number(p.price),
          weight_grams: p.weight_grams,
        })),
    [products, qty]
  );

  const subtotal = lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const deliveryCharge = Number(settings?.delivery_charge ?? 0);
  const total = subtotal + deliveryCharge;

  const known = lookup.state === "found";
  const ready =
    phone.length === 10 &&
    (known || lookup.state === "new") &&
    name.trim() &&
    areaId &&
    flat.trim() &&
    lines.length > 0 &&
    date;

  async function submit() {
    setBusy(true);
    setError(null);
    let orderId = null;

    try {
      // 1 — customer. Writing the form values back on every order means a
      // corrected flat number or a move to another block sticks.
      let customerId = lookup.customer?.id ?? null;
      const details = { name: name.trim(), delivery_area_id: areaId, flat: flat.trim() };

      if (customerId) {
        await db(`customers?id=eq.${customerId}`, {
          method: "PATCH",
          body: details,
          prefer: "return=minimal",
        });
      } else {
        const created = await db("customers", {
          method: "POST",
          body: { phone, ...details },
          prefer: "return=representation",
        });
        customerId = created?.[0]?.id;
        if (!customerId) throw new Error("Could not save the customer. Please try again.");
      }

      // 2 — order. source='whatsapp' is the entire point of this screen: these
      // orders were previously invisible to the milk forecast.
      const orderRows = await db("orders", {
        method: "POST",
        body: {
          customer_id: customerId,
          delivery_date: date,
          source: "whatsapp",
          subtotal,
          delivery_charge: deliveryCharge,
          total,
          notes: notes.trim() || null,
          time_preference:
            timePref === "morning" || timePref === "evening" ? timePref : null,
          address_note: addressNote.trim() || null,
        },
        prefer: "return=representation",
      });

      const order = orderRows?.[0];
      if (!order?.id) throw new Error("Could not save the order. Please try again.");
      orderId = order.id;

      // 3 — items, in one request.
      await db("order_items", {
        method: "POST",
        body: lines.map((l) => ({ order_id: order.id, ...l })),
        prefer: "return=minimal",
      });

      setDone(order);
      await onCreated(order);
    } catch (e) {
      if (e instanceof SessionExpired) {
        onExpired();
        return;
      }
      // An order with no items would quietly under-count the milk, which is
      // worse than no order at all. Roll it back rather than leave it.
      if (orderId) {
        await db(`orders?id=eq.${orderId}`, { method: "DELETE", prefer: "return=minimal" }).catch(
          () => {}
        );
        setError("The packs didn't save, so the order was rolled back. Please try again.");
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhone("");
    setLookup({ state: "idle", customer: null });
    setName("");
    setAreaId("");
    setFlat("");
    setNotes("");
    setTimePref("");
    setAddressNote("");
    setQty({});
    setDone(null);
    setError(null);
  }

  if (done) {
    return (
      <section className="ad-entry">
        <div className="ad-entry-done">
          <div className="tick">✓</div>
          <div className="ref">{done.reference}</div>
          <p>
            Saved for {shortDate(done.delivery_date)} — {rupees(done.total)} on delivery.
          </p>
          <div className="ad-entry-actions">
            <button type="button" className="cta" onClick={reset}>
              Add another
            </button>
            <button type="button" className="ad-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ad-entry">
      <div className="ad-entry-head">
        <h2>WhatsApp order</h2>
        <button type="button" className="ad-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="field">
        <label htmlFor="mp">Their number</label>
        <input
          id="mp"
          value={phone}
          inputMode="numeric"
          autoFocus
          maxLength={10}
          placeholder="10 digits"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
        />
      </div>

      {lookup.state === "searching" && <div className="ad-lookup">Looking up…</div>}

      {lookup.state === "error" && (
        <div className="ad-err">
          Couldn&apos;t check that number. Fill the details in below and it will still save.
        </div>
      )}

      {known && (
        <div className="ad-known">
          <strong>{lookup.customer.name}</strong>
          <span>
            {areas.find((a) => a.id === areaId)?.name ?? "—"} · {flat || "—"}
          </span>
          <button type="button" className="ad-editlink" onClick={() => setLookup({ ...lookup, state: "new" })}>
            Change details
          </button>
        </div>
      )}

      {/* Four extra fields, and only for someone we haven't served before. */}
      {(lookup.state === "new" || lookup.state === "error") && (
        <>
          <div className="field">
            <label htmlFor="mn">Name</label>
            <input id="mn" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="ma">Community</label>
            <select id="ma" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Choose community</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="mf">Flat / block</label>
            <input
              id="mf"
              value={flat}
              placeholder="e.g. B-302"
              onChange={(e) => setFlat(e.target.value)}
            />
          </div>
        </>
      )}

      {phone.length === 10 && (
        <>
          <div className="ad-sub">Packs</div>
          {products.map((p) => (
            <div className="qty" key={p.id}>
              <span className="lbl">
                {p.weight_grams}g · {rupees(p.price)}
              </span>
              <div className="ctrls">
                <button
                  type="button"
                  aria-label={`One less ${p.weight_grams}g pack`}
                  onClick={() => setQty((q) => ({ ...q, [p.id]: Math.max(0, (q[p.id] ?? 0) - 1) }))}
                >
                  −
                </button>
                <span className="n">{qty[p.id] ?? 0}</span>
                <button
                  type="button"
                  aria-label={`One more ${p.weight_grams}g pack`}
                  onClick={() =>
                    setQty((q) => ({ ...q, [p.id]: Math.min(50, (q[p.id] ?? 0) + 1) }))
                  }
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="ad-sub">Delivery date</div>
          <div className="ad-dates">
            {dates.map((iso) => (
              <button
                key={iso}
                type="button"
                className="ad-date"
                aria-pressed={date === iso}
                onClick={() => setDate(iso)}
              >
                <span className="dow">{DOW[parts(iso).getDay()]}</span>
                <span className="dnum">{parts(iso).getDate()}</span>
                <span className="mon">{MON[parts(iso).getMonth()]}</span>
              </button>
            ))}
          </div>

          <div className="ad-sub">Preferred time (optional)</div>
          <div className="bands" role="group" aria-label="Preferred delivery time (optional)">
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

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="maddr">Anything to help find them? (optional)</label>
            <input
              id="maddr"
              value={addressNote}
              maxLength={200}
              placeholder="e.g. near the side gate"
              onChange={(e) => setAddressNote(e.target.value)}
            />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="mnotes">Note (optional)</label>
            <input
              id="mnotes"
              value={notes}
              placeholder="Anything they asked for"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="ad-entry-total">
            <span>To collect on delivery</span>
            <strong>{rupees(total)}</strong>
          </div>
        </>
      )}

      {error && <div className="ad-err">{error}</div>}

      <button className="cta" disabled={!ready || busy} onClick={submit}>
        {busy ? "Saving…" : "Save WhatsApp order"}
      </button>

      <p className="ad-note">
        Saved as a WhatsApp order so it counts toward the milk forecast. The 6 PM
        cutoff isn&apos;t applied here — the order already reached you.
      </p>
    </section>
  );
}

/* ================================================== order card */

function OrderCard({ order, settings, onDispatched, onExpired }) {
  const customer = order.customer ?? {};
  const waNumber = customer.phone ? `91${customer.phone}` : null;
  const firstName = (customer.name ?? "").trim().split(" ")[0] || "there";

  const [dispatchError, setDispatchError] = useState(null);

  const link = (text) =>
    `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;

  // "1 × 500g, 2 × 200g" — same phrasing the customer sees on their
  // confirmation, so the card, the WhatsApp message and their screen all read
  // the same way and there is nothing to translate between them.
  const packs = (order.items ?? [])
    .slice()
    .sort((a, b) => b.weight_grams - a.weight_grams)
    .map((i) => `${i.quantity} × ${i.weight_grams}g`)
    .join(", ");

  // These templates no longer quote settings.delivery_window, and no longer say
  // "morning" either. The business stopped promising a delivery time, and a
  // pre-filled one would put that promise straight back — just over WhatsApp
  // instead of the site. Confirm opens the time conversation, echoing the
  // customer's own stated preference so the founder isn't retyping it.
  const prefEcho = order.time_preference
    ? ` You asked for ${order.time_preference} delivery — we'll aim for that.`
    : "";

  // Both messages carry the whole order, not just its number: the customer
  // should not have to go and look up what NAV-002 was.
  const packEcho = packs ? ` — ${packs}` : "";

  const confirmText =
    `Hi ${firstName}, this is Navera. Your order ${order.reference} is confirmed for ` +
    `${shortDate(order.delivery_date)}${packEcho}. ` +
    `${rupees(order.total)} to pay on delivery.${prefEcho} ` +
    `I'll confirm the delivery time with you closer to the day. Thank you!`;

  const dispatchText =
    `Hi ${firstName}, your Navera order ${order.reference} is packed and on its way` +
    `${packEcho}. ${rupees(order.total)} to pay on delivery.`;

  // The Dispatch link navigates immediately, same as Confirm — a real anchor
  // click, not blocked by popup heuristics. The status write runs alongside
  // it in the background rather than gating the navigation: window.open()
  // called after an awaited PATCH loses the click's user-gesture window and
  // gets silently popup-blocked in real browsers (confirmed against this
  // build — the WhatsApp tab failed to open every time with that ordering).
  // The WhatsApp message itself still needs a press of WhatsApp's own Send
  // button, so nothing goes out without a human reviewing it first.
  function onDispatchClick() {
    setDispatchError(null);
    db(`orders?id=eq.${order.id}`, {
      method: "PATCH",
      body: { status: "dispatched" },
      prefer: "return=minimal",
    })
      .then(() => onDispatched(order.id))
      .catch((e) => {
        if (e instanceof SessionExpired) onExpired();
        else setDispatchError(e.message);
      });
  }

  return (
    <article className={`ad-order${order.status === "cancelled" ? " is-cancelled" : ""}`}>
      <div className="ad-order-top">
        <div>
          <div className="ad-order-name">{customer.name ?? "Unknown"}</div>
          <div className="ad-order-where">
            {customer.area?.name ?? "—"} · {customer.flat ?? "—"}
          </div>
        </div>
        <div className="ad-order-meta">
          <span className="ad-ref">{order.reference}</span>
          <span className={`ad-src src-${order.source}`}>
            {SOURCE_LABEL[order.source] ?? order.source}
          </span>
          {order.status === "dispatched" && (
            <span className="ad-status st-dispatched">Dispatched</span>
          )}
        </div>
      </div>

      <div className="ad-order-packs">{packs || "No packs"}</div>

      <div className="ad-order-line">
        <span>{customer.phone ?? "—"}</span>
        <span>{rupees(order.total)}</span>
      </div>

      {/* Both optional — when absent they leave no trace, rather than an empty label. */}
      {order.time_preference && (
        <div className="ad-order-pref">
          Prefers {TIME_PREF_LABEL[order.time_preference] ?? order.time_preference}
        </div>
      )}

      {order.address_note && (
        <div className="ad-order-find">{order.address_note}</div>
      )}

      {order.notes && <div className="ad-order-note">{order.notes}</div>}

      {dispatchError && <div className="ad-err">{dispatchError}</div>}

      {order.status === "cancelled" ? (
        <div className="ad-order-cancelled">Cancelled — not counted in the forecast</div>
      ) : (
        waNumber && (
          <div className="ad-order-actions">
            <a className="ad-wa" href={link(confirmText)} target="_blank" rel="noopener noreferrer">
              Confirm
            </a>
            <a
              className="ad-wa"
              href={link(dispatchText)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDispatchClick}
            >
              Dispatch
            </a>
          </div>
        )
      )}
    </article>
  );
}
