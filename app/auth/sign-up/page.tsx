import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth/AuthForm";
import { getCurrentUser } from "@/lib/auth/server";
import { safeRedirect } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Create your account — Explore India" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const redirectTo = safeRedirect((await searchParams).redirectTo);
  if (await getCurrentUser()) redirect(redirectTo);
  return <AuthForm mode="sign-up" redirectTo={redirectTo} />;
}
