# Feature Flags

Tracking the Game uses a code-based launch control system for V1.

## Files

- `src/lib/features/definitions.ts`
  - typed feature registry
- `src/lib/features/profiles.ts`
  - launch profiles for development, staging, production MVP, and pilot core
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
- `pilot_core`

If neither variable is set:

- production defaults to `production_mvp`
- non-production defaults to `development`

## Production MVP defaults

Enabled:

- `game_day_mode`
- `resume_live_game`
- `undo_last_play`
- `reports_preview`
- `roster_import_csv`
- `team_management`
- `season_management`
- `opponent_management`
- `offline_outbox_sync`
- `xlsx_export`
- `pdf_export`

Hidden:

- `drive_summary`
- `advanced_participant_capture`
- `csv_export`
- `json_export`
- `live_public_tracker`
- `parent_portal`
- `advanced_analytics`
- `voice_input`
- `organization_branding`
- `internal_debug_tools`

## Pilot core defaults (recommended for HS/MS field testing)

Enabled:

- `game_day_mode`
- `resume_live_game`
- `undo_last_play`
- `reports_preview`
- `roster_import_csv`
- `team_management`
- `season_management`
- `opponent_management`
- `offline_outbox_sync`

Hidden by default:

- `csv_export`
- `json_export`
- `xlsx_export`
- `pdf_export`
- `drive_summary`
- `advanced_participant_capture`
- `live_public_tracker`
- `parent_portal`
- `advanced_analytics`
- `voice_input`
- `organization_branding`
- `internal_debug_tools`

## Optional per-feature overrides

You can selectively enable/disable any feature without changing profile by setting:

- Public/client-aware override: `NEXT_PUBLIC_FEATURE_OVERRIDE_<FEATURE_KEY_UPPERCASE>`
- Server-only override: `FEATURE_OVERRIDE_<FEATURE_KEY_UPPERCASE>`

Examples:

- `NEXT_PUBLIC_FEATURE_OVERRIDE_XLSX_EXPORT=true`
- `FEATURE_OVERRIDE_INTERNAL_DEBUG_TOOLS=false`

Accepted values: `true/false`, `1/0`, `on/off`, `yes/no`.

When both are set, server-side override wins on the server.

## Role guard note

Advanced analytics now requires at least `head_coach` role (or `admin`) even when the feature is enabled.

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
