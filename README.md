# Tracking the Game

Tracking the Game is a tablet-first football stat-tracking web app built around one non-negotiable rule: the ordered play log is the source of truth.

This scaffold includes:

- Next.js App Router shell
- Supabase Postgres + Drizzle schema and a baseline SQL migration
- Supabase Auth entry points with app-owned role enforcement
- Supabase Storage-ready paths for logos and export artifacts
- Team, season, game, and roster CRUD routes
- Game session and play log write paths
- A rebuild service that derives current game state from the ordered play log
- A game-day UI shell and report/export skeleton

## Source-of-truth model

- `play_events` is the only authoritative record of in-game outcomes.
- `play_participants` and `play_penalties` enrich each event without duplicating totals.
- `game_state_caches` stores only rebuildable read models for fast UI reads.
- Reports and exports are projections from the play log, not separate hand-maintained data.

## Next implementation priorities

1. Install dependencies and connect local Supabase or hosted Supabase credentials.
2. Apply the baseline schema and RLS policies.
3. Add richer play-entry forms for run/pass/kick/penalty variants.
4. Expand the rules reducer for full penalty enforcement and stat credits.
5. Persist IndexedDB outbox sync against the game session endpoints.
"# Sports-Tracking" 
