"use client";

// Community (delivery area) management. Writes straight to delivery_areas with
// the admin's JWT under the existing "admin manages areas" policy (ALL / to
// authenticated / USING true) — no SECURITY DEFINER function, same as the rest
// of the admin.
//
// DEACTIVATE, NEVER DELETE. Orders and customers reference these rows by id.
// Removing one would orphan a customer's address and blank the community on
// every past order. Toggling is_active is enough: get_ordering_info only
// returns active areas, so the customer dropdown drops it immediately, while
// the admin keeps reading every area (the manage policy is USING true) so past
// orders still render the name.

import { useCallback, useEffect, useState } from "react";
import { db, SessionExpired } from "../../lib/admin";

export default function Areas({ onExpired, onAreasChanged }) {
  const [areas, setAreas] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      // Every area, active or not — this screen is where inactive ones are
      // managed, so it must not filter them out.
      const rows = await db("delivery_areas?select=id,name,is_active,sort_order&order=sort_order,name");
      setAreas(rows ?? []);

      // How many customers sit in each area, so deactivating is an informed
      // decision rather than a guess.
      const customers = await db("customers?select=delivery_area_id");
      const tally = {};
      for (const c of customers ?? []) {
        if (c.delivery_area_id) tally[c.delivery_area_id] = (tally[c.delivery_area_id] ?? 0) + 1;
      }
      setCounts(tally);
    } catch (e) {
      if (e instanceof SessionExpired) onExpired();
      else setError(e.message);
    }
  }, [onExpired]);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(fn) {
    setError(null);
    try {
      await fn();
      await load();
      onAreasChanged?.();
    } catch (e) {
      if (e instanceof SessionExpired) onExpired();
      else setError(e.message);
    } finally {
      setBusyId(null);
      setAdding(false);
    }
  }

  const nameTaken = (name, exceptId) =>
    (areas ?? []).some(
      (a) => a.id !== exceptId && a.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

  function addArea() {
    const name = newName.trim();
    if (!name) return;
    if (nameTaken(name)) {
      setError(`"${name}" is already on the list.`);
      return;
    }
    setAdding(true);
    mutate(async () => {
      const maxSort = Math.max(0, ...(areas ?? []).map((a) => Number(a.sort_order) || 0));
      await db("delivery_areas", {
        method: "POST",
        body: { name, is_active: true, sort_order: maxSort + 1 },
        prefer: "return=minimal",
      });
      setNewName("");
    });
  }

  function saveName(id) {
    const name = editName.trim();
    if (!name) return;
    if (nameTaken(name, id)) {
      setError(`"${name}" is already on the list.`);
      return;
    }
    setBusyId(id);
    mutate(async () => {
      await db(`delivery_areas?id=eq.${id}`, {
        method: "PATCH",
        body: { name },
        prefer: "return=minimal",
      });
      setEditId(null);
    });
  }

  function toggleActive(area) {
    setBusyId(area.id);
    mutate(() =>
      db(`delivery_areas?id=eq.${area.id}`, {
        method: "PATCH",
        body: { is_active: !area.is_active },
        prefer: "return=minimal",
      })
    );
  }

  if (areas === null) {
    return (
      <section className="ad-areas">
        <h2 className="ad-h">Communities</h2>
        <div className="ad-empty">Loading communities…</div>
      </section>
    );
  }

  return (
    <section className="ad-areas">
      <h2 className="ad-h">Communities</h2>
      <p className="ad-fieldnote" style={{ marginBottom: 14 }}>
        Active communities appear in the customer&apos;s dropdown straight away.
        Turning one off hides it from new orders but keeps it on past ones —
        that is why there is no delete.
      </p>

      {error && (
        <div className="ad-err" role="alert">
          {error}
        </div>
      )}

      <ul className="ad-arealist">
        {areas.map((a) => {
          const n = counts[a.id] ?? 0;
          const editing = editId === a.id;
          return (
            <li key={a.id} className={`ad-area${a.is_active ? "" : " is-off"}`}>
              {editing ? (
                <div className="ad-area-edit">
                  <input
                    aria-label={`Rename ${a.name}`}
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName(a.id);
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                  <button
                    type="button"
                    className="ad-mini is-primary"
                    disabled={busyId === a.id || !editName.trim()}
                    onClick={() => saveName(a.id)}
                  >
                    Save
                  </button>
                  <button type="button" className="ad-mini" onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="ad-area-main">
                    <span className="ad-area-name">{a.name}</span>
                    <span className="ad-area-meta">
                      {n} customer{n === 1 ? "" : "s"}
                      {!a.is_active && " · hidden from new orders"}
                    </span>
                  </div>
                  <div className="ad-area-actions">
                    <button
                      type="button"
                      className="ad-mini"
                      onClick={() => {
                        setEditName(a.name);
                        setEditId(a.id);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="ad-mini"
                      aria-pressed={a.is_active}
                      disabled={busyId === a.id}
                      onClick={() => toggleActive(a)}
                    >
                      {a.is_active ? "Turn off" : "Turn on"}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="ad-area-add">
        <input
          id="new-area"
          aria-label="New community name"
          placeholder="Add a community"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addArea()}
        />
        <button
          type="button"
          className="ad-mini is-primary"
          disabled={adding || !newName.trim()}
          onClick={addArea}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
    </section>
  );
}
