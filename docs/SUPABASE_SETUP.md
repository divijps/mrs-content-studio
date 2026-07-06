# Turn on the team workspace (Supabase) — ~5 minutes

Right now the deployed app runs in **demo mode**: everyone gets their own
in-browser sandbox that resets on refresh. Following these steps turns it into
the **shared team workspace**: accounts, one library for everyone, uploads that
persist, comments/approvals that sync live between teammates.

Cost: **$0** on Supabase's free tier (500 MB database + 1 GB file storage —
web-res derivatives keep photos small). Upgrade later is ~$25/mo, or self-host
Supabase in-house with the same code.

## How the pieces fit (read this once)

There is **no separate server to run**. The app is a static site (HTML/JS/CSS);
**Supabase is the entire backend** — database, accounts/auth, file storage, and
live sync. So "going live" is just two things:

1. **Provision Supabase** (steps 1–3 below) — only you can do this; it creates
   the project and hands you two keys.
2. **Host the static site** with those two keys injected at build time
   (step 4). Any static host works — see "Where to host" below.

## Where to host

| | GitHub Pages (current) | **Vercel (recommended for launch)** |
|---|---|---|
| Cost | Free | Free (Hobby) |
| Private repo | ✗ needs public repo on free tier — this exposes the licensed Romie fonts + source | ✓ deploys private repos, so the repo can go back to private |
| Env vars | GitHub → repo secrets (see step 4) | Vercel dashboard → Project → Settings → Environment Variables |
| Custom domain | Fiddly | One click |
| Preview per branch | ✗ | ✓ |

Both are already wired: `.github/workflows/deploy.yml` for Pages, `vercel.json`
for Vercel. **Recommendation:** keep the Pages link as the client-preview/demo,
and move the real team workspace to **Vercel** — it lets you flip the repo back
to private (fixing the font-exposure flag) and manage the keys from a dashboard
instead of editing CI. The provisioning steps (1–3) are identical either way.

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

**On Vercel (recommended):** import the GitHub repo at
<https://vercel.com/new> (it auto-detects Vite via `vercel.json`). In the
project's **Settings → Environment Variables**, add the two values, then
redeploy:

- `VITE_SUPABASE_URL` = the Project URL
- `VITE_SUPABASE_ANON_KEY` = the anon key

**On GitHub Pages:** repo **Settings → Secrets and variables → Actions → New
repository secret**, twice, with the same two names/values. Then re-run the
deploy (Actions → "Deploy to GitHub Pages" → Run workflow) or push any commit.

Either way, the live site now shows a sign-in screen.

For local dev: copy `.env.example` to `.env.local`, fill the same two values,
restart `pnpm dev`. (Vite only reads env at startup, so a restart is required.)

## 5. Team accounts

Each teammate opens the site → **Create an account** (name + email + password).
Everyone then shares one library, one planner, one queue.

- **Email confirmation is ON by default** in Supabase: after signing up, the
  teammate gets a confirmation email and must click the link before they can
  sign in (the app tells them to check their email). To skip this for a small
  trusted team, turn it off at Dashboard → **Authentication → Sign In / Up →
  Confirm email**.
- **Forgot password** is built in: the sign-in screen has a "Forgot password?"
  link that emails a reset link; following it opens a "set a new password"
  screen in the app. (For the email to be delivered on the free tier's default
  mailer, keep the Supabase-provided email templates; high volume needs a
  custom SMTP provider — Dashboard → Authentication → Emails.)
- **Restrict who can join:** Dashboard → **Authentication → Sign In / Up** —
  disable self-signup and invite teammates by email instead.
- **Set the redirect allow-list:** Dashboard → **Authentication → URL
  Configuration** — add your live site URL (Vercel/Pages) so confirmation and
  password-reset links return to the app, not localhost.

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
