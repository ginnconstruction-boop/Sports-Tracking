# MVP Smoke Gate

This repo now has a blocker-first smoke gate for the MVP core flow.

## Critical Path Blueprint

The smoke suite treats these as the MVP path that must work before future work is safe:

1. Login
   - Requests: `POST /auth/login`
   - Success: authenticated browser session exists
   - Failure: login form remains, redirect loop, or auth error

2. Current user bootstrap
   - Requests: `GET /api/v1/me`
   - Success: `200` with memberships
   - Failure: non-`200`, empty memberships, or invalid JSON

3. Organization load/select
   - Requests: setup page bootstrap plus `/api/v1/me`
   - Success: organization dropdown is populated and selected
   - Failure: `No organizations found`, blank selector, or setup dead-end

4. Create/select team
   - Requests: `POST /api/v1/teams`, `GET /api/v1/teams?organizationId=...`
   - Success: team exists and is selectable
   - Failure: button silently fails, request errors, or team missing from list

5. Create/select season
   - Requests: `POST /api/v1/seasons`, `GET /api/v1/seasons?teamId=...`
   - Success: season exists and is selectable
   - Failure: request errors or season missing from list

6. Create/select opponent
   - Requests: `POST /api/v1/opponents`, `GET /api/v1/opponents?organizationId=...`
   - Success: opponent exists and schedule dropdown can display it
   - Failure: blank dropdown entry, request errors, or missing row

7. Create/select venue
   - Requests: `POST /api/v1/venues`, `GET /api/v1/venues?organizationId=...`
   - Success: venue exists and schedule dropdown can display it
   - Failure: request errors or missing row

8. Create game
   - Requests: `POST /api/v1/games`, `GET /api/v1/games?seasonId=...`
   - Success: game exists in setup schedule and game list
   - Failure: request errors or no game row returned

9. Games list load
   - Requests: `/api/v1/me`, `/api/v1/teams`, `/api/v1/seasons`, `/api/v1/games`
   - Success: game card is visible on `/games`
   - Failure: empty list or any upstream request failure

10. Game Day open
    - Requests: `POST /api/v1/games/[gameId]/session`, `GET /api/v1/games/[gameId]`, `GET /api/v1/games/[gameId]/live`, `GET /api/v1/games/[gameId]/plays`
    - Success: Game Day renders, scoreboard appears, session returns `201` or `409`
    - Failure: server error, JSON parse error, or UI crash

11. Submit one simple play
    - Requests: `POST /api/v1/games/[gameId]/plays`
    - Success: `201` and play appears in recent plays
    - Failure: disabled writer flow, failed request, or play not persisted

12. Refresh and persist
    - Requests: Game Day startup sequence again plus `GET /plays`
    - Success: recent play remains after reload
    - Failure: lost state or empty play log

13. Reports preview loads
    - Requests: reports page server load
    - Success: `Report preview` and `Coach packet summary` render
    - Failure: reports page error or missing preview

## Seeded Data Strategy

The smoke harness uses a dedicated smoke identity and smoke-owned organization.

- Smoke auth user: controlled by `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`
- Smoke organization: controlled by `SMOKE_ORGANIZATION_NAME` / `SMOKE_ORGANIZATION_SLUG`
- Smoke records are deterministic:
  - team
  - season
  - opponent
  - venue
  - game

### Modes

- `baseline`
  - ensures smoke user, `app_users`, organization, and admin membership
  - clears smoke-owned child data
  - browser suite then creates team/season/opponent/venue/game through the UI

- `full`
  - does the baseline cleanup
  - recreates deterministic team/season/opponent/venue/game directly

- `reset`
  - same cleanup behavior as baseline, without recreating child data

### Reset / reseed safety

Cleanup is intentionally limited to the dedicated smoke organization. Do not point smoke settings at a real production organization you care about.

## Tooling

- `@playwright/test`
- `tests/e2e/global.setup.ts`
- `tests/e2e/support/smoke-seed.ts`
- `tests/e2e/mvp-core.smoke.spec.ts`
- existing Supabase service-role environment variables

## Run Smoke Locally

1. Install the browser once:

```powershell
npm run smoke:install
```

2. Ensure local env is available in `.env.local` or the shell:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`

3. Run the smoke gate:

```powershell
npm run smoke:test
```

By default this uses `SMOKE_TARGET=local`, builds the app, starts `next start`, seeds `baseline`, and runs the browser spec.

## Run Smoke Against Deployed Beta

Make sure the smoke email is allowed by the private-beta allowlist in the deployed environment.

```powershell
$env:SMOKE_TARGET='deployed'
$env:SMOKE_BASE_URL='https://sports-tracking-blue.vercel.app'
$env:SMOKE_TEST_EMAIL='your-smoke-user@example.com'
$env:SMOKE_TEST_PASSWORD='your-password'
npm run smoke:test
```

## Manual Seed Commands

```powershell
npm run smoke:seed
npm run smoke:seed:full
npm run smoke:reset
```

## Blocker-First Workflow

If the smoke test fails:

1. Stop at the first failing step.
2. Use the attached screenshot, console log, and API evidence from `test-results`.
3. Fix only that blocker.
4. Re-run the smoke suite.

The smoke suite is now the gate for future stabilization work.
