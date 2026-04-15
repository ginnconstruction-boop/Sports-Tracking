# Beta Runbook

## Core operator flow

1. Open onboarding and create the team, season, opponent, venue, and first game.
2. Import the season roster with preview and confirm the mapped columns before write.
3. Open game admin for the scheduled game and confirm the game roster before kickoff.
4. Open Game Day Mode on the primary tablet and acquire the writer lease.
5. If a second device opens the same game, expect viewer mode until the writer lease is released or expires.
6. During connectivity drops, continue entering plays locally and confirm queued sync status in the session panel.
7. After reconnect, refresh the live snapshot and verify the outbox drains to zero.
8. Open reports and generate JSON, CSV, XLSX, and PDF exports for coach review.

## Pre-game checklist

- Team, season, opponent, and venue exist
- Season roster imported and reviewed
- Game scheduled with kickoff, arrival, and report times
- Game roster confirmed
- Tablet tested in portrait or landscape sideline view
- Supabase `exports` bucket exists and is writable from server-side code

## Recovery checklist

- If the writer lease is stuck, open Game Day on the original device and use `Release writer`
- If the original device is unavailable, wait for lease expiry and reopen as the new writer
- If the app reopens offline, confirm the cached snapshot loads and the queued mutation count is visible
- After reconnect, use `Retry sync` before entering additional cleanup edits

## Coach handoff checklist

- Review scoring summary
- Review drive summary
- Review player and team stat sections
- Download at least one structured artifact and one presentation artifact:
  - JSON or CSV
  - XLSX or PDF
