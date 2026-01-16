import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function SessionsPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Sessions",
        description: "View published upcoming sessions, schedules, and attendance details.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Sessions",
        description: "Schedule and manage instructor-led sessions you own, including publishing.",
      };
    }

    return {
      title: "Sessions",
      description: "Manage organization-wide session scheduling, assignment, and oversight.",
    };
  }, [role]);

  return (
    <section className="page" aria-label={title}>
      <header>
        <h1 className="pageTitle">{title}</h1>
        <p className="pageDesc">{description}</p>
      </header>

      <Outlet />
    </section>
  );
}
