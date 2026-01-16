import React, { useMemo } from "react";
import PlaceholderPage from "./PlaceholderPage";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function CoursesPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Courses",
        description: "Browse courses assigned to you, track progress, and access learning materials.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Courses",
        description: "Create and manage courses you own, including modules and learning content.",
      };
    }

    return {
      title: "Courses",
      description: "Manage the course catalog, ownership, and publishing across the organization.",
    };
  }, [role]);

  return <PlaceholderPage title={title} description={description} />;
}
