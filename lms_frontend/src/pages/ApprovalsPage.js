import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function ApprovalsPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "Requests",
        description: "Track enrollment request statuses and other approval workflows that affect you.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Approvals",
        description:
          "Review enrollment requests for your sessions and submit course publishing requests for admin approval.",
      };
    }

    return {
      title: "Approvals",
      description: "Review and process enrollment requests and course publishing approvals across the organization.",
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
