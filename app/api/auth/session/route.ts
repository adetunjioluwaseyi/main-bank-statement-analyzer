import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = NextResponse.json({ user: await getAuthenticatedUser() });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[Auth] Could not load the current session:", error);
    return NextResponse.json(
      { message: "Could not verify the current session." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
