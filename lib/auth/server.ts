import { createNeonAuth } from "@neondatabase/auth/next/server";
import { isUserAdmin, type AuthUser } from "./admin";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    sessionDataTtl: 300,
  },
});

/** The signed-in visitor, or null. Never throws — auth outages just read as signed out. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const result = await auth.getSession();
    return (result?.data?.user as AuthUser | undefined) ?? null;
  } catch (error) {
    console.error("Error retrieving session:", error);
    return null;
  }
}

/**
 * Server-side helper to fetch current session and verify admin authorization.
 * Returns { authenticated, isAdmin, user, session }.
 */
export async function getAdminSession() {
  try {
    const result = await auth.getSession();
    const data = result?.data;
    const user = data?.user as AuthUser | undefined;

    if (!user) {
      return { authenticated: false, isAdmin: false, user: null, session: null };
    }

    const admin = isUserAdmin(user);
    return {
      authenticated: true,
      isAdmin: admin,
      user,
      session: data?.session ?? null,
    };
  } catch (error) {
    console.error("Error retrieving admin session:", error);
    return { authenticated: false, isAdmin: false, user: null, session: null };
  }
}
