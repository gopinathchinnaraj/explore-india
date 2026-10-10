import type { Metadata } from "next";
import { getAdminSession } from "@/lib/auth/server";
import prisma from "@/lib/db/prisma";
import AdminShell from "./AdminSidebar";
import { THEME_KEY } from "@/components/admin/theme";
import AdminLoginModal from "@/components/admin/AdminLoginModal";
import AdminAccessDenied from "@/components/admin/AdminAccessDenied";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore India Admin",
  description: "Admin dashboard for managing tourism spots, photos, videos, reviews, and discovery.",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authenticated, isAdmin, user } = await getAdminSession();

  // 1. If visitor is not authenticated, show the minimal Explore India admin login popup
  if (!authenticated) {
    return <AdminLoginModal />;
  }

  // 2. If authenticated but not authorized as an ADMIN, show access denied
  if (!isAdmin) {
    return <AdminAccessDenied userEmail={user?.email} />;
  }

  // 3. Fully authenticated and authorized administrator — render dashboard
  const queueCount = await prisma.spot
    .count({ where: { status: { in: ["DISCOVERED", "PENDING_REVIEW"] } } })
    .catch(() => 0);

  // Applies the saved theme as soon as the shell is parsed, before hydration, to avoid a flash
  const themeBoot = `try{var t=localStorage.getItem("${THEME_KEY}");var el=document.querySelector(".adm");if(t&&el)el.setAttribute("data-theme",t)}catch(e){}`;

  return (
    <>
      <AdminShell user={user} queueCount={queueCount}>
        {children}
      </AdminShell>
      <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
    </>
  );
}
