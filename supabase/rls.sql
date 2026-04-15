create or replace function public.role_rank(role public.membership_role)
returns integer
language sql
immutable
as $$
  select case role
    when 'admin' then 5
    when 'head_coach' then 4
    when 'stat_operator' then 3
    when 'assistant_coach' then 2
    else 1
  end;
$$;

create or replace function public.has_min_org_role(org_id uuid, minimum_role public.membership_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships memberships
    where memberships.organization_id = org_id
      and memberships.user_id = auth.uid()
      and public.role_rank(memberships.role) >= public.role_rank(minimum_role)
  );
$$;

alter table public.app_users enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.teams enable row level security;
alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.season_roster_entries enable row level security;
alter table public.opponents enable row level security;
alter table public.venues enable row level security;
alter table public.games enable row level security;
alter table public.game_sides enable row level security;
alter table public.game_roster_entries enable row level security;
alter table public.game_sessions enable row level security;
alter table public.play_events enable row level security;
alter table public.play_event_audits enable row level security;
alter table public.play_participants enable row level security;
alter table public.play_penalties enable row level security;
alter table public.game_state_caches enable row level security;
alter table public.report_exports enable row level security;
alter table public.play_review_annotations enable row level security;

create policy "app_users_select_self"
on public.app_users
for select
using (id = auth.uid());

create policy "organization_memberships_select_own"
on public.organization_memberships
for select
using (user_id = auth.uid());

create policy "organizations_select_member"
on public.organizations
for select
using (public.has_min_org_role(id, 'read_only'));

create policy "organizations_write_admin"
on public.organizations
for all
using (public.has_min_org_role(id, 'admin'))
with check (public.has_min_org_role(id, 'admin'));

create policy "teams_select_member"
on public.teams
for select
using (public.has_min_org_role(organization_id, 'read_only'));

create policy "teams_write_coach"
on public.teams
for all
using (public.has_min_org_role(organization_id, 'head_coach'))
with check (public.has_min_org_role(organization_id, 'head_coach'));

create policy "players_select_member"
on public.players
for select
using (public.has_min_org_role(organization_id, 'read_only'));

create policy "players_write_coach"
on public.players
for all
using (public.has_min_org_role(organization_id, 'head_coach'))
with check (public.has_min_org_role(organization_id, 'head_coach'));

create policy "opponents_select_member"
on public.opponents
for select
using (public.has_min_org_role(organization_id, 'read_only'));

create policy "opponents_write_staff"
on public.opponents
for all
using (public.has_min_org_role(organization_id, 'assistant_coach'))
with check (public.has_min_org_role(organization_id, 'assistant_coach'));

create policy "venues_select_member"
on public.venues
for select
using (public.has_min_org_role(organization_id, 'read_only'));

create policy "venues_write_staff"
on public.venues
for all
using (public.has_min_org_role(organization_id, 'assistant_coach'))
with check (public.has_min_org_role(organization_id, 'assistant_coach'));

create policy "seasons_select_member"
on public.seasons
for select
using (
  exists (
    select 1
    from public.teams
    where teams.id = seasons.team_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "games_select_member"
on public.games
for select
using (
  exists (
    select 1
    from public.seasons
    join public.teams on teams.id = seasons.team_id
    where seasons.id = games.season_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "games_write_staff"
on public.games
for all
using (
  exists (
    select 1
    from public.seasons
    join public.teams on teams.id = seasons.team_id
    where seasons.id = games.season_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
)
with check (
  exists (
    select 1
    from public.seasons
    join public.teams on teams.id = seasons.team_id
    where seasons.id = games.season_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
);

create policy "seasons_write_coach"
on public.seasons
for all
using (
  exists (
    select 1
    from public.teams
    where teams.id = seasons.team_id
      and public.has_min_org_role(teams.organization_id, 'head_coach')
  )
)
with check (
  exists (
    select 1
    from public.teams
    where teams.id = seasons.team_id
      and public.has_min_org_role(teams.organization_id, 'head_coach')
  )
);

create policy "season_roster_entries_select_member"
on public.season_roster_entries
for select
using (
  exists (
    select 1
    from public.seasons
    join public.teams on teams.id = seasons.team_id
    where seasons.id = season_roster_entries.season_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "season_roster_entries_write_coach"
on public.season_roster_entries
for all
using (
  exists (
    select 1
    from public.seasons
    join public.teams on teams.id = seasons.team_id
    where seasons.id = season_roster_entries.season_id
      and public.has_min_org_role(teams.organization_id, 'head_coach')
  )
)
with check (
  exists (
    select 1
    from public.seasons
    join public.teams on teams.id = seasons.team_id
    where seasons.id = season_roster_entries.season_id
      and public.has_min_org_role(teams.organization_id, 'head_coach')
  )
);

create policy "game_sides_select_member"
on public.game_sides
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_sides.game_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "game_sides_write_staff"
on public.game_sides
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_sides.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_sides.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
);

create policy "game_roster_entries_select_member"
on public.game_roster_entries
for select
using (
  exists (
    select 1
    from public.game_sides
    join public.games on games.id = game_sides.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where game_sides.id = game_roster_entries.game_side_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "game_roster_entries_write_staff"
on public.game_roster_entries
for all
using (
  exists (
    select 1
    from public.game_sides
    join public.games on games.id = game_sides.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where game_sides.id = game_roster_entries.game_side_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
)
with check (
  exists (
    select 1
    from public.game_sides
    join public.games on games.id = game_sides.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where game_sides.id = game_roster_entries.game_side_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
);

create policy "game_sessions_select_staff"
on public.game_sessions
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_sessions.game_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "game_sessions_write_operator"
on public.game_sessions
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_sessions.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_sessions.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
);

create policy "play_events_select_member"
on public.play_events
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_events.game_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "play_events_write_operator"
on public.play_events
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_events.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_events.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
);

create policy "play_event_audits_select_staff"
on public.play_event_audits
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_event_audits.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
);

create policy "play_event_audits_write_operator"
on public.play_event_audits
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_event_audits.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_event_audits.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
);

create policy "play_participants_select_member"
on public.play_participants
for select
using (
  exists (
    select 1
    from public.play_events
    join public.games on games.id = play_events.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where play_events.id = play_participants.play_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "play_participants_write_operator"
on public.play_participants
for all
using (
  exists (
    select 1
    from public.play_events
    join public.games on games.id = play_events.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where play_events.id = play_participants.play_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
)
with check (
  exists (
    select 1
    from public.play_events
    join public.games on games.id = play_events.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where play_events.id = play_participants.play_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
);

create policy "play_penalties_select_member"
on public.play_penalties
for select
using (
  exists (
    select 1
    from public.play_events
    join public.games on games.id = play_events.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where play_events.id = play_penalties.play_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "play_penalties_write_operator"
on public.play_penalties
for all
using (
  exists (
    select 1
    from public.play_events
    join public.games on games.id = play_events.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where play_events.id = play_penalties.play_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
)
with check (
  exists (
    select 1
    from public.play_events
    join public.games on games.id = play_events.game_id
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where play_events.id = play_penalties.play_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
);

create policy "game_state_caches_select_member"
on public.game_state_caches
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_state_caches.game_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "game_state_caches_write_operator"
on public.game_state_caches
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_state_caches.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = game_state_caches.game_id
      and public.has_min_org_role(teams.organization_id, 'stat_operator')
  )
);

create policy "report_exports_select_member"
on public.report_exports
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = report_exports.game_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "report_exports_write_staff"
on public.report_exports
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = report_exports.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = report_exports.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
);

create policy "play_review_annotations_select_member"
on public.play_review_annotations
for select
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_review_annotations.game_id
      and public.has_min_org_role(teams.organization_id, 'read_only')
  )
);

create policy "play_review_annotations_write_staff"
on public.play_review_annotations
for all
using (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_review_annotations.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
)
with check (
  exists (
    select 1
    from public.games
    join public.seasons on seasons.id = games.season_id
    join public.teams on teams.id = seasons.team_id
    where games.id = play_review_annotations.game_id
      and public.has_min_org_role(teams.organization_id, 'assistant_coach')
  )
);
