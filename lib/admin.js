"use client";

// Admin-side Supabase access: password sign-in plus authenticated PostgREST
// queries. Deliberately no SDK, matching lib/db.js — the whole surface is a
// token endpoint and a REST endpoint, and hand-rolling it keeps the dependency
// list at zero.
//
// The difference from lib/db.js: that file speaks only to two SECURITY DEFINER
// functions as `anon`. This one carries a signed-in user's JWT, which the
// "admin manages X" RLS policies (ALL / to authenticated) accept for every
// table. No new SECURITY DEFINER functions are needed for admin work — that
// pattern exists to make the *public* path safe, and has no job here.

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://vslcxoshqwlomdrdpmqx.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_af0TFU_gi3U84MgLIDhc3A_LEUlCVZV";

const STORE = "navera.admin.session";

// Thrown when there is no usable session and the UI should fall back to the
// login form, as distinct from an ordinary query failure.
export class SessionExpired extends Error {
  constructor(message) {
    super(message || "Your session has ended. Please sign in again.");
    this.name = "SessionExpired";
  }
}

/* ------------------------------------------------ session storage */

function load() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(session) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(session));
  } catch {
    // Private-browsing quota errors shouldn't break the sign-in that just
    // succeeded; the session simply won't survive a reload.
  }
}

function clear() {
  try {
    window.localStorage.removeItem(STORE);
  } catch {
    /* nothing useful to do */
  }
}

// Supabase returns expires_in (seconds). Store an absolute epoch second so a
// reload hours later can tell staleness without trusting the original clock.
function shape(body) {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(body.expires_in ?? 3600),
    email: body?.user?.email ?? null,
  };
}

export function currentSession() {
  return load();
}

/* ------------------------------------------------ auth */

function authMessage(body, status) {
  const raw =
    body?.error_description || body?.msg || body?.message || body?.error;
  if (status === 400 || status === 401) {
    return raw || "That email and password didn't match. Please try again.";
  }
  return raw || "Could not sign in. Please try again in a moment.";
}

export async function signIn(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ email: email.trim(), password }),
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(authMessage(body, res.status));

  const session = shape(body);
  save(session);
  return session;
}

async function refresh(session) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
    cache: "no-store",
  });

  if (!res.ok) {
    clear();
    throw new SessionExpired();
  }

  const next = shape(await res.json());
  save(next);
  return next;
}

export async function signOut() {
  const session = load();
  clear();
  if (!session) return;
  try {
    await fetch(`${URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // The local session is already gone, which is what signing out means to
    // this browser. Revoking server-side is best effort.
  }
}

// Refresh a minute early rather than waiting for a 401 mid-order-entry.
async function accessToken() {
  const session = load();
  if (!session?.access_token) throw new SessionExpired();
  if (session.expires_at - 60 <= Math.floor(Date.now() / 1000)) {
    return (await refresh(session)).access_token;
  }
  return session.access_token;
}

/* ------------------------------------------------ PostgREST */

export async function db(path, options = {}) {
  const { method = "GET", body, prefer, retry = true } = options;

  const headers = { apikey: KEY, Authorization: `Bearer ${await accessToken()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  // A token can be revoked server-side before it expires locally. One retry
  // after a forced refresh, then give up and let the UI show the login form.
  if (res.status === 401 && retry) {
    const session = load();
    if (!session) throw new SessionExpired();
    await refresh(session);
    return db(path, { ...options, retry: false });
  }

  if (res.status === 204) return null;

  const out = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      out?.message || out?.hint || out?.details || "That didn't save. Please try again."
    );
  }
  return out;
}
