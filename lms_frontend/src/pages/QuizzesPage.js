import React, { useMemo } from "react";
import PlaceholderPage from "./PlaceholderPage";
import { useAuthorization } from "../auth/useAuthorization";

// PUBLIC_INTERFACE
export default function QuizzesPage() {
  const { role } = useAuthorization();

  const { title, description } = useMemo(() => {
    if (role === "learner") {
      return {
        title: "My Quizzes",
        description: "Take assigned quizzes, review results, and track mastery over time.",
      };
    }

    if (role === "instructor") {
      return {
        title: "Quizzes",
        description: "Create assessments for your courses and review learner results.",
      };
    }

    return {
      title: "Quizzes",
      description: "Manage assessments across the organization and monitor learning outcomes.",
    };
  }, [role]);

  return <PlaceholderPage title={title} description={description} />;
}
