"use client";

// Production summary over the next six delivery days. The maths lives in
// ./production-summary.js; this file is the table and the one bulk action.

import { useState } from "react";
import { db, SessionExpired } from "../../lib/admin";
import { buildProductionSummary } from "./production-summary";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const short = (iso) => {
  const d = parts(iso);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};
const kg = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

export default function Production({ orders, settings, dates, today, onChanged, onExpired }) {
  const { rows, totals } = buildProductionSummary(orders, settings, dates);

  const [busyDate, setBusyDate] = useState(null);
  const [error, setError] = useState(null);
  // Ids changed by the last bulk action, so Undo puts back exactly those and
  // never touches an order that was already 'preparing' beforehand.
  const [lastBulk, setLastBulk] = useState(null);

  async function run(fn) {
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      if (e instanceof SessionExpired) onExpired();
      else setError(e.message);
    } finally {
      setBusyDate(null);
    }
  }

  // One tap for the whole evening's batch — the batch is the unit that gets
  // marked, not fifteen individual taps at 9 PM. Filtering on
  // status=eq.confirmed in the query means cancelled orders — and anything
  // already further along — are skipped by the database rather than by a
  // client-side loop.
  function markPreparing(date) {
    setBusyDate(date);
    run(async () => {
      const changed = await db(
        `orders?delivery_date=eq.${date}&status=eq.confirmed`,
        { method: "PATCH", body: { status: "preparing" }, prefer: "return=representation" }
      );
      const ids = (changed ?? []).map((o) => o.id);
      setLastBulk(ids.length ? { date, ids } : null);
    });
  }

  function undoBulk() {
    if (!lastBulk) return;
    setBusyDate(lastBulk.date);
    run(async () => {
      const list = lastBulk.ids.map((id) => `"${id}"`).join(",");
      await db(`orders?id=in.(${list})`, {
        method: "PATCH",
        body: { status: "confirmed" },
        prefer: "return=minimal",
      });
      setLastBulk(null);
    });
  }

  return (
    <section className="ad-section">
      <div className="ad-orders-head">
        <h2 className="ad-h">Next {rows.length} delivery days</h2>
        <span className="ad-fc-date">
          {settings?.litres_per_kg} L/kg · {settings?.lemons_per_litre} lemon/L
        </span>
      </div>

      {error && (
        <div className="ad-err" role="alert">
          {error}
        </div>
      )}

      {/* Stacked on a phone exactly as before; two columns from lg, the
          table on the left and the notes that explain it on the right. */}
      <div className="ad-prod-split">
        <div className="ad-tablewrap">
          <table className="ad-table">
            <caption className="sr-only">
              Production for the next six delivery days. Paneer, milk and lemons
              cover only the orders still to make.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">Orders</th>
                <th scope="col" className="num">Done</th>
                <th scope="col" className="num">To make</th>
                <th scope="col" className="num">Paneer</th>
                <th scope="col" className="num">Milk</th>
                <th scope="col" className="num">Lemons</th>
                {/* No visible header: the buttons below label themselves, and a
                    word here would read as another column of data. */}
                <th scope="col"><span className="sr-only">Start the batch</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className={r.date === today ? "is-today" : undefined}>
                  <th scope="row">
                    {short(r.date)}
                    {r.date === today && <span className="ad-today">Today</span>}
                  </th>
                  <td className="num">{r.orders}</td>
                  <td className="num soft">{r.done}</td>
                  <td className="num strong">{r.toMake}</td>
                  <td className="num">{r.kg > 0 ? `${kg(r.kg)} kg` : "—"}</td>
                  <td className="num">{r.milk > 0 ? `${r.milk} L` : "—"}</td>
                  <td className="num">{r.lemons > 0 ? r.lemons : "—"}</td>
                  {/* The action sits beside the numbers it acts on, so there is
                      no matching a date in a button to a date in the table.
                      Only on rows with something left to make — a Start on a
                      finished or empty day is a button that does nothing. */}
                  <td className="act">
                    {r.notStarted > 0 ? (
                      <button
                        type="button"
                        className="ad-row-start"
                        disabled={busyDate === r.date}
                        // "Start" alone is ambiguous once it is out of a
                        // full-width block, so the accessible name carries the
                        // date and the count the visible column already shows.
                        aria-label={`Start ${short(r.date)} — ${r.notStarted} order${
                          r.notStarted === 1 ? "" : "s"
                        }`}
                        onClick={() => markPreparing(r.date)}
                      >
                        {busyDate === r.date ? "…" : "Start"}
                      </button>
                    ) : (
                      <span className="soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="ad-fc-empty">
                    No delivery days are configured. Set them under Settings.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Still to make</th>
                <td className="num">{totals.orders}</td>
                <td className="num soft">{totals.done}</td>
                <td className="num strong">{totals.toMake}</td>
                <td className="num">{totals.kg > 0 ? `${kg(totals.kg)} kg` : "—"}</td>
                <td className="num">{totals.milk > 0 ? `${totals.milk} L` : "—"}</td>
                <td className="num">{totals.lemons > 0 ? totals.lemons : "—"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="ad-prod-side">
          <p className="ad-note">
            Paneer, milk and lemons count the <strong>still to make</strong>{" "}
            orders only — anything already preparing, dispatched or delivered
            has had its milk bought, and cancelled orders are excluded
            entirely. <strong>Start</strong> marks that whole evening&apos;s
            batch as preparing, which takes it out of these figures.
          </p>

          {lastBulk && (
            <div className="ad-undo" role="status">
              <span>
                {lastBulk.ids.length} order{lastBulk.ids.length === 1 ? "" : "s"}{" "}
                on {short(lastBulk.date)} marked preparing.
              </span>
              <button type="button" className="ad-mini" onClick={undoBulk}>
                Undo
              </button>
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
