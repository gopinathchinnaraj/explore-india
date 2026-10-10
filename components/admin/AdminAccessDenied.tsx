"use client";

import { useState } from "react";
import { ShieldAlert, LogOut, ArrowLeft, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";

interface AdminAccessDeniedProps {
  userEmail?: string | null;
}

export default function AdminAccessDenied({ userEmail }: AdminAccessDeniedProps) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      window.location.reload();
    } catch (err) {
      console.error("Sign out error:", err);
      window.location.reload();
    }
  };

  return (
    <div className="admin-denied-root">
      <div className="admin-denied-card" role="alert">
        <div className="admin-denied-icon-wrap">
          <ShieldAlert size={40} className="admin-denied-icon" />
        </div>
        <h1 className="admin-denied-title">Access Denied</h1>
        <p className="admin-denied-msg">
          You are signed in as{" "}
          <strong className="admin-denied-email">{userEmail || "an unauthorized user"}</strong>,
          but this account does not have administrator privileges to access the Explore India Admin Panel.
        </p>
        <div className="admin-denied-actions">
          <a href="/" className="admin-btn-secondary">
            <ArrowLeft size={14} />
            Return to Live Site
          </a>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="admin-btn-primary"
            id="admin-switch-account-btn"
          >
            {signingOut ? (
              <>
                <Loader2 size={14} className="admin-spinner" />
                Signing out…
              </>
            ) : (
              <>
                <LogOut size={14} />
                Sign Out &amp; Switch
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        .admin-denied-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0f1a;
          color: #f1f5f9;
          font-family: var(--font-sans, "Inter", system-ui, sans-serif);
          padding: 24px;
        }

        .admin-denied-card {
          background: #0d1525;
          border: 1px solid #1e2d45;
          border-radius: 16px;
          padding: 36px 32px;
          max-width: 460px;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        }

        .admin-denied-icon-wrap {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #f87171;
        }

        .admin-denied-title {
          font-family: var(--font-display, "Plus Jakarta Sans", system-ui, sans-serif);
          font-size: 22px;
          font-weight: 800;
          margin-bottom: 12px;
          color: #f87171;
          letter-spacing: -0.3px;
        }

        .admin-denied-msg {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .admin-denied-email {
          color: #f1f5f9;
        }

        .admin-denied-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .admin-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #16a34a, #0ea5e9);
          border: none;
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .admin-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(22, 163, 74, 0.35);
        }

        .admin-btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .admin-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: #1e2d45;
          color: #cbd5e1;
          border-radius: 8px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: all 150ms ease;
        }

        .admin-btn-secondary:hover {
          background: #283955;
          color: white;
        }

        .admin-spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
