import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const filePath = path.join(process.cwd(), "docs", "stat-definitions.md");

  try {
    const body = await readFile(filePath, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json({ error: "Stat definitions document not found." }, { status: 404 });
  }
}
