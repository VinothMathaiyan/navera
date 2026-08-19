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
import AccountLink from "./AccountLink";
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

// One lookup, and every failure — bad token, wrong token type, database down —
// comes back as the same null. Nothing above this may distinguish them.
async function lookup(fn, token) {
  try {
    return await rpc(fn, { p_token: token });
  } catch {
    return null;
  }
}

export default async function MyNaveraPage({ params, searchParams }) {
  const { token } = await params;
  const { placed } = (await searchParams) ?? {};

  /* ---------------------------------------------- which kind of token is it */

  // Since the 2026-08-17 security fix a link in the wild can be either of two
  // things, and the page cannot tell which from the token alone — both are 48
  // hex characters:
  //
  //   customers.access_token  → get_my_orders      → the whole account
  //   orders.access_token     → get_order_by_token → that one order
  //
  // place_order hands the account link to a brand-new customer (the order just
  // placed IS the whole account, so it exposes nothing the caller did not just
  // type) and an order-scoped link to a returning one, because ten guessable
  // digits must not buy somebody else's history. Resolving only the first of
  // the two is what made every repeat customer's confirmation land on "This
  // link didn't open" — a perfectly valid link, refused by the page.
  //
  // Both are asked on every request, in parallel and never one-then-the-other,
  // for two reasons. It keeps the repeat customer's page exactly as fast as the
  // first-timer's — a second round trip for returning customers only would be a
  // worse page for them, which is precisely what this is fixing. And it means
  // an unknown token costs the same two calls as a good one, so response time
  // says nothing about which kind of token was guessed. Each function still
  // does its own validation and returns only its own customer's rows; asking
  // both cannot widen what either one answers.
  const [account, order] = await Promise.all([
    lookup("get_my_orders", token),
    lookup("get_order_by_token", token),
  ]);

  // A token is one or the other, never both — no order shares its customer's
  // token. get_order_by_token names its own scope in the payload; the account
  // read has no scope field, so anything that is not explicitly order-scoped is
  // treated as the narrower-to-render account case.
  const me = account ?? order;
  const orderScoped = me?.scope === "order";

  /* ---------------------------------------------- nothing to show */

  // One response for every failure: unknown token, truncated token, a character
  // altered, a revoked link, a blocked account, or the database being down. Both
  // functions return null for all of them and this page says the same thing for
  // all of them. Never "no such link" versus "no orders" — that difference is
  // what would confirm a guessed token.
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
  const orders = me.orders;

  // Landing straight from the order form: ?placed=NAV-00X names the one order
  // this visit is about. It is in the URL rather than in state precisely so a
  // refresh keeps showing the same confirmation instead of a generic list.
  const justPlaced = placed ? orders.find((o) => o.reference === placed) : null;

  // The order this page leads with. The list arrives newest first (delivery date
  // then placement), so the head of it is the latest order — except that a
  // cancelled one is not what somebody opening their link wants to read first,
  // so it yields to the newest live order and only leads when there is nothing
  // else. An order-scoped token has exactly one order, and this picks it.
  const lead =
    justPlaced ?? orders.find((o) => o.status !== "cancelled") ?? orders[0];

  // Everything else, split the way a customer thinks about it. Cancelled orders
  // stay out of both lists — the lead card is the one place a cancelled order
  // still speaks, because that is the one a customer may be looking for.
  const rest = orders.filter(
    (o) => o.reference !== lead.reference && o.status !== "cancelled"
  );
  const upcoming = rest
    .filter((o) => o.delivery_date >= today)
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const earlier = rest
    .filter((o) => o.delivery_date < today)
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));

  // Every message names its own order in full. WhatsApp appends a wa.me payload
  // to whatever unsent draft is already in the chat, so a message that only said
  // "my order" could end up under somebody else's half-typed line.
  const leadPacks = packLine(lead.items);
  const leadWhen = longDate(parseDate(lead.delivery_date));
  const waAboutLead =
    `Hi Navera, ${justPlaced ? "I've placed" : "about my"} order ${lead.reference}` +
    `${leadPacks ? ` for ${leadPacks} paneer` : ""} on ${leadWhen}.`;

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
              Hello {firstName}. Here&apos;s your latest order.
            </p>
          </>
        )}

        {/* The order itself, in full and at the top: reference, day, packs,
            amount and where it has got to. Whichever kind of link opened this
            page, this card is the same card — a returning customer must not get
            a thinner page than a first-time one. */}
        <LeadOrder
          order={lead}
          label={!orderScoped && orders.length > 1 ? "Latest order" : "Your order"}
        />

        {/* The address. This is the thing a refresh used to throw away, so it
            is on the page in its own right rather than only inside whichever
            order happens to be showing. */}
        {address && (
          <div className="card my-card">
            <div className="k">Delivering to</div>
            <div className="v">{address}</div>
          </div>
        )}

        {/* Straight under the order, above any history: reordering is the whole
            point of the page, so it must not sit at the bottom of a list.
            Tapping through lands on the order form with this customer's name,
            number, community and flat already filled in from their own device —
            so a repeat order is a pack, a day and one tap. §14's one-tap
            same-again lands here next; this is the honest version until it
            does. */}
        <div className="my-actions">
          <Link className="cta again" href="/">
            Order again
          </Link>
          <a className="wa" href={waLink(me.whatsapp_number, waAboutLead)} {...newTab}>
            {justPlaced ? "Message us about this order" : "Message us"}
            <NewTabNote />
          </a>
        </div>

        {/* What sits below the action is the one place the two kinds of link
            differ, and the order-scoped one says so plainly rather than showing
            an empty history that reads like something went missing. The wording
            claims nothing about whether there are other orders — this page has
            no way of knowing, and guessing would be its own small leak. */}
        {orderScoped ? (
          <p className="my-scope">
            This link opens order {lead.reference} on its own.{" "}
            {/* Whether this reader holds their account-wide link is knowable
                only on their own device — see AccountLink. The sentence reads
                correctly either way, and the order above it is already
                complete without this. */}
            <AccountLink />
          </p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section className="my-sec">
                <h2>Also coming up</h2>
                {upcoming.map((o) => (
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
          </>
        )}

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

// The same words the old in-memory confirmation showed, so nothing a customer
// had already seen changed when it moved onto a URL. The order's own facts moved
// down into the card below, which every visit now gets rather than only the one
// arriving straight from the form.
function ConfirmationHead({ order, firstName }) {
  const d = parseDate(order.delivery_date);
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
    </>
  );
}

/* ------------------------------------------------ the order this page is about */

function LeadOrder({ order, label }) {
  const packs = packLine(order.items);

  return (
    <div className="card my-card">
      <div className="my-lead-top">
        <span className="my-lead-label">{label}</span>
        <span className={`my-badge st-${order.status}`}>
          {STATUS_TEXT[order.status] ?? order.status}
        </span>
      </div>
      <div className="k">Delivery</div>
      <div className="v">{longDate(parseDate(order.delivery_date))}</div>
      {packs && (
        <>
          <div className="k">Pack</div>
          <div className="v">{packs}</div>
        </>
      )}
      <div className="k">
        {order.status === "delivered" ? "Paid on delivery" : "To pay on delivery"}
      </div>
      <div className="v">{rupees(order.total)}</div>
      <div className="ordid">Order {order.reference}</div>
    </div>
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
