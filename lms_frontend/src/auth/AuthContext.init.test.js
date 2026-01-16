import React from "react";
import { act, render, screen } from "@testing-library/react";

/**
 * This test ensures AuthProvider never leaves the UI stuck in "Checking your session."
 * if Supabase session bootstrapping hangs for any reason.
 */

jest.mock("../lib/supabaseClient", () => {
  const unsubscribe = jest.fn();

  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        // Simulate a hung getSession() call (never resolves)
        getSession: jest.fn(() => new Promise(() => {})),
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe } } })),
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
      },
      from: jest.fn(),
      rpc: jest.fn(),
    },
  };
});

jest.mock("./demoMode", () => {
  return {
    DEMO_SESSION_STORAGE_KEY: "lms_demo_session_v1",
    DEMO_ACCOUNTS: [],
    isDemoModeEnabled: () => false,
    findDemoAccount: jest.fn(),
  };
});

// Import after mocks
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { isSessionLoading } = useAuth();
  return <div>{isSessionLoading ? "loading" : "ready"}</div>;
}

test("AuthProvider clears session loading even if getSession hangs (timeout fallback)", async () => {
  jest.useFakeTimers();

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  expect(screen.getByText("loading")).toBeInTheDocument();

  // AuthContext timeout is 2500ms; advance a bit beyond to ensure the fallback triggers.
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });

  expect(screen.getByText("ready")).toBeInTheDocument();

  jest.useRealTimers();
});
