export type TeamSide = "home" | "away";
export type GamePhase = "normal" | "try" | "kickoff";

export type FieldPosition = {
  side: TeamSide;
  yardLine: number;
};

export type PlayType =
  | "run"
  | "pass"
  | "sack"
  | "kneel"
  | "spike"
  | "punt"
  | "kickoff"
  | "extra_point"
  | "two_point_try"
  | "field_goal"
  | "penalty"
  | "turnover";

export type RunKind = "designed" | "scramble" | "quarterback_keep" | "reverse";
export type PassResult = "complete" | "incomplete" | "interception";
export type KickTryResult = "good" | "no_good" | "blocked";
export type TwoPointResult = "good" | "failed" | "turnover";
export type ReturnResult = "returned" | "touchback" | "fair_catch" | "out_of_bounds" | "downed";
export type TurnoverKind = "fumble_return" | "interception_return" | "blocked_kick_return";

export const playParticipantRoles = [
  "passer",
  "target",
  "ball_carrier",
  "runner",
  "solo_tackle",
  "assist_tackle",
  "sack_credit",
  "tfl_credit",
  "hurry_credit",
  "pass_breakup",
  "interceptor",
  "forced_fumble",
  "fumble_recovery",
  "returner",
  "kicker",
  "punter",
  "long_snapper",
  "holder",
  "block_credit"
] as const;

export type PlayParticipantRole = (typeof playParticipantRoles)[number];

export type PlayPenaltyResult = "accepted" | "declined" | "offsetting";
export type PlayPenaltyEnforcement = "previous_spot" | "spot" | "dead_ball" | "succeeding_spot";
export type PlayPenaltyTiming = "live_ball" | "dead_ball" | "post_possession" | "post_score";

export type PlayPenalty = {
  penalizedSide: TeamSide;
  code: string;
  yards: number;
  result: PlayPenaltyResult;
  enforcementType: PlayPenaltyEnforcement;
  timing: PlayPenaltyTiming;
  foulSpot?: FieldPosition;
  automaticFirstDown?: boolean;
  lossOfDown?: boolean;
  replayDown?: boolean;
  noPlay?: boolean;
};

export type PlayParticipant = {
  gameRosterEntryId?: string;
  role: PlayParticipantRole;
  side: TeamSide;
  creditUnits: number;
  statPayload?: Record<string, unknown>;
};

export type RunPlayPayload = {
  kind: "run";
  startBall?: FieldPosition;
  ballCarrierNumber: string;
  runKind: RunKind;
  yards: number;
  firstDown?: boolean;
  touchdown?: boolean;
  fumble?: boolean;
  fumbleLost?: boolean;
  outOfBounds?: boolean;
};

export type PassPlayPayload = {
  kind: "pass";
  startBall?: FieldPosition;
  passerNumber: string;
  targetNumber?: string;
  result: PassResult;
  airYards?: number;
  yards: number;
  yacYards?: number;
  firstDown?: boolean;
  touchdown?: boolean;
};

export type SackPlayPayload = {
  kind: "sack";
  startBall?: FieldPosition;
  quarterbackNumber: string;
  yardsLost: number;
  fumble?: boolean;
  fumbleLost?: boolean;
};

export type KneelPlayPayload = {
  kind: "kneel";
  startBall?: FieldPosition;
  quarterbackNumber: string;
  yardsLost: number;
};

export type SpikePlayPayload = {
  kind: "spike";
  startBall?: FieldPosition;
  quarterbackNumber: string;
};

export type PuntPlayPayload = {
  kind: "punt";
  startBall?: FieldPosition;
  punterNumber: string;
  puntDistance: number;
  returnYards?: number;
  netYards?: number;
  result: ReturnResult;
  blocked?: boolean;
};

export type KickoffPlayPayload = {
  kind: "kickoff";
  startBall?: FieldPosition;
  kickerNumber?: string;
  kickDistance: number;
  returnYards?: number;
  result: ReturnResult;
};

export type ExtraPointPlayPayload = {
  kind: "extra_point";
  kickerNumber?: string;
  result: KickTryResult;
};

export type TwoPointTryPlayPayload = {
  kind: "two_point_try";
  playStyle: "run" | "pass";
  passerNumber?: string;
  targetNumber?: string;
  ballCarrierNumber?: string;
  result: TwoPointResult;
};

export type FieldGoalPlayPayload = {
  kind: "field_goal";
  startBall?: FieldPosition;
  kickerNumber?: string;
  kickDistance: number;
  result: KickTryResult;
};

export type PenaltyOnlyPlayPayload = {
  kind: "penalty";
  liveBall: boolean;
  note?: string;
};

export type TurnoverPlayPayload = {
  kind: "turnover";
  startBall?: FieldPosition;
  turnoverKind: TurnoverKind;
  returnerNumber?: string;
  returnYards: number;
  touchdown?: boolean;
};

export type PlayPayloadByType = {
  run: RunPlayPayload;
  pass: PassPlayPayload;
  sack: SackPlayPayload;
  kneel: KneelPlayPayload;
  spike: SpikePlayPayload;
  punt: PuntPlayPayload;
  kickoff: KickoffPlayPayload;
  extra_point: ExtraPointPlayPayload;
  two_point_try: TwoPointTryPlayPayload;
  field_goal: FieldGoalPlayPayload;
  penalty: PenaltyOnlyPlayPayload;
  turnover: TurnoverPlayPayload;
};

export type AnyPlayPayload = PlayPayloadByType[PlayType];

export type PlayRecord<TType extends PlayType = PlayType> = {
  id: string;
  gameId: string;
  sequence: string;
  clientMutationId?: string | null;
  quarter: 1 | 2 | 3 | 4 | 5;
  clockSeconds: number;
  possession: TeamSide;
  playType: TType;
  summary?: string | null;
  payload: PlayPayloadByType[TType];
  participants: PlayParticipant[];
  penalties: PlayPenalty[];
};
