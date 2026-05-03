import { z } from "zod";
import { sequenceTokenSchema, type SequenceToken } from "@/lib/contracts/play-log";
import { gameStateCorrectionReasonCategories } from "@/lib/domain/state-corrections";

const sequenceSchema = sequenceTokenSchema as z.ZodType<SequenceToken>;

const scorePayloadSchema = z.object({
  home: z.number().int().min(0).max(255),
  away: z.number().int().min(0).max(255)
});

export const createScoreCorrectionInputSchema = z.object({
  appliesAfterSequence: sequenceSchema,
  score: scorePayloadSchema,
  reasonCategory: z.enum(gameStateCorrectionReasonCategories),
  reasonNote: z.string().trim().min(3).max(400)
});

export const voidScoreCorrectionInputSchema = z.object({
  reasonNote: z.string().trim().min(3).max(400)
});

export type CreateScoreCorrectionInput = z.infer<typeof createScoreCorrectionInputSchema>;
export type VoidScoreCorrectionInput = z.infer<typeof voidScoreCorrectionInputSchema>;
