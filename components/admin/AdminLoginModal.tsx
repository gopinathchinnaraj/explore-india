"use client";

import { useState } from "react";
import { Compass, Mail, Lock, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";

export default function AdminLoginModal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email: trimmedEmail,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Invalid email or password");
        setLoading(false);
        return;
      }

      // Success: reload the current page so server-side AdminLayout verifies the session
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="admin-title">
        {/* Brand header */}
        <div className="admin-modal-header">
          <div className="admin-logo-badge">
            <Compass size={22} color="white" strokeWidth={2.5} />
          </div>
          <h1 id="admin-title" className="admin-brand-name">
            Explore India
          </h1>
          <div className="admin-pill-badge">Admin Access</div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="admin-modal-alert" role="alert">
            <AlertCircle size={16} className="admin-alert-icon" />
            <span>{error}</span>
          </div>
        )}

        {/* Minimal admin login form: Email, Password, Sign In */}
        <form onSubmit={handleSubmit} className="admin-modal-form" noValidate>
          <div className="admin-field">
            <label htmlFor="admin-email" className="admin-label">
              Email
            </label>
            <div className="admin-input-wrapper">
              <Mail size={16} className="admin-input-icon" aria-hidden="true" />
              <input
                id="admin-email"
                type="email"
                placeholder="admin@gosomewhere.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={loading}
                className="admin-input"
              />
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="admin-password" className="admin-label">
              Password
            </label>
            <div className="admin-input-wrapper">
              <Lock size={16} className="admin-input-icon" aria-hidden="true" />
              <input
                id="admin-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
                className="admin-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="admin-submit-btn"
            id="admin-signin-btn"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="admin-spinner" />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="admin-modal-footer">
          <a href="/" className="admin-return-link">
            ← Return to Explore India
          </a>
        </div>
      </div>

      <style jsx>{`
        .admin-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background-color: #0a0f1a;
          background-image: 
            radial-gradient(circle at 50% 30%, rgba(22, 163, 74, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 50% 80%, rgba(14, 165, 233, 0.08) 0%, transparent 60%);
          font-family: var(--font-sans, "Inter", system-ui, sans-serif);
        }

        .admin-modal-card {
          width: 100%;
          max-width: 380px;
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 16px;
          padding: 32px 28px;
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.7),
            0 0 0 1px rgba(255, 255, 255, 0.05);
          animation: modalAppear 200ms ease-out;
        }

        @keyframes modalAppear {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .admin-modal-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 24px;
        }

        .admin-logo-badge {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          background: linear-gradient(135deg, #16a34a 0%, #0ea5e9 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35);
          margin-bottom: 12px;
        }

        .admin-brand-name {
          font-family: var(--font-display, "Plus Jakarta Sans", system-ui, sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: #f8fafc;
          letter-spacing: -0.5px;
          margin: 0 0 6px 0;
        }

        .admin-pill-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: #4ade80;
          background: rgba(22, 163, 74, 0.14);
          border: 1px solid rgba(22, 163, 74, 0.3);
          padding: 3px 10px;
          border-radius: 999px;
        }

        .admin-modal-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          margin-bottom: 18px;
        }

        .admin-alert-icon {
          flex-shrink: 0;
        }

        .admin-modal-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .admin-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .admin-label {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
          text-align: left;
        }

        .admin-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .admin-input-icon {
          position: absolute;
          left: 12px;
          color: #64748b;
          pointer-events: none;
        }

        .admin-input {
          width: 100%;
          background: #0b1120;
          border: 1px solid #1e293b;
          border-radius: 10px;
          padding: 10px 12px 10px 38px;
          color: #f8fafc;
          font-size: 14px;
          outline: none;
          transition: all 150ms ease;
          font-family: inherit;
        }

        .admin-input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }

        .admin-input::placeholder {
          color: #475569;
        }

        .admin-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .admin-submit-btn {
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 11px 16px;
          border-radius: 10px;
          background: linear-gradient(135deg, #16a34a, #0ea5e9);
          border: none;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms ease;
          box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35);
        }

        .admin-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(22, 163, 74, 0.45);
        }

        .admin-submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
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

        .admin-modal-footer {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid #1e293b;
          text-align: center;
        }

        .admin-return-link {
          font-size: 12px;
          color: #64748b;
          text-decoration: none;
          transition: color 150ms ease;
        }

        .admin-return-link:hover {
          color: #94a3b8;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
