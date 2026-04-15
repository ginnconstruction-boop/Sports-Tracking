import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "tracking-the-game",
    timestamp: new Date().toISOString()
  });
}
