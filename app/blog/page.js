import Link from "next/link";
import Shell from "./Shell";
import { POSTS, postDate } from "./posts";
import { getWaNumber } from "./whatsapp";

// Server-rendered on every request, like the other pages: the WhatsApp number
// comes from the database, and the build container has no route to it.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog | Navera Fresh Paneer",
  description:
    "Short notes on how Navera paneer is made, and what we are learning from the families who order it.",
};

export default async function BlogIndex() {
  const waNumber = await getWaNumber();

  return (
    <Shell waNumber={waNumber}>
      <nav className="bl-top" aria-label="Back to ordering">
        <Link className="bl-back" href="/">
          <span aria-hidden="true">←</span> Back to ordering
        </Link>
      </nav>

      <header className="bl-head">
        <h1>Blog</h1>
        <p>
          Short notes on how our paneer is made, and what we are learning from
          you.
        </p>
      </header>

      <ul className="bl-list">
        {POSTS.map((post) => (
          <li key={post.slug}>
            <Link className="bl-card" href={`/blog/${post.slug}`}>
              <time className="bl-date" dateTime={post.date}>
                {postDate(post.date)}
              </time>
              <h2>{post.title}</h2>
              <p>{post.summary}</p>
              <span className="bl-more">
                Read the post <span aria-hidden="true">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
