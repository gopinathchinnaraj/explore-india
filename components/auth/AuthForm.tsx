"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Compass, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

const MIN_PASSWORD = 8;

function friendlyError(err: { code?: string; message?: string } | null | undefined, mode: Mode): string {
  switch (err?.code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in instead.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Check them and try again.";
    case "PASSWORD_TOO_SHORT":
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
  }
  return err?.message || (mode === "sign-up" ? "Couldn't create your account. Please try again." : "Couldn't sign you in. Please try again.");
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function AuthForm({ mode, redirectTo }: { mode: Mode; redirectTo: string }) {
  const isSignUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [error, setError] = useState<string | null>(null);

  const otherHref = `${isSignUp ? "/auth/sign-in" : "/auth/sign-up"}${redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`;

  // Full navigation so server components (e.g. /admin) read the fresh session cookie
  const finish = () => window.location.assign(redirectTo);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (isSignUp && !trimmedName) return setError("Tell us your name.");
    if (!trimmedEmail) return setError("Enter your email address.");
    if (!password) return setError("Enter your password.");
    if (isSignUp && password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);

    setBusy("email");
    try {
      const res = isSignUp
        ? await authClient.signUp.email({ name: trimmedName, email: trimmedEmail, password })
        : await authClient.signIn.email({ email: trimmedEmail, password });
      if (res.error) {
        setError(friendlyError(res.error, mode));
        setBusy(null);
        return;
      }
      finish();
    } catch {
      setError(friendlyError(null, mode));
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setBusy("google");
    try {
      const origin = window.location.origin;
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(redirectTo, origin).toString(),
        errorCallbackURL: new URL(`/auth/${mode}`, origin).toString(),
      });
      // On success the browser is already on its way to Google
      if (res?.error) {
        setError(res.error.message || "Couldn't start Google sign-in. Please try again.");
        setBusy(null);
      }
    } catch {
      setError("Couldn't start Google sign-in. Please try again.");
      setBusy(null);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-brand" aria-label="Explore India home">
          <span className="auth-brand-mark">
            <Compass size={20} strokeWidth={2.4} />
          </span>
          <span className="auth-brand-name">
            Explore <span>India</span>
          </span>
        </Link>

        <h1 className="auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-sub">
          {isSignUp ? "Save places and plan trips across India." : "Sign in to pick up where you left off."}
        </p>

        <button type="button" className="auth-google" onClick={onGoogle} disabled={busy !== null}>
          {busy === "google" ? <Loader2 size={18} className="auth-spin" /> : <GoogleIcon />}
          <span>Continue with Google</span>
        </button>

        <div className="auth-divider">
          <span>or with email</span>
        </div>

        {error && (
          <div className="auth-alert" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="auth-form" noValidate>
          {isSignUp && (
            <label className="auth-field">
              <span className="auth-label">Name</span>
              <span className="auth-input-wrap">
                <User size={16} aria-hidden="true" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Your name"
                  disabled={busy !== null}
                  autoFocus
                />
              </span>
            </label>
          )}

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <span className="auth-input-wrap">
              <Mail size={16} aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                disabled={busy !== null}
                autoFocus={!isSignUp}
              />
            </span>
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <span className="auth-input-wrap">
              <Lock size={16} aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder={isSignUp ? `At least ${MIN_PASSWORD} characters` : "Your password"}
                disabled={busy !== null}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <button type="submit" className="auth-submit" disabled={busy !== null}>
            {busy === "email" ? (
              <>
                <Loader2 size={16} className="auth-spin" />
                <span>{isSignUp ? "Creating account…" : "Signing in…"}</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? "Create account" : "Sign in"}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? "Already have an account?" : "New to Explore India?"}{" "}
          <Link href={otherHref}>{isSignUp ? "Sign in" : "Create an account"}</Link>
        </p>
      </div>
    </main>
  );
}
