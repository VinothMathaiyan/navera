// The customer's private link — spec §15.
//
// This page exists because the confirmation used to live in React state: a
// refresh dropped the delivery address and dumped the customer back on step 1,
// which made the page's own "keep this page" line untrue. The fix is not to
// remember harder on the client, it is for the confirmation to be a real URL
// that can be refreshed, bookmarked, and reopened next week.
//
// Rendered entirely on the server. There is no client component under here and
// no state to lose — the whole page is re-derived from the token in the URL on
// every request, which is exactly what "survives a refresh" has to mean.

import Link from "next/link";
import { rpc } from "../../../lib/db";
import Masthead from "../../Masthead";
import {
  DOW_LONG,
  clock,
  longDate,
  packLine,
  parseDate,
  rupees,
  shiftDays,
} from "../../format";

export const dynamic = "force-dynamic";

// Both halves matter and neither is decoration:
//   robots  — a private link must never reach an index. Anyone who finds it
//             holds the credential, so being crawlable would be the leak.
//   referrer— every outbound tap (the WhatsApp button) would otherwise hand the
//             full URL, token and all, to the destination in the Referer
//             header. The links carry rel="noreferrer" as well; this is the
//             belt to that pair of braces.
export const metadata = {
  title: "Your Navera",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const WA_FALLBACK = "919843327406";
const waLink = (number, text) =>
  `https://wa.me/${number || WA_FALLBACK}?text=${encodeURIComponent(text)}`;
const newTab = { target: "_blank", rel: "noopener noreferrer" };
const NewTabNote = () => <span className="sr-only"> (opens in a new tab)</span>;

// The customer's words for where their order has got to, not the kitchen's.
// Deliberately no times anywhere in here — the business commits to a day.
const STATUS_TEXT = {
  confirmed: "Confirmed",
  preparing: "Being prepared",
  dispatched: "On its way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default async function MyNaveraPage({ params, searchParams }) {
  const { token } = await params;
  const { placed } = (await searchParams) ?? {};

  let me = null;
  try {
    me = await rpc("get_my_orders", { p_token: token });
  } catch {
    // Swallowed on purpose. A network or database failure must look the same as
    // a bad token — see the not-found branch below.
    me = null;
  }

  // A repeat customer's confirmation link carries the order's own token, not
  // the account token — since the 17 Aug security fix these are two different
  // token types, and get_my_orders only ever recognises the account one. Try
  // the order-scoped lookup before giving up, same "swallow and treat as no
  // link" handling as above so every failure still renders identically.
  if (!me || !Array.isArray(me.orders) || me.orders.length === 0) {
    let order = null;
    try {
      order = await rpc("get_order_by_token", { p_token: token });
    } catch {
      order = null;
    }
    if (order && order.scope === "order" && order.reference) {
      // Reshaped into the same shape get_my_orders returns, with a single
      // order in it, so every render path below — address card, "coming
      // up"/"earlier" split, the just-placed confirmation, WhatsApp links —
      // stays the one already built and verified, instead of a second
      // parallel layout to keep in sync. An order-scoped token only ever
      // yields this one order; nothing here can surface any other.
      me = {
        name: order.name ?? null,
        community: order.community ?? null,
        flat: order.flat ?? null,
        whatsapp_number: order.whatsapp_number ?? null,
        cutoff_time: order.cutoff_time ?? null,
        // Falls back to a date before any real delivery date, so a missing
        // `today` can never sort the order out of both the "coming up" and
        // "earlier" lists and leave the page looking empty.
        today: order.today ?? "0000-00-00",
        orders: [
          {
            reference: order.reference,
            delivery_date: order.delivery_date,
            status: order.status,
            total: order.total,
            items: order.items ?? [],
          },
        ],
      };
    }
  }

  /* ---------------------------------------------- nothing to show */

  // One response for every failure: unknown token, truncated token, a character
  // altered, a revoked link, a blocked account, or the database being down. The
  // function itself returns null for all of them and this page says the same
  // thing for all of them. Never "no such link" versus "no orders" — that
  // difference is what would confirm a guessed token.
  if (!me || !Array.isArray(me.orders) || me.orders.length === 0) {
    return (
      <main>
        <Masthead lede={false} />
        <div className="wrap my">
          <h1 className="my-h">This link didn&apos;t open</h1>
          <p className="my-lost">
            It may have been typed incompletely, or replaced by a newer one.
            Message us and we&apos;ll sort it out — or start a fresh order.
          </p>
          <div className="my-actions">
            <Link className="cta again" href="/">
              Order fresh paneer
            </Link>
            <a
              className="wa"
              href={waLink(WA_FALLBACK, "Hi Navera, my order link isn't opening.")}
              {...newTab}
            >
              WhatsApp us
              <NewTabNote />
            </a>
          </div>
          <p className="fssai my-fssai">FSSAI Lic. No. 22426358000260</p>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------- the customer's orders */

  const firstName = (me.name ?? "").trim().split(" ")[0] || "there";
  const address = [me.community, me.flat].filter(Boolean).join(", ");

  // "today" comes from the database in the business's own timezone, so a phone
  // with a wrong clock cannot file tomorrow's delivery under "earlier".
  const today = me.today;
  const live = me.orders.filter((o) => o.status !== "cancelled");

  const upcoming = live
    .filter((o) => o.delivery_date >= today)
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const earlier = live
    .filter((o) => o.delivery_date < today)
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));

  // Landing straight from the order form: ?placed=NAV-00X names the one order
  // this visit is about. It is in the URL rather than in state precisely so a
  // refresh keeps showing the same confirmation instead of a generic list.
  const justPlaced = placed ? me.orders.find((o) => o.reference === placed) : null;

  // The order just placed is already spelled out in full above, so it must not
  // appear a second time in the list underneath it.
  const alsoUpcoming = upcoming.filter((o) => o.reference !== justPlaced?.reference);

  return (
    <main>
      <Masthead lede={false} />
      <div className="wrap my">
        {justPlaced ? (
          <ConfirmationHead order={justPlaced} firstName={firstName} />
        ) : (
          <>
            <h1 className="my-h">Your Navera</h1>
            <p className="my-hello">
              Hello {firstName}. Everything you&apos;ve ordered is here.
            </p>
          </>
        )}

        {/* The address. This is the thing a refresh used to throw away, so it
            is on the page in its own right rather than only inside whichever
            order happens to be showing. */}
        {address && (
          <div className="card my-card">
            <div className="k">Delivering to</div>
            <div className="v">{address}</div>
          </div>
        )}

        {alsoUpcoming.length > 0 && (
          <section className="my-sec">
            <h2>{justPlaced ? "Also coming up" : "Coming up"}</h2>
            {alsoUpcoming.map((o) => (
              <OrderRow key={o.reference} order={o} />
            ))}
          </section>
        )}

        {earlier.length > 0 && (
          <section className="my-sec">
            <h2>Earlier</h2>
            {earlier.map((o) => (
              <OrderRow key={o.reference} order={o} past />
            ))}
          </section>
        )}

        <div className="my-actions">
          {/* What makes "you can reorder from it" true. Tapping through lands on
              the order form with this customer's name, number, community and
              flat already filled in from their own device — so a repeat order
              is a pack, a day and one tap. §14's one-tap same-again lands here
              next; this is the honest version of the promise until it does. */}
          <Link className="cta again" href="/">
            Order again
          </Link>
          <a
            className="wa"
            href={waLink(
              me.whatsapp_number,
              justPlaced
                ? `Hi Navera, I've placed order ${justPlaced.reference} for ` +
                    `${packLine(justPlaced.items)} paneer on ` +
                    `${longDate(parseDate(justPlaced.delivery_date))}.`
                : "Hi Navera, I have a question about my order."
            )}
            {...newTab}
          >
            {justPlaced ? "Message us about this order" : "Message us"}
            <NewTabNote />
          </a>
        </div>

        <p className="my-keep">
          Keep this page — you can reorder from it next time.
        </p>
        <p className="my-private">
          It&apos;s private to you, so please don&apos;t forward the link.
          Orders close at {clock(me.cutoff_time)} the day before delivery.
        </p>
        <p className="fssai my-fssai">FSSAI Lic. No. 22426358000260</p>
      </div>
    </main>
  );
}

/* ------------------------------------------------ just-placed confirmation */

// The same card the old in-memory confirmation showed, in the same order, so
// nothing a customer had already seen changed shape when it moved onto a URL.
function ConfirmationHead({ order, firstName }) {
  const d = parseDate(order.delivery_date);
  const packs = packLine(order.items);
  // Every delivery is prepared the evening before — derived, never a lookup
  // table, so it stays right if the delivery days ever change again.
  const prepDayName = DOW_LONG[shiftDays(d, -1).getDay()];

  return (
    <>
      <div className="tick" aria-hidden="true">
        ✓
      </div>
      <h1 className="done-h">Thank you, {firstName}</h1>
      <p className="msg">
        Your paneer will be prepared on {prepDayName} evening and delivered on{" "}
        {DOW_LONG[d.getDay()]}. We&apos;ll confirm the delivery details with you
        on WhatsApp.
      </p>

      <div className="card my-card">
        <div className="k">Delivery</div>
        <div className="v">{longDate(d)}</div>
        {packs && (
          <>
            <div className="k">Pack</div>
            <div className="v">{packs}</div>
          </>
        )}
        <div className="k">To pay on delivery</div>
        <div className="v">{rupees(order.total)}</div>
        <div className="ordid">Order {order.reference}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------ one order in a list */

function OrderRow({ order, past = false }) {
  const d = parseDate(order.delivery_date);
  const packs = packLine(order.items);

  return (
    <div className={`my-order${past ? " is-past" : ""}`}>
      <div className="my-order-top">
        <span className="my-when">{longDate(d)}</span>
        <span className={`my-badge st-${order.status}`}>
          {STATUS_TEXT[order.status] ?? order.status}
        </span>
      </div>
      <div className="my-order-line">
        <span>{packs || "No packs"}</span>
        <span>{rupees(order.total)}</span>
      </div>
      <div className="my-ref">{order.reference}</div>
    </div>
  );
}
