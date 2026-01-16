import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function AttendancePage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Attendance",
        description: "View your attendance status for enrolled sessions.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Attendance",
        description: "Take and maintain attendance for sessions you instruct.",
      };
    }

    return {
      title: "Attendance",
      description: "Track organization-wide attendance and training compliance.",
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
