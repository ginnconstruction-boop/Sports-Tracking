import { createClient } from "@supabase/supabase-js";

function readArg(name: string) {
  const prefixed = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (prefixed) {
    return prefixed.slice(name.length + 3);
  }
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const gameId = readArg("gameId");
  if (!gameId) {
    throw new Error("Missing required --gameId.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const [gameResult, exportsResult] = await Promise.all([
    supabase.from("games").select("id,status,current_revision,last_rebuilt_at").eq("id", gameId).maybeSingle(),
    supabase.from("report_exports").select("id,status,format,created_at").eq("game_id", gameId).order("created_at", { ascending: false })
  ]);

  if (gameResult.error) throw new Error(`Unable to load game: ${gameResult.error.message}`);
  if (exportsResult.error) throw new Error(`Unable to load exports: ${exportsResult.error.message}`);
  if (!gameResult.data) throw new Error("Game not found.");

  const game = gameResult.data;
  const exports = exportsResult.data ?? [];
  const completedExports = exports.filter((item) => item.status === "complete");
  const statusReady = game.status === "final" || game.status === "archived";
  const exportsReady = completedExports.length > 0;

  console.log("=== Postgame closeout gate ===");
  console.log(`Game: ${game.id}`);
  console.log(`Status: ${game.status}`);
  console.log(`Revision: ${game.current_revision}`);
  console.log(`Last rebuild: ${game.last_rebuilt_at ?? "n/a"}`);
  console.log(`Exports: ${exports.length} total, ${completedExports.length} complete`);

  if (!statusReady || !exportsReady) {
    console.log("Result: FAIL");
    if (!statusReady) console.log("- Game status must be final or archived.");
    if (!exportsReady) console.log("- At least one completed export is required.");
    process.exit(1);
  }

  console.log("Result: PASS");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
