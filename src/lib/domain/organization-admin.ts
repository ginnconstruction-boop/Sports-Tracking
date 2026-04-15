export type OrganizationDiagnostics = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  brandingComplete: boolean;
  teamCount: number;
  seasonCount: number;
  opponentCount: number;
  venueCount: number;
  gameCount: number;
  liveGameCount: number;
  publicShareCount: number;
  exportCount: number;
  activeSeasonCount: number;
  lastGameKickoffAt?: string | null;
};

