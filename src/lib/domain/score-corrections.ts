import type { SequenceToken } from "@/lib/contracts/play-log";
import type { GameStateCorrectionReasonCategory } from "@/lib/domain/state-corrections";

export type ScoreCorrection = {
  id: string;
  gameId: string;
  appliesAfterSequence: SequenceToken;
  score: {
    home: number;
    away: number;
  };
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
