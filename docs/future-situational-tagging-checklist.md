# Future: Situational Tagging Checklist

Goal: add formation/personnel/motion/hash/play-direction tagging later without breaking the current play-log source of truth.

## Current Status

- Safe to defer.
- Current rebuild and report pipelines are stable and tested.
- Payloads are JSON-shaped, so optional tags can be added later in a backward-compatible way.

## Phase 1: Domain + Contract (Optional Fields)

1. Add optional tagging fields to relevant play payload schemas in `src/lib/contracts/play-log.ts`.
2. Keep all new fields optional to preserve compatibility with existing play data.
3. Mirror types in `src/lib/domain/play-log.ts`.

Suggested optional tag fields:

- `offensivePersonnel`: string (example: `"11"`, `"12"`, `"21"`)
- `formation`: string (example: `"Trips Right"`, `"Ace"`)
- `motion`: string (example: `"jet"`, `"orbit"`, `"none"`)
- `hash`: `"left" | "middle" | "right"`
- `playDirection`: `"left" | "middle" | "right"`

## Phase 2: Entry UI + Persistence

1. Add compact inputs to play entry for tags in `src/components/game-day/play-entry-panel.tsx`.
2. Persist through existing create/edit API paths (no migration required for optional JSON fields).
3. Ensure offline queue preserves tag fields during append/edit/delete flows.

## Phase 3: Situational Analytics Wiring

1. Extend `src/lib/analytics/situational.ts` to bucket by:
   - personnel
   - formation
   - motion
   - hash
   - play direction
2. Add these groups to report document type in `src/lib/domain/reports.ts`.
3. Add export rows/sheets in `src/lib/reports/export-artifacts.ts`.

## Phase 4: Tests

1. Contract tests:
   - accepted optional tag values
   - invalid enum values (hash/direction)
2. Rebuild/report tests:
   - tagged plays appear in situational report buckets
   - untagged legacy plays still serialize and compute correctly
3. Offline tests:
   - tags survive queued append/edit sync merge flow

## Done Criteria

- Existing tests remain green.
- New tagging tests pass.
- Untagged historical games keep identical projection outputs.
- Report exports include new situational dimensions when tags are present.
