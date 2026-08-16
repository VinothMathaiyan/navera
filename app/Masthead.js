import Image from "next/image";

// Lifted out of OrderFlow.js so the private /my/<token> page can head itself the
// same way without pulling the whole client-side order form in behind it. No
// "use client": it renders an image and two lines of text, so it stays a server
// component and ships no JavaScript.
//
// public/Logo.png is the founder's finished artwork on its own cream ground —
// opaque, not transparent, and deliberately left unprocessed. The masthead
// background is set to that same cream (see --masthead in globals.css) so the
// image has no visible edge. Do not run this file through background removal;
// that was only ever needed for the old logo, which had to sit on a dark green
// header.
export default function Masthead({ lede = true }) {
  return (
    <header className="masthead">
      <div className="logo-wrap">
        <Image
          src="/Logo.png"
          alt="Navera Fresh Paneer"
          fill
          priority
          sizes="(max-width: 599px) 78vw, 340px"
          style={{ objectFit: "contain" }}
        />
      </div>
      {/* The lede is the order page's <h1>. The private page has its own
          heading, and two h1s on one page is one too many — so it takes the
          mark alone. */}
      {lede && (
        <>
          <div className="rule" />
          {/* "Fresh paneer" is already in the logo above — saying it again here
              read as a stutter, so the lede is just the promise. */}
          <h1 className="lede">
            <em>Prepared after your order.</em>
          </h1>
          <p className="two">
            From free-roaming cared cows, around 100 km away from Chennai.
          </p>
        </>
      )}
    </header>
  );
}
