"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandingPanel } from "@/components/setup/branding-panel";
import { gameStatusValues } from "@/lib/contracts/admin";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { RosterImportPanel } from "@/components/setup/roster-import-panel";

type OrganizationMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type Team = {
  id: string;
  organizationId: string;
  name: string;
  level: string;
  archivedAt?: string | null;
};

type Season = {
  id: string;
  teamId: string;
  label: string;
  year: number;
  isActive: boolean;
  archivedAt?: string | null;
};

type Opponent = {
  id: string;
  organizationId: string;
  schoolName: string;
  mascot?: string | null;
  shortCode?: string | null;
  archivedAt?: string | null;
};

type Venue = {
  id: string;
  organizationId: string;
  name: string;
  fieldName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

type GameListItem = {
  game: {
    id: string;
    seasonId: string;
    opponentId: string;
    status: string;
    venueId?: string | null;
    kickoffAt?: string | null;
    arrivalAt?: string | null;
    reportAt?: string | null;
    homeAway: "home" | "away";
    currentRevision: number;
  };
  opponentSchoolName: string;
  venueName?: string | null;
  venueCity?: string | null;
  venueState?: string | null;
};

type RosterEntry = {
  rosterId: string;
  jerseyNumber: string;
  grade?: string | null;
  position?: string | null;
  offenseRole: boolean;
  defenseRole: boolean;
  specialTeamsRole: boolean;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
};

type TeamForm = { name: string; level: string };
type SeasonForm = { label: string; year: string; isActive: boolean };
type OpponentForm = { schoolName: string; mascot: string; shortCode: string };
type VenueForm = { name: string; city: string; state: string };
type GameForm = {
  opponentId: string;
  venueId: string;
  kickoffAt: string;
  arrivalAt: string;
  reportAt: string;
  homeAway: "home" | "away";
  status: (typeof gameStatusValues)[number];
};
type RosterForm = {
  firstName: string;
  lastName: string;
  preferredName: string;
  jerseyNumber: string;
  grade: string;
  position: string;
  offenseRole: boolean;
  defenseRole: boolean;
  specialTeamsRole: boolean;
};
type OrganizationForm = {
  name: string;
};

type Props = {
  memberships?: OrganizationMembership[];
};

type SetupStage = "organization" | "team" | "season" | "details" | "schedule" | "roster";

const EMPTY_MEMBERSHIPS: OrganizationMembership[] = [];

const emptyRosterForm: RosterForm = {
  firstName: "",
  lastName: "",
  preferredName: "",
  jerseyNumber: "",
  grade: "",
  position: "",
  offenseRole: true,
  defenseRole: false,
  specialTeamsRole: true
};

const emptyVenueForm: VenueForm = {
  name: "",
  city: "",
  state: ""
};

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw body ?? {
      error: `Request failed with status ${response.status}.`
    };
  }
  return body as T;
}

function messageFromError(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "error" in error && typeof error.error === "string") {
    const runtime =
      "runtime" in error && typeof error.runtime === "object" && error.runtime
        ? error.runtime
        : null;

    if (runtime && "databaseHost" in runtime && "supabaseHost" in runtime) {
      const databaseHost =
        typeof runtime.databaseHost === "string" && runtime.databaseHost.length > 0
          ? runtime.databaseHost
          : "n/a";
      const supabaseHost =
        typeof runtime.supabaseHost === "string" && runtime.supabaseHost.length > 0
          ? runtime.supabaseHost
          : "n/a";

      return `${error.error} (db: ${databaseHost}; supabase: ${supabaseHost})`;
    }

    return error.error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function sortByName<T extends { name?: string; schoolName?: string; year?: number }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (typeof left.year === "number" && typeof right.year === "number") {
      return right.year - left.year;
    }

    const leftLabel = left.name ?? left.schoolName ?? "";
    const rightLabel = right.name ?? right.schoolName ?? "";
    return leftLabel.localeCompare(rightLabel);
  });
}

function preferredSelection<T extends { id: string; archivedAt?: string | null }>(items: T[], currentId: string) {
  if (currentId && items.some((item) => item.id === currentId)) {
    return currentId;
  }

  return items.find((item) => !item.archivedAt)?.id ?? items[0]?.id ?? "";
}

function rosterFormFromEntry(entry: RosterEntry): RosterForm {
  return {
    firstName: entry.firstName,
    lastName: entry.lastName,
    preferredName: entry.preferredName ?? "",
    jerseyNumber: entry.jerseyNumber,
    grade: entry.grade ?? "",
    position: entry.position ?? "",
    offenseRole: entry.offenseRole,
    defenseRole: entry.defenseRole,
    specialTeamsRole: entry.specialTeamsRole
  };
}

function rosterPayload(entry: RosterEntry) {
  return {
    firstName: entry.firstName,
    lastName: entry.lastName,
    preferredName: entry.preferredName || undefined,
    jerseyNumber: entry.jerseyNumber,
    grade: entry.grade || undefined,
    position: entry.position || undefined,
    offenseRole: entry.offenseRole,
    defenseRole: entry.defenseRole,
    specialTeamsRole: entry.specialTeamsRole
  };
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SetupConsole({ memberships }: Props) {
  const providedMemberships = memberships ?? EMPTY_MEMBERSHIPS;
  const showBranding = isFeatureEnabled("organization_branding");
  const showTeamManagement = isFeatureEnabled("team_management");
  const showSeasonManagement = isFeatureEnabled("season_management");
  const showOpponentManagement = isFeatureEnabled("opponent_management");
  const showRosterImport = isFeatureEnabled("roster_import_csv");
  const [availableMemberships, setAvailableMemberships] = useState<OrganizationMembership[]>(providedMemberships);
  const [organizationId, setOrganizationId] = useState(providedMemberships[0]?.organizationId ?? "");
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [rosterDraft, setRosterDraft] = useState<RosterEntry[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [editingOpponentId, setEditingOpponentId] = useState<string | null>(null);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState<TeamForm>({ name: "", level: "Varsity" });
  const [seasonForm, setSeasonForm] = useState<SeasonForm>({ label: "", year: String(new Date().getFullYear()), isActive: true });
  const [opponentForm, setOpponentForm] = useState<OpponentForm>({ schoolName: "", mascot: "", shortCode: "" });
  const [venueForm, setVenueForm] = useState<VenueForm>(emptyVenueForm);
  const [gameForm, setGameForm] = useState<GameForm>({
    opponentId: "",
    venueId: "",
    kickoffAt: "",
    arrivalAt: "",
    reportAt: "",
    homeAway: "home",
    status: "scheduled"
  });
  const [rosterForm, setRosterForm] = useState<RosterForm>(emptyRosterForm);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<"all" | GameForm["status"]>("all");
  const [scheduleSideFilter, setScheduleSideFilter] = useState<"all" | GameForm["homeAway"]>("all");
  const [activeStep, setActiveStep] = useState<SetupStage>("organization");
  const [organizationForm, setOrganizationForm] = useState<OrganizationForm>({ name: "" });
  const [statusText, setStatusText] = useState(
    providedMemberships.length > 0 ? "Choose an organization to manage." : "Loading setup..."
  );
  const [isBusy, setIsBusy] = useState(false);

  const selectedTeam = useMemo(() => teams.find((item) => item.id === selectedTeamId) ?? null, [teams, selectedTeamId]);
  const selectedSeason = useMemo(() => seasons.find((item) => item.id === selectedSeasonId) ?? null, [seasons, selectedSeasonId]);
  const availableOpponents = useMemo(
    () => opponents.filter((item) => !item.archivedAt),
    [opponents]
  );
  const availableVenues = useMemo(() => venues, [venues]);
  const hasOrganization = Boolean(organizationId);
  const hasTeams = teams.length > 0;
  const hasSeasons = seasons.length > 0;
  const hasOpponents = availableOpponents.length > 0;
  const hasVenues = availableVenues.length > 0;
  const hasGames = games.length > 0;
  const filteredGames = useMemo(() => {
    const search = scheduleSearch.trim().toLowerCase();

    return games.filter((item) => {
      const matchesSearch =
        search.length === 0 ||
        item.opponentSchoolName.toLowerCase().includes(search) ||
        (item.venueName ?? "").toLowerCase().includes(search);
      const matchesStatus =
        scheduleStatusFilter === "all" || item.game.status === scheduleStatusFilter;
      const matchesSide =
        scheduleSideFilter === "all" || item.game.homeAway === scheduleSideFilter;

      return matchesSearch && matchesStatus && matchesSide;
    });
  }, [games, scheduleSearch, scheduleSideFilter, scheduleStatusFilter]);
  const flowSteps = useMemo(
    () => [
      { key: "organization" as const, label: "1. Organization", enabled: true, complete: hasOrganization },
      { key: "team" as const, label: "2. Team", enabled: hasOrganization, complete: hasTeams },
      { key: "season" as const, label: "3. Season", enabled: hasTeams, complete: hasSeasons },
      {
        key: "details" as const,
        label: "4. Opponent + venue",
        enabled: hasSeasons,
        complete: hasOpponents && hasVenues
      },
      {
        key: "schedule" as const,
        label: "5. Schedule",
        enabled: hasSeasons && hasOpponents,
        complete: hasGames
      },
      {
        key: "roster" as const,
        label: "6. Roster",
        enabled: hasSeasons,
        complete: rosterDraft.length > 0
      }
    ],
    [hasGames, hasOpponents, hasOrganization, hasSeasons, hasTeams, hasVenues, rosterDraft.length]
  );
  const activeStepMeta = flowSteps.find((step) => step.key === activeStep) ?? flowSteps[0];

  useEffect(() => {
    if (providedMemberships.length > 0) {
      setAvailableMemberships(providedMemberships);
      setOrganizationId((current) => current || providedMemberships[0]?.organizationId || "");
      return;
    }

    void readJson<{ memberships: OrganizationMembership[] }>("/api/v1/me")
      .then((body) => {
        setAvailableMemberships(body.memberships);
        setOrganizationId(body.memberships[0]?.organizationId ?? "");
        setStatusText(
          body.memberships.length > 0 ? "Choose an organization to manage." : "No organization memberships found yet."
        );
      })
      .catch((error) => setStatusText(messageFromError(error, "Unable to load setup access.")));
  }, [providedMemberships]);

  useEffect(() => {
    if (!organizationId) return;

    void (async () => {
      setStatusText("Loading teams, opponents, and venues...");
      const [teamsResult, opponentsResult, venuesResult] = await Promise.allSettled([
        readJson<{ items: Team[] }>(`/api/v1/teams?organizationId=${organizationId}`),
        readJson<{ items: Opponent[] }>(`/api/v1/opponents?organizationId=${organizationId}`),
        readJson<{ items: Venue[] }>(`/api/v1/venues?organizationId=${organizationId}`)
      ]);

      const teamsResponse = teamsResult.status === "fulfilled" ? teamsResult.value : { items: [] };
      const opponentsResponse = opponentsResult.status === "fulfilled" ? opponentsResult.value : { items: [] };
      const venuesResponse = venuesResult.status === "fulfilled" ? venuesResult.value : { items: [] };

      const nextTeams = sortByName(teamsResponse.items);
      setTeams(nextTeams);
      setOpponents(sortByName(opponentsResponse.items));
      setVenues(sortByName(venuesResponse.items));
      setSelectedTeamId((current) => preferredSelection(nextTeams, current));

      const failures = [teamsResult, opponentsResult, venuesResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => messageFromError(result.reason, "Request failed."));

      setStatusText(failures.length > 0 ? failures[0] : "Setup data loaded.");
    })().catch((error) => setStatusText(messageFromError(error, "Unable to load setup data.")));
  }, [organizationId]);

  useEffect(() => {
    if (!selectedTeamId) {
      setSeasons([]);
      setSelectedSeasonId("");
      return;
    }

    void (async () => {
      const response = await readJson<{ items: Season[] }>(`/api/v1/seasons?teamId=${selectedTeamId}`);
      const nextSeasons = sortByName(response.items);
      setSeasons(nextSeasons);
      setSelectedSeasonId((current) => preferredSelection(nextSeasons, current));
    })().catch((error) => setStatusText(messageFromError(error, "Unable to load seasons.")));
  }, [selectedTeamId]);

  useEffect(() => {
    if (!selectedSeasonId) {
      setRosterDraft([]);
      setEditingRosterId(null);
      setRosterForm(emptyRosterForm);
      setGames([]);
      return;
    }

    void (async () => {
      const [rosterResponse, gamesResponse] = await Promise.all([
        readJson<{ items: RosterEntry[] }>(`/api/v1/seasons/${selectedSeasonId}/roster`),
        readJson<{ items: GameListItem[] }>(`/api/v1/games?seasonId=${selectedSeasonId}`)
      ]);
      setRosterDraft(rosterResponse.items);
      setGames(gamesResponse.items);
      setEditingRosterId(null);
      setRosterForm(emptyRosterForm);
      setGameForm((current) => ({
        ...current,
        opponentId:
          current.opponentId && availableOpponents.some((item) => item.id === current.opponentId)
            ? current.opponentId
            : availableOpponents[0]?.id ?? "",
        venueId:
          current.venueId && availableVenues.some((item) => item.id === current.venueId)
            ? current.venueId
            : availableVenues[0]?.id ?? ""
      }));
    })().catch((error) => setStatusText(messageFromError(error, "Unable to load roster.")));
  }, [selectedSeasonId, availableOpponents, availableVenues]);

  useEffect(() => {
    if (activeStep === "organization" || activeStepMeta.enabled) {
      return;
    }

    if (!hasOrganization) {
      setActiveStep("organization");
      return;
    }

    if (!hasTeams) {
      setActiveStep("team");
      return;
    }

    if (!hasSeasons) {
      setActiveStep("season");
      return;
    }

    if (!hasOpponents || !hasVenues) {
      setActiveStep("details");
      return;
    }

    setActiveStep("schedule");
  }, [activeStep, activeStepMeta.enabled, hasOpponents, hasOrganization, hasSeasons, hasTeams, hasVenues]);

  function resetTeamForm() {
    setEditingTeamId(null);
    setTeamForm({ name: "", level: "Varsity" });
  }

  function resetSeasonForm() {
    setEditingSeasonId(null);
    setSeasonForm({ label: "", year: String(new Date().getFullYear()), isActive: true });
  }

  function resetOpponentForm() {
    setEditingOpponentId(null);
    setOpponentForm({ schoolName: "", mascot: "", shortCode: "" });
  }

  function resetVenueForm() {
    setEditingVenueId(null);
    setVenueForm(emptyVenueForm);
  }

  function resetRosterForm() {
    setEditingRosterId(null);
    setRosterForm(emptyRosterForm);
  }

  function resetGameForm() {
    setEditingGameId(null);
    setGameForm({
      opponentId: availableOpponents[0]?.id ?? "",
      venueId: availableVenues[0]?.id ?? "",
      kickoffAt: "",
      arrivalAt: "",
      reportAt: "",
      homeAway: "home",
      status: "scheduled"
    });
  }

  async function saveOrganization() {
    if (!organizationForm.name.trim()) {
      setStatusText("Enter an organization name before creating it.");
      return;
    }

    setIsBusy(true);
    setStatusText("Creating organization...");

    try {
      const response = await readJson<{ item: { id: string; name: string; slug: string } }>("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name: organizationForm.name.trim() })
      });

      const nextMembership: OrganizationMembership = {
        organizationId: response.item.id,
        organizationName: response.item.name,
        organizationSlug: response.item.slug,
        role: "admin"
      };

      setAvailableMemberships((current) =>
        current.some((membership) => membership.organizationId === nextMembership.organizationId)
          ? current
          : [...current, nextMembership]
      );
      setOrganizationId(response.item.id);
      setOrganizationForm({ name: "" });
      setStatusText("Organization created.");
      setActiveStep("team");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to create organization."));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveTeam() {
    if (!organizationId) {
      setStatusText("Choose an organization before creating a team.");
      return;
    }
    setIsBusy(true);
    setStatusText(editingTeamId ? "Updating team..." : "Creating team...");

    try {
      const response = editingTeamId
        ? await readJson<{ item: Team }>(`/api/v1/teams/${editingTeamId}`, {
            method: "PATCH",
            body: JSON.stringify({ organizationId, ...teamForm })
          })
        : await readJson<{ item: Team }>("/api/v1/teams", {
            method: "POST",
            body: JSON.stringify({ organizationId, ...teamForm })
          });

      setTeams((current) =>
        sortByName(editingTeamId ? current.map((item) => (item.id === response.item.id ? response.item : item)) : [...current, response.item])
      );
      setSelectedTeamId(response.item.id);
      resetTeamForm();
      setStatusText("Team saved.");
      if (!editingTeamId) {
        setActiveStep("season");
      }
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to save team."));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveSeason() {
    if (!selectedTeamId) {
      setStatusText("Choose a team before creating a season.");
      return;
    }
    setIsBusy(true);
    setStatusText(editingSeasonId ? "Updating season..." : "Creating season...");

    try {
      const payload = { teamId: selectedTeamId, label: seasonForm.label, year: Number(seasonForm.year), isActive: seasonForm.isActive };
      const response = editingSeasonId
        ? await readJson<{ item: Season }>(`/api/v1/seasons/${editingSeasonId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await readJson<{ item: Season }>("/api/v1/seasons", {
            method: "POST",
            body: JSON.stringify(payload)
          });

      setSeasons((current) =>
        sortByName(editingSeasonId ? current.map((item) => (item.id === response.item.id ? response.item : item)) : [...current, response.item])
      );
      setSelectedSeasonId(response.item.id);
      resetSeasonForm();
      setStatusText("Season saved.");
      if (!editingSeasonId) {
        setActiveStep("details");
      }
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to save season."));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveOpponent() {
    if (!organizationId) {
      setStatusText("Choose an organization before creating an opponent.");
      return;
    }
    setIsBusy(true);
    setStatusText(editingOpponentId ? "Updating opponent..." : "Creating opponent...");

    try {
      const payload = { organizationId, ...opponentForm };
      const response = editingOpponentId
        ? await readJson<{ item: Opponent }>(`/api/v1/opponents/${editingOpponentId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await readJson<{ item: Opponent }>("/api/v1/opponents", {
            method: "POST",
            body: JSON.stringify(payload)
          });

      setOpponents((current) =>
        sortByName(editingOpponentId ? current.map((item) => (item.id === response.item.id ? response.item : item)) : [...current, response.item])
      );
      resetOpponentForm();
      setStatusText("Opponent saved.");
      if (!editingOpponentId && venues.length > 0) {
        setActiveStep("schedule");
      }
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to save opponent."));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveVenue() {
    if (!organizationId) {
      setStatusText("Choose an organization before creating a venue.");
      return;
    }
    if (!venueForm.name.trim()) {
      setStatusText("Enter a venue name before saving.");
      return;
    }
    setIsBusy(true);
    setStatusText(editingVenueId ? "Updating venue..." : "Creating venue...");

    try {
      const payload = {
        organizationId,
        name: venueForm.name,
        fieldName: undefined,
        addressLine1: undefined,
        addressLine2: undefined,
        city: venueForm.city || undefined,
        state: venueForm.state || undefined,
        postalCode: undefined
      };
      const response = editingVenueId
        ? await readJson<{ item: Venue }>(`/api/v1/venues/${editingVenueId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await readJson<{ item: Venue }>("/api/v1/venues", {
            method: "POST",
            body: JSON.stringify(payload)
          });

      setVenues((current) =>
        sortByName(
          editingVenueId
            ? current.map((item) => (item.id === response.item.id ? response.item : item))
            : [...current, response.item]
        )
      );
      setGameForm((current) => ({ ...current, venueId: response.item.id }));
      resetVenueForm();
      setStatusText(editingVenueId ? "Venue updated." : "Venue saved.");
      if (!editingVenueId && availableOpponents.length > 0) {
        setActiveStep("schedule");
      }
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to save venue."));
    } finally {
      setIsBusy(false);
    }
  }

  async function saveGame() {
    if (!selectedSeasonId || !gameForm.opponentId) {
      setStatusText("Choose a season and opponent before creating a game.");
      return;
    }

    setIsBusy(true);
    setStatusText(editingGameId ? "Updating game..." : "Creating game...");

    try {
      const payload = {
        seasonId: selectedSeasonId,
        opponentId: gameForm.opponentId,
        venueId: gameForm.venueId || undefined,
        kickoffAt: gameForm.kickoffAt ? new Date(gameForm.kickoffAt).toISOString() : undefined,
        arrivalAt: gameForm.arrivalAt ? new Date(gameForm.arrivalAt).toISOString() : undefined,
        reportAt: gameForm.reportAt ? new Date(gameForm.reportAt).toISOString() : undefined,
        homeAway: gameForm.homeAway,
        status: gameForm.status
      };

      const response = editingGameId
        ? await readJson<{ item: GameListItem["game"] }>(`/api/v1/games/${editingGameId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await readJson<{ item: GameListItem["game"] }>("/api/v1/games", {
            method: "POST",
            body: JSON.stringify(payload)
          });

      const opponentName =
        opponents.find((item) => item.id === gameForm.opponentId)?.schoolName ?? "Opponent";
      const venue = venues.find((item) => item.id === gameForm.venueId) ?? null;

      const nextItem: GameListItem = {
        game: response.item,
        opponentSchoolName: opponentName,
        venueName: venue?.name ?? null,
        venueCity: venue?.city ?? null,
        venueState: venue?.state ?? null
      };

      setGames((current) =>
        [...(editingGameId ? current.map((item) => (item.game.id === response.item.id ? nextItem : item)) : [...current, nextItem])].sort((left, right) => {
          const leftValue = left.game.kickoffAt ? new Date(left.game.kickoffAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightValue = right.game.kickoffAt ? new Date(right.game.kickoffAt).getTime() : Number.MAX_SAFE_INTEGER;
          return leftValue - rightValue;
        })
      );
      resetGameForm();
      setStatusText(editingGameId ? "Game updated." : "Game scheduled.");
      if (!editingGameId) {
        setActiveStep("roster");
      }
    } catch (error) {
      setStatusText(messageFromError(error, editingGameId ? "Unable to update game." : "Unable to create game."));
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleGameArchived(item: GameListItem, archived: boolean) {
    setIsBusy(true);
    setStatusText(archived ? "Archiving game..." : "Restoring game...");

    try {
      const response = await readJson<{ item: GameListItem["game"] }>(`/api/v1/games/${item.game.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          seasonId: selectedSeasonId,
          opponentId: item.game.opponentId,
          venueId: item.game.venueId ?? undefined,
          kickoffAt: item.game.kickoffAt ?? undefined,
          arrivalAt: (item.game as { arrivalAt?: string | null }).arrivalAt ?? undefined,
          reportAt: (item.game as { reportAt?: string | null }).reportAt ?? undefined,
          homeAway: item.game.homeAway,
          status: archived ? "archived" : "scheduled"
        })
      });

      setGames((current) =>
        current.map((entry) =>
          entry.game.id === item.game.id
            ? {
                ...entry,
                game: response.item
              }
            : entry
        )
      );
      setStatusText(archived ? "Game archived." : "Game restored.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to update game status."));
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteGame(item: GameListItem) {
    if (!window.confirm(`Delete ${item.opponentSchoolName}? This only works before any plays are logged.`)) return;

    setIsBusy(true);
    setStatusText("Deleting game...");

    try {
      await readJson(`/api/v1/games/${item.game.id}`, { method: "DELETE" });
      setGames((current) => current.filter((entry) => entry.game.id !== item.game.id));
      if (editingGameId === item.game.id) {
        resetGameForm();
      }
      setStatusText("Game deleted.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to delete game."));
    } finally {
      setIsBusy(false);
    }
  }

  async function applyQuickGameStatus(item: GameListItem, status: GameForm["status"]) {
    setIsBusy(true);
    setStatusText(`Setting game to ${status.replace("_", " ")}...`);

    try {
      const response = await readJson<{ item: GameListItem["game"] }>(`/api/v1/games/${item.game.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          seasonId: item.game.seasonId,
          opponentId: item.game.opponentId,
          venueId: item.game.venueId ?? undefined,
          kickoffAt: item.game.kickoffAt ?? undefined,
          arrivalAt: (item.game as { arrivalAt?: string | null }).arrivalAt ?? undefined,
          reportAt: (item.game as { reportAt?: string | null }).reportAt ?? undefined,
          homeAway: item.game.homeAway,
          status
        })
      });

      setGames((current) =>
        current.map((entry) =>
          entry.game.id === item.game.id
            ? {
                ...entry,
                game: response.item
              }
            : entry
        )
      );
      setStatusText(`Game marked ${status.replace("_", " ")}.`);
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to update game status."));
    } finally {
      setIsBusy(false);
    }
  }

  function editVenue(venue: Venue) {
    setEditingVenueId(venue.id);
    setVenueForm({
      name: venue.name,
      city: venue.city ?? "",
      state: venue.state ?? ""
    });
    setStatusText(`Editing venue ${venue.name}.`);
  }

  async function deleteVenueItem(venue: Venue) {
    if (!window.confirm(`Delete ${venue.name}? This only works if no games use it.`)) return;

    setIsBusy(true);
    setStatusText("Deleting venue...");

    try {
      await readJson(`/api/v1/venues/${venue.id}`, { method: "DELETE" });
      setVenues((current) => current.filter((item) => item.id !== venue.id));
      setGames((current) =>
        current.map((item) =>
          item.game.venueId === venue.id
            ? {
                ...item,
                game: { ...item.game, venueId: null },
                venueName: null,
                venueCity: null,
                venueState: null
              }
            : item
        )
      );
      if (editingVenueId === venue.id) {
        resetVenueForm();
      }
      setStatusText("Venue deleted.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to delete venue."));
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleArchived(type: "team" | "season" | "opponent", item: Team | Season | Opponent, archived: boolean) {
    setIsBusy(true);
    setStatusText(archived ? `Archiving ${type}...` : `Restoring ${type}...`);

    try {
      const route = type === "team" ? `/api/v1/teams/${item.id}` : type === "season" ? `/api/v1/seasons/${item.id}` : `/api/v1/opponents/${item.id}`;
      const body =
        type === "team"
          ? { organizationId: (item as Team).organizationId, name: (item as Team).name, level: (item as Team).level, archived }
          : type === "season"
            ? { teamId: (item as Season).teamId, label: (item as Season).label, year: (item as Season).year, isActive: (item as Season).isActive, archived }
            : { organizationId: (item as Opponent).organizationId, schoolName: (item as Opponent).schoolName, mascot: (item as Opponent).mascot ?? "", shortCode: (item as Opponent).shortCode ?? "", archived };
      const response = await readJson<{ item: Team | Season | Opponent }>(route, {
        method: "PATCH",
        body: JSON.stringify(body)
      });

      if (type === "team") {
        setTeams((current) => sortByName(current.map((entry) => (entry.id === item.id ? (response.item as Team) : entry))));
      } else if (type === "season") {
        setSeasons((current) => sortByName(current.map((entry) => (entry.id === item.id ? (response.item as Season) : entry))));
      } else {
        setOpponents((current) => sortByName(current.map((entry) => (entry.id === item.id ? (response.item as Opponent) : entry))));
      }

      setStatusText(archived ? `${type} archived.` : `${type} restored.`);
    } catch (error) {
      setStatusText(messageFromError(error, `Unable to update ${type}.`));
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteItem(type: "team" | "season" | "opponent", item: Team | Season | Opponent) {
    const label = type === "team" ? (item as Team).name : type === "season" ? (item as Season).label : (item as Opponent).schoolName;
    if (!window.confirm(`Delete ${label}? This only works if no dependent records block removal.`)) return;

    setIsBusy(true);
    setStatusText(`Deleting ${type}...`);
    const route = type === "team" ? `/api/v1/teams/${item.id}` : type === "season" ? `/api/v1/seasons/${item.id}` : `/api/v1/opponents/${item.id}`;

    try {
      await readJson(route, { method: "DELETE" });

      if (type === "team") {
        const nextTeams = sortByName(teams.filter((entry) => entry.id !== item.id));
        setTeams(nextTeams);
        setSelectedTeamId(preferredSelection(nextTeams, selectedTeamId === item.id ? "" : selectedTeamId));
        if (editingTeamId === item.id) resetTeamForm();
      } else if (type === "season") {
        const nextSeasons = sortByName(seasons.filter((entry) => entry.id !== item.id));
        setSeasons(nextSeasons);
        setSelectedSeasonId(preferredSelection(nextSeasons, selectedSeasonId === item.id ? "" : selectedSeasonId));
        if (editingSeasonId === item.id) resetSeasonForm();
      } else {
        setOpponents((current) => sortByName(current.filter((entry) => entry.id !== item.id)));
        if (editingOpponentId === item.id) resetOpponentForm();
      }

      setStatusText(`${type} deleted.`);
    } catch (error) {
      setStatusText(messageFromError(error, `Unable to delete ${type}.`));
    } finally {
      setIsBusy(false);
    }
  }

  function saveRosterEntryLocally() {
    if (!rosterForm.firstName.trim() || !rosterForm.lastName.trim() || !rosterForm.jerseyNumber.trim()) {
      setStatusText("First name, last name, and jersey number are required.");
      return;
    }

    const nextEntry: RosterEntry = {
      rosterId: editingRosterId ?? `draft-${Date.now()}`,
      firstName: rosterForm.firstName.trim(),
      lastName: rosterForm.lastName.trim(),
      preferredName: rosterForm.preferredName.trim() || null,
      jerseyNumber: rosterForm.jerseyNumber.trim(),
      grade: rosterForm.grade.trim() || null,
      position: rosterForm.position.trim() || null,
      offenseRole: rosterForm.offenseRole,
      defenseRole: rosterForm.defenseRole,
      specialTeamsRole: rosterForm.specialTeamsRole
    };

    const duplicate = rosterDraft.some((entry) => entry.jerseyNumber === nextEntry.jerseyNumber && entry.rosterId !== nextEntry.rosterId);
    if (duplicate) {
      setStatusText("Jersey numbers must be unique within the season.");
      return;
    }

    setRosterDraft((current) => {
      const next = editingRosterId ? current.map((entry) => (entry.rosterId === editingRosterId ? nextEntry : entry)) : [...current, nextEntry];
      return [...next].sort((left, right) => Number(left.jerseyNumber) - Number(right.jerseyNumber));
    });
    resetRosterForm();
    setStatusText(editingRosterId ? "Roster row updated locally." : "Roster row added locally.");
  }

  async function saveManualRoster() {
    if (!selectedSeasonId || !organizationId) return;
    if (rosterDraft.length === 0) {
      setStatusText("Add at least one player before saving the roster.");
      return;
    }

    setIsBusy(true);
    setStatusText("Saving roster...");

    try {
      const response = await readJson<{ items: RosterEntry[] }>(`/api/v1/seasons/${selectedSeasonId}/roster`, {
        method: "PUT",
        body: JSON.stringify({
          organizationId,
          seasonId: selectedSeasonId,
          players: rosterDraft.map(rosterPayload)
        })
      });

      setRosterDraft(response.items);
      resetRosterForm();
      setStatusText("Roster saved.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to save roster."));
    } finally {
      setIsBusy(false);
    }
  }

  function editRosterEntry(entry: RosterEntry) {
    setEditingRosterId(entry.rosterId);
    setRosterForm(rosterFormFromEntry(entry));
  }

  function removeRosterEntry(entryId: string) {
    setRosterDraft((current) => current.filter((entry) => entry.rosterId !== entryId));
    if (editingRosterId === entryId) resetRosterForm();
    setStatusText("Roster row removed locally. Save roster to commit.");
  }

  function editGame(item: GameListItem) {
    setEditingGameId(item.game.id);
    setGameForm({
      opponentId: item.game.opponentId,
      venueId: item.game.venueId ?? "",
      kickoffAt: toDateTimeLocalValue(item.game.kickoffAt),
      arrivalAt: toDateTimeLocalValue((item.game as { arrivalAt?: string | null }).arrivalAt),
      reportAt: toDateTimeLocalValue((item.game as { reportAt?: string | null }).reportAt),
      homeAway: item.game.homeAway,
      status: item.game.status as GameForm["status"]
    });
    setStatusText(`Editing ${item.opponentSchoolName}.`);
  }

  return (
    <section className="section-grid">
      {organizationId && showBranding ? <BrandingPanel organizationId={organizationId} /> : null}

      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <h2 style={{ margin: 0 }}>Program setup</h2>
            <p className="kicker">Move through setup in order, then jump back to any unlocked step whenever you need.</p>
          </div>
          <div className="stack-sm" style={{ minWidth: 280 }}>
            <label className="field">
              <span>Organization</span>
              <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                {availableMemberships.length === 0 ? <option value="">No organizations found</option> : null}
                {availableMemberships.map((membership) => (
                  <option key={membership.organizationId} value={membership.organizationId}>
                    {membership.organizationName} ({membership.role})
                  </option>
                ))}
              </select>
            </label>
            <span className="chip">{statusText}</span>
          </div>
        </div>
        <div className="pill-row">
          {flowSteps.map((step) => (
            <button
              key={step.key}
              className={activeStep === step.key ? "button-primary" : "button-secondary-light"}
              disabled={!step.enabled}
              type="button"
              onClick={() => setActiveStep(step.key)}
            >
              {step.complete ? `${step.label} done` : step.label}
            </button>
          ))}
        </div>
        <p className="kicker">
          Current step: <strong>{activeStepMeta.label}</strong>. Organization comes first, team comes next, roster opens once a season exists, and you can revisit any unlocked step anytime.
        </p>
      </section>

      {activeStep === "organization" ? (
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <h2 style={{ margin: 0 }}>Organization</h2>
            <p className="kicker">
              Your first setup step is choosing or creating the program workspace everything else will live under.
            </p>
          </div>
          <span className="chip">{hasOrganization ? "Organization ready" : "Waiting for organization"}</span>
        </div>
        <div className="table-like">
          <div className="timeline-card">
            <div className="timeline-top">
              <strong>{availableMemberships[0]?.organizationName ?? "No organization available yet"}</strong>
              <span className="mono">{availableMemberships[0]?.role ?? "pending"}</span>
            </div>
            <div className="kicker">
              {hasOrganization
                ? "This organization will be used for teams, seasons, schedule, roster, and reports. Continue to Team when ready."
                : "Create your organization here first. Once it exists, the Team step unlocks automatically."}
            </div>
            <div className="timeline-actions">
              {!hasOrganization ? (
                <>
                  <label className="field" style={{ minWidth: 280 }}>
                    <span>Organization name</span>
                    <input
                      value={organizationForm.name}
                      onChange={(event) => setOrganizationForm({ name: event.target.value })}
                      placeholder="Ginn Construction Varsity"
                    />
                  </label>
                  <button
                    className="button-primary"
                    disabled={isBusy || !organizationForm.name.trim()}
                    type="button"
                    onClick={() => void saveOrganization()}
                  >
                    Create organization
                  </button>
                </>
              ) : null}
              <button className="button-primary" disabled={!hasOrganization} type="button" onClick={() => setActiveStep("team")}>
                Continue to team
              </button>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {activeStep === "team" ? (
      <section className="two-column">
        {showTeamManagement ? (
        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Teams</h2>
            <span className="chip">{teams.length} teams</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Team name</span>
              <input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Level</span>
              <input value={teamForm.level} onChange={(event) => setTeamForm((current) => ({ ...current, level: event.target.value }))} />
            </label>
          </div>
          <div className="timeline-actions">
            <button className="button-primary" disabled={isBusy || !organizationId || !teamForm.name.trim()} type="button" onClick={() => void saveTeam()}>
              {editingTeamId ? "Save team" : "Create team"}
            </button>
            {editingTeamId ? <button className="mini-button" type="button" onClick={resetTeamForm}>Cancel</button> : null}
          </div>
          <div className="table-like">
            {teams.map((team) => (
              <div className="timeline-card" key={team.id}>
                <div className="timeline-top">
                  <strong>{team.name}</strong>
                  <span className="mono">{team.level}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">{team.archivedAt ? "archived" : "active"}</span>
                </div>
                <div className="timeline-actions">
                  <button className="mini-button" type="button" onClick={() => { setEditingTeamId(team.id); setTeamForm({ name: team.name, level: team.level }); setSelectedTeamId(team.id); }}>
                    Edit
                  </button>
                  <button className="mini-button" type="button" onClick={() => setSelectedTeamId(team.id)}>View seasons</button>
                  <button className="mini-button" type="button" onClick={() => void toggleArchived("team", team, !team.archivedAt)}>
                    {team.archivedAt ? "Restore" : "Archive"}
                  </button>
                  <button className="mini-button danger-button" type="button" onClick={() => void deleteItem("team", team)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}
      </section>
      ) : null}

      {activeStep === "season" ? (
      <section className="two-column">
        {showSeasonManagement ? (
        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Seasons</h2>
            <span className="chip">{seasons.length} seasons</span>
          </div>
          <p className="kicker">{selectedTeam ? `Managing seasons for ${selectedTeam.name}.` : "Create or select a team first."}</p>
          <div className="form-grid">
            <label className="field">
              <span>Label</span>
              <input value={seasonForm.label} onChange={(event) => setSeasonForm((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="field">
              <span>Year</span>
              <input value={seasonForm.year} onChange={(event) => setSeasonForm((current) => ({ ...current, year: event.target.value }))} />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={seasonForm.isActive} onChange={(event) => setSeasonForm((current) => ({ ...current, isActive: event.target.checked }))} />
              Active season
            </label>
          </div>
          <div className="timeline-actions">
            <button className="button-primary" disabled={isBusy || !selectedTeamId || !seasonForm.label.trim()} type="button" onClick={() => void saveSeason()}>
              {editingSeasonId ? "Save season" : "Create season"}
            </button>
            {editingSeasonId ? <button className="mini-button" type="button" onClick={resetSeasonForm}>Cancel</button> : null}
          </div>
          <div className="table-like">
            {seasons.map((season) => (
              <div className="timeline-card" key={season.id}>
                <div className="timeline-top">
                  <strong>{season.label}</strong>
                  <span className="mono">{season.year}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">{season.isActive ? "active season" : "inactive season"}</span>
                  <span className="chip">{season.archivedAt ? "archived" : "available"}</span>
                </div>
                <div className="timeline-actions">
                  <button className="mini-button" type="button" onClick={() => { setEditingSeasonId(season.id); setSeasonForm({ label: season.label, year: String(season.year), isActive: season.isActive }); setSelectedSeasonId(season.id); }}>
                    Edit
                  </button>
                  <button className="mini-button" type="button" onClick={() => setSelectedSeasonId(season.id)}>View roster</button>
                  <button className="mini-button" type="button" onClick={() => void toggleArchived("season", season, !season.archivedAt)}>
                    {season.archivedAt ? "Restore" : "Archive"}
                  </button>
                  <button className="mini-button danger-button" type="button" onClick={() => void deleteItem("season", season)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}

        {showRosterImport ? (
        <div className="section-card pad-lg stack-md">
          <RosterImportPanel
            organizationId={organizationId}
            seasonId={selectedSeasonId}
            targetLabel={selectedSeason ? selectedSeason.label : undefined}
            onImported={(items) => {
              setRosterDraft(items);
              setStatusText(`Roster imported into ${selectedSeason?.label ?? "season"}.`);
            }}
          />
        </div>
        ) : null}
      </section>
      ) : null}

      {activeStep === "details" ? (
      <section className="two-column">
        {showOpponentManagement ? (
        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Opponents</h2>
            <span className="chip">{opponents.length} opponents</span>
          </div>
          <p className="kicker">Add the teams you plan to schedule against. Once you have at least one opponent and one venue, schedule opens up.</p>
          <div className="form-grid">
            <label className="field">
              <span>School</span>
              <input value={opponentForm.schoolName} onChange={(event) => setOpponentForm((current) => ({ ...current, schoolName: event.target.value }))} />
            </label>
            <label className="field">
              <span>Mascot</span>
              <input value={opponentForm.mascot} onChange={(event) => setOpponentForm((current) => ({ ...current, mascot: event.target.value }))} />
            </label>
            <label className="field">
              <span>Short code</span>
              <input value={opponentForm.shortCode} onChange={(event) => setOpponentForm((current) => ({ ...current, shortCode: event.target.value }))} />
            </label>
          </div>
          <div className="timeline-actions">
            <button className="button-primary" disabled={isBusy || !organizationId || !opponentForm.schoolName.trim()} type="button" onClick={() => void saveOpponent()}>
              {editingOpponentId ? "Save opponent" : "Create opponent"}
            </button>
            {editingOpponentId ? <button className="mini-button" type="button" onClick={resetOpponentForm}>Cancel</button> : null}
          </div>
          <div className="table-like">
            {opponents.map((opponent) => (
              <div className="timeline-card" key={opponent.id}>
                <div className="timeline-top">
                  <strong>{opponent.schoolName}</strong>
                  <span className="mono">{opponent.shortCode ?? "n/a"}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">{opponent.archivedAt ? "archived" : "active"}</span>
                  <span className="chip">{opponent.mascot || "No mascot yet"}</span>
                </div>
                <div className="timeline-actions">
                  <button className="mini-button" type="button" onClick={() => { setEditingOpponentId(opponent.id); setOpponentForm({ schoolName: opponent.schoolName, mascot: opponent.mascot ?? "", shortCode: opponent.shortCode ?? "" }); }}>
                    Edit
                  </button>
                  <button className="mini-button" type="button" onClick={() => void toggleArchived("opponent", opponent, !opponent.archivedAt)}>
                    {opponent.archivedAt ? "Restore" : "Archive"}
                  </button>
                  <button className="mini-button danger-button" type="button" onClick={() => void deleteItem("opponent", opponent)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        ) : null}

        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Venues</h2>
            <span className="chip">{venues.length} venues</span>
          </div>
          <p className="kicker">Create home fields and away locations once, then reuse them across every game on the schedule.</p>
          <div className="form-grid">
            <label className="field">
              <span>Venue name</span>
              <input value={venueForm.name} onChange={(event) => setVenueForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="field">
              <span>City</span>
              <input value={venueForm.city} onChange={(event) => setVenueForm((current) => ({ ...current, city: event.target.value }))} />
            </label>
            <label className="field">
              <span>State</span>
              <input value={venueForm.state} onChange={(event) => setVenueForm((current) => ({ ...current, state: event.target.value }))} />
            </label>
          </div>
          <div className="timeline-actions">
            <button className="mini-button" disabled={isBusy || !organizationId || !venueForm.name.trim()} type="button" onClick={() => void saveVenue()}>
              {editingVenueId ? "Save venue" : "Create venue"}
            </button>
            {editingVenueId ? (
              <button className="mini-button" type="button" onClick={resetVenueForm}>
                Cancel
              </button>
            ) : null}
          </div>
          <div className="table-like">
            {venues.length === 0 ? <div className="kicker">No venues saved yet.</div> : null}
            {venues.map((venue) => (
              <div className="timeline-card" key={venue.id}>
                <div className="timeline-top">
                  <strong>{venue.name}</strong>
                  <span className="mono">{[venue.city, venue.state].filter(Boolean).join(", ") || "Location TBD"}</span>
                </div>
                <div className="timeline-actions">
                  <button className="mini-button" type="button" onClick={() => editVenue(venue)}>
                    Edit
                  </button>
                  <button className="mini-button danger-button" type="button" onClick={() => void deleteVenueItem(venue)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {activeStep === "schedule" ? (
      <section className="two-column">
        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Season schedule</h2>
            <span className="chip">{games.length} games</span>
          </div>
          <p className="kicker">
            {selectedSeason
              ? `Schedule games for ${selectedSeason.label} and open them directly in Game Day or reports.`
              : "Select a season first."}
          </p>
          <div className="form-grid">
            <label className="field">
              <span>Opponent</span>
              <select
                value={gameForm.opponentId}
                onChange={(event) =>
                  setGameForm((current) => ({ ...current, opponentId: event.target.value }))
                }
              >
                <option value="">Select opponent</option>
                {availableOpponents.map((opponent) => (
                  <option key={opponent.id} value={opponent.id}>
                    {opponent.schoolName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Venue</span>
              <select
                value={gameForm.venueId}
                onChange={(event) =>
                  setGameForm((current) => ({ ...current, venueId: event.target.value }))
                }
              >
                <option value="">Venue TBD</option>
                {availableVenues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.city ? ` - ${venue.city}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Kickoff</span>
              <input
                type="datetime-local"
                value={gameForm.kickoffAt}
                onChange={(event) =>
                  setGameForm((current) => ({ ...current, kickoffAt: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Arrival</span>
              <input
                type="datetime-local"
                value={gameForm.arrivalAt}
                onChange={(event) =>
                  setGameForm((current) => ({ ...current, arrivalAt: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Report time</span>
              <input
                type="datetime-local"
                value={gameForm.reportAt}
                onChange={(event) =>
                  setGameForm((current) => ({ ...current, reportAt: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Primary team side</span>
              <select
                value={gameForm.homeAway}
                onChange={(event) =>
                  setGameForm((current) => ({
                    ...current,
                    homeAway: event.target.value as "home" | "away"
                  }))
                }
              >
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={gameForm.status}
                onChange={(event) =>
                  setGameForm((current) => ({
                    ...current,
                    status: event.target.value as GameForm["status"]
                  }))
                }
              >
                {gameStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="timeline-actions">
            <button
              className="button-primary"
              disabled={isBusy || !selectedSeasonId || !gameForm.opponentId}
              type="button"
              onClick={() => void saveGame()}
            >
              {editingGameId ? "Save game" : "Create game"}
            </button>
            {editingGameId ? (
              <button className="mini-button" type="button" onClick={resetGameForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Game list</h2>
            <span className="chip">{filteredGames.length} shown</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Search</span>
              <input
                value={scheduleSearch}
                onChange={(event) => setScheduleSearch(event.target.value)}
                placeholder="Opponent or venue"
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={scheduleStatusFilter}
                onChange={(event) =>
                  setScheduleStatusFilter(event.target.value as "all" | GameForm["status"])
                }
              >
                <option value="all">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="ready">Ready</option>
                <option value="in_progress">In progress</option>
                <option value="final">Final</option>
                <option value="canceled">Canceled</option>
                <option value="postponed">Postponed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="field">
              <span>Side</span>
              <select
                value={scheduleSideFilter}
                onChange={(event) =>
                  setScheduleSideFilter(event.target.value as "all" | GameForm["homeAway"])
                }
              >
                <option value="all">Home and away</option>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
          </div>
          <div className="table-like">
            {filteredGames.length === 0 ? <div className="kicker">No games match the current schedule filters.</div> : null}
            {filteredGames.map((item) => (
              <div className="timeline-card" key={item.game.id}>
                <div className="timeline-top">
                  <strong>{item.opponentSchoolName}</strong>
                  <span className="mono">{item.game.homeAway}</span>
                </div>
                <div className="timeline-meta">
                  <span>{item.game.kickoffAt ? new Date(item.game.kickoffAt).toLocaleString() : "Kickoff TBD"}</span>
                  <span className="mono">{item.game.status}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">
                    {item.venueName ? `${item.venueName}${item.venueState ? `, ${item.venueState}` : ""}` : "Venue TBD"}
                  </span>
                  <span className="chip">{item.game.currentRevision > 0 ? `${item.game.currentRevision} revisions` : "no plays yet"}</span>
                </div>
                <div className="timeline-actions">
                  <button className="mini-button" type="button" onClick={() => editGame(item)}>
                    Edit
                  </button>
                  {item.game.status !== "scheduled" ? (
                    <button className="mini-button" type="button" onClick={() => void applyQuickGameStatus(item, "scheduled")}>
                      Mark scheduled
                    </button>
                  ) : null}
                  {item.game.status !== "in_progress" ? (
                    <button className="mini-button" type="button" onClick={() => void applyQuickGameStatus(item, "in_progress")}>
                      Start live
                    </button>
                  ) : null}
                  {item.game.status !== "ready" ? (
                    <button className="mini-button" type="button" onClick={() => void applyQuickGameStatus(item, "ready")}>
                      Mark ready
                    </button>
                  ) : null}
                  {item.game.status !== "final" ? (
                    <button className="mini-button" type="button" onClick={() => void applyQuickGameStatus(item, "final")}>
                      Mark final
                    </button>
                  ) : null}
                  {item.game.status !== "postponed" ? (
                    <button className="mini-button" type="button" onClick={() => void applyQuickGameStatus(item, "postponed")}>
                      Postpone
                    </button>
                  ) : null}
                  <button className="mini-button" type="button" onClick={() => void toggleGameArchived(item, item.game.status !== "archived")}>
                    {item.game.status === "archived" ? "Restore" : "Archive"}
                  </button>
                  <button className="mini-button danger-button" type="button" onClick={() => void deleteGame(item)}>
                    Delete
                  </button>
                  <Link className="mini-button" href={`/games/${item.game.id}/manage`}>
                    Game admin
                  </Link>
                  <Link className="mini-button" href={`/games/${item.game.id}/gameday`}>
                    Open Game Day
                  </Link>
                  <Link className="mini-button" href={`/games/${item.game.id}/reports`}>
                    Open reports
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {activeStep === "roster" ? (
      <section className="two-column">
        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Roster editor</h2>
            <span className="chip">{rosterDraft.length} players</span>
          </div>
          <p className="kicker">{selectedSeason ? `Edit ${selectedSeason.label} manually, then save the roster back to the season.` : "Select a season to edit the roster."}</p>
          <div className="form-grid">
            <label className="field"><span>First name</span><input value={rosterForm.firstName} onChange={(event) => setRosterForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
            <label className="field"><span>Last name</span><input value={rosterForm.lastName} onChange={(event) => setRosterForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
            <label className="field"><span>Preferred name</span><input value={rosterForm.preferredName} onChange={(event) => setRosterForm((current) => ({ ...current, preferredName: event.target.value }))} /></label>
            <label className="field"><span>Jersey</span><input value={rosterForm.jerseyNumber} onChange={(event) => setRosterForm((current) => ({ ...current, jerseyNumber: event.target.value }))} /></label>
            <label className="field"><span>Grade</span><input value={rosterForm.grade} onChange={(event) => setRosterForm((current) => ({ ...current, grade: event.target.value }))} /></label>
            <label className="field"><span>Position</span><input value={rosterForm.position} onChange={(event) => setRosterForm((current) => ({ ...current, position: event.target.value }))} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={rosterForm.offenseRole} onChange={(event) => setRosterForm((current) => ({ ...current, offenseRole: event.target.checked }))} />Offense</label>
            <label className="checkbox-field"><input type="checkbox" checked={rosterForm.defenseRole} onChange={(event) => setRosterForm((current) => ({ ...current, defenseRole: event.target.checked }))} />Defense</label>
            <label className="checkbox-field"><input type="checkbox" checked={rosterForm.specialTeamsRole} onChange={(event) => setRosterForm((current) => ({ ...current, specialTeamsRole: event.target.checked }))} />Special teams</label>
          </div>
          <div className="timeline-actions">
            <button className="button-primary" disabled={isBusy || !selectedSeasonId} type="button" onClick={saveRosterEntryLocally}>
              {editingRosterId ? "Update local row" : "Add local row"}
            </button>
            {editingRosterId ? <button className="mini-button" type="button" onClick={resetRosterForm}>Cancel edit</button> : null}
            <button className="button-secondary-light" disabled={isBusy || !selectedSeasonId || rosterDraft.length === 0} type="button" onClick={() => void saveManualRoster()}>
              Save roster to season
            </button>
          </div>
        </div>

        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Roster preview</h2>
            <span className="chip">{rosterDraft.length} players</span>
          </div>
          <div className="table-like">
            {rosterDraft.length === 0 ? <div className="kicker">No roster entries loaded yet.</div> : null}
            {rosterDraft.map((entry) => (
              <div className="timeline-card" key={entry.rosterId}>
                <div className="timeline-top">
                  <strong>#{entry.jerseyNumber} {entry.preferredName || `${entry.firstName} ${entry.lastName}`}</strong>
                  <span className="mono">{entry.position || "ATH"}</span>
                </div>
                <div className="pill-row">
                  {entry.grade ? <span className="chip">Grade {entry.grade}</span> : null}
                  {entry.offenseRole ? <span className="chip">Offense</span> : null}
                  {entry.defenseRole ? <span className="chip">Defense</span> : null}
                  {entry.specialTeamsRole ? <span className="chip">Special teams</span> : null}
                </div>
                <div className="timeline-actions">
                  <button className="mini-button" type="button" onClick={() => editRosterEntry(entry)}>Edit row</button>
                  <button className="mini-button danger-button" type="button" onClick={() => removeRosterEntry(entry.rosterId)}>Remove row</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      ) : null}
    </section>
  );
}
