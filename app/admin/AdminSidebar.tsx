"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Telescope,
  RefreshCw,
  Globe,
  LogOut,
  Sun,
  Moon,
  Menu,
  Compass,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import type { AuthUser } from "@/lib/auth/admin";
import { ToastProvider } from "@/components/admin/ui";

import { readTheme, subscribeTheme, writeTheme } from "@/components/admin/theme";

export default function AdminShell({
  user,
  queueCount,
  children,
}: {
  user?: AuthUser | null;
  queueCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const [navOpen, setNavOpen] = useState(false);

  function toggleTheme() {
    writeTheme(theme === "dark" ? "light" : "dark");
  }

  async function handleSignOut() {
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } catch {
      router.replace("/");
    }
  }

  const nav = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/spots", label: "Spots", icon: MapPin },
    { href: "/admin/discovery", label: "Discovery", icon: Telescope, badge: queueCount },
    { href: "/admin/sync", label: "Data sync", icon: RefreshCw },
  ];

  const title = nav.find((n) => (n.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(n.href)))?.label;

  return (
    <div className={`adm ${navOpen ? "nav-open" : ""}`} data-theme={theme} suppressHydrationWarning>
      <ToastProvider>
        <div className="adm-shell">
          <aside className="adm-sidebar">
            <div className="adm-brand">
              <div className="adm-brand-mark">
                <Compass size={19} />
              </div>
              <div>
                <div className="adm-brand-name">Explore India</div>
                <div className="adm-brand-sub">Content admin</div>
              </div>
            </div>

            <nav className="adm-nav">
              <div className="adm-nav-label">Manage</div>
              {nav.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`adm-nav-item ${active ? "is-active" : ""}`} onClick={() => setNavOpen(false)}>
                    <Icon size={17} />
                    {item.label}
                    {item.badge ? <span className="adm-badge warn">{item.badge}</span> : null}
                  </Link>
                );
              })}
              <div className="adm-nav-label">Public</div>
              <a href="/" target="_blank" rel="noopener" className="adm-nav-item">
                <Globe size={17} />
                View live site
              </a>
            </nav>

            <div className="adm-sidebar-foot">
              {user && (
                <div className="adm-user">
                  <div className="adm-avatar">{(user.name?.[0] || user.email?.[0] || "A").toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="adm-user-email" title={user.email || ""}>
                      {user.email}
                    </div>
                    <div className="adm-user-role">Administrator</div>
                  </div>
                </div>
              )}
              <div className="adm-foot-row">
                <button className="adm-btn adm-btn-sm" style={{ flex: 1 }} onClick={toggleTheme} title="Toggle theme">
                  {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button className="adm-btn adm-btn-sm" style={{ flex: 1 }} onClick={handleSignOut}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          </aside>
          <div className="adm-scrim" onClick={() => setNavOpen(false)} />

          <main className="adm-main">
            <div className="adm-topbar">
              <button className="adm-btn adm-btn-ghost adm-icon-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
                <Menu size={18} />
              </button>
              <strong>{title || "Admin"}</strong>
            </div>
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
