import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { deleteQuiz, listMyAssignedQuizzes, listQuizzes } from "../../data/quizzes";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 10;

function scopeLabel(row) {
  if (row?.session?.id) {
    const courseTitle = row?.session?.course?.title ? ` • ${row.session.course.title}` : "";
    return `Session: ${row.session.title}${courseTitle}`;
  }
  if (row?.course?.id) return `Course: ${row.course.title}`;
  return "—";
}

// PUBLIC_INTERFACE
export default function QuizzesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  // Manage list (admin/instructor)
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated_desc");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);

  // Learner assigned list
  const [assignedRows, setAssignedRows] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPages = useMemo(() => {
    if (typeof count !== "number") return null;
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }, [count]);

  const canPrev = page > 0;
  const canNext = useMemo(() => {
    if (typeof totalPages === "number") return page + 1 < totalPages;
    return rows.length === PAGE_SIZE;
  }, [page, totalPages, rows.length]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    setIsLoading(true);
    setError("");

    if (role === "learner") {
      const { data, error: e } = await listMyAssignedQuizzes({ userId: user?.id });
      if (e) {
        setAssignedRows([]);
        setError(e);
        setIsLoading(false);
        return;
      }
      setAssignedRows(data);
      setIsLoading(false);
      return;
    }

    const { data, count: nextCount, error: e } = await listQuizzes({
      role,
      userId: user?.id,
      search,
      sort,
      page,
      pageSize: PAGE_SIZE,
    });

    if (e) {
      setRows([]);
      setCount(null);
      setError(e);
      setIsLoading(false);
      return;
    }

    setRows(data);
    setCount(nextCount);
    setIsLoading(false);
  }, [role, user?.id, search, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (quiz) => {
    if (!canManage) return;
    const ok = window.confirm(`Delete quiz "${quiz.title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setIsLoading(true);
    setError("");

    const { error: delErr } = await deleteQuiz(quiz.id);
    if (delErr) {
      setIsLoading(false);
      setError(delErr);
      return;
    }

    if (rows.length === 1 && page > 0) {
      setPage((p) => Math.max(0, p - 1));
      setIsLoading(false);
      return;
    }

    await load();
  };

  return (
    <>
      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Quizzes data is unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      {role !== "learner" ? (
        <div className="card toolbarCard" aria-label="Quizzes controls">
          <div className="toolbarLeft">
            <div className="fieldInline">
              <label className="labelSmall" htmlFor="quiz-search">
                Search
              </label>
              <input
                id="quiz-search"
                className="input"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search by title…"
                disabled={!isSupabaseConfigured}
              />
            </div>

            <div className="fieldInline">
              <label className="labelSmall" htmlFor="quiz-sort">
                Sort
              </label>
              <select
                id="quiz-sort"
                className="select"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(0);
                }}
                disabled={!isSupabaseConfigured}
              >
                <option value="updated_desc">Recently updated</option>
                <option value="created_desc">Newest</option>
                <option value="title_asc">Title (A–Z)</option>
                <option value="title_desc">Title (Z–A)</option>
              </select>
            </div>
          </div>

          <div className="toolbarRight">
            {canManage ? (
              <button
                type="button"
                className="button buttonPrimary"
                onClick={() => navigate("/quizzes/new")}
                disabled={!isSupabaseConfigured}
              >
                New quiz
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card" aria-label="Quizzes list">
        <div className="cardTitle">{role === "learner" ? "Assigned quizzes" : "Quizzes"}</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading quizzes…</p>
        ) : role === "learner" ? (
          assignedRows.length === 0 ? (
            <p className="cardBody muted">No quizzes assigned yet. Enroll in a session to receive quizzes.</p>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "44%" }}>Quiz</th>
                    <th style={{ width: "26%" }}>Assigned to</th>
                    <th style={{ width: "14%" }}>Due</th>
                    <th style={{ width: "16%" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedRows.map((a) => {
                    const quiz = a.quiz;
                    const due = a.due_at ? formatDateTime(a.due_at) : "—";
                    const latest = a.latestAttempt;
                    const hasSubmitted = Boolean(latest?.submitted_at) || latest?.status === "submitted";

                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="cellTitle">{quiz?.title || "Quiz"}</div>
                          {quiz?.description ? <div className="cellSub">{quiz.description}</div> : null}
                        </td>
                        <td>{scopeLabel(a)}</td>
                        <td className="mono">{due}</td>
                        <td>
                          <div className="rowActions">
                            {hasSubmitted ? (
                              <Link className="button buttonSecondary" to={`/quizzes/attempts/${latest.id}`}>
                                Review
                              </Link>
                            ) : (
                              <Link
                                className="button buttonPrimary"
                                to={`/quizzes/${a.quiz_id}/take?assignmentId=${encodeURIComponent(a.id)}`}
                              >
                                Start
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : rows.length === 0 ? (
          <p className="cardBody muted">
            No quizzes found.{" "}
            {canManage ? (
              <>
                You can{" "}
                <button type="button" className="buttonLink" onClick={() => navigate("/quizzes/new")}>
                  create a new quiz
                </button>
                .
              </>
            ) : (
              "Try adjusting your search."
            )}
          </p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "44%" }}>Title</th>
                  <th style={{ width: "16%" }}>Published</th>
                  <th style={{ width: "24%" }}>Updated</th>
                  <th style={{ width: "16%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div className="cellTitle">{q.title}</div>
                      {q.description ? <div className="cellSub">{q.description}</div> : null}
                    </td>
                    <td>
                      <span className={q.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                        {q.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="mono">{formatDateTime(q.updated_at || q.created_at)}</td>
                    <td>
                      <div className="rowActions">
                        <Link className="button buttonSecondary" to={`/quizzes/${q.id}`}>
                          View
                        </Link>
                        {canManage ? (
                          <>
                            <Link className="button buttonSecondary" to={`/quizzes/${q.id}/edit`}>
                              Edit
                            </Link>
                            <Link className="button buttonSecondary" to={`/quizzes/${q.id}/assign`}>
                              Assign
                            </Link>
                            <button
                              type="button"
                              className="button buttonDanger"
                              onClick={() => onDelete(q)}
                              disabled={!isSupabaseConfigured}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {role !== "learner" ? (
        <div className="card" aria-label="Pagination">
          <div className="paginationRow">
            <div className="muted">
              Page <strong>{page + 1}</strong>
              {typeof totalPages === "number" ? (
                <>
                  {" "}
                  of <strong>{totalPages}</strong>
                </>
              ) : (
                " (count pending)"
              )}
            </div>

            <div className="rowActions">
              <button
                type="button"
                className="button buttonSecondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={!canPrev || isLoading}
              >
                Previous
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext || isLoading}
              >
                Next
              </button>
            </div>
          </div>

          <p className="helpText">
            Admins/instructors can manage quizzes and assignments here. Learners see only assigned quizzes (derived from
            enrollments).
          </p>
        </div>
      ) : null}
    </>
  );
}
