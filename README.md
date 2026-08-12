# Navera Ordering Site

Next.js ordering page for Navera Fresh Paneer. Talks directly to Supabase
(project `vslcxoshqwlomdrdpmqx`, ap-south-1) through two RPC functions —
no ORM. See `CLAUDE.md` for full project context, `docs/NAVERA_WEBSITE_MASTER_SPEC.md`
for the locked business specification.

## Run locally

    npm install
    npm run dev

Opens on http://localhost:3000. No `.env` file required — Supabase URL and
the public anon key are defaulted in `lib/db.js`.

## Deploy

    npx vercel --prod

Or connect this repo to Vercel via GitHub for deploy-on-push (recommended —
see "First time setting up" below).

## What's enforced server-side (never trust the browser for these)

- Cutoff time and which delivery dates are still open
- Prices — read from the `products` table, never sent by the client
- Valid 10-digit Indian mobile number
- Delivery community must exist and be active
- Minimum order amount

## First time setting up (GitHub + Vercel)

1. Create an empty GitHub repository (no README/gitignore — this repo
   already has both).
2. From this folder: `git remote add origin <your-repo-url>` then
   `git branch -M main && git push -u origin main`.
3. In Vercel, import the GitHub repo rather than deploying ad-hoc — this
   gives you a preview deploy on every branch/PR and a production deploy on
   every push to `main`.
4. If Vercel refuses to create a new project ("You don't have permission"),
   check your Vercel account/team role, or create an empty project named
   `navera` manually first, then connect the GitHub repo to it.
