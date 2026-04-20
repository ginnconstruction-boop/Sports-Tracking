import { z } from "zod";
import { sequenceTokenSchema, type SequenceToken } from "@/lib/contracts/play-log";
import { gameStateCorrectionReasonCategories } from "@/lib/domain/state-corrections";

const fieldPositionSchema = z.object({
  side: z.enum(["home", "away"]),
  yardLine: z.number().int().min(1).max(99)
});

const sequenceSchema = sequenceTokenSchema as z.ZodType<SequenceToken>;

export const createSituationCorrectionInputSchema = z.object({
  appliesAfterSequence: sequenceSchema,
  possession: z.enum(["home", "away"]),
  ballOn: fieldPositionSchema,
  down: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  distance: z.number().int().min(1).max(99),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  reasonCategory: z.enum(gameStateCorrectionReasonCategories),
  reasonNote: z.string().trim().min(3).max(400)
});

export const voidSituationCorrectionInputSchema = z.object({
  reasonNote: z.string().trim().min(3).max(400)
});

export type CreateSituationCorrectionInput = z.infer<typeof createSituationCorrectionInputSchema>;
export type VoidSituationCorrectionInput = z.infer<typeof voidSituationCorrectionInputSchema>;
