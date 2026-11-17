import { NextResponse } from "next/server";
import {
  AuthenticatedUser,
  createSessionToken,
  getSessionExpiry,
  SESSION_COOKIE_NAME,
} from "@/lib/server-session";

export const runtime = "nodejs";

export async function POST() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DEV_AUTH_BYPASS !== "true"
  ) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const user: AuthenticatedUser = {
    id: "local:developer",
    username: "developer",
    email: "developer@local.test",
    name: "Local Developer",
    role: "user",
    status: "active",
  };

  const response = NextResponse.json({ user });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    expires: getSessionExpiry(),
  });
  return response;
}
