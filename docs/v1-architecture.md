# Tracking the Game V1 Architecture

## A. Final Architecture Recommendation

- `Platform`: GitHub for source control and CI, Vercel for the Next.js app, Supabase for Postgres/Auth/Storage.
- `App shape`: one Next.js App Router application with route handlers for server APIs and a mobile-first PWA shell.
- `Data model`: ordered play events are the source of truth; current state, reports, and exports are rebuildable projections.
- `Auth model`: Supabase Auth for identity, plus app-owned organization membership roles in Postgres.
- `Offline model`: IndexedDB/Dexie local session + outbox queue, then sync event mutations back to Supabase-connected APIs.
- `Background jobs`: not required for V1. Render stays out unless later export generation or batch analytics becomes heavy enough to justify a worker tier.

## B. Supabase Database Schema

- `public.organizations`
- `public.app_users` mapped 1:1 to `auth.users`
- `public.organization_memberships`
- `public.teams`
- `public.seasons`
- `public.players`
- `public.season_roster_entries`
- `public.opponents`
- `public.venues`
- `public.games`
- `public.game_sides`
- `public.game_roster_entries`
- `public.game_sessions`
- `public.play_events`
- `public.play_participants`
- `public.play_penalties`
- `public.game_state_caches`
- `public.report_exports`

## C. Page and Screen Map

- `/login`
- `/`
- `/seasons/[seasonId]`
- `/seasons/[seasonId]/roster`
- `/games/new`
- `/games/[gameId]`
- `/games/[gameId]/gameday`
- `/games/[gameId]/reports`
- `/admin/users`

## D. Phased Implementation Plan

1. `Foundation`
   - Supabase auth utilities, schema, migrations, RLS, route-handler shell
2. `Program management`
   - Teams, seasons, opponents, venues, rosters, game setup
3. `Live engine`
   - Game sessions, play entry, edit/insert, rebuild pipeline, summaries
4. `Offline resilience`
   - IndexedDB outbox, sync state, reconnect reconciliation
5. `Reports and exports`
   - Game/season projections, CSV/XLSX/Sheets/PDF pipelines, storage-backed export files

## E. Deployment Structure For GitHub + Vercel + Supabase

- `GitHub`
  - Feature branches, PR review, GitHub Actions for lint/typecheck/build
- `Vercel`
  - Preview deployments per PR
  - Production deploy from protected main branch
  - Environment groups for local/preview/production
- `Supabase`
  - Separate local/dev/prod projects
  - Postgres schema and RLS policies
  - Auth users and session cookies
  - Storage buckets for team assets and export artifacts

## Notes on Render

Do not introduce Render in V1 by default. Add it later only if PDF generation, scheduled season rebuilds, or heavyweight analytics exceed the practical limits of Vercel functions.
