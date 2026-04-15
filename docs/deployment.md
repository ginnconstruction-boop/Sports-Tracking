# GitHub + Vercel + Supabase Deployment Structure

## Environments

- `local`
  - Local Next.js app
  - Local or hosted Supabase credentials in `.env.local`
- `preview`
  - Vercel preview deployment per pull request
  - Preview Supabase project or a shared staging project
- `production`
  - Protected Vercel production deployment
  - Production Supabase project

## Recommended environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `APP_LAUNCH_PROFILE`
- `NEXT_PUBLIC_APP_LAUNCH_PROFILE`
- `PRIVATE_BETA_INVITE_ONLY`
- `BETA_ALLOWLIST_EMAILS`

## Client-safe vs server-only

- Client-safe:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_APP_LAUNCH_PROFILE`
- Server-only:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `APP_LAUNCH_PROFILE`
  - `PRIVATE_BETA_INVITE_ONLY`
  - `BETA_ALLOWLIST_EMAILS`

## GitHub workflow recommendation

1. Push branch to GitHub
2. Open PR
3. Run `npm test`, `npm run typecheck`, and `npm run build` in GitHub Actions
4. Review against Vercel preview URL
5. Merge to main
6. Promote to production on Vercel

## Supabase responsibilities

- Postgres database
- Auth users and sessions
- Storage buckets for:
  - `team-assets`
  - `imports`
  - `exports`

## Beta readiness checklist

- Apply the current SQL schema plus the matching `supabase/rls.sql` policies together.
- Confirm the production Supabase project has email auth enabled but public signup disabled.
- If using magic links, keep `shouldCreateUser: false` in the app so a link only works for an existing invited account.
- Create the `exports` bucket before enabling coach-facing export downloads.
- Create the `imports` bucket if you want to persist uploaded roster source files later.
- Confirm the service-role key is available only to server-side environments.
- Set `APP_LAUNCH_PROFILE=production_mvp` and `NEXT_PUBLIC_APP_LAUNCH_PROFILE=production_mvp` in Vercel production.
- Set `PRIVATE_BETA_INVITE_ONLY=true` and populate `BETA_ALLOWLIST_EMAILS` with invited staff emails.
- Seed at least one demo organization, season, roster, opponent, venue, and game for smoke coverage.
- Verify Game Day Mode on a tablet-sized viewport and in browser offline mode before rollout.
- Verify only JSON and CSV exports are visible in production MVP.
- Walk the onboarding flow end to end: team -> season -> roster import -> opponent -> venue -> first game.

## Operational notes

- Game Day uses one primary writer lease per game session; a second operator should expect viewer mode until the lease is released or expires.
- The live state on-screen is always derived from the play log and can be rebuilt after edits, deletes, inserts, and reconnect sync.
- Export history is stored in Postgres and the generated artifacts live in Supabase Storage under the `exports` bucket.
- Append-play syncs are idempotent by client mutation id, which reduces duplicate writes during reconnect recovery.
- Use the game admin screen to confirm the active game roster before kickoff so the sideline picker is working from the intended season list.
- Server logs now emit structured JSON for play submission failures, session sync failures, rebuild failures, and export failures. Route and function logs should be the first place to look during beta support triage.
- The lean production launch profile should keep advanced analytics, public live sharing, branding controls, XLSX/PDF exports, and internal debug tools turned off until the core sideline workflow has survived real usage.

## Private beta access control

- Create invited users in Supabase Auth first, then add their email addresses to `BETA_ALLOWLIST_EMAILS`.
- There is no public signup flow in the app.
- Password login works only for existing invited users.
- Magic link login is invite-safe because the app requests OTP login with `shouldCreateUser: false`.
- If an authenticated email is not allowlisted while `PRIVATE_BETA_INVITE_ONLY=true`, middleware signs the user out and redirects back to `/login`.

## Render boundary

Keep Render out of the initial deploy path. Introduce it later only if export queues or scheduled rebuild workers need long-running processing beyond the comfort zone of Vercel functions.
