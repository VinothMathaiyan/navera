import Link from "next/link";
import Shell from "../Shell";
import { getWaNumber } from "../whatsapp";

export const dynamic = "force-dynamic";

const TITLE = "How Your Paneer Is Made, From Fresh Milk to Your Door | Navera Fresh Paneer";
const DESCRIPTION =
  "Six simple steps from fresh milk and fresh lemon to the paneer at your door. No vinegar, no preservatives, prepared after you order.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The banner doubles as the preview card when this link is shared on WhatsApp.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    images: [
      { url: "https://naverafresh.in/how-paneer-is-made.png", width: 1200, height: 600 },
    ],
  },
};

// The six steps match the six on the WhatsApp banner, in the same order and
// the same words, so the banner and this page always tell one story.
const STEPS = [
  {
    title: "Fresh milk",
    body: "Once your order is in, fresh milk is brought to our unit. We check its smell and quality before we use it. If it does not pass, we do not use it.",
  },
  {
    title: "Gentle heating",
    body: "We heat the milk to 95°C and hold it there for a few minutes to remove harmful bacteria. We stir as it heats, so it never sticks or scorches.",
  },
  {
    title: "Fresh lemon",
    body: "We squeeze fresh, ripe lemons ourselves and strain the juice. When the milk has cooled to the right temperature for your chosen texture, we add the juice slowly, a little at a time, until soft white curds separate from the clear whey.",
  },
  {
    title: "Pressed your way",
    body: "We pour off the whey through clean muslin cloth, then rinse the curds in cold, clean drinking water to wash away the lemon taste. Then we press them in a stainless-steel press. How long we press decides whether your paneer is soft, medium-firm or firm.",
  },
  {
    title: "Ice-cold chill",
    body: "The pressed block rests in ice-cold, clean drinking water until it is cold all the way through. Cooling it properly helps the paneer stay fresh.",
  },
  {
    title: "Packed fresh",
    body: "We pat the block dry, cut it into pieces and weigh each one, so every pack is at least the weight on its label. Each pack is sealed in a clean food-grade pouch, labelled with its packing date, and kept cold until it is on its way to you.",
  },
];

export default async function HowPaneerIsMadePost() {
  const waNumber = await getWaNumber();

  return (
    <Shell waNumber={waNumber}>
      <nav className="bl-top" aria-label="Blog">
        <Link className="bl-back" href="/blog">
          <span aria-hidden="true">←</span> All posts
        </Link>
      </nav>

      <article className="bl-article">
        <header>
          <h1>How your paneer is made, from fresh milk to your door</h1>
          <p className="bl-intro">
            At Navera Fresh Paneer, we believe you should know exactly how your
            food is made. So here is the whole journey, from fresh milk to the
            pack at your door. It takes a few hours from milk to pack, and it is
            never rushed.
          </p>
        </header>

        <section aria-labelledby="two">
          <h2 id="two">Just two ingredients</h2>
          <p>
            Fresh milk from free-roaming cared cows, around 100 km away from
            Chennai, and fresh lemon juice. Nothing more. No vinegar, no
            preservatives, no additives.
          </p>
        </section>

        <section aria-labelledby="steps">
          <h2 id="steps">Six simple steps</h2>
          <ol className="bl-steps">
            {STEPS.map((s, i) => (
              <li className="bl-step" key={s.title}>
                <span className="bl-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="bl-note">
            Soft, medium-firm or firm? Read{" "}
            <Link href="/blog/paneer-texture">how texture is decided</Link>.
          </p>
        </section>

        <section className="bl-made" aria-labelledby="clean">
          <h2 id="clean">Kept clean at every step</h2>
          <p>
            Everything that touches the milk, the lemon juice, the curds and the
            paneer is stainless steel. We wash our hands, wear gloves, a hair
            cover and an apron, and we clean and sanitise all equipment and
            cloths after every batch.
          </p>
          <p>
            Because there are no preservatives, we make your paneer only after
            you order and keep it cold until it reaches you. Please keep it in
            the fridge when it arrives.
          </p>
        </section>

        <section className="bl-cta" aria-labelledby="try">
          <h2 id="try">Taste it fresh</h2>
          <p>Fresh paneer, prepared after your order.</p>
          <Link className="bl-btn" href="/">
            Order fresh paneer
          </Link>
        </section>

        <p className="bl-signoff">
          Thank you for being part of our journey! ❤️
          <br />
          <strong>Navera Fresh Paneer</strong> · Fresh Paneer. Prepared After You
          Order.
        </p>
      </article>
    </Shell>
  );
}
