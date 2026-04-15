import { z } from "zod";

export const openGameSessionInputSchema = z.object({
  deviceKey: z.string().min(6).max(120),
  requestActiveWriter: z.boolean().default(true),
  leaseDurationSeconds: z.number().int().min(30).max(900).default(300),
  localRevision: z.number().int().min(0).default(0),
  remoteRevision: z.number().int().min(0).default(0)
});

export const syncGameSessionInputSchema = z.object({
  deviceKey: z.string().min(6).max(120),
  extendWriterLease: z.boolean().default(true),
  releaseWriter: z.boolean().default(false),
  leaseDurationSeconds: z.number().int().min(30).max(900).default(300),
  localRevision: z.number().int().min(0),
  remoteRevision: z.number().int().min(0),
  status: z.enum(["local_only", "syncing", "synced", "conflict"])
});

export type OpenGameSessionInput = z.infer<typeof openGameSessionInputSchema>;
export type SyncGameSessionInput = z.infer<typeof syncGameSessionInputSchema>;
