import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { getQuizWithQuestions, listAttemptsForQuiz, listQuizAssignments } from "../../data/quizzes";
import { formatDateTime } from "../../utils/datetime";

// PUBLIC_INTERFACE
export default function QuizDetailsPage() {
  const { quizId } = useParams();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const [quiz, setQuiz] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [attempts, setAttempts] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => quiz?.title || "Quiz", [quiz?.title]);
  const questionCount = useMemo(() => quiz?.questions?.length || 0, [quiz?.questions?.length]);

  const load = useCallback(async () => {
    if (!quizId) return;

    setIsLoading(true);
    setError("");

    const { data: quizData, error: qErr } = await getQuizWithQuestions(quizId);
    if (qErr) {
      setQuiz(null);
      setAssignments([]);
      setAttempts([]);
      setError(qErr);
      setIsLoading(false);
      return;
    }

    setQuiz(quizData);

    // Best-effort: these may be blocked by RLS depending on role.
    const [{ data: aData, error: aErr }, { data: attData, error: attErr }] = await Promise.all([
      listQuizAssignments(quizId),
      listAttemptsForQuiz({ role, userId: user?.id, quizId }),
    ]);

    if (!aErr) setAssignments(aData);
    if (!attErr) setAttempts(attData);

    setIsLoading(false);
  }, [quizId, role, user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    load();
  }, [load]);

  return (
    <>
      <div className="card subHeaderCard" aria-label="Quiz header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className={quiz?.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                {quiz?.is_published ? "Published" : "Draft"}
              </span>
              <span className="muted">
                Questions: <span className="mono">{questionCount}</span>
              </span>
              {quiz?.updated_at ? (
                <span className="muted">
                  Updated: <span className="mono">{formatDateTime(quiz.updated_at)}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/quizzes">
              Back
            </Link>

            {canManage ? (
              <>
                <Link className="button buttonSecondary" to={`/quizzes/${quizId}/edit`}>
                  Edit
                </Link>
                <Link className="button buttonSecondary" to={`/quizzes/${quizId}/assign`}>
                  Assign
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Quizzes data is unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      <div className="card" aria-label="Quiz overview">
        <div className="cardTitle">Overview</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading && !quiz ? (
          <p className="cardBody">Loading…</p>
        ) : quiz ? (
          <>
            {quiz.description ? <p className="cardBody">{quiz.description}</p> : <p className="cardBody muted">—</p>}

            <div className="kvGrid" style={{ marginTop: 12 }}>
              <div className="kvItem">
                <div className="kvKey">Quiz ID</div>
                <div className="kvValue mono">{quiz.id}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Owner ID</div>
                <div className="kvValue mono">{quiz.owner_id || "—"}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Created</div>
                <div className="kvValue mono">{formatDateTime(quiz.created_at)}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="cardBody muted">Quiz not found or you don’t have access.</p>
        )}
      </div>

      <div className="card" aria-label="Assignments">
        <div className="cardTitle">Assignments</div>

        {!canManage ? (
          <p className="cardBody muted">
            Assignments are managed by admins/instructors. Learners see quizzes via their enrollments.
          </p>
        ) : assignments.length === 0 ? (
          <p className="cardBody muted">No assignments yet. Use “Assign” to attach this quiz to a course or session.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Scope</th>
                  <th style={{ width: "22%" }}>Starts</th>
                  <th style={{ width: "22%" }}>Due</th>
                  <th style={{ width: "14%" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const scope =
                    a?.session?.id
                      ? `Session: ${a.session.title}${a.session.course?.title ? ` • ${a.session.course.title}` : ""}`
                      : a?.course?.id
                        ? `Course: ${a.course.title}`
                        : "—";

                  return (
                    <tr key={a.id}>
                      <td>{scope}</td>
                      <td className="mono">{formatDateTime(a.starts_at)}</td>
                      <td className="mono">{formatDateTime(a.due_at)}</td>
                      <td>
                        <span className={a.is_active ? "badge badgeSuccess" : "badge badgeNeutral"}>
                          {a.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" aria-label="Attempts">
        <div className="cardTitle">Attempts</div>

        {attempts.length === 0 ? (
          <p className="cardBody muted">
            {role === "learner" ? "You have no attempts yet." : "No learner attempts yet (or restricted by RLS)."}
          </p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>Submitted</th>
                  <th style={{ width: "24%" }}>Learner</th>
                  <th style={{ width: "18%" }}>Score</th>
                  <th style={{ width: "18%" }}>Correct</th>
                  <th style={{ width: "16%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att) => (
                  <tr key={att.id}>
                    <td className="mono">{formatDateTime(att.submitted_at || att.created_at)}</td>
                    <td className="mono">{att.user_id}</td>
                    <td className="mono">{typeof att.score_percent === "number" ? `${att.score_percent}%` : "—"}</td>
                    <td className="mono">
                      {typeof att.correct_count === "number" && typeof att.total_questions === "number"
                        ? `${att.correct_count}/${att.total_questions}`
                        : "—"}
                    </td>
                    <td>
                      <div className="rowActions">
                        <Link className="button buttonSecondary" to={`/quizzes/attempts/${att.id}`}>
                          Review
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!canManage ? (
          <p className="helpText">
            Note: Instructors/admins may be able to review attempts depending on Supabase RLS policies.
          </p>
        ) : null}
      </div>
    </>
  );
}
