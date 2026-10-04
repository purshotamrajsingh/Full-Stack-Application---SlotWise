import { NextResponse } from "next/server";
import { ZodError, type ZodIssue } from "zod";

/** Typed HTTP error thrown by handlers, converted to a JSON response by `handle`. */
export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/** Flattens a Zod validation error into one readable sentence. */
function zodMessage(issues: ZodIssue[]): string {
  const first = issues[0];
  if (!first) return "Invalid request body.";
  const path = first.path.length > 0 ? `\`${first.path.join(".")}\`` : "body";
  const detail =
    first.code === "too_small"
      ? `${path} is too short`
      : first.code === "too_big"
        ? `${path} is too long`
        : `${path} is invalid`;
  return `Validation failed: ${detail} (${first.message}).`;
}

/**
 * Wraps a route handler so thrown HttpErrors become clean JSON responses.
 * Zod validation failures (client input) map to 422 VALIDATION_FAILED —
 * they must never surface as 500s.
 */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.status, err.code, err.message);
    }
    if (err instanceof ZodError) {
      return fail(422, "VALIDATION_FAILED", zodMessage(err.issues));
    }
    console.error("[api] unhandled error:", err);
    return fail(500, "INTERNAL", "Something went wrong. Please try again.");
  }
}

export function query(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body must be valid JSON.");
  }
}
