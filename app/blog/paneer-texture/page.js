import Link from "next/link";
import Shell from "../Shell";
import { getWaNumber, newTab, waLink } from "../whatsapp";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Soft, Medium-Firm or Firm? How Do You Like Your Paneer? | Navera Fresh Paneer",
  description:
    "Tell Navera which paneer texture you prefer: soft for bhurji, medium-firm for salads, or firm for tandoori and grilling. Fresh paneer, prepared after you order.",
};

// One entry per texture: the card below and the WhatsApp button further down
// both read from it, so the two can never describe a texture differently.
const TEXTURES = [
  {
    key: "soft",
    name: "Soft paneer",
    best: "Best for bhurji and delicate dishes",
    body: "Feels soft and tender when you eat it. It blends easily with the other ingredients, so it is lovely in paneer bhurji.",
    button: "I like it soft",
    message: "Hi Navera! I prefer Soft paneer (for bhurji).",
  },
  {
    key: "medium",
    name: "Medium-firm paneer",
    best: "Best for salads and everyday cooking",
    body: "A balance of tender and sturdy. It holds its shape in salads and daily dishes, and still feels soft to bite.",
    button: "I like it medium-firm",
    message: "Hi Navera! I prefer Medium-Firm paneer (for salads and everyday cooking).",
  },
  {
    key: "firm",
    name: "Firm paneer",
    best: "Best for tandoori and grilling",
    body: "Holds its shape well and feels firmer when you bite. The cubes stay whole on the grill or in the tandoor.",
    button: "I like it firm",
    message: "Hi Navera! I prefer Firm paneer (for tandoori and grilling).",
  },
];

export default async function PaneerTexturePost() {
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
          <h1>Soft, medium-firm or firm? How do you like your paneer?</h1>
          <p className="bl-intro">
            At Navera Fresh Paneer, good food starts with listening to the
            people who enjoy it. This week, some of you told us you like softer
            paneer, and others like it firmer. Thank you for sharing! ❤️ Now we
            would like to hear from everyone.
          </p>
        </header>

        <section aria-labelledby="textures">
          <h2 id="textures">Which texture suits you best?</h2>
          <p>
            Paneer can be made softer or firmer. Each one works best in
            different dishes.
          </p>

          <div className="bl-choices">
            {TEXTURES.map((t) => (
              <div className="bl-choice" key={t.key}>
                <div className={`bl-cube ${t.key}`} aria-hidden="true" />
                <div>
                  <h3>{t.name}</h3>
                  <p className="bl-best">{t.best}</p>
                  <p>{t.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="bl-note">
            The right texture also depends on your recipe and how you cook.
          </p>
        </section>

        <section aria-labelledby="why">
          <h2 id="why">What decides how soft or firm paneer turns out?</h2>
          <p>
            Paneer is made by separating the milk solids from the liquid using
            an acid. We use fresh lemon juice. Four things shape the final
            texture:
          </p>
          <dl className="bl-factors">
            <dt>Heat</dt>
            <dd>How hot the milk gets changes how the milk proteins set.</dd>
            <dt>Lemon</dt>
            <dd>
              How much lemon we add, how sour it is, and when it goes in all
              affect how the curds form.
            </dd>
            <dt>Pressing</dt>
            <dd>
              How long and how hard we press decides how much water stays in
              the paneer. More water means softer paneer.
            </dd>
            <dt>Cooling and storage</dt>
            <dd>
              How the paneer cools and is kept can also change the texture you
              get at home.
            </dd>
          </dl>
          <p>
            We are working to control each of these steps more consistently.
            Your answers will guide our trials and improvements.
          </p>
        </section>

        <section className="bl-made" aria-labelledby="simple">
          <h2 id="simple">Made simply, with care</h2>
          <p>
            Our paneer is made with village cow milk and fresh lemon, nothing
            more. We prepare it fresh after you order, with no preservatives and
            no vinegar. As we grow, we want to keep listening and improving,
            without changing the way we make our paneer.
          </p>
        </section>

        <section className="bl-cta" aria-labelledby="tell">
          <h2 id="tell">Tell us your preference</h2>
          <p>
            Tap the texture you like. WhatsApp opens with your message ready, so
            you only need to press send.
          </p>
          {TEXTURES.map((t) => (
            <a
              key={t.key}
              className="bl-btn"
              href={waLink(waNumber, t.message)}
              {...newTab}
            >
              {t.button}
              <span className="sr-only"> (opens WhatsApp in a new tab)</span>
            </a>
          ))}
        </section>

        <p className="bl-signoff">
          Thank you for being part of our journey! ❤️
          <br />
          <strong>Navera Fresh Paneer</strong> · Fresh Paneer. Prepared After You
          Order.
        </p>

        <Link className="bl-btn bl-btn-ghost" href="/">
          Order fresh paneer
        </Link>
      </article>
    </Shell>
  );
}
