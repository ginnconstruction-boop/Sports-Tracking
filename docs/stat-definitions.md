# Tracking App Stat Definitions (V1)

Purpose: keep staff, coaches, and operators aligned on how core stats are recorded and reported.

## Core Team Totals

- `first_down`: offense earns a new series (`down` resets to 1) on a legal play.
- `first_down_rush`: first down earned on a run play.
- `first_down_pass`: first down earned on a pass play.
- `first_down_penalty`: first down earned from accepted penalty enforcement (including automatic first down).
- `third_down_attempt` / `third_down_conversion`: legal 3rd-down snaps and conversions.
- `fourth_down_attempt` / `fourth_down_conversion`: legal 4th-down snaps and conversions.
- `red_zone_trip` / `red_zone_score`: possession enters red zone and scores on that possession.
- `goal_to_go_trip` / `goal_to_go_score`: possession enters goal-to-go and scores on that possession.
- `penalty_count` / `penalty_yards`: accepted penalties charged to the penalized side.
- `sacks_allowed` / `sack_yards_lost`: sacks charged to the offense and yards lost.
- `total_offense_yards`: run + completed-pass net plus sack yard loss.
- `turnover_lost` / `turnover_gained`: turnovers committed/forced on legal plays.

## Player Groupings In Reports

Player stat cards now split credits into:

- `Offense`: rushing, passing, receiving, conversion, and offense-result stats.
- `Defense`: tackles, sacks, disruption, takeaways, and defensive returns.
- `Special teams`: kickoff/punt/kicking attempt and make stats.

This keeps one canonical player timeline while still surfacing side-of-ball context for live planning.

## Explosive Plays

- Run explosive threshold: `>= 12` yards.
- Pass explosive threshold: `>= 16` yards.
- Offensive score on play also counts as explosive in situational summary.

## Success Rate

Play success (offense):

- 1st down: gain at least 50% of yards-to-gain.
- 2nd down: gain at least 70% of yards-to-gain.
- 3rd/4th down: gain 100% of yards-to-gain.
- Offensive score is always successful.

Reported as:

- `overallSuccessRate` = successful situational plays / situational plays.

## Situational Buckets

Current reporting groups:

- Down-distance: `short_1_3`, `medium_4_6`, `long_7_10`, `very_long_11_plus`
- Field zone: `backed_up`, `midfield`, `fringe`, `red_zone`, `goal_to_go`
- Clock: `opening`, `middle`, `late`, `two_minute`
- Score state: `leading_9_plus`, `leading_1_8`, `tied`, `trailing_1_8`, `trailing_9_plus`
- Play family: `run`, `pass`, `special_teams`, `turnover`, `penalty`, `other`

## Credit Weighting (`creditShare`)

- Player stat credits may be weighted with `creditShare` (e.g., split sack: `0.5` + `0.5`).
- Team totals are not split by `creditShare`; team totals reflect full event outcome.

## No-Play / Offsetting Behavior

- No-play and offsetting penalty scenarios do not produce situational totals for that play.
- These plays are tracked in timeline context but are excluded from legal-play situational rates.
