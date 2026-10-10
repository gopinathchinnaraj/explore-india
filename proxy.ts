import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 proxy convention
// Normal users browse completely without auth.
// Legacy /auth/sign-in and /auth/sign-up requests are redirected to /admin.
export default async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/auth/sign-in") || pathname.startsWith("/auth/sign-up")) {
    const redirectTo = searchParams.get("redirectTo") || "/admin";
    return NextResponse.redirect(new URL(redirectTo.startsWith("/admin") ? redirectTo : "/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*"],
};
