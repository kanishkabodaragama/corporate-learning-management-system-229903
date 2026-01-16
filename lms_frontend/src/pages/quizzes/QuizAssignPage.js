import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { listCourses } from "../../data/courses";
import { listSessions } from "../../data/sessions";
import { createQuizAssignment, deleteQuizAssignment, getQuizById, listQuizAssignments } from "../../data/quizzes";
import { toIsoFromDatetimeLocal, formatDateTime } from "../../utils/datetime";

// PUBLIC_INTERFACE
export default function QuizAssignPage() {
  const { quizId } = useParams();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const [quiz, setQuiz] = useState(null);

  const [mode, setMode] = useState("session"); // "session" | "course"
  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");

  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState("");

  const [courseOptions, setCourseOptions] = useState([]);
  const [sessionOptions, setSessionOptions] = useState([]);

  const [assignments, setAssignments] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => quiz?.title || "Quiz", [quiz?.title]);

  const load = useCallback(async () => {
    if (!quizId) return;

    setIsLoading(true);
    setError("");

    const { data: qData, error: qErr } = await getQuizById(quizId);
    if (qErr) {
      setQuiz(null);
      setError(qErr);
      setIsLoading(false);
      return;
    }
    setQuiz(qData);

    if (canManage) {
      const [{ data: cData }, { data: sData }, { data: aData }] = await Promise.all([
        listCourses({ role, userId: user?.id, search: "", sort: "title_asc", page: 0, pageSize: 300 }),
        listSessions({ role, userId: user?.id, search: "", sort: "starts_desc", page: 0, pageSize: 300 }),
        listQuizAssignments(quizId),
      ]);

      setCourseOptions(Array.isArray(cData) ? cData : []);
      setSessionOptions(Array.isArray(sData) ? sData : []);
      setAssignments(Array.isArray(aData) ? aData : []);
    }

    setIsLoading(false);
  }, [quizId, canManage, role, user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    load();
  }, [load]);

  const refreshAssignments = useCallback(async () => {
    if (!quizId) return;
    const { data } = await listQuizAssignments(quizId);
    setAssignments(Array.isArray(data) ? data : []);
  }, [quizId]);

  const onAssign = async (e) => {
    e.preventDefault();
    setError("");

    if (!canManage) {
      setError("You don’t have permission to assign quizzes.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    if (!quizId) {
      setError("Missing quiz id.");
      return;
    }

    const startsAtIso = toIsoFromDatetimeLocal(startsAtLocal);
    const dueAtIso = toIsoFromDatetimeLocal(dueAtLocal);

    setIsSaving(true);

    const { error: aErr } = await createQuizAssignment({
      role,
      actorUserId: user?.id,
      quizId,
      courseId: mode === "course" ? (courseId || null) : null,
      sessionId: mode === "session" ? (sessionId || null) : null,
      startsAt: startsAtIso,
      dueAt: dueAtIso,
    });

    if (aErr) {
      setError(aErr);
      setIsSaving(false);
      return;
    }

    await refreshAssignments();
    setIsSaving(false);
  };

  const onRemoveAssignment = async (assignmentId) => {
    if (!canManage) return;
    const ok = window.confirm("Remove this assignment?");
    if (!ok) return;

    setIsSaving(true);
    setError("");

    const { error: dErr } = await deleteQuizAssignment({ role, assignmentId });
    if (dErr) {
      setError(dErr);
      setIsSaving(false);
      return;
    }

    await refreshAssignments();
    setIsSaving(false);
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Assignment header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">Assign: {title}</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Attach this quiz to a course or a session. Learners see assignments via enrollments.
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to={`/quizzes/${quizId}`}>
              Back
            </Link>
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

      <div className="card" aria-label="Assign form">
        <div className="cardTitle">Create assignment</div>

        {!canManage ? (
          <div className="alert alertError" role="alert">
            You don’t have permission to assign quizzes.
          </div>
        ) : null}

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading…</p>
        ) : (
          <form className="form" onSubmit={onAssign}>
            <div className="formRow formRow2">
              <div className="formField">
                <label className="label" htmlFor="assign-mode">
                  Assign to
                </label>
                <select
                  id="assign-mode"
                  className="select"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setCourseId("");
                    setSessionId("");
                  }}
                  disabled={!canManage || isSaving}
                >
                  <option value="session">Session</option>
                  <option value="course">Course</option>
                </select>
              </div>

              <div className="formField">
                <label className="label" htmlFor="assign-scope">
                  Scope
                </label>

                {mode === "session" ? (
                  <select
                    id="assign-scope"
                    className="select"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    disabled={!canManage || isSaving}
                    required
                  >
                    <option value="">Select a session…</option>
                    {sessionOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.course?.title ? ` • ${s.course.title}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    id="assign-scope"
                    className="select"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    disabled={!canManage || isSaving}
                    required
                  >
                    <option value="">Select a course…</option>
                    {courseOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}

                {canManage && mode === "session" && sessionOptions.length === 0 ? (
                  <div className="helpText">
                    No sessions available. Create a session first, or ensure RLS allows access.
                  </div>
                ) : null}
                {canManage && mode === "course" && courseOptions.length === 0 ? (
                  <div className="helpText">
                    No courses available. Create a course first, or ensure RLS allows access.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="formRow formRow2">
              <div className="formField">
                <label className="label" htmlFor="assign-starts">
                  Starts (optional)
                </label>
                <input
                  id="assign-starts"
                  className="input mono"
                  type="datetime-local"
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                  disabled={!canManage || isSaving}
                />
              </div>

              <div className="formField">
                <label className="label" htmlFor="assign-due">
                  Due (optional)
                </label>
                <input
                  id="assign-due"
                  className="input mono"
                  type="datetime-local"
                  value={dueAtLocal}
                  onChange={(e) => setDueAtLocal(e.target.value)}
                  disabled={!canManage || isSaving}
                />
              </div>
            </div>

            <div className="formActions">
              <button type="submit" className="button buttonPrimary" disabled={!canManage || isSaving}>
                {isSaving ? "Assigning…" : "Create assignment"}
              </button>
              <Link className="button buttonSecondary" to={`/quizzes/${quizId}`}>
                Back
              </Link>
            </div>
          </form>
        )}
      </div>

      <div className="card" aria-label="Existing assignments">
        <div className="cardTitle">Existing assignments</div>

        {assignments.length === 0 ? (
          <p className="cardBody muted">No assignments yet.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Scope</th>
                  <th style={{ width: "20%" }}>Starts</th>
                  <th style={{ width: "20%" }}>Due</th>
                  <th style={{ width: "10%" }}>Status</th>
                  <th style={{ width: "8%" }}>Actions</th>
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
                      <td>
                        <div className="rowActions">
                          <button
                            type="button"
                            className="button buttonDanger"
                            onClick={() => onRemoveAssignment(a.id)}
                            disabled={!canManage || isSaving}
                            title="Remove assignment"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="helpText">
          Learner visibility is typically enforced by Supabase RLS and enrollment-based logic. If you use course-level
          assignments, ensure your policies match your organization’s enrollment model.
        </p>
      </div>
    </>
  );
}
