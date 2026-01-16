import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { DEMO_ACCOUNTS, isDemoModeEnabled } from "../auth/demoMode";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

// PUBLIC_INTERFACE
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const demoModeEnabled = isDemoModeEnabled();

  const { signIn, signUp, demoSignIn, user, isSessionLoading, isAuthActionLoading } = useAuth();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const redirectTo = useMemo(() => {
    const from = location.state?.from?.pathname;
    return typeof from === "string" && from.length > 0 ? from : "/dashboard";
  }, [location.state]);

  useEffect(() => {
    // If already authenticated, skip the login screen.
    if (!isSessionLoading && user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, isSessionLoading, navigate, redirectTo]);

  // Prevent switching into sign-up mode while demo mode is active (keep demo strictly local-only).
  useEffect(() => {
    if (demoModeEnabled) setMode("signin");
  }, [demoModeEnabled]);

  const title = mode === "signin" ? "Sign in" : "Create account";
  const hint =
    mode === "signin"
      ? "Use your account to access the LMS."
      : "Create a new account to get started.";

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const normalizedEmail = safeTrim(email);
    const normalizedPassword = password;

    if (!normalizedEmail || !normalizedPassword) {
      setError("Please enter both email and password.");
      return;
    }

    // Demo Mode: local-only credential validation; never call Supabase.
    if (demoModeEnabled) {
      const { error: demoError } = await demoSignIn(normalizedEmail, normalizedPassword);
      if (demoError) {
        setError(demoError);
        return;
      }
      navigate(redirectTo, { replace: true });
      return;
    }

    // Normal mode: Supabase required
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY.");
      return;
    }

    if (mode === "signin") {
      const { error: signInError } = await signIn(normalizedEmail, normalizedPassword);
      if (signInError) {
        setError(signInError);
        return;
      }
      navigate(redirectTo, { replace: true });
      return;
    }

    const { data, error: signUpError } = await signUp(normalizedEmail, normalizedPassword);
    if (signUpError) {
      setError(signUpError);
      return;
    }

    // If email confirmation is enabled, session might be null.
    if (data?.session) {
      navigate(redirectTo, { replace: true });
      return;
    }

    setInfo("Account created. Please check your email to confirm, then sign in.");
    setMode("signin");
  }

  function onAutofill(account) {
    setError("");
    setInfo("");
    setMode("signin");
    setEmail(account.email);
    setPassword(account.password);
  }

  return (
    <div className="authWrap">
      <section className="authCard" aria-label="Login">
        <h1 className="authTitle">{title}</h1>
        <p className="authHint">{hint}</p>

        {demoModeEnabled ? (
          <div className="demoBanner" role="note" aria-label="Demo Mode accounts">
            <div className="demoBannerTitle">Demo Mode is enabled</div>
            <div className="demoBannerSub">
              Use one of the following demo accounts. These credentials are validated locally and are never sent to
              Supabase or any API.
            </div>

            <div className="demoAccounts">
              {DEMO_ACCOUNTS.map((a) => (
                <div key={a.email} className="demoAccountRow">
                  <div className="demoAccountMeta">
                    <div className="demoAccountRole">{a.label}</div>
                    <div className="demoAccountEmail">{a.email}</div>
                  </div>
                  <button
                    type="button"
                    className="button buttonSecondary"
                    onClick={() => onAutofill(a)}
                    disabled={isSessionLoading || isAuthActionLoading}
                    aria-label={`Use ${a.label} demo account`}
                  >
                    Autofill
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!demoModeEnabled && !isSupabaseConfigured ? (
          <div className="authWarning" role="note">
            Supabase env vars are missing. Authentication is disabled until
            <br />
            <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code> are set.
          </div>
        ) : null}

        {error ? (
          <div className="authError" role="alert">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="authInfo" role="status">
            {info}
          </div>
        ) : null}

        <form className="authForm" onSubmit={onSubmit}>
          <label className="authField">
            <span className="authLabel">Email</span>
            <input
              className="authInput"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={demoModeEnabled ? "admin@demo.lms" : "you@company.com"}
              disabled={isSessionLoading || isAuthActionLoading}
              required
            />
          </label>

          <label className="authField">
            <span className="authLabel">Password</span>
            <input
              className="authInput"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isSessionLoading || isAuthActionLoading}
              required
            />
          </label>

          <button
            type="submit"
            className="button buttonPrimary buttonFull"
            disabled={
              isSessionLoading ||
              isAuthActionLoading ||
              (!demoModeEnabled && !isSupabaseConfigured) ||
              (demoModeEnabled && mode !== "signin")
            }
          >
            {isAuthActionLoading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="authFooter">
          {demoModeEnabled ? (
            <p className="authHint" style={{ marginTop: 14 }}>
              Demo Mode is active — sign up is disabled.
            </p>
          ) : mode === "signin" ? (
            <p className="authHint" style={{ marginTop: 14 }}>
              No account?{" "}
              <button
                type="button"
                className="inlineButton"
                onClick={() => {
                  setError("");
                  setInfo("");
                  setMode("signup");
                }}
                disabled={isSessionLoading || isAuthActionLoading}
              >
                Create one
              </button>
            </p>
          ) : (
            <p className="authHint" style={{ marginTop: 14 }}>
              Already have an account?{" "}
              <button
                type="button"
                className="inlineButton"
                onClick={() => {
                  setError("");
                  setInfo("");
                  setMode("signin");
                }}
                disabled={isSessionLoading || isAuthActionLoading}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
