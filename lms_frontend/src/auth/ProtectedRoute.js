import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

// PUBLIC_INTERFACE
/**
 * Route guard. Renders nested routes only when authenticated; otherwise redirects to /login.
 *
 * @returns {JSX.Element}
 */
export default function ProtectedRoute() {
  const location = useLocation();
  const { user, isSessionLoading } = useAuth();

  if (isSessionLoading) {
    return (
      <div className="authWrap">
        <section className="authCard" aria-label="Loading session">
          <h1 className="authTitle">Loading…</h1>
          <p className="authHint">Checking your session.</p>
        </section>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
