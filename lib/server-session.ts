import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "statement_analyzer_session";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
}

interface SessionPayload extends AuthenticatedUser {
  expiresAt: number;
}

export function getSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_LIFETIME_MS);
}

export function assertSessionSecretConfigured(): void {
  getSessionSecret();
}

const DEVELOPMENT_SESSION_SECRET =
  "local-development-session-secret-that-is-long-enough-123456";

function getSessionSecret(): string {
  const secret = process.env.AD_SESSION_SECRET;
  if (secret && Buffer.byteLength(secret, "utf8") >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEVELOPMENT_SESSION_SECRET;
  }

  throw new Error("AD_SESSION_SECRET must be configured with at least 32 bytes.");
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createSessionToken(user: AuthenticatedUser): string {
  const payload: SessionPayload = {
    ...user,
    expiresAt: getSessionExpiry().getTime(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, getSessionSecret()).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string): AuthenticatedUser | null {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra || token.length > 4096) return null;

  const expectedSignature = sign(encodedPayload, getSessionSecret());
  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<SessionPayload>;
    if (
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "user" && payload.role !== "admin") ||
      (payload.status !== "active" && payload.status !== "suspended") ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      status: payload.status,
    };
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return parseSessionToken(token);
}

export function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate =
    request.headers.get("x-real-ip") || forwarded?.split(",")[0]?.trim() || null;
  return candidate ? candidate.slice(0, 45) : null;
}

export function getRequestUserAgent(request: Request): string | null {
  return request.headers.get("user-agent")?.slice(0, 512) || null;
}
