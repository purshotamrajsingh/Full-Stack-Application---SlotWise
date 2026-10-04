import { SignJWT, jwtVerify } from "jose";
import { compare, hash } from "bcryptjs";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import type { Role } from "@/lib/types";

const ACCESS_TTL_SECONDS = 60 * 30; // 30 minutes
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const accessSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-access-secret-change-me",
);
const refreshSecret = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
);

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  providerId: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function issueTokenPair(user: SessionUser): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = await new SignJWT({
    type: "access",
    role: user.role,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);

  const refreshToken = await new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(refreshSecret);

  return { accessToken, refreshToken };
}

async function verify(
  token: string,
  secret: Uint8Array,
  expectedType: "access" | "refresh",
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== expectedType || typeof payload.sub !== "string") {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export function verifyAccessToken(token: string): Promise<string | null> {
  return verify(token, accessSecret, "access");
}

export function verifyRefreshToken(token: string): Promise<string | null> {
  return verify(token, refreshSecret, "refresh");
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Resolves the current session from the Authorization header (JWT access token). */
export async function getSession(req: Request): Promise<SessionUser | null> {
  const token = bearer(req);
  if (!token) return null;

  const userId = await verifyAccessToken(token);
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { provider: { select: { id: true } } },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    providerId: user.provider?.id ?? null,
  };
}

/** Auth + RBAC guard. Throws 401 when unauthenticated, 403 when the role is not allowed. */
export async function requireSession(
  req: Request,
  roles?: Role[],
): Promise<SessionUser> {
  const session = await getSession(req);
  if (!session) {
    throw new HttpError(401, "UNAUTHORIZED", "You need to sign in first.");
  }
  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Your role does not have permission to perform this action.",
    );
  }
  return session;
}

export function toUserDTO(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  timezone?: string | null;
  createdAt: Date;
  provider?: { id: string } | null;
}): import("@/lib/types").UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    providerId: user.provider?.id ?? null,
    timezone: user.timezone ?? "UTC",
    createdAt: user.createdAt.toISOString(),
  };
}
