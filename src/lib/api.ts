import { NextResponse } from "next/server";

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

/** Wraps a route handler so thrown HttpErrors become clean JSON responses. */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.status, err.code, err.message);
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
