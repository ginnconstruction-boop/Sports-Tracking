import { z } from "zod";
import { playParticipantRoles } from "@/lib/domain/play-log";
import { parseClockToSeconds } from "@/lib/engine/clock";

const sequenceTokenSchema = z.string().regex(/^\d+(\.\d{1,12})?$/);
const clockDisplaySchema = z.string().regex(/^\d{1,2}:\d{2}$/);

const fieldPositionSchema = z.object({
  side: z.enum(["home", "away"]),
  yardLine: z.number().int().min(1).max(99)
});

export const playParticipantInputSchema = z.object({
  gameRosterEntryId: z.string().uuid().optional(),
  role: z.enum(playParticipantRoles),
  side: z.enum(["home", "away"]),
  creditUnits: z.number().int().min(1).max(4).default(1),
  statPayload: z.record(z.string(), z.unknown()).optional()
});

export const playPenaltyInputSchema = z
  .object({
    penalizedSide: z.enum(["home", "away"]),
    code: z.string().min(1).max(80),
    yards: z.number().int().min(0).max(50),
    result: z.enum(["accepted", "declined", "offsetting"]),
    enforcementType: z.enum(["previous_spot", "spot", "dead_ball", "succeeding_spot"]),
    timing: z.enum(["live_ball", "dead_ball", "post_possession", "post_score"]),
    foulSpot: fieldPositionSchema.optional(),
    automaticFirstDown: z.boolean().default(false),
    lossOfDown: z.boolean().default(false),
    replayDown: z.boolean().default(false),
    noPlay: z.boolean().default(false)
  })
  .superRefine((penalty, ctx) => {
    if (penalty.result === "declined") {
      if (
        penalty.automaticFirstDown ||
        penalty.lossOfDown ||
        penalty.replayDown ||
        penalty.noPlay ||
        penalty.enforcementType !== "previous_spot"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Declined penalties cannot change state or use non-default enforcement."
        });
      }
    }

    if (penalty.result === "offsetting") {
      if (
        penalty.automaticFirstDown ||
        penalty.lossOfDown ||
        penalty.replayDown ||
        penalty.noPlay ||
        penalty.enforcementType !== "previous_spot"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Offsetting penalties cannot carry state-changing enforcement flags."
        });
      }
    }

    if (penalty.enforcementType === "spot" && !penalty.foulSpot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Spot enforcement requires a foulSpot."
      });
    }

    if (penalty.noPlay && penalty.timing !== "live_ball") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only live-ball penalties can create a no-play result."
      });
    }

    if (penalty.replayDown && penalty.timing !== "live_ball") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay down can only be used on live-ball penalties."
      });
    }

    if (penalty.enforcementType === "dead_ball" && penalty.timing === "live_ball") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dead-ball enforcement cannot be paired with live-ball timing."
      });
    }

    if (penalty.automaticFirstDown && penalty.lossOfDown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A penalty cannot grant both automatic first down and loss of down."
      });
    }
  });

const sharedFields = {
  sequence: sequenceTokenSchema,
  clientMutationId: z.string().uuid().optional(),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  clock: clockDisplaySchema,
  possession: z.enum(["home", "away"]),
  summary: z.string().max(500).optional(),
  participants: z.array(playParticipantInputSchema).default([]),
  penalties: z.array(playPenaltyInputSchema).default([])
} as const;

const runPlaySchema = z
  .object({
    ...sharedFields,
    playType: z.literal("run"),
    payload: z.object({
      kind: z.literal("run"),
      startBall: fieldPositionSchema.optional(),
      ballCarrierNumber: z.string().min(1).max(12),
      runKind: z.enum(["designed", "scramble", "quarterback_keep", "reverse"]),
      yards: z.number().int().min(-99).max(99),
      firstDown: z.boolean().optional(),
      touchdown: z.boolean().optional(),
      fumble: z.boolean().optional(),
      fumbleLost: z.boolean().optional(),
      outOfBounds: z.boolean().optional()
    })
  })
  .superRefine((play, ctx) => {
    if (play.payload.touchdown && play.payload.fumbleLost) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A rushing play cannot be both a touchdown and a lost fumble."
      });
    }
  });

const passPlaySchema = z
  .object({
    ...sharedFields,
    playType: z.literal("pass"),
    payload: z.object({
      kind: z.literal("pass"),
      startBall: fieldPositionSchema.optional(),
      passerNumber: z.string().min(1).max(12),
      targetNumber: z.string().max(12).optional(),
      result: z.enum(["complete", "incomplete", "interception"]),
      airYards: z.number().int().min(-20).max(99).optional(),
      yards: z.number().int().min(-99).max(99),
      yacYards: z.number().int().min(0).max(99).optional(),
      firstDown: z.boolean().optional(),
      touchdown: z.boolean().optional()
    })
  })
  .superRefine((play, ctx) => {
    if (play.payload.result !== "complete" && play.payload.touchdown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only completed passes can be touchdowns for the offense."
      });
    }

    if (play.payload.result !== "complete" && play.payload.firstDown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only completed passes can directly record an offensive first down."
      });
    }

    if (play.payload.result !== "complete" && play.payload.yacYards) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "YAC can only be recorded on completed passes."
      });
    }

    if (play.payload.result === "interception" && play.payload.yards !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Interceptions should not record offensive pass yards."
      });
    }

    if (play.payload.result === "incomplete" && play.payload.yards !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incomplete passes should not record yards."
      });
    }
  });

const sackPlaySchema = z
  .object({
    ...sharedFields,
    playType: z.literal("sack"),
    payload: z.object({
      kind: z.literal("sack"),
      startBall: fieldPositionSchema.optional(),
      quarterbackNumber: z.string().min(1).max(12),
      yardsLost: z.number().int().min(0).max(40),
      fumble: z.boolean().optional(),
      fumbleLost: z.boolean().optional()
    })
  })
  .superRefine((play, ctx) => {
    if (play.payload.fumbleLost && !play.payload.fumble) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A lost fumble on a sack must also mark fumble=true."
      });
    }
  });

const kneelPlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("kneel"),
  payload: z.object({
    kind: z.literal("kneel"),
    startBall: fieldPositionSchema.optional(),
    quarterbackNumber: z.string().min(1).max(12),
    yardsLost: z.number().int().min(0).max(5)
  })
});

const spikePlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("spike"),
  payload: z.object({
    kind: z.literal("spike"),
    startBall: fieldPositionSchema.optional(),
    quarterbackNumber: z.string().min(1).max(12)
  })
});

const puntPlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("punt"),
  payload: z.object({
    kind: z.literal("punt"),
    startBall: fieldPositionSchema.optional(),
    punterNumber: z.string().min(1).max(12),
    puntDistance: z.number().int().min(0).max(99),
    returnYards: z.number().int().min(0).max(99).optional(),
    netYards: z.number().int().min(-99).max(99).optional(),
    result: z.enum(["returned", "touchback", "fair_catch", "out_of_bounds", "downed"]),
    blocked: z.boolean().optional()
  })
});

const kickoffPlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("kickoff"),
  payload: z.object({
    kind: z.literal("kickoff"),
    startBall: fieldPositionSchema.optional(),
    kickerNumber: z.string().max(12).optional(),
    kickDistance: z.number().int().min(0).max(99),
    returnYards: z.number().int().min(0).max(99).optional(),
    result: z.enum(["returned", "touchback", "fair_catch", "out_of_bounds", "downed"])
  })
});

const extraPointPlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("extra_point"),
  payload: z.object({
    kind: z.literal("extra_point"),
    kickerNumber: z.string().max(12).optional(),
    result: z.enum(["good", "no_good", "blocked"])
  })
});

const twoPointTryPlaySchema = z
  .object({
    ...sharedFields,
    playType: z.literal("two_point_try"),
    payload: z.object({
      kind: z.literal("two_point_try"),
      playStyle: z.enum(["run", "pass"]),
      passerNumber: z.string().max(12).optional(),
      targetNumber: z.string().max(12).optional(),
      ballCarrierNumber: z.string().max(12).optional(),
      result: z.enum(["good", "failed", "turnover"])
    })
  })
  .superRefine((play, ctx) => {
    if (play.payload.playStyle === "run" && !play.payload.ballCarrierNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Run-style two-point tries require a ball carrier."
      });
    }

    if (play.payload.playStyle === "pass" && !play.payload.passerNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pass-style two-point tries require a passer."
      });
    }
  });

const fieldGoalPlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("field_goal"),
  payload: z.object({
    kind: z.literal("field_goal"),
    startBall: fieldPositionSchema.optional(),
    kickerNumber: z.string().max(12).optional(),
    kickDistance: z.number().int().min(0).max(70),
    result: z.enum(["good", "no_good", "blocked"])
  })
});

const penaltyPlaySchema = z
  .object({
    ...sharedFields,
    playType: z.literal("penalty"),
    payload: z.object({
      kind: z.literal("penalty"),
      liveBall: z.boolean(),
      note: z.string().max(240).optional()
    })
  })
  .superRefine((play, ctx) => {
    if (play.penalties.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Penalty-only plays must include at least one penalty."
      });
    }
  });

const turnoverPlaySchema = z.object({
  ...sharedFields,
  playType: z.literal("turnover"),
  payload: z.object({
    kind: z.literal("turnover"),
    startBall: fieldPositionSchema.optional(),
    turnoverKind: z.enum(["fumble_return", "interception_return", "blocked_kick_return"]),
    returnerNumber: z.string().max(12).optional(),
    returnYards: z.number().int().min(0).max(99),
    touchdown: z.boolean().optional()
  })
});

const rawCreatePlayEventInputSchema = z
  .discriminatedUnion("playType", [
    runPlaySchema,
    passPlaySchema,
    sackPlaySchema,
    kneelPlaySchema,
    spikePlaySchema,
    puntPlaySchema,
    kickoffPlaySchema,
    extraPointPlaySchema,
    twoPointTryPlaySchema,
    fieldGoalPlaySchema,
    penaltyPlaySchema,
    turnoverPlaySchema
  ])
  .superRefine((play, ctx) => {
    const hasOffsetting = play.penalties.some((penalty) => penalty.result === "offsetting");
    if (hasOffsetting && !play.penalties.every((penalty) => penalty.result === "offsetting")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Offsetting penalties cannot be mixed with accepted or declined penalties."
      });
    }

    if (play.playType === "kickoff" && play.payload.result === "touchback" && play.payload.returnYards) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Touchback kickoffs cannot include return yards."
      });
    }
  });

export const createPlayEventInputSchema = rawCreatePlayEventInputSchema.transform((play) => {
  const { clock, ...rest } = play;
  return {
    ...rest,
    clockSeconds: parseClockToSeconds(clock)
  };
});

export const updatePlayEventInputSchema = rawCreatePlayEventInputSchema
  .and(
    z.object({
      playId: z.string().uuid()
    })
  )
  .transform((play) => {
    const { clock, ...rest } = play;
    return {
      ...rest,
      clockSeconds: parseClockToSeconds(clock)
    };
  });

export type CreatePlayEventInput = z.infer<typeof createPlayEventInputSchema>;
export type UpdatePlayEventInput = z.infer<typeof updatePlayEventInputSchema>;
export type SequenceToken = z.infer<typeof sequenceTokenSchema>;
