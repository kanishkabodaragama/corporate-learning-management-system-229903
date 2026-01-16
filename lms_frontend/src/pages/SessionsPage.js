import React, { useMemo } from "react";
import PlaceholderPage from "./PlaceholderPage";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function SessionsPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Sessions",
        description: "View your upcoming sessions, join live training, and track attendance status.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Sessions",
        description: "Schedule and deliver instructor-led sessions you own, and manage rosters.",
      };
    }

    return {
      title: "Sessions",
      description: "Manage organization-wide session scheduling, assignment, and oversight.",
    };
  }, [role]);

  return <PlaceholderPage title={title} description={description} />;
}
