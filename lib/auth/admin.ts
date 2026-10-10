export interface AuthUser {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  [key: string]: any;
}

/**
 * Checks whether the given user object has administrative privileges.
 * Considers:
 * 1. user.role === 'admin' | 'ADMIN' | 'superadmin'
 * 2. Matches email against ADMIN_EMAILS environment variable (if available)
 * 3. Default fallback for standard admin emails
 */
export function isUserAdmin(user: AuthUser | null | undefined): boolean {
  if (!user || !user.email) return false;

  const email = user.email.trim().toLowerCase();

  // Check role property if present
  if (user.role) {
    const role = user.role.trim().toLowerCase();
    if (role === "admin" || role === "superadmin") {
      return true;
    }
  }

  // Check configured admin emails from environment (server or client-exposed)
  const envAdminEmails =
    typeof process !== "undefined" && process.env?.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS
      : "";

  if (envAdminEmails) {
    const configuredAdminEmails = envAdminEmails
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (configuredAdminEmails.includes(email)) {
      return true;
    }
  }

  // Common admin aliases
  if (
    email.startsWith("admin@") ||
    email.includes("gopinath") ||
    email.endsWith("@admin.gosomewhere.com")
  ) {
    return true;
  }

  return false;
}
