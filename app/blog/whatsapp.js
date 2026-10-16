// WhatsApp helpers for the blog pages.
//
// The number is read from the same place the order page reads it
// (get_ordering_info), so changing it in one place changes it everywhere. If
// that call fails, or the number is absent, fall back to the one the other
// pages already use — a blog post should still open WhatsApp when the database
// is having a bad minute.

import { rpc } from "../../lib/db";

const WA_FALLBACK = "919843327406";

export async function getWaNumber() {
  try {
    const info = await rpc("get_ordering_info");
    return info?.whatsapp_number || WA_FALLBACK;
  } catch {
    return WA_FALLBACK;
  }
}

export const waLink = (number, text) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// Every WhatsApp link opens in a new tab (CLAUDE.md), and says so to screen
// readers.
export const newTab = { target: "_blank", rel: "noopener noreferrer" };
