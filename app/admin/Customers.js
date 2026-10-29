"use client";

// Customers: one row per phone number, built from the order rows the All Orders
// tab already holds — so it is as live as that tab is. A new order, a status
// change to cancelled, a new pack size: all of it shows here on the next
// Refresh, with no step in between.
//
// Read-only, like All Orders. All the counting lives in ./customers-stats.js,
// which takes the rows and "today" and nothing else, so the numbers can be
// checked without rendering this.
//
// Samples and sales are never blended anywhere on this screen: every figure
// has a sample value and a sale value. (The sample-to-sale conversion rate, its
// chart and the Conversion flag / Data flags / Last activity columns were
// removed on 2026-10-29 — they were not giving the insight wanted.)

import { useEffect, useMemo, useState } from "react";
import { db, SessionExpired } from "../../lib/admin";
import {
  BUCKETS,
  DEFAULT_FILTERS,
  bucketCounts,
  buildCustomerModel,
  frequencyCounts,
  matchesFilters,
  sortRows,
  sortValue,
  summarize,
  topByPaidPacks,
} from "./customers-stats";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Written out by hand rather than toLocaleDateString: "Sept" in one browser and
// "Sep" in another is exactly the kind of thing that makes a date column look
// untrustworthy. A plain calendar string is split, never turned into a Date.
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d} ${MON[Number(m) - 1]} ${y}`;
};

// "Today" as the business reckons it, not as the laptop's clock does — the
// same rule the rest of the admin applies.
function todayISO(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

const TYPE_OPTIONS = [
  { id: "all", label: "Samples and sales" },
  { id: "sample", label: "Has a sample" },
  { id: "sale", label: "Has a sale" },
  { id: "sampleonly", label: "Sample only" },
];

// Shown above the first customer with no value in the sorted column, so a
// customer who has never bought is visibly a group of their own and not a
// "new" customer mixed into the rest.
const SEP_LABEL = {
  lastSale: "No paid purchase yet",
  daysSince: "No paid purchase yet",
  firstSale: "No paid purchase yet",
  firstSample: "No sample received",
};

/* ------------------------------------------------ small pieces */

const ICON = {
  warn: (
    <svg className="ad-cu-ico is-warn" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 15 14H1z" fill="currentColor" />
      <path d="M8 6v4M8 11.6v.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  crit: (
    <svg className="ad-cu-ico is-crit" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.5v4.2M8 10.8v.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg className="ad-cu-ico is-info" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

const Dot = ({ kind }) => <i className={`ad-cu-dot is-${kind}`} aria-hidden="true" />;

function Chips({ label, options, value, onChange }) {
  return (
    <div className="ad-cu-chipset" role="group" aria-label={label}>
      <span className="ad-cu-chiplabel">{label}</span>
      <div className="ad-cu-chips">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="ad-filter"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Split({ total, label, sample, sale }) {
  return (
    <div className="ad-money-fig">
      <div className="n">{total}</div>
      <div className="l">{label}</div>
      <div className="ad-cu-split">
        <span><Dot kind="sample" />Sample <b>{sample}</b></span>
        <span><Dot kind="sale" />Sale <b>{sale}</b></span>
      </div>
    </div>
  );
}

function Bar({ label, sub, value, max, kind, title }) {
  const w = max > 0 ? (100 * value) / max : 0;
  return (
    <div className="ad-cu-bar" title={title}>
      <span className="l">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <span className="track">
        <span className={`fill is-${kind}`} style={{ width: `${w}%` }} />
      </span>
      <span className="v">{value}</span>
    </div>
  );
}

function MiniTable({ cols, rows }) {
  return (
    <div className="ad-cu-minwrap">
      <table className="ad-cu-mini">
        <thead>
          <tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartCard({ id, title, sub, showTable, onToggle, cols, rows, wide, children }) {
  return (
    <article className={`ad-cu-card${wide ? " is-wide" : ""}`}>
      <header className="ad-cu-cardhead">
        <div>
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
        {/* The label itself says which view is next, so this is a plain button;
            aria-pressed on top of a changing label would say it twice, and
            contradict itself to a screen reader. */}
        <button type="button" className="ad-cu-toggle" onClick={() => onToggle(id)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </header>
      {showTable ? <MiniTable cols={cols} rows={rows} /> : children}
    </article>
  );
}

function SortTh({ col, sort, onSort, rowSpan }) {
  const active = sort.key === col.key;
  return (
    <th
      scope="col"
      rowSpan={rowSpan}
      className={col.num ? "num" : undefined}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="ad-cu-sort" aria-label={col.aria} onClick={() => onSort(col)}>
        {col.dot && <Dot kind={col.dot} />}
        <span>
          {col.label}
          {col.sub && <small>{col.sub}</small>}
        </span>
        <span className="arr" aria-hidden="true">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

/* ------------------------------------------------ the view */

export default function Customers({ orders, settings, loading, onRefresh, onExpired }) {
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const today = todayISO(timezone);

  // Community names an order was placed under. Inactive communities are
  // included on purpose: an order for a community that has since been switched
  // off is still an order for that community.
  const [areaNames, setAreaNames] = useState({});
  useEffect(() => {
    let alive = true;
    db("delivery_areas?select=id,name")
      .then((rows) => {
        if (alive) setAreaNames(Object.fromEntries((rows ?? []).map((a) => [a.id, a.name])));
      })
      .catch((e) => {
        // Not fatal: a customer then shows the community saved on their record.
        if (e instanceof SessionExpired) onExpired?.();
      });
    return () => {
      alive = false;
    };
  }, [onExpired]);

  const model = useMemo(
    () => buildCustomerModel(orders, { areaNames, today }),
    [orders, areaNames, today]
  );

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: "lastSale", dir: "desc" });
  const [tables, setTables] = useState({});
  const [notesOpen, setNotesOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 720);

  const setFilter = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const dirty = Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);
  const toggleTable = (id) => setTables((t) => ({ ...t, [id]: !t[id] }));

  const communities = useMemo(() => {
    const c = new Map();
    model.rows.forEach((r) => c.set(r.community, (c.get(r.community) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [model.rows]);

  const shown = useMemo(() => model.rows.filter((r) => matchesFilters(r, filters)), [model.rows, filters]);
  const sorted = useMemo(() => sortRows(shown, sort.key, sort.dir), [shown, sort]);
  const sum = useMemo(() => summarize(shown, model.sizes), [shown, model.sizes]);
  const sizeOptions = [{ id: "all", label: "All sizes" }, ...model.sizes.map((g) => ({ id: String(g), label: `${g}g` }))];

  /* ---- columns: whatever pack sizes the data holds ---- */
  const baseCols = [
    { key: "name", label: "Customer", kind: "str" },
    { key: "phone", label: "Phone", kind: "str" },
    { key: "community", label: "Community", kind: "str" },
  ];
  const sizeGroups = model.sizes.map((g) => ({
    label: `${g}g`,
    cols: [
      { key: `s:${g}:sample`, label: "Samples", dot: "sample", num: true, aria: `Sort by ${g}g samples` },
      { key: `s:${g}:sale`, label: "Sold", dot: "sale", num: true, aria: `Sort by ${g}g sold` },
    ],
  }));
  const restCols = [
    { key: "packsTotal", label: "Total packs", num: true },
    { key: "orders", label: "Orders", num: true },
    { key: "paidOrders", label: "Paid orders", num: true },
    { key: "firstSample", label: "First sample", kind: "str" },
    { key: "firstSale", label: "First purchase", kind: "str" },
    { key: "lastSale", label: "Last purchase", kind: "str" },
    { key: "daysSince", label: "Days since last purchase", num: true },
  ];
  const nCols = baseCols.length + sizeGroups.length * 2 + restCols.length;
  const sortLabel = [...baseCols, ...sizeGroups.flatMap((g) => g.cols.map((c) => ({ ...c, label: `${g.label} ${c.label.toLowerCase()}` }))), ...restCols].find((c) => c.key === sort.key)?.label ?? sort.key;

  const onSort = (col) =>
    setSort((s) =>
      s.key === col.key ? { key: s.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: col.kind === "str" && !col.key.startsWith("first") && !col.key.startsWith("last") ? "asc" : "desc" }
    );

  const totalOf = (key) => sorted.reduce((t, r) => t + Number(sortValue(r, key) ?? 0), 0);

  /* ---- charts ---- */
  const freq = frequencyCounts(shown);
  const freqRows = [
    ["1 paid order", freq.one],
    ["2 paid orders", freq.two],
    ["3+ paid orders", freq.threePlus],
  ];
  const buckets = bucketCounts(shown);
  const top = topByPaidPacks(shown, 10);
  const sizeTxt = (r) =>
    model.sizes.filter((g) => r.bySize[g].sale > 0).map((g) => `${g}g × ${r.bySize[g].sale}`).join(", ");
  const sizeMax = Math.max(1, ...model.sizes.flatMap((g) => [sum.bySize[g].sample, sum.bySize[g].sale]));
  const freqMax = Math.max(1, ...freqRows.map((x) => x[1]));
  const bucketMax = Math.max(1, ...BUCKETS.map((b) => buckets[b.id]));
  const topMax = Math.max(1, ...top.map((r) => r.packsSale));

  /* ---- notes (the whole dataset, whatever the filters say) ---- */
  const n = model.notes;
  const flagged = n.multiName.length + n.anomalies.length + (n.unpaidSales ? 1 : 0) + (n.staleOpen ? 1 : 0) + (n.future ? 1 : 0) + n.badDates.length;

  if (!orders || orders.length === 0) {
    return (
      <section className="ad-section">
        <div className="ad-orders-head">
          <h2 className="ad-h">Customers</h2>
          <button type="button" className="ad-refresh" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <div className="ad-empty">{loading ? "Loading orders…" : "No orders yet, so no customers to show."}</div>
      </section>
    );
  }

  return (
    <section className="ad-section ad-cu">
      <div className="ad-orders-head">
        <h2 className="ad-h">Customers</h2>
        <button type="button" className="ad-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <p className="ad-note">
        One row per phone number, read live from your orders as of {fmtDate(today)}. Samples and
        sales are counted separately throughout. Cancelled orders are left out.
      </p>

      {/* filters */}
      <div className="ad-cu-filters">
        <div className="field ad-cu-community">
          <label htmlFor="cu-community">Community</label>
          <select id="cu-community" value={filters.community} onChange={(e) => setFilter("community")(e.target.value)}>
            <option value="all">All communities ({model.rows.length})</option>
            {communities.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            ))}
          </select>
        </div>
        <Chips label="Pack size" options={sizeOptions} value={filters.size} onChange={setFilter("size")} />
        <Chips label="Order type" options={TYPE_OPTIONS} value={filters.type} onChange={setFilter("type")} />
        <Chips
          label="Last purchase"
          options={[{ id: "all", label: "Any time" }, ...BUCKETS.map((b) => ({ id: b.id, label: b.label }))]}
          value={filters.bucket}
          onChange={setFilter("bucket")}
        />
        <div className="ad-cu-filterline" aria-live="polite">
          <span>
            Showing <b>{shown.length}</b> of <b>{model.rows.length}</b> customers
            {dirty ? ". Summary, charts and table follow the filters." : "."}
          </span>
          {dirty && (
            <button type="button" className="ad-refresh" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* summary */}
      <section className="ad-money ad-cu-sum" aria-label="Summary">
        <div className="ad-money-head">
          <h2 className="ad-h">Summary</h2>
          <span className="ad-money-scope">{dirty ? "filtered" : "all customers"}</span>
        </div>
        <div className="ad-money-row">
          <div className="ad-money-fig">
            <div className="n">{sum.customers}</div>
            <div className="l">unique customers, by phone</div>
          </div>
        </div>
        <div className="ad-money-row">
          <Split total={sum.ordSample + sum.ordSale} label="orders" sample={sum.ordSample} sale={sum.ordSale} />
          <Split total={sum.packSample + sum.packSale} label="packs" sample={sum.packSample} sale={sum.packSale} />
        </div>
        <div className="ad-money-row ad-cu-sizes">
          <table className="ad-cu-sizetable">
            <caption>Customers per pack size</caption>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Pack size</span></th>
                <th scope="col" className="num"><Dot kind="sample" />Sample</th>
                <th scope="col" className="num"><Dot kind="sale" />Sale</th>
              </tr>
            </thead>
            <tbody>
              {model.sizes.map((g) => (
                <tr key={g}>
                  <th scope="row">{g}g</th>
                  <td className="num">{sum.bySize[g].sample}</td>
                  <td className="num">{sum.bySize[g].sale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* notes */}
      <details className="ad-cu-notes" open={notesOpen} onToggle={(e) => setNotesOpen(e.currentTarget.open)}>
        <summary>
          Data notes <span>{flagged ? `${flagged} to look at` : "nothing to flag"}</span>
        </summary>
        <ul>
          {n.multiName.length ? (
            <li>{ICON.warn}<span><b>One phone, more than one name.</b> {n.multiName.map((m) => `${m.phone}: ${m.text}`).join(" ")}</span></li>
          ) : (
            <li>{ICON.info}<span><b>One phone, one name.</b> No phone number appears under more than one name.</span></li>
          )}
          {n.anomalies.length ? (
            <li>{ICON.crit}<span><b>Sale dated before sample.</b> {n.anomalies.map((r) => `${r.name} (${r.phone})`).join(", ")}.</span></li>
          ) : (
            <li>{ICON.info}<span><b>No sale dated before a sample.</b> Every customer with both has a first sample on or before their first sale.</span></li>
          )}
          {n.sameName.length > 0 && (
            <li>{ICON.info}<span><b>Same name, different phones, kept separate:</b> {n.sameName.map((g) => `${g[0].name} ×${g.length} (${g.map((r) => r.phone).join(", ")})`).join("; ")}.</span></li>
          )}
          {n.unpaidSales > 0 && (
            <li>{ICON.warn}<span><b>{plural(n.unpaidSales, "sale order")} not yet marked paid.</b> They are tagged Sale, so they count as paid orders here. Their payment status is still pending.</span></li>
          )}
          {n.staleOpen > 0 && (
            <li>{ICON.warn}<span><b>{plural(n.staleOpen, "order")} dated before today still show confirmed, preparing or dispatched.</b> They are counted, since they are not cancelled.</span></li>
          )}
          {n.future > 0 && (
            <li>{ICON.warn}<span><b>{plural(n.future, "order")} dated after today.</b> Counted as orders; days since last purchase shows 0.</span></li>
          )}
          {n.badDates.length > 0 && (
            <li>{ICON.crit}<span><b>Unreadable dates on {n.badDates.join(", ")}.</b> Those orders are counted but have no date.</span></li>
          )}
          <li>{ICON.info}<span><b>{plural(n.cancelled, "cancelled order")} left out</b> of every count and date. Dates are delivery dates.</span></li>
          <li>{ICON.info}<span><b>Pack sizes found:</b> {model.sizes.length ? model.sizes.map((g) => `${g}g`).join(", ") : "none"}. Columns and filters follow whatever sizes appear.</span></li>
          <li>{ICON.info}<span>Filters choose customers; each customer&apos;s own figures stay complete. These notes cover everyone.</span></li>
        </ul>
      </details>

      {/* charts */}
      <div className="ad-cu-charts">
        <ChartCard
          id="size"
          title="Customers by pack size"
          sub="Customers who received or bought each size"
          showTable={!!tables.size}
          onToggle={toggleTable}
          cols={["Pack size", "Sample customers", "Sale customers"]}
          rows={model.sizes.map((g) => [`${g}g`, sum.bySize[g].sample, sum.bySize[g].sale])}
        >
          <div className="ad-cu-legend"><span><Dot kind="sample" />Sample</span><span><Dot kind="sale" />Sale</span></div>
          {model.sizes.map((g) => (
            <div key={g} className="ad-cu-group">
              <h4>{g}g</h4>
              <Bar label="Sample" value={sum.bySize[g].sample} max={sizeMax} kind="sample" title={`${sum.bySize[g].sample} customers received ${g}g as a sample`} />
              <Bar label="Sale" value={sum.bySize[g].sale} max={sizeMax} kind="sale" title={`${sum.bySize[g].sale} customers bought ${g}g`} />
            </div>
          ))}
        </ChartCard>

        <ChartCard
          id="freq"
          title="Paid orders per customer"
          sub="Customers with at least one paid order"
          showTable={!!tables.freq}
          onToggle={toggleTable}
          cols={["Paid orders", "Customers"]}
          rows={freqRows}
        >
          {freqRows.map(([label, v]) => (
            <Bar key={label} label={label} value={v} max={freqMax} kind="sale" />
          ))}
          <p className="ad-cu-fine">
            {freq.none ? `${plural(freq.none, "customer")} with no paid orders ${freq.none === 1 ? "is" : "are"} not shown.` : "Every customer here has a paid order."}
          </p>
        </ChartCard>

        <ChartCard
          id="rec"
          title="Time since last purchase"
          sub={`Days from last paid order to ${fmtDate(today)}`}
          showTable={!!tables.rec}
          onToggle={toggleTable}
          cols={["Bucket", "Customers"]}
          rows={BUCKETS.map((b) => [b.short, buckets[b.id]])}
        >
          {BUCKETS.filter((b) => b.id !== "never").map((b) => (
            <Bar key={b.id} label={b.short} value={buckets[b.id]} max={bucketMax} kind="sale" />
          ))}
          <div className="ad-cu-rule" />
          <Bar label="Never purchased" value={buckets.never} max={bucketMax} kind="sample" title="Customers who have had a sample and no paid order" />
          <p className="ad-cu-fine">Customers who only had a sample sit in Never purchased, not in a time bucket.</p>
        </ChartCard>

        <ChartCard
          id="top"
          title="Top customers by paid packs"
          sub="Packs bought across all sizes, samples excluded"
          showTable={!!tables.top}
          onToggle={toggleTable}
          cols={["Customer", "Phone", "Paid packs", "By size"]}
          rows={top.map((r) => [r.name, r.phone, r.packsSale, sizeTxt(r)])}
        >
          {top.length === 0 ? (
            <p className="ad-cu-empty">No paid packs in this view.</p>
          ) : (
            top.map((r) => (
              <Bar key={r.key} label={r.name} sub={`…${r.phone.slice(-4)}`} value={r.packsSale} max={topMax} kind="sale" title={`${r.name} · ${r.phone} · ${r.community} · ${sizeTxt(r)}`} />
            ))
          )}
        </ChartCard>
      </div>

      {/* table */}
      <h2 className="ad-h ad-cu-tablehead">Every customer</h2>
      <p className="ad-note">
        Sorted by {sortLabel.toLowerCase()}, {sort.dir === "asc" ? "lowest" : "highest"} first. Blank values always stay at the bottom.
      </p>
      {sorted.length === 0 ? (
        <div className="ad-empty">
          No customers match these filters.{" "}
          <button type="button" className="ad-cu-link" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
        </div>
      ) : (
        <div className="ad-tablewrap">
          <table className="ad-table ad-cu-table">
            <caption className="sr-only">One row per customer phone number. Use the column buttons to sort.</caption>
            <thead>
              <tr>
                {baseCols.map((c) => <SortTh key={c.key} col={c} sort={sort} onSort={onSort} rowSpan={2} />)}
                {sizeGroups.map((g) => (
                  <th key={g.label} scope="colgroup" colSpan={2} className="ad-cu-grouphead">{g.label}</th>
                ))}
                {restCols.map((c) => <SortTh key={c.key} col={c} sort={sort} onSort={onSort} rowSpan={2} />)}
              </tr>
              <tr>
                {sizeGroups.flatMap((g) => g.cols).map((c) => <SortTh key={c.key} col={c} sort={sort} onSort={onSort} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.flatMap((r, i) => {
                const out = [];
                const sepLabel = SEP_LABEL[sort.key];
                if (sepLabel && i > 0 && sortValue(r, sort.key) === null && sortValue(sorted[i - 1], sort.key) !== null) {
                  out.push(
                    <tr key="sep" className="ad-cu-sep">
                      {/* The span is what stays put when the table is scrolled
                          sideways; the cell itself is as wide as the table. */}
                      <td colSpan={nCols}><span>{sepLabel} · {sorted.length - i}</span></td>
                    </tr>
                  );
                }
                const num = (v) => (v === 0 ? <span className="soft">0</span> : v);
                out.push(
                  <tr key={r.key}>
                    <th scope="row" title={r.name}>{r.name}</th>
                    <td>{r.phone}</td>
                    <td>{r.community}</td>
                    {model.sizes.flatMap((g) => [
                      <td key={`${g}s`} className="num">{num(r.bySize[g].sample)}</td>,
                      <td key={`${g}b`} className="num">{num(r.bySize[g].sale)}</td>,
                    ])}
                    <td className="num">{num(r.packsTotal)}</td>
                    <td className="num">{num(r.orders)}</td>
                    <td className="num">{num(r.paidOrders)}</td>
                    <td>{fmtDate(r.firstSample)}</td>
                    <td>{fmtDate(r.firstSale)}</td>
                    <td>{fmtDate(r.lastSale)}</td>
                    <td className="num">{r.daysSince === null ? "" : r.daysSince}</td>
                  </tr>
                );
                return out;
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total · {sorted.length}</th>
                <td />
                <td />
                {model.sizes.flatMap((g) => [
                  <td key={`${g}s`} className="num">{totalOf(`s:${g}:sample`)}</td>,
                  <td key={`${g}b`} className="num">{totalOf(`s:${g}:sale`)}</td>,
                ])}
                <td className="num">{totalOf("packsTotal")}</td>
                <td className="num">{totalOf("orders")}</td>
                <td className="num">{totalOf("paidOrders")}</td>
                <td colSpan={restCols.length - 3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
