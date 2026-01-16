import React, { useMemo, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAuthorization } from "../auth/useAuthorization";
import { titleCaseRole } from "../auth/roles";
import { isDemoModeEnabled } from "../auth/demoMode";

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

  { to: "/approvals", label: "Approvals", labelByRole: { learner: "Requests" }, roles: ["admin", "instructor", "learner"] },
  { to: "/reports", label: "Reports", roles: ["admin"] },
  { to: "/settings", label: "Settings", roles: ["admin"] },
];

function getItemLabel(item, role) {
  return item?.labelByRole?.[role] ?? item.label;
}

const PATH_LABELS = {
  dashboard: "Dashboard",
  courses: "Courses",
  sessions: "Sessions",
  quizzes: "Quizzes",
  enrollments: "Enrollments",
  attendance: "Attendance",
  approvals: "Approvals",
  reports: "Reports",
  settings: "Settings",
};

function computeBreadcrumbs(pathname) {
  const segments = String(pathname || "/")
    .split("/")
    .filter(Boolean);

  // Default to dashboard for "/" and unknown routes.
  if (segments.length === 0) {
    return {
      pageTitle: "Dashboard",
      crumbs: [{ label: "Dashboard", to: "/dashboard" }],
    };
  }

  const section = segments[0];
  const sectionLabel = PATH_LABELS[section] || "App";
  const crumbs = [{ label: sectionLabel, to: `/${section}` }];

  let subLabel = "";
  if (segments.length >= 2) {
    const a = segments[1];
    const b = segments[2];

    if (section === "courses") {
      subLabel = a === "new" ? "New" : b === "edit" ? "Edit" : "Details";
    } else if (section === "sessions") {
      subLabel = a === "new" ? "New" : b === "edit" ? "Edit" : "Details";
    } else if (section === "quizzes") {
      if (a === "new") subLabel = "New";
      else if (a === "attempts") subLabel = "Attempt review";
      else if (b === "edit") subLabel = "Edit";
      else if (b === "assign") subLabel = "Assign";
      else if (b === "take") subLabel = "Take";
      else if (a) subLabel = "Details";
    } else if (section === "enrollments") {
      subLabel = a === "new" ? "New" : "Details";
    } else if (section === "attendance") {
      subLabel = a === "sessions" ? "Take attendance" : "";
    } else if (section === "approvals") {
      subLabel = segments.length >= 3 ? "Details" : "";
    } else {
      subLabel = "";
    }
  }

  if (subLabel) crumbs.push({ label: subLabel, to: pathname });
  return { pageTitle: subLabel ? `${sectionLabel} · ${subLabel}` : sectionLabel, crumbs };
}

// PUBLIC_INTERFACE
export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAuthActionLoading } = useAuth();
  const { role, roleSource, isRoleLoading, roleLoadError, isProfilesTableMissing } = useAuthorization();

  // Desktop behavior
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Mobile drawer behavior (CSS handles layout; state controls open/close)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => item.roles.includes(role));
  }, [role]);

  const { pageTitle, crumbs } = useMemo(() => computeBreadcrumbs(location.pathname), [location.pathname]);

  /** Close mobile drawer when navigating to a new location */
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  /** Prevent background scroll when the mobile drawer is open. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (isMobileNavOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobileNavOpen]);

  /** Allow ESC to close the drawer (basic accessibility). */
  useEffect(() => {
    if (!isMobileNavOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsMobileNavOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileNavOpen]);

  const onToggleMobileNav = () => setIsMobileNavOpen((v) => !v);
  const onCloseMobileNav = () => setIsMobileNavOpen(false);
  const onToggleCollapsed = () => setIsCollapsed((v) => !v);

  const onSignOut = async () => {
    // Call the shared auth signOut(), which supports both Demo Mode and Supabase auth.
    // Then explicitly route to /login for immediate UX clarity.
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const roleLabel = titleCaseRole(role);
  const demoModeEnabled = isDemoModeEnabled();

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
        id="primary-sidebar"
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
              aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-controls="primary-sidebar"
              aria-expanded={isMobileNavOpen}
            >
              ☰
            </button>

            <div className="topbarTitleGroup">
              <div className="topbarKicker">Ocean Professional LMS</div>

              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <ol className="breadcrumbsList">
                  {crumbs.map((c, idx) => {
                    const isLast = idx === crumbs.length - 1;
                    return (
                      <li key={`${c.to}-${c.label}`} className="breadcrumbsItem">
                        {isLast ? (
                          <span aria-current="page">{c.label}</span>
                        ) : (
                          <>
                            <Link className="breadcrumbsLink" to={c.to}>
                              {c.label}
                            </Link>
                            <span className="breadcrumbsSep" aria-hidden="true">
                              /
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>

            <div className="topbarPageTitle" aria-label="Current page">
              {pageTitle}
            </div>
          </div>

          <div className="topbarRight">
            {demoModeEnabled ? (
              <span className="badge badgeWarning" title="Demo authentication is enabled (non-production only).">
                Demo Mode
              </span>
            ) : null}

            <div className="roleSelect" aria-label="Current role">
              <span className="roleLabel">Role</span>
              <span className="roleValue">{roleLabel}</span>
            </div>

            <div className="userChip" aria-label="Signed in user">
              {user?.email || "Signed in"}
            </div>

            <button
              type="button"
              className="button buttonSecondary topbarLogoutButton"
              onClick={onSignOut}
              disabled={isAuthActionLoading}
              aria-label="Sign out"
              title="Logout"
            >
              <span className="logoutIcon" aria-hidden="true">
                ⎋
              </span>
              <span className="logoutText">Logout</span>
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
