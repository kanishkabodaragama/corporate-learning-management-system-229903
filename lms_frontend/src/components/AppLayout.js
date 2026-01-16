import React, { useMemo, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAuthorization } from "../auth/useAuthorization";
import { titleCaseRole } from "../auth/roles";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "instructor", "learner"] },

  { to: "/courses", label: "Courses", labelByRole: { learner: "My Courses" }, roles: ["admin", "instructor", "learner"] },
  { to: "/sessions", label: "Sessions", labelByRole: { learner: "My Sessions" }, roles: ["admin", "instructor", "learner"] },
  { to: "/quizzes", label: "Quizzes", labelByRole: { learner: "My Quizzes" }, roles: ["admin", "instructor", "learner"] },

  {
    to: "/enrollments",
    label: "Enrollments",
    labelByRole: { learner: "My Enrollments" },
    roles: ["admin", "instructor", "learner"],
  },
  {
    to: "/attendance",
    label: "Attendance",
    labelByRole: { learner: "My Attendance" },
    roles: ["admin", "instructor", "learner"],
  },

  { to: "/approvals", label: "Approvals", roles: ["admin"] },
  { to: "/reports", label: "Reports", roles: ["admin"] },
  { to: "/settings", label: "Settings", roles: ["admin"] },
];

function getItemLabel(item, role) {
  return item?.labelByRole?.[role] ?? item.label;
}

// PUBLIC_INTERFACE
export default function AppLayout() {
  const location = useLocation();
  const { user, signOut, isAuthActionLoading } = useAuth();
  const { role, roleSource, isRoleLoading, roleLoadError, isProfilesTableMissing } = useAuthorization();

  // Desktop behavior
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Mobile drawer behavior (CSS handles layout; state controls open/close)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => item.roles.includes(role));
  }, [role]);

  /** Close mobile drawer when navigating to a new location */
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  const onToggleMobileNav = () => setIsMobileNavOpen((v) => !v);
  const onCloseMobileNav = () => setIsMobileNavOpen(false);
  const onToggleCollapsed = () => setIsCollapsed((v) => !v);

  const onSignOut = async () => {
    // UI is intentionally minimal; ProtectedRoute will redirect after session clears.
    await signOut();
  };

  const roleLabel = titleCaseRole(role);

  return (
    <div className="shell">
      <a className="skipLink" href="#main-content">
        Skip to content
      </a>

      {/* Mobile overlay */}
      <button
        type="button"
        className={isMobileNavOpen ? "overlay overlayOpen" : "overlay"}
        aria-label="Close navigation"
        onClick={onCloseMobileNav}
      />

      <aside
        className={[
          "sidebar",
          isCollapsed ? "sidebarCollapsed" : "",
          isMobileNavOpen ? "sidebarMobileOpen" : "",
        ].join(" ")}
        aria-label="Primary navigation"
      >
        <div className="sidebarHeader">
          <div className="brand">
            <div className="brandMark" aria-hidden="true">
              OP
            </div>
            <div className="brandText">
              <div className="brandName">Ocean Professional</div>
              <div className="brandSub">Learning Management</div>
            </div>
          </div>

          <button
            type="button"
            className="iconButton collapseButton"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? "→" : "←"}
          </button>
        </div>

        <nav className="nav" aria-label="Sections">
          {visibleNavItems.map((item) => {
            const label = getItemLabel(item, role);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={label}
                className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
              >
                <span className="navIcon" aria-hidden="true">
                  {label.slice(0, 1).toUpperCase()}
                </span>
                <span className="navLabel">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <div className="sidebarHint">
            {isRoleLoading ? (
              "Loading permissions…"
            ) : (
              <>
                Signed in as <strong>{roleLabel}</strong>
                {roleSource ? <> ({roleSource})</> : null}.
              </>
            )}
            {roleLoadError ? (
              <>
                <br />
                <span>Note: {roleLoadError}</span>
              </>
            ) : null}
            {isProfilesTableMissing ? (
              <>
                <br />
                <span>
                  Profiles table not found; defaulting to learner unless role is present in user
                  metadata.
                </span>
              </>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbarLeft">
            <button
              type="button"
              className="iconButton hamburger"
              onClick={onToggleMobileNav}
              aria-label="Open navigation"
            >
              ☰
            </button>

            <div className="topbarTitle">Ocean Professional LMS</div>
          </div>

          <div className="topbarRight">
            <div className="roleSelect" aria-label="Current role">
              <span className="roleLabel">Role</span>
              <span className="roleValue">{roleLabel}</span>
            </div>

            <div className="userChip" aria-label="Signed in user">
              {user?.email || "Signed in"}
            </div>

            <button
              type="button"
              className="iconButton"
              onClick={onSignOut}
              disabled={isAuthActionLoading}
              aria-label="Sign out"
              title="Sign out"
            >
              ⎋
            </button>
          </div>
        </header>

        <main id="main-content" className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
