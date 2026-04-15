import type { OrganizationBranding } from "@/lib/domain/organization-settings";

export type GameAdminRecord = {
  game: {
    id: string;
    status: string;
    kickoffAt?: string | null;
    arrivalAt?: string | null;
    reportAt?: string | null;
    homeAway: "home" | "away";
    weatherConditions?: string | null;
    fieldConditions?: string | null;
    staffNotes?: string | null;
    opponentPrepNotes?: string | null;
    logisticsNotes?: string | null;
    rosterConfirmedAt?: string | null;
    publicShareToken: string;
    publicLiveEnabled: boolean;
    publicReportsEnabled: boolean;
    currentRevision: number;
    lastRebuiltAt?: string | null;
  };
  organizationId: string;
  branding?: OrganizationBranding | null;
  team: {
    id: string;
    name: string;
    level: string;
  };
  season: {
    id: string;
    label: string;
    year: number;
  };
  opponent: {
    id: string;
    schoolName: string;
    mascot?: string | null;
    shortCode?: string | null;
  };
  venue?: {
    id: string;
    name: string;
    fieldName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
  sideLabels: {
    home: string;
    away: string;
  };
};
