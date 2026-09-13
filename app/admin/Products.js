"use client";

// Pack price management. Writes straight to `products` with the admin's JWT
// under the existing "admin manages products" policy (ALL / to authenticated
// / USING true) — no SECURITY DEFINER function, same as Settings and Areas.
//
// place_order and get_ordering_info both read price straight from this table
// at the moment of use ("priced from the database not the browser" — see
// place_order's items loop). So a price saved here reaches the customer's
// next page load and prices every order placed after that — website,
// WhatsApp, or manual entry — with nothing to redeploy. order_items.unit_price
// is a snapshot taken when an order is placed, so past orders keep the price
// they were actually charged; changing a pack's price here never rewrites
// history.
//
// Only price is editable here. Renaming a pack or changing its weight touches
// order_items.weight_grams history and the manual-entry sample logic
// (AdminDashboard keys the 100g sample pack off weight_grams) and is
// deliberately out of scope. Adding or retiring a pack is a schema-adjacent
// decision, not a quick edit, so it also stays off this screen — use is_active
// via a migration if a pack needs to disappear.

import { useCallback, useEffect, useState } from "react";
import { db, SessionExpired } from "../../lib/admin";

export default function Products({ onExpired, onProductsChanged }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [editId, setEditId] = useState(null);
  const [editPrice, setEditPrice] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      // Every pack, active or not. The 100g sample pack is inactive (hidden
      // from customers) but its price still feeds manual sample entries in
      // the order form, so it belongs on this screen too.
      const rows = await db(
        "products?select=id,name,weight_grams,price,is_active,sort_order&order=sort_order"
      );
      setProducts(rows ?? []);
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
      onProductsChanged?.();
    } catch (e) {
      if (e instanceof SessionExpired) onExpired();
      else setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function savePrice(p) {
    const raw = editPrice.trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 0) {
      setError("Enter a price of ₹0 or more.");
      return;
    }
    setBusyId(p.id);
    mutate(async () => {
      await db(`products?id=eq.${p.id}`, {
        method: "PATCH",
        body: { price: n },
        prefer: "return=minimal",
      });
      setEditId(null);
    });
  }

  if (products === null) {
    return (
      <section className="ad-areas">
        <h2 className="ad-h">Pack prices</h2>
        <div className="ad-empty">Loading packs…</div>
      </section>
    );
  }

  return (
    <section className="ad-areas">
      <h2 className="ad-h">Pack prices</h2>
      <p className="ad-fieldnote" style={{ marginBottom: 14 }}>
        The order page and every new order — website, WhatsApp, or manual —
        price straight from what is saved here. A change reaches customers on
        their next page load. Orders already placed keep the price they were
        actually charged.
      </p>

      {error && (
        <div className="ad-err" role="alert">
          {error}
        </div>
      )}

      <ul className="ad-arealist">
        {products.map((p) => {
          const editing = editId === p.id;
          return (
            <li key={p.id} className={`ad-area${p.is_active ? "" : " is-off"}`}>
              {editing ? (
                <div className="ad-area-edit">
                  <input
                    aria-label={`Price for ${p.name}`}
                    inputMode="decimal"
                    value={editPrice}
                    autoFocus
                    onChange={(e) => setEditPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePrice(p);
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                  <button
                    type="button"
                    className="ad-mini is-primary"
                    disabled={busyId === p.id || !editPrice.trim()}
                    onClick={() => savePrice(p)}
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
                    <span className="ad-area-name">
                      {p.name} <span className="ad-area-meta">({p.weight_grams}g)</span>
                    </span>
                    <span className="ad-area-meta">
                      ₹{Number(p.price).toFixed(0)}
                      {!p.is_active && " · hidden from new orders"}
                    </span>
                  </div>
                  <div className="ad-area-actions">
                    <button
                      type="button"
                      className="ad-mini"
                      disabled={busyId === p.id}
                      onClick={() => {
                        setError(null);
                        setEditPrice(String(Number(p.price)));
                        setEditId(p.id);
                      }}
                    >
                      Edit price
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
