import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { DEFAULT_ROLE, normalizeRole } from "./roles";
import { DEMO_SESSION_STORAGE_KEY, findDemoAccount, isDemoModeEnabled } from "./demoMode";

const AuthContext = createContext(null);

/**
 * Supabase's `auth.getSession()` is usually fast (localStorage-based), but in misconfigured
 * environments it may hang or throw. Keep the UX responsive by enforcing a finite timeout.
 */
const AUTH_INIT_TIMEOUT_MS = 2500;

function formatAuthError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Authentication error";
}

function isMissingProfilesTableError(err) {
  const code = err?.code;
  const msg = String(err?.message || "");
  // Postgres: relation does not exist => 42P01
  return code === "42P01" || /relation .*profiles.* does not exist/i.test(msg);
}

function formatRoleLoadError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Failed to load role";
}

function safeLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_err) {
    return null;
  }
}

function loadDemoUserFromStorage() {
  const ls = safeLocalStorage();
  if (!ls) return null;

  try {
    const raw = ls.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const u = parsed?.user;

    // Keep the shape intentionally small: { id, email, role }
    if (!u?.id || !u?.email || !u?.role) return null;
    return { id: String(u.id), email: String(u.email), role: normalizeRole(u.role) };
  } catch (_err) {
    return null;
  }
}

function persistDemoUserToStorage(user) {
  const ls = safeLocalStorage();
  if (!ls) return;

  try {
    ls.setItem(
      DEMO_SESSION_STORAGE_KEY,
      JSON.stringify({
        user: { id: user.id, email: user.email, role: user.role },
        createdAt: new Date().toISOString(),
      })
    );
  } catch (_err) {
    // ignore
  }
}

function clearDemoSessionFromStorage() {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(DEMO_SESSION_STORAGE_KEY);
  } catch (_err) {
    // ignore
  }
}

/**
 * Best-effort cleanup for Supabase auth persistence keys in localStorage.
 * Supabase JS v2 commonly uses keys like:
 * - sb-<project-ref>-auth-token
 * - sb-<project-ref>-auth-token-code-verifier
 *
 * This is defensive: signOut() should remove these, but we also clean up to ensure
 * a reliable logout UX even if the remote call fails.
 */
function clearSupabaseAuthStorage() {
  const ls = safeLocalStorage();
  if (!ls) return;

  try {
    const keysToRemove = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (!key) continue;

      // Covers `sb-<ref>-auth-token` and `sb-<ref>-auth-token-code-verifier`.
      if (/^sb-.*-auth-token/i.test(key)) {
        keysToRemove.push(key);
      }

      // Older key used by some versions/tooling.
      if (key === "supabase.auth.token") {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => ls.removeItem(k));
  } catch (_err) {
    // ignore
  }
}

async function tryCreateProfilesTableViaRpcOnce(createAttemptedRef) {
  if (createAttemptedRef.current) return false;
  createAttemptedRef.current = true;

  // Best-effort: only works if the Supabase project provides a SQL-execution RPC.
  // This is NOT standard for Supabase and will gracefully fail in normal setups.
  const sql = `
    create table if not exists public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      role text not null default 'learner' check (role in ('admin', 'instructor', 'learner')),
      created_at timestamptz not null default now()
    );
  `.trim();

  const candidates = ["exec_sql", "execute_sql", "run_sql", "sql"];

  for (const fn of candidates) {
    try {
      const { error } = await supabase.rpc(fn, { sql });
      if (!error) {
        // eslint-disable-next-line no-console
        console.info(`[RBAC] Created profiles table via RPC function '${fn}'.`);
        return true;
      }
      // Function missing often returns PostgREST codes like PGRST202.
      // Keep trying other candidates; otherwise bail out quietly.
      const msg = String(error?.message || "");
      if (error?.code === "PGRST202" || /Could not find the function/i.test(msg)) {
        continue;
      }
      return false;
    } catch (_err) {
      // Ignore and try next
    }
  }

  return false;
}

async function ensureProfileRowExists({ user, createAttemptedRef, setIsProfilesTableMissing }) {
  /**
   * Ensures there is a `profiles` row for this user.
   * IMPORTANT: We never auto-elevate; we only insert the safe default role (learner) if missing.
   *
   * This function is best-effort and must not prevent login if it fails (e.g., due to RLS).
   */
  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, role: DEFAULT_ROLE }, { onConflict: "id" });

    if (error && isMissingProfilesTableError(error)) {
      setIsProfilesTableMissing(true);
      await tryCreateProfilesTableViaRpcOnce(createAttemptedRef);
    }
  } catch (_err) {
    // Non-fatal; role load will still attempt to read.
  }
}

async function loadRoleFromProfilesOnly({ user, createAttemptedRef, setIsProfilesTableMissing }) {
  /**
   * Loads role strictly from the `profiles` table.
   * Requirement: when real Supabase auth is in use, bypass demo completely and remove
   * demo/metadata fallback behavior.
   *
   * If profile is missing, we attempt to create it with DEFAULT_ROLE and then return DEFAULT_ROLE.
   */
  try {
    const { data, error } = await supabase.from("profiles").select("id, role").eq("id", user.id).limit(1);

    if (error) {
      if (isMissingProfilesTableError(error)) {
        setIsProfilesTableMissing(true);
        await tryCreateProfilesTableViaRpcOnce(createAttemptedRef);
      }
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (row?.role) {
      return { role: normalizeRole(row.role), roleSource: "profiles", profile: row };
    }

    // No row yet: attempt to create default row (may fail due to RLS, but should be allowed by policy).
    await ensureProfileRowExists({ user, createAttemptedRef, setIsProfilesTableMissing });
    return { role: DEFAULT_ROLE, roleSource: "profiles", profile: { id: user.id, role: DEFAULT_ROLE } };
  } catch (err) {
    // Non-fatal; default to learner for safety, but keep error for diagnostics.
    return { role: DEFAULT_ROLE, roleSource: "default", profile: null, error: err };
  }
}

// PUBLIC_INTERFACE
/**
 * Auth provider for Supabase authentication + RBAC role loading.
 *
 * Demo Mode:
 * - When enabled (REACT_APP_DEMO_MODE=true AND not production), the app supports a local-only demo session:
 *   - demoSignIn(email,password) validates against predefined demo credentials
 *   - sets a synthetic user object and persists it in localStorage
 *   - Supabase auth is NOT called at all (no getSession/onAuthStateChange/signIn/signUp).
 *
 * Exposes:
 * - user, session
 * - isSessionLoading (initial session check)
 * - isAuthActionLoading (during sign-in/sign-up/sign-out)
 * - role (admin/instructor/learner)
 * - roleSource ("profiles" | "default" | "demo")
 * - isRoleLoading
 * - roleLoadError
 * - isProfilesTableMissing
 * - refreshRole()
 * - signUp(email, password)
 * - signIn(email, password)
 * - demoSignIn(email, password)
 * - signOut()
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export function AuthProvider({ children }) {
  const demoModeEnabled = isDemoModeEnabled();

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // "Loading while checking session" requirement
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // UX: disable buttons while performing auth actions
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);

  // RBAC state
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [roleSource, setRoleSource] = useState("default"); // "profiles" | "metadata" | "default" | "demo"
  const [profile, setProfile] = useState(null);
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [roleLoadError, setRoleLoadError] = useState(null);
  const [isProfilesTableMissing, setIsProfilesTableMissing] = useState(false);

  // Ensure we only try "create profiles table" once per session (best-effort).
  const createAttemptedRef = useRef(false);

  const refreshRole = useCallback(
    async (targetUser) => {
      if (!targetUser?.id) {
        setRole(DEFAULT_ROLE);
        setRoleSource("default");
        setProfile(null);
        setRoleLoadError(null);
        setIsRoleLoading(false);
        setIsProfilesTableMissing(false);
        return;
      }

      // Demo Mode: role comes from the synthetic user object, never from Supabase.
      if (demoModeEnabled && String(targetUser.id).startsWith("demo-")) {
        setIsRoleLoading(false);
        setRoleLoadError(null);
        setIsProfilesTableMissing(false);
        setProfile(null);
        setRole(normalizeRole(targetUser.role));
        setRoleSource("demo");
        return;
      }

      setIsRoleLoading(true);
      setRoleLoadError(null);

      // Supabase auth active path: role must come from DB.
      try {
        await ensureProfileRowExists({
          user: targetUser,
          createAttemptedRef,
          setIsProfilesTableMissing,
        });

        const result = await loadRoleFromProfilesOnly({
          user: targetUser,
          createAttemptedRef,
          setIsProfilesTableMissing,
        });

        setRole(result.role);
        setRoleSource(result.roleSource);
        setProfile(result.profile);

        if (result.error) {
          setRoleLoadError(formatRoleLoadError(result.error));
        }
      } catch (err) {
        // Non-fatal; default to learner for safety.
        setRole(DEFAULT_ROLE);
        setRoleSource("default");
        setProfile(null);
        setRoleLoadError(formatRoleLoadError(err));
      } finally {
        setIsRoleLoading(false);
      }
    },
    [demoModeEnabled]
  );

  useEffect(() => {
    let isMounted = true;

    async function getSessionWithTimeout(timeoutMs) {
      let timeoutId;
      try {
        const timeoutPromise = new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            resolve({
              data: { session: null },
              // Shape is "Supabase-like" but we treat it as best-effort.
              error: { message: `Auth session check timed out after ${timeoutMs}ms.`, __isTimeout: true },
            });
          }, timeoutMs);
        });

        // Guard against `getSession()` hanging; whichever resolves first wins.
        return await Promise.race([supabase.auth.getSession(), timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    async function loadInitialSession() {
      setIsSessionLoading(true);

      try {
        // Demo Mode: bootstrap ONLY from localStorage demo session.
        if (demoModeEnabled) {
          const demoUser = loadDemoUserFromStorage();

          if (!isMounted) return;

          if (demoUser) {
            setSession({ user: demoUser, access_token: "demo" });
            setUser(demoUser);
            void refreshRole(demoUser);
          } else {
            setSession(null);
            setUser(null);
            void refreshRole(null);
          }

          return;
        }

        // Non-demo: if a demo session was left behind, clear it (safety/cleanliness).
        clearDemoSessionFromStorage();

        // If Supabase isn't configured, don't attempt Supabase auth bootstrapping.
        // This avoids confusing "infinite loading" when env vars are missing.
        if (!isSupabaseConfigured) {
          setSession(null);
          setUser(null);
          void refreshRole(null);
          return;
        }

        const { data, error } = await getSessionWithTimeout(AUTH_INIT_TIMEOUT_MS);

        if (!isMounted) return;

        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[Auth] getSession issue:", error);
        }

        const nextSession = data?.session ?? null;
        const nextUser = nextSession?.user ?? null;

        setSession(nextSession);
        setUser(nextUser);

        // Do not block the session-loading flip on role lookups/network.
        void refreshRole(nextUser);
      } catch (err) {
        if (!isMounted) return;

        // eslint-disable-next-line no-console
        console.error("[Auth] Failed to bootstrap session:", err);

        setSession(null);
        setUser(null);
        void refreshRole(null);
      } finally {
        if (isMounted) setIsSessionLoading(false);
      }
    }

    loadInitialSession();

    // Demo Mode or missing Supabase env: do NOT register Supabase auth listeners.
    if (demoModeEnabled || !isSupabaseConfigured) {
      return () => {
        isMounted = false;
      };
    }

    let subscription;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!isMounted) return;

        const nextUser = nextSession?.user ?? null;
        setSession(nextSession ?? null);
        setUser(nextUser);

        // Ensure route guards can proceed promptly.
        setIsSessionLoading(false);

        // Best-effort role refresh (never block rendering).
        void refreshRole(nextUser);
      });

      subscription = data?.subscription;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[Auth] Failed to register onAuthStateChange listener:", err);
    }

    return () => {
      isMounted = false;
      subscription?.unsubscribe?.();
    };
  }, [refreshRole, demoModeEnabled]);

  const demoSignIn = useCallback(
    async (email, password) => {
      if (!demoModeEnabled) {
        return { data: null, error: "Demo Mode is disabled." };
      }

      setIsAuthActionLoading(true);
      try {
        const hit = findDemoAccount(email, password);
        if (!hit) {
          return { data: null, error: "Invalid demo credentials." };
        }

        const demoUser = {
          id: `demo-${hit.role}`,
          email: hit.email,
          role: hit.role,
        };

        // Persist so refresh keeps the session.
        persistDemoUserToStorage(demoUser);

        // Set synthetic session/user for the rest of the app.
        setSession({ user: demoUser, access_token: "demo" });
        setUser(demoUser);

        // RBAC state (no Supabase calls).
        setRole(normalizeRole(hit.role));
        setRoleSource("demo");
        setProfile(null);
        setIsRoleLoading(false);
        setRoleLoadError(null);
        setIsProfilesTableMissing(false);

        // Ensure ProtectedRoute doesn't show the "Loading session" UI after demo sign-in.
        setIsSessionLoading(false);

        return { data: { user: demoUser }, error: null };
      } catch (err) {
        return { data: null, error: formatAuthError(err) };
      } finally {
        setIsAuthActionLoading(false);
      }
    },
    [demoModeEnabled]
  );

  const signIn = useCallback(
    async (email, password) => {
      // Safety: never call Supabase sign-in when demo mode is active.
      if (demoModeEnabled) {
        return { data: null, error: "Demo Mode is enabled. Use one of the demo accounts to sign in." };
      }

      setIsAuthActionLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { data: null, error: formatAuthError(error) };
        return { data, error: null };
      } catch (err) {
        return { data: null, error: formatAuthError(err) };
      } finally {
        setIsAuthActionLoading(false);
      }
    },
    [demoModeEnabled]
  );

  const signUp = useCallback(
    async (email, password) => {
      // Safety: keep demo mode strictly local-only.
      if (demoModeEnabled) {
        return { data: null, error: "Sign up is disabled in Demo Mode." };
      }

      setIsAuthActionLoading(true);
      try {
        const emailRedirectTo =
          process.env.REACT_APP_FRONTEND_URL || (typeof window !== "undefined" ? window.location.origin : undefined);

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });

        if (error) return { data: null, error: formatAuthError(error) };

        // Best-effort: create a default profile row if allowed (will be blocked if RLS forbids it,
        // or if email-confirmation results in no session yet).
        const createdUser = data?.user;
        if (createdUser?.id) {
          try {
            await supabase.from("profiles").upsert({ id: createdUser.id, role: DEFAULT_ROLE }, { onConflict: "id" });
          } catch (_err) {
            // Ignore; app still functions with metadata/default role.
          }
        }

        return { data, error: null };
      } catch (err) {
        return { data: null, error: formatAuthError(err) };
      } finally {
        setIsAuthActionLoading(false);
      }
    },
    [demoModeEnabled]
  );

  const signOut = useCallback(async () => {
    setIsAuthActionLoading(true);
    try {
      // Always clear any demo session (safe in all modes).
      clearDemoSessionFromStorage();

      // IMPORTANT:
      // Clear in-memory auth state immediately so navigation to /login cannot bounce back
      // due to LoginPage seeing a still-authenticated user.
      setSession(null);
      setUser(null);
      setIsSessionLoading(false);
      await refreshRole(null);

      // Demo Mode: do not call Supabase at all.
      if (demoModeEnabled || String(user?.id || "").startsWith("demo-")) {
        clearSupabaseAuthStorage();
        return { error: null };
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        // Best-effort local cleanup to avoid resurrecting sessions from storage.
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch (_err) {
          // ignore
        }
        clearSupabaseAuthStorage();

        // eslint-disable-next-line no-console
        console.warn("[Auth] signOut error:", error);
        return { error: formatAuthError(error) };
      }

      return { error: null };
    } catch (err) {
      // If remote signOut fails, still try to remove local persistence.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (_err) {
        // ignore
      }
      clearSupabaseAuthStorage();

      // eslint-disable-next-line no-console
      console.warn("[Auth] signOut exception:", err);
      return { error: formatAuthError(err) };
    } finally {
      setIsAuthActionLoading(false);
    }
  }, [demoModeEnabled, refreshRole, user?.id]);

  const value = useMemo(() => {
    return {
      session,
      user,
      isSessionLoading,
      isAuthActionLoading,

      // Demo mode indicator (useful for UI)
      isDemoModeEnabled: demoModeEnabled,

      // RBAC
      role,
      roleSource,
      profile,
      isRoleLoading,
      roleLoadError,
      isProfilesTableMissing,
      refreshRole: () => refreshRole(user),

      // Auth actions
      signIn,
      signUp,
      demoSignIn,
      signOut,
    };
  }, [
    session,
    user,
    isSessionLoading,
    isAuthActionLoading,
    demoModeEnabled,
    role,
    roleSource,
    profile,
    isRoleLoading,
    roleLoadError,
    isProfilesTableMissing,
    refreshRole,
    signIn,
    signUp,
    demoSignIn,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// PUBLIC_INTERFACE
/**
 * Hook to access auth state/actions from AuthProvider.
 *
 * @returns {{
 *  session: any,
 *  user: any,
 *  isSessionLoading: boolean,
 *  isAuthActionLoading: boolean,
 *  isDemoModeEnabled: boolean,
 *
 *  role: "admin" | "instructor" | "learner",
 *  roleSource: "profiles" | "metadata" | "default" | "demo",
 *  profile: any,
 *  isRoleLoading: boolean,
 *  roleLoadError: string | null,
 *  isProfilesTableMissing: boolean,
 *  refreshRole: () => Promise<void>,
 *
 *  signIn: (email: string, password: string) => Promise<{data: any, error: string|null}>,
 *  signUp: (email: string, password: string) => Promise<{data: any, error: string|null}>,
 *  demoSignIn: (email: string, password: string) => Promise<{data: any, error: string|null}>,
 *  signOut: () => Promise<{error: string|null}>,
 * }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
