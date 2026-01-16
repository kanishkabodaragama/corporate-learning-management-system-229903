import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function CoursesPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Courses",
        description: "Browse published courses, track progress, and access learning materials.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Courses",
        description: "Create and manage courses you own, including content and publishing.",
      };
    }

    return {
      title: "Courses",
      description: "Manage the course catalog, ownership, and publishing across the organization.",
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
