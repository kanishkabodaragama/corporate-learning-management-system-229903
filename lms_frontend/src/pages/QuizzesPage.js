import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
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
        description: "Create assessments for your courses, assign them to sessions, and review learner results.",
      };
    }

    return {
      title: "Quizzes",
      description: "Manage quizzes across the organization and monitor learning outcomes.",
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
