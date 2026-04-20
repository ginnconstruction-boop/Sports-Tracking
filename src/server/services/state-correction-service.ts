import type {
  CreateSituationCorrectionInput,
  VoidSituationCorrectionInput
} from "@/lib/contracts/state-corrections";
import type { GameStateCorrection } from "@/lib/domain/state-corrections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { requireGameRole } from "@/server/services/game-access";

type GameStateCorrectionRow = {
  id: string;
  game_id: string;
  kind: "situation";
  applies_after_sequence: string | number;
  possession: "home" | "away";
  ball_on: { side: "home" | "away"; yardLine: number } | null;
  down: number;
  distance: number;
  quarter: number | null;
  reason_category: GameStateCorrection["reasonCategory"];
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

function isMissingStateCorrectionsTable(error: { message: string }) {
  return (
    error.message.includes("game_state_corrections") &&
    (error.message.includes("schema cache") || error.message.includes("relation"))
  );
}

function isMissingStateCorrectionVoidColumns(error: { message: string }) {
  return (
    error.message.includes("game_state_corrections.") &&
    (error.message.includes("voided_by_user_id") ||
      error.message.includes("voided_at") ||
      error.message.includes("void_reason_note"))
  );
}

function mapCorrection(
  row: GameStateCorrectionRow,
  displayNames: Map<string, string>
): GameStateCorrection {
  return {
    id: row.id,
    gameId: row.game_id,
    kind: row.kind,
    appliesAfterSequence: normalizeSequenceToken(row.applies_after_sequence),
    possession: row.possession,
    ballOn: {
      side: row.ball_on?.side ?? row.possession,
      yardLine: Number(row.ball_on?.yardLine ?? 1)
    },
    down: row.down as 1 | 2 | 3 | 4,
    distance: row.distance,
    quarter: row.quarter as 1 | 2 | 3 | 4 | 5 | undefined,
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

  if (!data) {
    throw new Error("Situation correction could not be loaded after creation.");
  }

  return new Map((data ?? []).map((row) => [row.id, row.display_name]));
}

export async function listSituationCorrections(gameId: string) {
  await requireGameRole(gameId, "read_only");
  const supabaseAdmin = createSupabaseAdminClient();
  let { data, error } = await supabaseAdmin
    .from("game_state_corrections")
    .select(
      "id,game_id,kind,applies_after_sequence,possession,ball_on,down,distance,quarter,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .eq("game_id", gameId)
    .eq("kind", "situation")
    .order("created_at", { ascending: false })
    .returns<GameStateCorrectionRow[]>();

  if (error && isMissingStateCorrectionVoidColumns(error)) {
    const fallback = await supabaseAdmin
      .from("game_state_corrections")
      .select(
        "id,game_id,kind,applies_after_sequence,possession,ball_on,down,distance,quarter,reason_category,reason_note,created_by_user_id,created_at"
      )
      .eq("game_id", gameId)
      .eq("kind", "situation")
      .order("created_at", { ascending: false })
      .returns<
        Array<
          Omit<
            GameStateCorrectionRow,
            "voided_by_user_id" | "voided_at" | "void_reason_note"
          >
        >
      >();

    data = (fallback.data ?? []).map((row) => ({
      ...row,
      voided_by_user_id: null,
      voided_at: null,
      void_reason_note: null
    }));
    error = fallback.error;
  }

  if (error) {
    if (isMissingStateCorrectionsTable(error)) {
      throw new Error("Situation corrections are not installed in this database yet. Apply the latest database migration first.");
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

export async function createSituationCorrection(gameId: string, input: CreateSituationCorrectionInput) {
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

  let { data, error } = await supabaseAdmin
    .from("game_state_corrections")
    .insert({
      game_id: gameId,
      kind: "situation",
      applies_after_sequence: input.appliesAfterSequence,
      possession: input.possession,
      ball_on: input.ballOn,
      down: input.down,
      distance: input.distance,
      quarter: input.quarter ?? null,
      reason_category: input.reasonCategory,
      reason_note: input.reasonNote,
      created_by_user_id: user.id
    })
    .select(
      "id,game_id,kind,applies_after_sequence,possession,ball_on,down,distance,quarter,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .single<GameStateCorrectionRow>();

  if (error && isMissingStateCorrectionVoidColumns(error)) {
    const fallback = await supabaseAdmin
      .from("game_state_corrections")
      .insert({
        game_id: gameId,
        kind: "situation",
        applies_after_sequence: input.appliesAfterSequence,
        possession: input.possession,
        ball_on: input.ballOn,
        down: input.down,
        distance: input.distance,
        quarter: input.quarter ?? null,
        reason_category: input.reasonCategory,
        reason_note: input.reasonNote,
        created_by_user_id: user.id
      })
      .select(
        "id,game_id,kind,applies_after_sequence,possession,ball_on,down,distance,quarter,reason_category,reason_note,created_by_user_id,created_at"
      )
      .single<
        Omit<
          GameStateCorrectionRow,
          "voided_by_user_id" | "voided_at" | "void_reason_note"
        >
      >();

    data = fallback.data
      ? {
          ...fallback.data,
          voided_by_user_id: null,
          voided_at: null,
          void_reason_note: null
        }
      : null;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Situation correction could not be loaded after creation.");
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

  const displayNames = new Map<string, string>([[user.id, user.displayName]]);
  return mapCorrection(data, displayNames);
}

export async function voidSituationCorrection(
  gameId: string,
  correctionId: string,
  input: VoidSituationCorrectionInput
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
    .from("game_state_corrections")
    .select(
      "id,game_id,kind,applies_after_sequence,possession,ball_on,down,distance,quarter,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .eq("id", correctionId)
    .eq("game_id", gameId)
    .eq("kind", "situation")
    .maybeSingle<GameStateCorrectionRow>();

  if (existingError) {
    if (isMissingStateCorrectionVoidColumns(existingError)) {
      throw new Error("Voiding situation corrections is not installed in this database yet. Apply the latest database migration first.");
    }
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error("Situation correction not found.");
  }

  if (existing.voided_at) {
    throw new Error("Situation correction is already voided.");
  }

  const { data, error } = await supabaseAdmin
    .from("game_state_corrections")
    .update({
      voided_by_user_id: user.id,
      voided_at: new Date().toISOString(),
      void_reason_note: input.reasonNote
    })
    .eq("id", correctionId)
    .eq("game_id", gameId)
    .select(
      "id,game_id,kind,applies_after_sequence,possession,ball_on,down,distance,quarter,reason_category,reason_note,created_by_user_id,created_at,voided_by_user_id,voided_at,void_reason_note"
    )
    .single<GameStateCorrectionRow>();

  if (error) {
    if (isMissingStateCorrectionVoidColumns(error)) {
      throw new Error("Voiding situation corrections is not installed in this database yet. Apply the latest database migration first.");
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Situation correction could not be loaded after voiding.");
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

  const displayNames = new Map<string, string>();
  if (existing.created_by_user_id && existing.created_by_user_id === user.id) {
    displayNames.set(user.id, user.displayName);
  } else if (existing.created_by_user_id) {
    const loaded = await loadDisplayNames([existing.created_by_user_id, user.id]);
    loaded.forEach((value, key) => displayNames.set(key, value));
  } else {
    displayNames.set(user.id, user.displayName);
  }
  if (!displayNames.has(user.id)) {
    displayNames.set(user.id, user.displayName);
  }

  return mapCorrection(data, displayNames);
}
