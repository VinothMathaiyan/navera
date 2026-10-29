// The blog's one source of truth: the index page reads this list, and each post
// is its own route under app/blog/<slug>/page.js. Newest first.
//
// Adding a post is two steps: write app/blog/<slug>/page.js, then add one entry
// here. Nothing else on the site needs to know a post exists.

export const POSTS = [
  {
    slug: "how-paneer-is-made",
    title: "How your paneer is made, from fresh milk to your door",
    date: "2026-10-29",
    summary:
      "Six simple steps from fresh milk and fresh lemon to the paneer at your door.",
  },
  {
    slug: "paneer-texture",
    title: "Soft, medium-firm or firm? How do you like your paneer?",
    // Publish date, as YYYY-MM-DD. Shown on the index and used by <time>.
    date: "2026-10-16",
    summary:
      "Paneer can be made softer or firmer, and each suits different dishes. Tell us which texture you prefer.",
  },
];

// "2026-10-16" -> "16 Oct 2026". Pinned to UTC so a plain date never slides a
// day depending on the server's time zone.
export function postDate(iso) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
