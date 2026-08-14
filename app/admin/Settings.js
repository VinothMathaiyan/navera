"use client";

// The admin-editable settings screen. Everything here writes straight to the
// `settings` singleton with the signed-in user's JWT — the "admin manages
// settings" policy (ALL / to authenticated / USING true) covers it, so there is
// no SECURITY DEFINER function and there must not be one. That pattern exists
// to make the *public* path safe for anon; it has no job behind a login.
//
// The whole point of this screen: the customer page already reads these values
// live through get_ordering_info. Saving here changes what customers are
// offered on the next page load. One source of truth, no redeploy.

import { useMemo, useState } from "react";
import { db, SessionExpired } from "../../lib/admin";

// 0 = Sunday, matching extract(dow) in Postgres and the existing
// settings.delivery_days convention. Do not renumber.
const DAYS = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
];

const DAY_LONG = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

// The column is `time`, which PostgREST hands back as "18:00:00";
// <input type="time"> speaks "HH:MM".
const toTimeInput = (t) => (t ?? "").slice(0, 5);
const toTimeColumn = (t) => (t && t.length === 5 ? `${t}:00` : t);

const sortedDays = (arr) => [...(arr ?? [])].map(Number).sort((a, b) => a - b);
const sameDays = (a, b) => sortedDays(a).join(",") === sortedDays(b).join(",");

export default function Settings({ settings, onSaved, onExpired }) {
  const [cutoff, setCutoff] = useState(toTimeInput(settings?.cutoff_time));
  const [days, setDays] = useState(() => sortedDays(settings?.delivery_days));
  const [windowNote, setWindowNote] = useState(settings?.delivery_window ?? "");
  const [litresPerKg, setLitresPerKg] = useState(String(settings?.litres_per_kg ?? ""));
  const [lemonsPerLitre, setLemonsPerLitre] = useState(
    String(settings?.lemons_per_litre ?? 1)
  );
  const [minOrder, setMinOrder] = useState(String(settings?.min_order_amount ?? 0));
  const [charge, setCharge] = useState(String(settings?.delivery_charge ?? 0));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  function toggleDay(d) {
    setSavedAt(null);
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  // Any edit clears the "Saved" flag, so the tick never lingers over a form
  // that no longer matches what is in the database.
  const edit = (setter) => (value) => {
    setSavedAt(null);
    setter(value);
  };

  /* ---------------------------------------------- validation */

  // These are refusals, not warnings: every one of them would break the
  // customer page rather than merely look odd. No delivery days at all means
  // get_ordering_info returns an empty date list and nobody can order.
  const problems = [
    days.length === 0 && "Choose at least one delivery day.",
    !cutoff && "Set a cutoff time.",
    !(Number(litresPerKg) > 0) && "Litres per kg must be more than zero.",
    !(Number(lemonsPerLitre) > 0) && "Lemons per litre must be more than zero.",
    !(Number(minOrder) >= 0) && "Minimum order can't be negative.",
    !(Number(charge) >= 0) && "Delivery charge can't be negative.",
  ].filter(Boolean);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      toTimeColumn(cutoff) !== settings.cutoff_time ||
      !sameDays(days, settings.delivery_days) ||
      windowNote !== (settings.delivery_window ?? "") ||
      Number(litresPerKg) !== Number(settings.litres_per_kg) ||
      Number(lemonsPerLitre) !== Number(settings.lemons_per_litre) ||
      Number(minOrder) !== Number(settings.min_order_amount) ||
      Number(charge) !== Number(settings.delivery_charge)
    );
  }, [settings, cutoff, days, windowNote, litresPerKg, lemonsPerLitre, minOrder, charge]);

  // Days the admin is about to take away from customers.
  //
  // TODO(subscriptions): once weekly delivery exists, removing a day must not
  // silently orphan the subscriptions that fall on it. The check belongs right
  // here, before the save: look for active subscriptions on each removed
  // weekday and make the admin move or pause them first. There are no
  // subscriptions yet — the table is empty and the feature isn't built — so
  // there is genuinely nothing to check today, and this is a warning rather
  // than a block. Do not ship weekly delivery without turning it into one.
  const removed = sortedDays(settings?.delivery_days).filter((d) => !days.includes(d));

  /* ---------------------------------------------- save */

  async function save() {
    setBusy(true);
    setError(null);
    setSavedAt(null);
    try {
      const rows = await db("settings?id=eq.true", {
        method: "PATCH",
        body: {
          cutoff_time: toTimeColumn(cutoff),
          delivery_days: days,
          delivery_window: windowNote.trim(),
          litres_per_kg: Number(litresPerKg),
          lemons_per_litre: Number(lemonsPerLitre),
          min_order_amount: Number(minOrder),
          delivery_charge: Number(charge),
        },
        // updated_at is maintained by the settings_touch trigger, not sent here.
        prefer: "return=representation",
      });

      const next = rows?.[0];
      if (!next) {
        throw new Error(
          "The save went through but the server sent nothing back. Reload to check before changing anything else."
        );
      }
      setSavedAt(new Date());
      onSaved(next);
    } catch (e) {
      if (e instanceof SessionExpired) onExpired();
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <div className="ad-empty">Settings haven&apos;t loaded yet.</div>;
  }

  return (
    <section className="ad-settings">
      <p className="ad-settings-lede">
        These are the live values the order page reads. A change here reaches
        customers on their next page load — there is nothing to redeploy.
      </p>

      {/* ---- ordering ---- */}
      <h2 className="ad-h">Ordering</h2>

      <div className="field">
        <label htmlFor="s-cutoff">Cutoff time</label>
        <input
          id="s-cutoff"
          type="time"
          value={cutoff}
          onChange={(e) => edit(setCutoff)(e.target.value)}
        />
        <p className="ad-fieldnote">
          Orders for a delivery day close at this time the day before.
        </p>
      </div>

      <div className="field">
        <span className="lbl" id="s-days-lbl">
          Delivery days
        </span>
        <div className="ad-days" role="group" aria-labelledby="s-days-lbl">
          {DAYS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="ad-day"
              aria-pressed={days.includes(value)}
              aria-label={DAY_LONG[value]}
              onClick={() => toggleDay(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="ad-fieldnote">
          The days offered to customers on the order page.
        </p>

        {removed.length > 0 && (
          <p className="ad-warn" role="status">
            Removing {removed.map((d) => DAY_LONG[d]).join(" and ")}. Customers
            will no longer be offered {removed.length === 1 ? "that day" : "those days"}.
            Orders already placed on {removed.length === 1 ? "it" : "them"} stay
            put and still show in the forecast.
            <span className="ad-warn-later">
              Once weekly delivery exists, this will also need to check for
              subscriptions that rely on the day before letting it go.
            </span>
          </p>
        )}
      </div>

      {/* ---- production ---- */}
      <h2 className="ad-h">Production</h2>

      <div className="ad-pair">
        <div className="field">
          <label htmlFor="s-litres">Litres of milk per kg</label>
          <input
            id="s-litres"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            value={litresPerKg}
            onChange={(e) => edit(setLitresPerKg)(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="s-lemons">Lemons per litre</label>
          <input
            id="s-lemons"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            value={lemonsPerLitre}
            onChange={(e) => edit(setLemonsPerLitre)(e.target.value)}
          />
        </div>
      </div>
      <p className="ad-fieldnote">
        Both drive the forecast. Lemons are always rounded <strong>up</strong> to
        a whole lemon — running short fails a batch, a spare lemon costs a few
        rupees.
      </p>

      {/* ---- money ---- */}
      <h2 className="ad-h">Money</h2>

      <div className="ad-pair">
        <div className="field">
          <label htmlFor="s-min">Minimum order (₹)</label>
          <input
            id="s-min"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={minOrder}
            onChange={(e) => edit(setMinOrder)(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="s-charge">Delivery charge (₹)</label>
          <input
            id="s-charge"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={charge}
            onChange={(e) => edit(setCharge)(e.target.value)}
          />
        </div>
      </div>
      <p className="ad-fieldnote">Zero in both means what it says: neither is applied.</p>

      {/* ---- internal ---- */}
      <h2 className="ad-h">Internal note</h2>

      <div className="field">
        <label htmlFor="s-window">Delivery window</label>
        <input
          id="s-window"
          value={windowNote}
          placeholder="e.g. 6:30 AM - 8:30 AM"
          onChange={(e) => edit(setWindowNote)(e.target.value)}
        />
        {/* The no-fixed-window rule is locked. This field is a note to
            yourselves about when the run usually happens; it is deliberately
            not read by the customer page or by the WhatsApp templates, and it
            must not start being read by them. */}
        <p className="ad-fieldnote">
          <strong>Your reference only.</strong> Customers are never shown this
          and are never promised a time — they pick Morning or Evening as a
          preference and the real time is agreed on WhatsApp.
        </p>
      </div>

      {/* ---- save ---- */}
      {problems.length > 0 && (
        <div className="ad-err" role="alert">
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="ad-err" role="alert">
          {error}
        </div>
      )}

      <button
        className="cta"
        disabled={busy || !dirty || problems.length > 0}
        onClick={save}
      >
        {busy ? "Saving…" : dirty ? "Save settings" : "Saved"}
      </button>

      <p className="ad-note" role="status">
        {savedAt
          ? `Saved. The order page will show this from its next load.`
          : dirty
            ? "Unsaved changes."
            : `Last changed ${new Date(settings.updated_at).toLocaleString("en-IN")}.`}
      </p>
    </section>
  );
}
