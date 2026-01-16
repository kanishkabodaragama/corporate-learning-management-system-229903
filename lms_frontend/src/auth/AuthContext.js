import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

function formatAuthError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Authentication error";
}

// PUBLIC_INTERFACE
/**
 * Auth provider for Supabase authentication.
 *
 * Exposes:
 * - user, session
 * - isSessionLoading (initial session check)
 * - isAuthActionLoading (during sign-in/sign-up/sign-out)
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

      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
      setIsSessionLoading(false);
    }

    loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setIsSessionLoading(false);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

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
      signIn,
      signUp,
      signOut,
    };
  }, [session, user, isSessionLoading, isAuthActionLoading, signIn, signUp, signOut]);

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
