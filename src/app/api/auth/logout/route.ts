import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";

/**
 * POST /api/auth/logout — stateless JWT: the client discards its tokens.
 * Kept for API completeness / documentation.
 */
export async function POST(_req: NextRequest) {
  return handle(async () => ok({ success: true }));
}
