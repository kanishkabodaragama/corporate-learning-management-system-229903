import React from "react";
import { useAuthorization } from "./useAuthorization";
import UnauthorizedPage from "../pages/UnauthorizedPage";

// PUBLIC_INTERFACE
/**
 * Role-based guard wrapper.
 *
 * Usage:
 *  <RoleRequired allowedRoles={["admin"]}>
 *    <AdminPage />
 *  </RoleRequired>
 *
 * If the role is still loading, a lightweight loading UI is shown.
 * If access is denied, UnauthorizedPage is rendered.
 *
 * @param {{
 *  allowedRoles: Array<"admin" | "instructor" | "learner">,
 *  children: React.ReactNode
 * }} props
 * @returns {JSX.Element}
 */
export default function RoleRequired({ allowedRoles, children }) {
  const { isRoleLoading, canAccess } = useAuthorization();

  if (isRoleLoading) {
    return (
      <section className="page" aria-label="Loading permissions">
        <header>
          <h1 className="pageTitle">Loading…</h1>
          <p className="pageDesc">Checking your permissions.</p>
        </header>
        <div className="card">
          <div className="cardTitle">Please wait</div>
          <p className="cardBody">We’re loading your role to determine access.</p>
        </div>
      </section>
    );
  }

  if (!canAccess(allowedRoles)) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
}
