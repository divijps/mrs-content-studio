# Turn on the team workspace (Supabase) — ~5 minutes

Right now the deployed app runs in **demo mode**: everyone gets their own
in-browser sandbox that resets on refresh. Following these steps turns it into
the **shared team workspace**: accounts, one library for everyone, uploads that
persist, comments/approvals that sync live between teammates.

Cost: **$0** on Supabase's free tier (500 MB database + 1 GB file storage —
web-res derivatives keep photos small). Upgrade later is ~$25/mo, or self-host
Supabase in-house with the same code.

## 1. Create the project (2 min)

1. Go to <https://supabase.com> → sign up (GitHub login works) → **New project**.
2. Name: `mrs-content-studio`. Pick the region closest to the team. Set a strong
   database password (you won't need it day-to-day). Wait ~1 min for provisioning.

## 2. Create the schema (1 min)

1. In the dashboard: **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql)
   from this repo and press **Run**. You should see "Success".
   (This creates the tables, team access rules, live-sync, and the two storage
   buckets: `assets` for originals, `thumbs` for web-size copies.)

## 3. Copy the two keys (1 min)

Dashboard → **Project Settings → API**:

- **Project URL** → this is `VITE_SUPABASE_URL`
- **anon public** key → this is `VITE_SUPABASE_ANON_KEY`

(The anon key is safe to ship in the frontend — access is controlled by the
row-level-security rules the schema installed: only signed-in teammates can
read or write.)

## 4. Wire the deployed site (1 min)

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**, twice:

- `VITE_SUPABASE_URL` = the Project URL
- `VITE_SUPABASE_ANON_KEY` = the anon key

Then re-run the deploy (Actions → "Deploy to GitHub Pages" → Run workflow), or
just push any commit. The live site now shows a sign-in screen.

For local dev: copy `.env.example` to `.env.local`, fill the same two values,
restart `pnpm dev`.

## 5. Team accounts

Each teammate opens the site → **Create an account** (name + email + password).
Done — everyone shares one library, one planner, one queue.

To restrict who can sign up: Dashboard → **Authentication → Sign In / Up** —
disable self-signup and invite teammates by email instead.

## Notes

- **Storage visibility**: image files are served from public bucket URLs
  (simple + fast). Anyone with a direct file URL can view that image; the app
  and all data still require sign-in. If pre-release imagery demands stricter
  privacy, we can switch to signed URLs later.
- **Demo mode stays available**: any build without the two env values (e.g. a
  branch preview) runs the sandbox demo, untouched.
- **What syncs**: assets + uploads, boards, tags/statuses/favorites, focal
  points, pinned comments, comps, copy decks, the export queue, and the
  planner. Studio work-in-progress stays per-person until "Add to Queue".
