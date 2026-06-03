import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatabaseConnectionConfig } from "@/server/db/connection";

test("resolveDatabaseConnectionConfig prefers a dedicated pooler URL", () => {
  const connection = resolveDatabaseConnectionConfig({
    DATABASE_POOLER_URL: "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    DATABASE_URL: "postgresql://user:pass@db.example.supabase.co:5432/postgres"
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(connection.source, "DATABASE_POOLER_URL");
  assert.equal(connection.host, "aws-0-us-east-1.pooler.supabase.com:5432");
  assert.equal(connection.isPooler, true);
  assert.equal(connection.isDirectSupabase, false);
});

test("resolveDatabaseConnectionConfig falls back to DATABASE_URL and provides a Supabase pooler hint", () => {
  const connection = resolveDatabaseConnectionConfig({
    DATABASE_URL: "postgresql://postgres:pass@db.kpagbygxqrtgzzuyycoe.supabase.co:5432/postgres"
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(connection.source, "DATABASE_URL");
  assert.equal(connection.host, "db.kpagbygxqrtgzzuyycoe.supabase.co:5432");
  assert.equal(connection.isDirectSupabase, true);
  assert.match(connection.poolerHint ?? "", /DATABASE_POOLER_URL/);
  assert.match(connection.poolerHint ?? "", /postgres\.kpagbygxqrtgzzuyycoe/);
});
