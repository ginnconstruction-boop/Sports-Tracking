import type { SequenceToken } from "@/lib/contracts/play-log";
import type { FieldPosition, TeamSide } from "@/lib/domain/play-log";

export const gameStateCorrectionReasonCategories = [
  "missed_play",
  "live_resync",
  "official_correction",
  "other"
] as const;

export type GameStateCorrectionReasonCategory =
  (typeof gameStateCorrectionReasonCategories)[number];

export type GameStateCorrection = {
  id: string;
  gameId: string;
  kind: "situation";
  appliesAfterSequence: SequenceToken;
  possession: TeamSide;
  ballOn: FieldPosition;
  down: 1 | 2 | 3 | 4;
  distance: number;
  quarter?: 1 | 2 | 3 | 4 | 5;
  reasonCategory: GameStateCorrectionReasonCategory;
  reasonNote: string;
  createdByUserId: string;
  createdAt: string;
  createdByDisplayName?: string;
  voidedAt?: string;
  voidedByUserId?: string;
  voidedByDisplayName?: string;
  voidReasonNote?: string;
};
