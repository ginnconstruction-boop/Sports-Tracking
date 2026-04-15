import { z } from "zod";

export const exportRequestSchema = z.object({
  reportType: z.literal("game_report").default("game_report"),
  format: z.enum(["json", "csv", "xlsx", "pdf"])
});

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
