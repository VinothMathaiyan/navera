"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentSession, db, signIn, signOut, SessionExpired } from "../../lib/admin";
import { computeForecast } from "./forecast";
import Settings from "./Settings";
import Areas from "./Areas";
import Production from "./Production";
import {
  nextDeliveryDates,
  nextStatus,
  prevStatus,
  STATUS_LABEL,
} from "./production-summary";

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

// "Sun 16 Aug" — no comma inside, because the card's line joins two of these
// with one: "placed Sun 16 Aug, for Mon 17 Aug".
const dayDate = (iso) => {
  const d = parts(iso);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};

// created_at is a timestamptz, so it has to be reduced to a calendar date in
// the kitchen's timezone before it can be printed. An order placed at 11:40 PM
// in Chennai is 6:10 PM UTC — the same instant, a different day — and the card
// must say the day Gowri would say.
function isoInZone(ts, timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(ts));
  } catch {
    return toISO(new Date(ts));
  }
}

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

/* Which message a status naturally goes with. This is the ONLY link between
   the two axes on an order card, and it is a suggestion in one direction only:
   arriving at a status offers the message, and sending a message never moves a
   status. Dispatch used to write 'dispatched' as a side effect of opening
   WhatsApp — that is what this table replaces. */
const MESSAGE_FOR_STATUS = {
  confirmed: "confirm",
  preparing: "reminder",
  dispatched: "dispatch",
  delivered: "feedback",
};

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

  // Extracted from the boot effect so the Communities screen can re-run it
  // after adding or toggling an area — otherwise the manual-entry dropdown
  // keeps showing the old list until a reload.
  const loadReference = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsRows, productRows, areaRows] = await Promise.all([
        db("settings?select=*&limit=1"),
        db("products?select=id,name,weight_grams,price&is_active=eq.true&order=sort_order"),
        // Active only: this feeds the manual-entry dropdown, which must match
        // what a customer can choose. The Communities screen does its own,
        // unfiltered read.
        db("delivery_areas?select=id,name&is_active=eq.true&order=sort_order"),
      ]);

      const s = settingsRows?.[0] ?? null;
      setSettings(s);
      setProducts(productRows ?? []);
      setAreas(areaRows ?? []);

      const t = todayISO(s?.timezone ?? "Asia/Kolkata");
      const upcoming = upcomingDeliveryDates(s?.delivery_days, t);
      setDate((d) => d ?? upcoming[0] ?? t);
    } catch (e) {
      if (e instanceof SessionExpired) dropToLogin();
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, dropToLogin]);

  useEffect(() => {
    loadReference();
  }, [loadReference]);

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

  /* ------------------------------------------------ the run, for Production */

  // A separate read: the dashboard shows one chosen date, the production table
  // shows the next six delivery days, so they need different windows.
  const [weekOrders, setWeekOrders] = useState([]);

  const weekFrom = todayISO(settings?.timezone ?? "Asia/Kolkata");
  const weekDates = useMemo(
    () => nextDeliveryDates(settings?.delivery_days, weekFrom, 6),
    [settings?.delivery_days, weekFrom]
  );

  const loadWeek = useCallback(async () => {
    if (!session || !settings || weekDates.length === 0) return;
    // Bounded by the dates actually being shown rather than a fixed number of
    // calendar days, so the query and the table can never disagree about how
    // far ahead they reach.
    const from = weekDates[0];
    const to = weekDates[weekDates.length - 1];
    try {
      const rows = await db(
        `orders?select=${ORDER_SELECT}&delivery_date=gte.${from}&delivery_date=lte.${to}` +
          `&order=delivery_date.asc,created_at.asc`
      );
      setWeekOrders(rows ?? []);
    } catch (e) {
      if (e instanceof SessionExpired) dropToLogin();
      else setError(e.message);
    }
  }, [session, settings, weekDates, dropToLogin]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // A status change can affect either list, so both are refreshed together
  // rather than leaving one showing a stale badge.
  const reloadAll = useCallback(async () => {
    await Promise.all([loadOrders(), loadWeek()]);
  }, [loadOrders, loadWeek]);

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
          aria-pressed={view === "production"}
          onClick={() => setView("production")}
        >
          Production
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
        /* is-narrow: a form is read along its lines, so this tab keeps the
           wide gutter but not the wide column. */
        <div className="ad-wrap is-narrow">
          {error && <div className="ad-err">{error}</div>}
          <Settings
            settings={settings}
            onExpired={dropToLogin}
            // Push the saved row straight back into state so the forecast and
            // the delivery-date row re-derive from it immediately, rather than
            // waiting for a reload to catch up with what was just saved.
            onSaved={setSettings}
          />
          {/* Communities live with the other configuration rather than in a
              fourth tab — four tabs do not fit a 360px handset comfortably. */}
          <Areas onExpired={dropToLogin} onAreasChanged={loadReference} />
        </div>
      ) : view === "production" ? (
        <div className="ad-wrap">
          {error && <div className="ad-err">{error}</div>}
          <Production
            orders={weekOrders}
            settings={settings}
            dates={weekDates}
            today={today}
            onChanged={reloadAll}
            onExpired={dropToLogin}
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

          {/* Two shopping numbers, equal weight — this is what gets bought,
              and it is STILL TO MAKE only. Anything already preparing,
              dispatched or delivered has had its milk bought once already;
              counting it again here told Gowri to buy it twice. Whole litres,
              because the shop does not sell 0.2 of one. Both the filter and
              the rounding come from computeForecast, which the production tab
              reads too — the two screens cannot answer differently. */}
          <div className="ad-hero">
            <div className="ad-hero-fig">
              <div className="ad-hero-n">{forecast.milk}</div>
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
            {" still to make"}
            {forecast.perKg > 0 && <> · {forecast.perKg} litres per kg</>}
            {forecast.milk > 0 && <> · {forecast.perLitre} lemon per litre, rounded up</>}
          </div>

          {/* Named for what they are. These are the packs left to make, not
              every pack ordered for the day — the footer below carries that. */}
          <div className="ad-fc-grid">
            {forecast.bySize.length === 0 && (
              <div className="ad-fc-empty">
                {forecast.doneCount > 0
                  ? "Nothing left to make for this date."
                  : "No packs ordered for this date yet."}
              </div>
            )}
            {forecast.bySize.map(([grams, count]) => (
              <div className="ad-fc-cell" key={grams}>
                <div className="n">{count}</div>
                <div className="l">
                  {grams}g pack{count === 1 ? "" : "s"} to make
                </div>
              </div>
            ))}
          </div>

          {/* The gross figures, spelled out rather than folded into the
              headline. Without this line a zero above is indistinguishable
              from a day with no orders at all. */}
          <div className="ad-fc-foot">
            {forecast.orderCount} order{forecast.orderCount === 1 ? "" : "s"} ·{" "}
            {forecast.toMakeCount} still to make · {forecast.packs} pack
            {forecast.packs === 1 ? "" : "s"} to make
            {forecast.doneCount > 0 && (
              <>
                {" "}
                · {forecast.doneCount} already preparing or later, not counted
                {forecast.gross.milk > forecast.milk && (
                  <> ({forecast.gross.milk} L for the whole day)</>
                )}
              </>
            )}
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

          {/* Container only — OrderCard is unchanged. One column on a
              phone, two at lg, three at xl. */}
          <div className="ad-orderlist">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                settings={settings}
                onStatusChanged={reloadAll}
                onExpired={dropToLogin}
              />
            ))}
          </div>
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
          // time_preference is deliberately not sent — the column is nullable
          // and defaults to null. See the note by the removed control above.
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

          {/* The Morning / Evening / No preference control was removed on
              2026-08-16. It was the last thing writing orders.time_preference,
              and the card stopped displaying it when the badge went — so
              anything typed here landed in a column nobody could see. A field
              that silently discards what you tell it is worse than no field.
              The column and place_order's p_time_preference both remain. */}

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

/* The card carries two independent axes, and keeping them apart is the whole
   design:

     STATUS   where the order has got to. One row, one write. Advancing or
              stepping back is the ONLY thing on this card that touches
              orders.status.
     MESSAGE  what gets said to the customer. One WhatsApp button opening a
              short menu. It never writes anything.

   They used to be tangled: Back/Preparing changed status, Confirm sent a
   message, and Dispatch quietly did both. Five controls, one of them doing two
   unrelated jobs — which is exactly what made it unpredictable in testing.
   Dispatch no longer writes status.

   Advancing the status OFFERS the matching message and never sends it. §20 and
   §21 both put a human in that loop deliberately: Gowri taps, reviews, sends. */
function OrderCard({ order, settings, onStatusChanged, onExpired }) {
  const customer = order.customer ?? {};
  const waNumber = customer.phone ? `91${customer.phone}` : null;
  const firstName = (customer.name ?? "").trim().split(" ")[0] || "there";
  const timezone = settings?.timezone ?? "Asia/Kolkata";

  const [error, setError] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Which message the last status change suggests. A suggestion only — it is
  // cleared by sending or by dismissing, and nothing sends on its own.
  const [offer, setOffer] = useState(null);

  // Every transition is a deliberate tap. Nothing advances on a timer or at
  // the cutoff.
  function setStatus(to) {
    setStatusBusy(true);
    setError(null);
    db(`orders?id=eq.${order.id}`, {
      method: "PATCH",
      body: { status: to },
      prefer: "return=minimal",
    })
      .then(() => {
        // The status we just wrote, not order.status. The prop only catches up
        // after onStatusChanged's reload comes back, so reading it here would
        // caption the offer with the status we just left.
        setOffer(MESSAGE_FOR_STATUS[to] ? { to, key: MESSAGE_FOR_STATUS[to] } : null);
        onStatusChanged?.();
      })
      .catch((e) => {
        if (e instanceof SessionExpired) onExpired();
        else setError(e.message);
      })
      .finally(() => {
        setStatusBusy(false);
        setConfirmCancel(false);
      });
  }

  const forward = nextStatus(order.status);
  const back = prevStatus(order.status);

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

  // Every message carries the whole order, not just its number: the customer
  // should not have to go and look up what NAV-002 was.
  const packEcho = packs ? ` — ${packs}` : "";

  const messages = {
    confirm: {
      label: "Confirm",
      hint: "the order is accepted",
      text:
        `Hi ${firstName}, this is Navera. Your order ${order.reference} is confirmed for ` +
        `${shortDate(order.delivery_date)}${packEcho}. ` +
        `${rupees(order.total)} to pay on delivery.${prefEcho} ` +
        `I'll confirm the delivery time with you closer to the day. Thank you!`,
    },
    // §21 — prepared the evening before. It commits to a day and to tonight's
    // batch, never to a delivery time.
    reminder: {
      label: "Reminder",
      hint: "we're making it tonight",
      text:
        `Hi ${firstName}, this is Navera. Your paneer${packEcho} is being made fresh ` +
        `tonight for ${shortDate(order.delivery_date)}. ` +
        `${rupees(order.total)} to pay on delivery.`,
    },
    dispatch: {
      label: "Dispatch",
      hint: "it's on its way",
      text:
        `Hi ${firstName}, your Navera order ${order.reference} is packed and on its way` +
        `${packEcho}. ${rupees(order.total)} to pay on delivery.`,
    },
    // §27 — asked after delivery, and asked as a person rather than a form.
    feedback: {
      label: "Feedback",
      hint: "how was it?",
      text:
        `Hi ${firstName}, hope the paneer was good. If anything wasn't right, ` +
        `tell me and I'll put it right next time. — Navera`,
    },
  };

  // Every one of these is a plain anchor to wa.me and nothing more. WhatsApp
  // opens with the text prefilled and still needs its own Send pressed, so no
  // message ever leaves without a human reading it first.
  const MENU = ["confirm", "dispatch", "reminder", "feedback"];

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
          <span className={`ad-status st-${order.status}`}>
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
        </div>
      </div>

      {/* When it came in, and what it is for. Two dates on one line because
          the gap between them is the thing worth seeing at a glance — an order
          placed today for Sunday behaves nothing like one placed a week ago.
          Deliberately NOT added to the Production table: that table aggregates
          by delivery date, and several orders on one row can have been placed
          on different days, so there is no single order date to print there. */}
      <div className="ad-order-when">
        placed {dayDate(isoInZone(order.created_at, timezone))}, for{" "}
        {dayDate(order.delivery_date)}
      </div>

      <div className="ad-order-packs">{packs || "No packs"}</div>

      <div className="ad-order-line">
        <span>{customer.phone ?? "—"}</span>
        <span>{rupees(order.total)}</span>
      </div>

      {/* The "Prefers Morning" badge was removed on 2026-08-16 — dead UI. The
          customer page stopped sending a preference, so it only ever appeared
          on two legacy test rows. orders.time_preference and place_order's
          p_time_preference both stay; only the badge is gone. Note that manual
          entry can still set one, and the Confirm template still echoes it. */}

      {order.address_note && (
        <div className="ad-order-find">{order.address_note}</div>
      )}

      {order.notes && <div className="ad-order-note">{order.notes}</div>}

      {error && <div className="ad-err">{error}</div>}

      {order.status === "cancelled" ? (
        <>
          <div className="ad-order-cancelled">Cancelled — not counted in the forecast</div>
          {/* An undo for a mis-tap. Cancel is confirmed before it happens, but
              a destructive action with no way back is its own kind of trap. */}
          <div className="ad-order-actions">
            <button
              type="button"
              className="ad-step"
              disabled={statusBusy}
              onClick={() => setStatus("confirmed")}
            >
              Restore to confirmed
            </button>
          </div>
        </>
      ) : (
        <>
          {/* ---- axis 1: status. The only writer on this card. ---- */}
          <div className="ad-axis">Status</div>
          <div className="ad-order-steps">
            <button
              type="button"
              className="ad-step"
              disabled={!back || statusBusy}
              onClick={() => back && setStatus(back)}
            >
              ← {back ? STATUS_LABEL[back] : "Back"}
            </button>
            <button
              type="button"
              className="ad-step is-primary"
              disabled={!forward || statusBusy}
              onClick={() => forward && setStatus(forward)}
            >
              {forward ? STATUS_LABEL[forward] : "Delivered"} →
            </button>
          </div>

          {/* The bridge between the two axes, and the only place they touch:
              a status change SUGGESTS its message. Tapping it opens WhatsApp
              with the text prefilled; WhatsApp's own Send still has to be
              pressed. Nothing here sends, and dismissing changes no data. */}
          {offer && waNumber && messages[offer.key] && (
            <div className="ad-offer" role="status">
              <span>
                Now {STATUS_LABEL[offer.to] ?? offer.to}. Send the{" "}
                {messages[offer.key].label.toLowerCase()} message?
              </span>
              <div className="ad-offer-actions">
                <a
                  className="ad-wa"
                  href={link(messages[offer.key].text)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOffer(null)}
                >
                  {messages[offer.key].label}
                </a>
                <button type="button" className="ad-mini" onClick={() => setOffer(null)}>
                  Not now
                </button>
              </div>
            </div>
          )}

          {/* ---- axis 2: messages. Writes nothing, ever. ---- */}
          {waNumber && (
            <>
              <div className="ad-axis">Message</div>
              <button
                type="button"
                className="ad-wa ad-wa-toggle"
                aria-expanded={menuOpen}
                aria-controls={`wa-${order.id}`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                WhatsApp {customer.name ?? "customer"} {menuOpen ? "▴" : "▾"}
              </button>
              {menuOpen && (
                <div className="ad-wa-menu" id={`wa-${order.id}`}>
                  {MENU.map((key) => (
                    <a
                      key={key}
                      className="ad-wa-item"
                      href={link(messages[key].text)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                    >
                      <strong>{messages[key].label}</strong>
                      <span>{messages[key].hint}</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {confirmCancel ? (
            <div className="ad-confirm" role="alert">
              <span>
                Cancel {order.reference}? It leaves the production maths
                entirely.
              </span>
              <div className="ad-confirm-actions">
                <button
                  type="button"
                  className="ad-step is-danger"
                  disabled={statusBusy}
                  onClick={() => setStatus("cancelled")}
                >
                  {statusBusy ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button
                  type="button"
                  className="ad-step"
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="ad-cancel-link"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel this order
            </button>
          )}
        </>
      )}
    </article>
  );
}
