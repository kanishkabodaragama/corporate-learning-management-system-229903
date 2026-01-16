import React, { useMemo, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const ROLE_OPTIONS = ["admin", "instructor", "learner"];

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "instructor", "learner"] },
  { to: "/courses", label: "Courses", roles: ["admin", "instructor", "learner"] },
  { to: "/sessions", label: "Sessions", roles: ["admin", "instructor"] },
  { to: "/enrollments", label: "Enrollments", roles: ["admin", "instructor"] },
  { to: "/attendance", label: "Attendance", roles: ["admin", "instructor"] },
  { to: "/quizzes", label: "Quizzes", roles: ["admin", "instructor", "learner"] },
  { to: "/approvals", label: "Approvals", roles: ["admin"] },
  { to: "/reports", label: "Reports", roles: ["admin", "instructor"] },
  { to: "/settings", label: "Settings", roles: ["admin"] },
];

// PUBLIC_INTERFACE
export default function AppLayout() {
  const location = useLocation();

  // Desktop behavior
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Mobile drawer behavior (CSS handles layout; state controls open/close)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Role-aware placeholder (will later come from Supabase auth/profile)
  const [role, setRole] = useState("admin");

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
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                isActive ? "navLink navLinkActive" : "navLink"
              }
            >
              <span className="navIcon" aria-hidden="true">
                {item.label.slice(0, 1).toUpperCase()}
              </span>
              <span className="navLabel">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="sidebarHint">
            Role-aware nav is a placeholder (auth comes next).
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
            <label className="roleSelect">
              <span className="roleLabel">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Select role (placeholder)"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <div className="userChip" aria-label="User placeholder">
              Demo User
            </div>
          </div>
        </header>

        <main id="main-content" className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
