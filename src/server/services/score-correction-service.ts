import type {
  CreateScoreCorrectionInput,
  VoidScoreCorrectionInput
} from "@/lib/contracts/score-corrections";
import type { ScoreCorrection } from "@/lib/domain/score-corrections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { requireGameRole } from "@/server/services/game-access";

type ScoreCorrectionRow = {
  id: string;
  game_id: string;
  applies_after_sequence: string | number;
  score: { home: number; away: number } | null;
  reason_category: ScoreCorrection["reasonCategory"];
  reason_note: string;
  created_by_user_id: string | null;
  created_at: string;
  voided_by_user_id: string | null;
  voided_at: string | null;
  void_reason_note: string | null;
};

type AppUserRow = {
  id: string;
  display_name: string;
};

type GameRevisionRow = {
  id: string;
  current_revision: number;
};

function normalizeSequenceToken(sequence: string | number) {
  return typeof sequence === "string" ? sequence : String(sequence);
}

function isMissingScoreCorrectionsTable(error: { message: string }) {
  return (
    error.message.includes("game_score_corrections") &&
    (error.message.includes("schema cache") || error.message.includes("relation"))
  );
}

async function loadDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,display_name")
    .in("id", userIds)
    .returns<AppUserRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

function mapCorrection(row: ScoreCorrectionRow, displayNames: Map<string, string>): ScoreCorrection {
  return {
    id: row.id,
    gameId: row.game_id,
    appliesAfterSequence: normalizeSequenceToken(row.applies_after_sequence),
    score: {
      home: Number(row.score?.home ?? 0),
      away: Number(row.score?.away ?? 0)
    },
    reasonCategory: row.reason_category,
    reasonNote: row.reason_note,
    createdByUserId: row.created_by_user_id ?? "",
    createdAt: row.created_at,
    createdByDisplayName: row.created_by_user_id ? displayNames.get(row.created_by_user_id) : undefined,
    voidedByUserId: row.voided_by_user_id ?? undefined,
    voidedAt: row.voided_at ?? undefined,
    voidedByDisplayName: row.voided_by_user_id ? displayNames.get(row.voided_by_user_id) : undefined,
    voidReasonNote: row.void_reason_note ?? undefined
  };
}

export async function listScoreCorrections(gameId: string) {
  await requireGameRole(gameId, "read_only");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("game_score_corrections")
    .select(
      "id,game_id,applies_after_sequence,score,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .returns<ScoreCorrectionRow[]>();

  if (error) {
    if (isMissingScoreCorrectionsTable(error)) {
      throw new Error("Score corrections are not installed in this database yet. Apply the latest database migration first.");
    }
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const displayNames = await loadDisplayNames(
    [
      ...new Set(
        rows
          .flatMap((row) => [row.created_by_user_id, row.voided_by_user_id])
          .filter((value): value is string => Boolean(value))
      )
    ]
  );

  return rows.map((row) => mapCorrection(row, displayNames));
}

export async function createScoreCorrection(gameId: string, input: CreateScoreCorrectionInput) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: gameRow, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id,current_revision")
    .eq("id", gameId)
    .maybeSingle<GameRevisionRow>();

  if (gameError) {
    throw new Error(gameError.message);
  }

  if (!gameRow) {
    throw new Error("Game not found.");
  }

  const { data, error } = await supabaseAdmin
    .from("game_score_corrections")
    .insert({
      game_id: gameId,
      applies_after_sequence: input.appliesAfterSequence,
      score: input.score,
      reason_category: input.reasonCategory,
      reason_note: input.reasonNote,
      created_by_user_id: user.id
    })
    .select(
      "id,game_id,applies_after_sequence,score,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .single<ScoreCorrectionRow>();

  if (error) {
    if (isMissingScoreCorrectionsTable(error)) {
      throw new Error("Score corrections are not installed in this database yet. Apply the latest database migration first.");
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Score correction could not be loaded after creation.");
  }

  const { error: revisionUpdateError } = await supabaseAdmin
    .from("games")
    .update({
      current_revision: gameRow.current_revision + 1
    })
    .eq("id", gameId);

  if (revisionUpdateError) {
    throw new Error(revisionUpdateError.message);
  }

  return mapCorrection(data, new Map([[user.id, user.displayName]]));
}

export async function voidScoreCorrection(
  gameId: string,
  correctionId: string,
  input: VoidScoreCorrectionInput
) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: gameRow, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id,current_revision")
    .eq("id", gameId)
    .maybeSingle<GameRevisionRow>();

  if (gameError) {
    throw new Error(gameError.message);
  }

  if (!gameRow) {
    throw new Error("Game not found.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("game_score_corrections")
    .select(
      "id,game_id,applies_after_sequence,score,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .eq("id", correctionId)
    .eq("game_id", gameId)
    .maybeSingle<ScoreCorrectionRow>();

  if (existingError) {
    if (isMissingScoreCorrectionsTable(existingError)) {
      throw new Error("Score corrections are not installed in this database yet. Apply the latest database migration first.");
    }
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error("Score correction not found.");
  }

  if (existing.voided_at) {
    throw new Error("Score correction is already voided.");
  }

  const { data, error } = await supabaseAdmin
    .from("game_score_corrections")
    .update({
      voided_by_user_id: user.id,
      voided_at: new Date().toISOString(),
      void_reason_note: input.reasonNote
    })
    .eq("id", correctionId)
    .eq("game_id", gameId)
    .select(
      "id,game_id,applies_after_sequence,score,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .single<ScoreCorrectionRow>();

  if (error) {
    if (isMissingScoreCorrectionsTable(error)) {
      throw new Error("Score corrections are not installed in this database yet. Apply the latest database migration first.");
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Score correction could not be loaded after voiding.");
  }

  const { error: revisionUpdateError } = await supabaseAdmin
    .from("games")
    .update({
      current_revision: gameRow.current_revision + 1
    })
    .eq("id", gameId);

  if (revisionUpdateError) {
    throw new Error(revisionUpdateError.message);
  }

  const displayNames = await loadDisplayNames(
    [existing.created_by_user_id, user.id].filter((value): value is string => Boolean(value))
  );
  if (!displayNames.has(user.id)) {
    displayNames.set(user.id, user.displayName);
  }

  return mapCorrection(data, displayNames);
}
