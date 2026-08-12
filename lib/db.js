// Thin wrapper over Supabase's REST RPC endpoint.
// No SDK: the public site only ever calls two functions.
//
// The publishable key is meant to be public — it identifies the project, it
// does not grant access. Row Level Security is what protects the data: the
// anon role has no read access at all to customers, orders or subscriptions.

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://vslcxoshqwlomdrdpmqx.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_af0TFU_gi3U84MgLIDhc3A_LEUlCVZV";

export async function rpc(fn, args = {}) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // Postgres raise-exception messages are written to be read by customers,
    // so pass them through rather than inventing our own.
    const message =
      body?.message?.replace(/^.*?:\s*/, "") ||
      "Something went wrong. Please try again, or WhatsApp us.";
    throw new Error(message);
  }
  return body;
}
