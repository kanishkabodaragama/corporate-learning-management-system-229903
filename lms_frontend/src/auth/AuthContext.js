import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { DEFAULT_ROLE, getRoleFromUserMetadata, normalizeRole } from "./roles";
import { DEMO_SESSION_STORAGE_KEY, findDemoAccount, isDemoModeEnabled } from "./demoMode";

const AuthContext = createContext(null);

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

async function loadRoleFromProfilesOrMetadata({ user, createAttemptedRef, setIsProfilesTableMissing }) {
  // 1) Prefer profiles table
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

    // No row yet: attempt to create (may fail due to RLS / missing table)
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, role: DEFAULT_ROLE }, { onConflict: "id" });

    if (!upsertError) {
      return { role: DEFAULT_ROLE, roleSource: "profiles", profile: { id: user.id, role: DEFAULT_ROLE } };
    }

    // If profiles exists but we can't write, still fall back
  } catch (_err) {
    // fall through to metadata/default
  }

  // 2) Fallback: auth metadata (app_metadata/user_metadata)
  const metaRole = getRoleFromUserMetadata(user);
  if (metaRole) return { role: metaRole, roleSource: "metadata", profile: null };

  // 3) Default
  return { role: DEFAULT_ROLE, roleSource: "default", profile: null };
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
 * - roleSource ("profiles" | "metadata" | "default" | "demo")
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

      try {
        const result = await loadRoleFromProfilesOrMetadata({
          user: targetUser,
          createAttemptedRef,
          setIsProfilesTableMissing,
        });
        setRole(result.role);
        setRoleSource(result.roleSource);
        setProfile(result.profile);
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

    async function loadInitialSession() {
      setIsSessionLoading(true);

      // Demo Mode: bootstrap ONLY from localStorage demo session.
      if (demoModeEnabled) {
        const demoUser = loadDemoUserFromStorage();

        if (!isMounted) return;

        if (demoUser) {
          setSession({ user: demoUser, access_token: "demo" });
          setUser(demoUser);
          await refreshRole(demoUser);
        } else {
          setSession(null);
          setUser(null);
          await refreshRole(null);
        }

        setIsSessionLoading(false);
        return;
      }

      // Non-demo: if a demo session was left behind, clear it (safety/cleanliness).
      clearDemoSessionFromStorage();

      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[Auth] getSession error:", error);
      }

      const nextSession = data?.session ?? null;
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      setIsSessionLoading(false);

      if (nextUser) {
        await refreshRole(nextUser);
      } else {
        await refreshRole(null);
      }
    }

    loadInitialSession();

    // Demo Mode: do NOT register Supabase auth listeners.
    if (demoModeEnabled) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;

      const nextUser = nextSession?.user ?? null;
      setSession(nextSession ?? null);
      setUser(nextUser);
      setIsSessionLoading(false);

      if (nextUser) {
        await refreshRole(nextUser);
      } else {
        await refreshRole(null);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
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

      // Demo Mode: do not call Supabase at all.
      if (demoModeEnabled || String(user?.id || "").startsWith("demo-")) {
        setSession(null);
        setUser(null);
        await refreshRole(null);
        return { error: null };
      }

      const { error } = await supabase.auth.signOut();
      if (error) return { error: formatAuthError(error) };
      return { error: null };
    } catch (err) {
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
