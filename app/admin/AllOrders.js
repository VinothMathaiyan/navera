"use client";

// All Orders: every order ever placed, in one table, independent of the
// Dashboard tab's single chosen delivery date. Built because "what happened
// this week" required stepping through each delivery date one at a time —
// this tab answers that in one screen instead.
//
// Read-only by design. Status and payment are written from the Dashboard
// tab's OrderCard, which is the one writer of those columns (see
// AdminDashboard.js). Duplicating write actions here would give two places
// that could disagree about which tap moved an order from confirmed to
// preparing, so this file only ever reads `orders`.

import { useMemo, useState } from "react";
import { STATUS_LABEL } from "./production-summary";
import { SOURCE_LABEL } from "./AdminDashboard";

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

// created_at is a timestamptz. Reduced to the kitchen's calendar date the same
// way AdminDashboard.js does it for order cards, so "placed" can't land on
// the wrong side of midnight because a browser sits in a different timezone
// from Chennai.
function placedDate(ts, timezone) {
  try {
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(ts));
    return short(iso);
  } catch {
    return "—";
  }
}

const rupees = (n) => "₹" + Number(n).toLocaleString("en-IN");

// 'cancelled' listed alongside the flow here, unlike STATUS_FLOW in
// production-summary.js — this screen is a record of everything that
// happened, and a cancelled order is part of that record, not a step to
// count towards production.
const STATUS_ORDER = ["confirmed", "preparing", "dispatched", "delivered", "cancelled"];

function packSummary(items) {
  if (!items || items.length === 0) return "—";
  const bySize = new Map();
  for (const item of items) {
    bySize.set(item.weight_grams, (bySize.get(item.weight_grams) ?? 0) + item.quantity);
  }
  return [...bySize.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([grams, qty]) => `${grams}g×${qty}`)
    .join(", ");
}

function community(customer) {
  const area = customer?.area?.name;
  const flat = customer?.flat;
  if (area && flat) return `${area}, ${flat}`;
  return area || flat || "—";
}

function paymentText(order) {
  if (order.order_type === "sample") return "—";
  if (order.payment_status === "paid") {
    return order.payment_method ? `Paid (${order.payment_method})` : "Paid";
  }
  return "Pending";
}

// A CSV, not a real .xlsx: it opens in Excel or Sheets on a double-click,
// with none of a spreadsheet's binary format and no new dependency in the
// app. Good enough for "give me everything in one file" — if a formatted
// workbook is ever wanted instead, that is a separate, bigger ask.
function toCSV(rows, timezone) {
  const header = [
    "Order", "Placed", "Delivery date", "Customer", "Phone", "Community",
    "Pack", "Type", "Status", "Payment", "Source", "Total (Rs)",
  ];
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(escape).join(",")];
  for (const o of rows) {
    const c = o.customer ?? {};
    lines.push(
      [
        o.reference,
        placedDate(o.created_at, timezone),
        short(o.delivery_date),
        c.name ?? "—",
        c.phone ?? "—",
        community(c),
        packSummary(o.items),
        o.order_type === "sample" ? "Sample" : "Sale",
        STATUS_LABEL[o.status] ?? o.status,
        paymentText(o),
        SOURCE_LABEL[o.source] ?? o.source,
        Number(o.total ?? 0).toFixed(2),
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

function download(filename, text) {
  // A leading BOM so Excel on Windows reads the ₹/"—" characters correctly
  // instead of guessing the wrong encoding.
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AllOrders({ orders, settings, loading, onRefresh }) {
  const [statusFilter, setStatusFilter] = useState("all");
  // Delivery-date range, not placed-date — this mirrors the Dashboard tab's
  // own date picker, just widened from "one day" to "from / to". Empty
  // string means that end of the range is open.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const list = orders ?? [];

  const inRange = useMemo(() => {
    return (o) =>
      (!fromDate || o.delivery_date >= fromDate) && (!toDate || o.delivery_date <= toDate);
  }, [fromDate, toDate]);

  // Counts are computed after the date range but before the status filter,
  // so the chips always show "how many of each status in the dates I've
  // picked" rather than a stale all-time count.
  const dateFiltered = useMemo(() => list.filter(inRange), [list, inRange]);

  const counts = useMemo(() => {
    const c = { all: dateFiltered.length };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const o of dateFiltered) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [dateFiltered]);

  const shown = useMemo(
    () =>
      statusFilter === "all"
        ? dateFiltered
        : dateFiltered.filter((o) => o.status === statusFilter),
    [dateFiltered, statusFilter]
  );

  const hasRange = fromDate || toDate;

  function exportCSV() {
    const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const range = hasRange ? `${fromDate || "start"}_to_${toDate || "now"}` : "all-dates";
    download(`navera-orders-${statusFilter}-${range}-${stamp}.csv`, toCSV(shown, timezone));
  }

  return (
    <section className="ad-section">
      <div className="ad-orders-head">
        <h2 className="ad-h">All orders</h2>
        <div className="ad-orders-actions">
          <button type="button" className="ad-refresh" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className="ad-refresh"
            onClick={exportCSV}
            disabled={shown.length === 0}
          >
            Download CSV
          </button>
        </div>
      </div>

      <p className="ad-note">
        Every order ever placed, across every delivery date — the record of
        what happened, not the tonight&apos;s-batch view. Change a status or
        mark a payment from the Dashboard tab; this one only reads.
      </p>

      <div className="ad-anydate ad-daterange">
        <label htmlFor="from-date">From</label>
        <input
          id="from-date"
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <label htmlFor="to-date">to</label>
        <input
          id="to-date"
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => setToDate(e.target.value)}
        />
        {hasRange && (
          <button type="button" className="ad-filter" onClick={() => { setFromDate(""); setToDate(""); }}>
            Clear dates
          </button>
        )}
      </div>

      <div className="ad-filters" role="group" aria-label="Filter by status">
        <button
          type="button"
          className="ad-filter"
          aria-pressed={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          All ({counts.all})
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className="ad-filter"
            aria-pressed={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          >
            {STATUS_LABEL[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="ad-empty">
          No orders match this filter{hasRange ? " and date range" : ""}.
        </div>
      ) : (
        <div className="ad-tablewrap">
          <table className="ad-table">
            <caption className="sr-only">
              Orders filtered by status and delivery date range.
            </caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Delivery</th>
                <th scope="col">Customer</th>
                <th scope="col">Community</th>
                <th scope="col">Pack</th>
                <th scope="col">Status</th>
                <th scope="col">Payment</th>
                <th scope="col">Source</th>
                <th scope="col" className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const c = o.customer ?? {};
                return (
                  <tr key={o.id}>
                    <th scope="row">{o.reference}</th>
                    <td>{placedDate(o.created_at, timezone)}</td>
                    <td>{short(o.delivery_date)}</td>
                    <td>
                      {c.name ?? "—"}
                      {c.phone && <span className="ad-table-sub">{c.phone}</span>}
                    </td>
                    <td>{community(c)}</td>
                    <td>{packSummary(o.items)}</td>
                    <td>
                      {STATUS_LABEL[o.status] ?? o.status}
                      {o.order_type === "sample" && (
                        <span className="ad-table-sub">sample</span>
                      )}
                    </td>
                    <td>{paymentText(o)}</td>
                    <td>{SOURCE_LABEL[o.source] ?? o.source}</td>
                    <td className="num">{rupees(o.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
