# Feature Flags

Tracking the Game uses a code-based launch control system for V1.

## Files

- `src/lib/features/definitions.ts`
  - typed feature registry
- `src/lib/features/profiles.ts`
  - launch profiles for development, staging, and production MVP
- `src/lib/features/runtime.ts`
  - shared server/client helpers for evaluating flags
- `src/lib/features/server.ts`
  - server-side guard helper for protected routes and services

## Active launch profile

Set both of these environment variables:

- `APP_LAUNCH_PROFILE`
- `NEXT_PUBLIC_APP_LAUNCH_PROFILE`

Supported values:

- `development`
- `staging`
- `production_mvp`

If neither variable is set:

- production defaults to `production_mvp`
- non-production defaults to `development`

## Production MVP defaults

Enabled:

- `game_day_mode`
- `resume_live_game`
- `undo_last_play`
- `reports_preview`
- `csv_export`
- `json_export`
- `roster_import_csv`
- `team_management`
- `season_management`
- `opponent_management`
- `offline_outbox_sync`

Hidden:

- `drive_summary`
- `advanced_participant_capture`
- `xlsx_export`
- `pdf_export`
- `live_public_tracker`
- `parent_portal`
- `advanced_analytics`
- `voice_input`
- `organization_branding`
- `internal_debug_tools`

## How to use flags

### In server components and pages

```ts
import { isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";

if (!isFeatureEnabled("advanced_analytics")) {
  notFound();
}
```

### In server services and routes

```ts
import { assertFeatureEnabled } from "@/lib/features/server";

assertFeatureEnabled("reports_preview");
```

### In client components

```ts
import { isFeatureEnabled } from "@/lib/features/runtime";

const showDriveSummary = isFeatureEnabled("drive_summary");
```

## Promoting a hidden feature

1. Open `src/lib/features/profiles.ts`
2. Turn the feature to `true` in `production_mvp`
3. Deploy with the same `production_mvp` profile

If you want a softer rollout first:

1. Enable it in `staging`
2. Verify behavior
3. Promote it in `production_mvp`

## Non-production inspection

When `internal_debug_tools` is enabled and the app is not running in production, the admin page shows the active profile and the evaluated flag matrix.
