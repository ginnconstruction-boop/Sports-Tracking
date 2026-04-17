import type { OpenGameSessionInput, SyncGameSessionInput } from "@/lib/contracts/game-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { requireGameRole } from "@/server/services/game-access";

export class ActiveWriterConflictError extends Error {
  constructor() {
    super("Another active stat writer already holds the game session lease.");
  }
}

type GameSessionRow = {
  id: string;
  game_id: string;
  device_key: string;
  user_id: string | null;
  status: "local_only" | "syncing" | "synced" | "conflict";
  is_active_writer: boolean;
  writer_lease_expires_at: string | null;
  local_revision: number;
  remote_revision: number;
  last_synced_at: string | null;
};

function writerLeaseExpiry(leaseDurationSeconds: number) {
  return new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
}

function mapSessionRow(row: GameSessionRow) {
  return {
    id: row.id,
    status: row.status,
    isActiveWriter: row.is_active_writer,
    localRevision: row.local_revision,
    remoteRevision: row.remote_revision,
    writerLeaseExpiresAt: row.writer_lease_expires_at,
    pendingMutationCount: 0,
    lastSyncError: null
  };
}

export async function openGameSession(gameId: string, input: OpenGameSessionInput) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const supabaseAdmin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const expiredWriterReset = await supabaseAdmin
    .from("game_sessions")
    .update({
      is_active_writer: false
    })
    .eq("game_id", gameId)
    .eq("is_active_writer", true)
    .lt("writer_lease_expires_at", nowIso);

  if (expiredWriterReset.error) {
    throw new Error(expiredWriterReset.error.message);
  }

  if (input.requestActiveWriter) {
    const { data: activeWriter, error: activeWriterError } = await supabaseAdmin
      .from("game_sessions")
      .select("id")
      .eq("game_id", gameId)
      .eq("is_active_writer", true)
      .neq("device_key", input.deviceKey)
      .gt("writer_lease_expires_at", nowIso)
      .maybeSingle<{ id: string }>();

    if (activeWriterError) {
      throw new Error(activeWriterError.message);
    }

    if (activeWriter) {
      throw new ActiveWriterConflictError();
    }
  }

  const upsertPayload = {
    game_id: gameId,
    device_key: input.deviceKey,
    user_id: user.id,
    status: "local_only" as const,
    is_active_writer: input.requestActiveWriter,
    writer_lease_expires_at: input.requestActiveWriter ? writerLeaseExpiry(input.leaseDurationSeconds) : null,
    local_revision: input.localRevision,
    remote_revision: input.remoteRevision
  };

  const { data, error } = await supabaseAdmin
    .from("game_sessions")
    .upsert(upsertPayload, {
      onConflict: "game_id,device_key"
    })
    .select(
      "id,game_id,device_key,user_id,status,is_active_writer,writer_lease_expires_at,local_revision,remote_revision,last_synced_at"
    )
    .maybeSingle<GameSessionRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Game session could not be created.");
  }

  return mapSessionRow(data);
}

export async function syncGameSession(gameId: string, input: SyncGameSessionInput) {
  await requireGameRole(gameId, "stat_operator");
  const supabaseAdmin = createSupabaseAdminClient();

  const { data, error } = await supabaseAdmin
    .from("game_sessions")
    .update({
      status: input.status,
      is_active_writer: input.releaseWriter ? false : input.extendWriterLease,
      writer_lease_expires_at: input.releaseWriter
        ? null
        : input.extendWriterLease
          ? writerLeaseExpiry(input.leaseDurationSeconds)
          : null,
      local_revision: input.localRevision,
      remote_revision: input.remoteRevision,
      last_synced_at: new Date().toISOString()
    })
    .eq("game_id", gameId)
    .eq("device_key", input.deviceKey)
    .select(
      "id,game_id,device_key,user_id,status,is_active_writer,writer_lease_expires_at,local_revision,remote_revision,last_synced_at"
    )
    .maybeSingle<GameSessionRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Game session not found for device.");
  }

  return mapSessionRow(data);
}
