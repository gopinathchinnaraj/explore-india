"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";

function initials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 && name ? parts[1][0] : "")).toUpperCase();
}

export default function AccountMenu() {
  const { data, isPending } = authClient.useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isPending) return <span className="gs-account-skel" aria-hidden="true" />;

  const user = data?.user;
  if (!user) {
    const href = pathname && pathname !== "/" ? `/auth/sign-in?redirectTo=${encodeURIComponent(pathname)}` : "/auth/sign-in";
    return (
      <Link href={href} className="gs-btn gs-btn-ghost" title="Sign in or create an account">
        <LogIn size={16} />
        <span className="label">Sign in</span>
      </Link>
    );
  }

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  };

  return (
    <div className="gs-account" ref={boxRef}>
      <button
        className={`gs-account-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name || user.email}`}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="gs-account-avatar" referrerPolicy="no-referrer" />
        ) : (
          <span className="gs-account-avatar">{initials(user.name, user.email)}</span>
        )}
      </button>

      {open && (
        <div className="gs-account-menu" role="menu">
          <div className="gs-account-info">
            <div className="gs-account-name">{user.name || "Explorer"}</div>
            <div className="gs-account-email">{user.email}</div>
          </div>
          <div className="gs-account-sep" />
          <button className="gs-account-item" role="menuitem" onClick={onSignOut} disabled={signingOut}>
            {signingOut ? <Loader2 size={15} className="gs-account-spin" /> : <LogOut size={15} />}
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
