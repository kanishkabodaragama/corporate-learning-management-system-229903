import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { DEFAULT_ROLE, getRoleFromUserMetadata, normalizeRole } from "./roles";

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

async function loadRoleFromProfilesOrMetadata({
  user,
  createAttemptedRef,
  setIsProfilesTableMissing,
}) {
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
 * Exposes:
 * - user, session
 * - isSessionLoading (initial session check)
 * - isAuthActionLoading (during sign-in/sign-up/sign-out)
 * - role (admin/instructor/learner)
 * - roleSource ("profiles" | "metadata" | "default")
 * - isRoleLoading
 * - roleLoadError
 * - isProfilesTableMissing
 * - refreshRole()
 * - signUp(email, password)
 * - signIn(email, password)
 * - signOut()
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  // "Loading while checking session" requirement
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // UX: disable buttons while performing auth actions
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);

  // RBAC state
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [roleSource, setRoleSource] = useState("default"); // "profiles" | "metadata" | "default"
  const [profile, setProfile] = useState(null);
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [roleLoadError, setRoleLoadError] = useState(null);
  const [isProfilesTableMissing, setIsProfilesTableMissing] = useState(false);

  // Ensure we only try "create profiles table" once per session (best-effort).
  const createAttemptedRef = useRef(false);

  const refreshRole = useCallback(async (targetUser) => {
    if (!targetUser?.id) {
      setRole(DEFAULT_ROLE);
      setRoleSource("default");
      setProfile(null);
      setRoleLoadError(null);
      setIsRoleLoading(false);
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
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      setIsSessionLoading(true);
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
  }, [refreshRole]);

  const signIn = useCallback(async (email, password) => {
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
  }, []);

  const signUp = useCallback(async (email, password) => {
    setIsAuthActionLoading(true);
    try {
      const emailRedirectTo =
        process.env.REACT_APP_FRONTEND_URL ||
        (typeof window !== "undefined" ? window.location.origin : undefined);

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
  }, []);

  const signOut = useCallback(async () => {
    setIsAuthActionLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) return { error: formatAuthError(error) };
      return { error: null };
    } catch (err) {
      return { error: formatAuthError(err) };
    } finally {
      setIsAuthActionLoading(false);
    }
  }, []);

  const value = useMemo(() => {
    return {
      session,
      user,
      isSessionLoading,
      isAuthActionLoading,

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
      signOut,
    };
  }, [
    session,
    user,
    isSessionLoading,
    isAuthActionLoading,
    role,
    roleSource,
    profile,
    isRoleLoading,
    roleLoadError,
    isProfilesTableMissing,
    refreshRole,
    signIn,
    signUp,
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
 *
 *  role: "admin" | "instructor" | "learner",
 *  roleSource: "profiles" | "metadata" | "default",
 *  profile: any,
 *  isRoleLoading: boolean,
 *  roleLoadError: string | null,
 *  isProfilesTableMissing: boolean,
 *  refreshRole: () => Promise<void>,
 *
 *  signIn: (email: string, password: string) => Promise<{data: any, error: string|null}>,
 *  signUp: (email: string, password: string) => Promise<{data: any, error: string|null}>,
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
