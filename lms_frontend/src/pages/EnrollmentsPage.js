import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function EnrollmentsPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Enrollments",
        description: "Review the sessions you’re enrolled in and related attendance status.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Enrollments",
        description: "Enroll learners into sessions you instruct and manage enrollment rosters.",
      };
    }

    return {
      title: "Enrollments",
      description: "Manage enrollments across all courses and sessions (admin/instructor write access).",
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
