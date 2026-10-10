import { NextResponse } from "next/server";
import { getAdminSession } from "./server";

/**
 * Validates that an incoming API request originates from an authenticated admin session.
 * Returns { authorized: true, user } if authorized,
 * or { authorized: false, response: NextResponse } ready to return from the route handler.
 */
export async function requireAdminApi() {
  const sessionResult = await getAdminSession();

  if (!sessionResult.authenticated) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Unauthorized: Authentication required" },
        { status: 401 }
      ),
    };
  }

  if (!sessionResult.isAdmin) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Forbidden: Administrator privileges required" },
        { status: 403 }
      ),
    };
  }

  return { authorized: true as const, user: sessionResult.user };
}

/**
 * For machine-triggered sync routes: allow an admin session, or a matching
 * x-sync-key header when SYNC_SECRET_KEY is configured. Never open by default.
 */
export async function requireAdminOrSyncKey(request: Request) {
  const secret = process.env.SYNC_SECRET_KEY;
  if (secret && request.headers.get("x-sync-key") === secret) {
    return { authorized: true as const, user: null };
  }
  return requireAdminApi();
}
