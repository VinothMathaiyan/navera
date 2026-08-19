"use client";

// The one client component under /my/<token>, and the smallest one that can do
// this job.
//
// The page itself stays server-rendered with no client state — that is what
// makes "refresh it, bookmark it, come back next week" structurally true, and
// it has not changed. This is an enhancement hanging off the end of one
// sentence: the order, the amount, the delivery day and the reorder action all
// render server-side and are complete without it. If the JavaScript never
// arrives, the sentence below still reads correctly.
//
// It has to be a client component because the thing it needs cannot exist on
// the server. An account-wide link is issued once, to the browser that placed
// the first order, and is deliberately never re-issued — not by phone number,
// not by anything. So the only place it lives is that device. The server
// rendering this page has no way to know whether the reader holds one, and
// must not be given a way: a page that could look up "does this person have an
// account link" from an order token would be the exposure the two-token rule
// exists to prevent.

import Link from "next/link";
import { useEffect, useState } from "react";

const REMEMBER_KEY = "navera.you.v1";
const looksLikeToken = (t) => typeof t === "string" && /^[0-9a-f]{24,128}$/i.test(t);

export default function AccountLink() {
  const [token, setToken] = useState("");

  // After mount, never during render: localStorage does not exist on the
  // server, and reading it while rendering would make the two HTMLs disagree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (v && looksLikeToken(v.accountToken)) setToken(v.accountToken);
    } catch {
      // Safari in private mode throws rather than returning null. Not being
      // able to remember must never break a page that is otherwise complete.
    }
  }, []);

  // Nothing stored, or the JavaScript has not run yet. Deliberately does not
  // tell anyone to go and find the link from their first order — most people
  // will not have kept it, and sending them looking for something they haven't
  // got is worse than saying nothing. It also claims nothing about whether
  // other orders exist: this page genuinely cannot know, and a guess either
  // way would be its own small leak.
  if (!token) {
    return <>If you&apos;ve ordered before, message us and we&apos;ll find the rest for you.</>;
  }

  // The stored token appears here and nowhere else: as the href of an internal
  // link to this site's own private page. Never in a message, never in an
  // outbound link, never in a query parameter — those get forwarded.
  return (
    <>
      Ordered before?{" "}
      <Link className="my-allorders" href={`/my/${token}`}>
        See all your orders
      </Link>
    </>
  );
}
