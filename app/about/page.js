// The About page — spec-adjacent, added 2026-08-22 at the founder's request.
//
// A server component with no client component under it and no state: it is
// prose, and every word of it is on the page with JavaScript disabled. The one
// thing it reads from the database is the WhatsApp number, for the same reason
// the order page does — the number belongs in `settings`, not in three separate
// files. If that read fails the page still renders in full; only the number
// falls back, so a Supabase blip can never take the About page down.
//
// COPY IS THE FOUNDER'S, VERBATIM. Nothing here was written, trimmed or
// embellished by the build, and nothing may be added to it without a fresh
// instruction. Two things in particular are deliberate and must not be
// "corrected" by a later pass:
//
//   - There is no claim about refrigeration or cold chain anywhere on this
//     page. Paneer does need cold storage between packing and delivery, so any
//     sentence implying otherwise would be false. Do not add one.
//   - There is no founder name, bio, photo, mission statement or founding
//     story, and no health claim about protein or fat. All four were ruled out
//     explicitly.
//
// The one line that is not the brief's is the opening of "What goes in" — see
// the note on that section below. Everything else is exactly as supplied.

import Link from "next/link";
import { rpc } from "../../lib/db";
import Masthead from "../Masthead";

// Prose, but the WhatsApp number comes from the database, so this cannot be
// statically cached without going stale the day the number changes.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "About Navera — Fresh Paneer Prepared After Your Order",
  description:
    "Milk from free-roaming cared cows, and fresh lemon. That is the whole list. No preservatives, no vinegar, no citric acid powder, no milk solids, no starch, no vegetable fat.",
};

const WA_FALLBACK = "919843327406";

/* Every WhatsApp link leaves the site and opens in a new tab, and says so for
   screen readers — the same rule the order page and the private page follow. */
const newTab = { target: "_blank", rel: "noopener noreferrer" };
const NewTabNote = () => <span className="sr-only"> (opens in a new tab)</span>;

export default async function AboutPage() {
  let number = null;
  try {
    const info = await rpc("get_ordering_info");
    number = info?.whatsapp_number ?? null;
  } catch {
    // Deliberately swallowed. The About page states no fact that depends on
    // this call, so a failure must not surface an error to a reader who only
    // came to find out what goes in the paneer.
  }

  // The same greeting the order page's footer link carries, so a question
  // arrives in Gowri's WhatsApp reading the same way from either page.
  const wa = `https://wa.me/${number || WA_FALLBACK}?text=${encodeURIComponent(
    "Hi Navera, I have a question about your paneer."
  )}`;

  return (
    <main>
      {/* The mark alone: this page's own <h1> is "About Navera", and the
          masthead's lede is an <h1> on the order page. Two on one page is one
          too many — same reason /my/<token> takes it without the lede. */}
      <Masthead lede={false} />

      <div className="wrap about">
        <h1>About Navera</h1>
        <p className="about-lede">Fresh paneer, prepared after your order.</p>

        {/* This opening line, and the meta description that echoes it, are the
            ONE place the page departs from the copy as it was supplied. The
            brief read "Country cow milk and fresh lemon", which the founder
            confirmed on 2026-08-22 was a slip in the brief rather than a
            reversal: the 2026-08-13 sourcing rule stands, and "country cow"
            must not go back on the site. Corrected at their instruction.
            Do not restore the original wording from the brief. */}
        <section aria-labelledby="about-what">
          <h2 id="about-what">What goes in</h2>
          <p>
            Milk from free-roaming cared cows, and fresh lemon. That is the
            whole list.
          </p>
          <p>
            No preservatives. No vinegar. No citric acid powder. No milk solids,
            no starch, no vegetable fat. Nothing that extends shelf life,
            because nothing needs to sit on a shelf.
          </p>
          <p>
            Paneer sold in shops is made in bulk, then stored, then waits for a
            buyer. Some of what is sold as paneer is not made from milk alone at
            all. We would rather you knew exactly what you are eating.
          </p>
        </section>

        <section aria-labelledby="about-milk">
          <h2 id="about-milk">Where the milk comes from</h2>
          <p>
            From free-roaming cared cows, around 100 km away from Chennai.
          </p>
          <p>
            The milk is brought in for your order. It is not bought in bulk and
            held.
          </p>
        </section>

        <section aria-labelledby="about-made">
          <h2 id="about-made">How it is made</h2>
          <p>
            Every order is prepared the evening before it reaches you, in small
            batches, by hand.
          </p>
          <p>
            The milk is heated, then set with fresh lemon — whole lemons,
            squeezed, roughly one per litre. The curd is strained, lightly
            pressed, and packed as soon as it is made.
          </p>
          <p>
            It takes longer this way. That is why we ask you to order a day
            ahead.
          </p>
        </section>

        <section aria-labelledby="about-why">
          <h2 id="about-why">Why prepared after your order</h2>
          <p>
            Paneer is at its best when it is fresh. Making it only after you
            order means none of it is ever stored waiting to be sold.
          </p>
          <p>
            It also means we make exactly what is needed, and nothing is wasted.
          </p>
        </section>

        <section aria-labelledby="about-who">
          <h2 id="about-who">Who we are</h2>
          <p>
            Navera is a small operation in Koliyanur, near Viluppuram,
            delivering to apartment communities in Chennai. Every pack is made
            by the same hands.
          </p>
          {/* The licence line the founder's copy places here. The order page
              carries it in its footer as `.foot .fssai`; this one is not in a
              .foot, so it takes its own type — same problem `.my-fssai`
              solves on the private page. It is the page's only mention of the
              number, which is why the footer below does not repeat it. */}
          <p className="about-fssai">FSSAI Registration No. 22426358000260</p>
        </section>

        {/* The same `.foot` the order page uses, so the rule above it, the
            spacing and the type are the site's and not this page's. */}
        <div className="foot">
          <p className="about-note">
            Questions are welcome.{" "}
            {/* Inline in the sentence, so it takes the .notlisted treatment —
                height to 44px, never a box. The founder's line reads "WhatsApp
                us" mid-sentence, so linking those two words is what makes the
                copy and the control the same thing rather than adding a second
                "WhatsApp us" button underneath it. */}
            <a className="notlisted about-wa" href={wa} {...newTab}>
              WhatsApp us
              <NewTabNote />
            </a>{" "}
            — we would rather explain than have you wonder.
          </p>
          {/* The way back. /about is reachable only from the order page's
              footer, so this link is the whole of its navigation. */}
          <p className="foot-nav">
            <Link className="footlink" href="/">
              Order fresh paneer
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
