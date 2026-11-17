export interface AuthUser {
  id?: string;
  email?: string | null;
  emailVerified?: boolean | null;
  name?: string | null;
  role?: string | null;
  [key: string]: unknown;
}

/**
 * Checks whether the given user object has administrative privileges.
 *
 * Visitors can sign up freely, so admin rights must never come from anything a
 * visitor controls at sign-up (such as the shape of their email address).
 * A user is an admin when either:
 * 1. their Neon Auth role is 'admin' or 'superadmin' (set server-side only), or
 * 2. their email is listed in ADMIN_EMAILS AND that email has been verified —
 *    otherwise anyone could register an unclaimed admin address and walk in.
 */
export function isUserAdmin(user: AuthUser | null | undefined): boolean {
  if (!user || !user.email) return false;

  if (user.role) {
    const role = user.role.trim().toLowerCase();
    if (role === "admin" || role === "superadmin") {
      return true;
    }
  }

  if (user.emailVerified !== true) return false;

  const email = user.email.trim().toLowerCase();
  const configuredAdminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return configuredAdminEmails.includes(email);
}
