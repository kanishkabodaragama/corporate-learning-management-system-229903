import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { listCourses } from "../../data/courses";
import { listSessions } from "../../data/sessions";
import { listEnrollments, removeEnrollmentById } from "../../data/enrollments";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 10;

function safeShortId(id) {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

// PUBLIC_INTERFACE
export default function EnrollmentsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const initialCourseId = searchParams.get("courseId") || "";
  const initialSessionId = searchParams.get("sessionId") || "";

  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState(initialCourseId);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [learnerId, setLearnerId] = useState("");

  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("created_desc");

  const [courseOptions, setCourseOptions] = useState([]);
  const [sessionOptions, setSessionOptions] = useState([]);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadFilterOptions = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    // Courses are only used as a filter UI (not required for learners).
    const { data: cData } = await listCourses({
      role,
      userId: user?.id,
      search: "",
      sort: "title_asc",
      page: 0,
      pageSize: 300,
    });
    setCourseOptions(Array.isArray(cData) ? cData : []);

    const { data: sData } = await listSessions({
      role,
      userId: user?.id,
      courseId: courseId || null,
      search: "",
      sort: "starts_desc",
      page: 0,
      pageSize: 400,
    });
    setSessionOptions(Array.isArray(sData) ? sData : []);
  }, [role, user?.id, courseId]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data, count: nextCount, error: e } = await listEnrollments({
      role,
      userId: user?.id,
      search,
      sort,
      page,
      pageSize: PAGE_SIZE,
      courseId: role === "learner" ? null : courseId || null,
      sessionId: role === "learner" ? null : sessionId || null,
      learnerId: role === "learner" ? null : learnerId.trim() || null,
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
  }, [role, user?.id, search, sort, page, courseId, sessionId, learnerId]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = useMemo(() => {
    if (typeof count !== "number") return null;
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }, [count]);

  const canPrev = page > 0;
  const canNext = useMemo(() => {
    if (typeof totalPages === "number") return page + 1 < totalPages;
    return rows.length === PAGE_SIZE;
  }, [page, totalPages, rows.length]);

  const onRemove = async (enrollment) => {
    if (!canManage) return;
    const ok = window.confirm(
      `Remove this enrollment?\n\nSession: ${enrollment?.session?.title || enrollment?.session_id}\nLearner: ${
        enrollment?.user_id || "—"
      }`
    );
    if (!ok) return;

    setIsLoading(true);
    setError("");

    const { error: delErr } = await removeEnrollmentById({
      role,
      actorUserId: user?.id,
      enrollmentId: enrollment.id,
    });

    if (delErr) {
      setIsLoading(false);
      setError(delErr);
      return;
    }

    // If we deleted the last item on a page, step back one page when possible.
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
            Enrollments are unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      <div className="card toolbarCard" aria-label="Enrollment controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="enroll-search">
              Search
            </label>
            <input
              id="enroll-search"
              className="input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by session title…"
              disabled={!isSupabaseConfigured}
            />
          </div>

          <div className="fieldInline">
            <label className="labelSmall" htmlFor="enroll-sort">
              Sort
            </label>
            <select
              id="enroll-sort"
              className="select"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
              disabled={!isSupabaseConfigured}
            >
              <option value="created_desc">Newest enrollments</option>
              <option value="created_asc">Oldest enrollments</option>
            </select>
          </div>

          {role !== "learner" ? (
            <>
              <div className="fieldInline">
                <label className="labelSmall" htmlFor="enroll-course">
                  Course
                </label>
                <select
                  id="enroll-course"
                  className="select"
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setSessionId("");
                    setPage(0);
                  }}
                  disabled={!isSupabaseConfigured}
                >
                  <option value="">All</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fieldInline">
                <label className="labelSmall" htmlFor="enroll-session">
                  Session
                </label>
                <select
                  id="enroll-session"
                  className="select"
                  value={sessionId}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setPage(0);
                  }}
                  disabled={!isSupabaseConfigured}
                >
                  <option value="">All</option>
                  {sessionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fieldInline">
                <label className="labelSmall" htmlFor="enroll-learner">
                  Learner (User ID)
                </label>
                <input
                  id="enroll-learner"
                  className="input mono"
                  value={learnerId}
                  onChange={(e) => {
                    setLearnerId(e.target.value);
                    setPage(0);
                  }}
                  placeholder="uuid…"
                  disabled={!isSupabaseConfigured}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="toolbarRight">
          <div className="pill" aria-label="Access level">
            {role === "learner" ? "Self view" : canManage ? "Manage" : "Read-only"}
          </div>

          {canManage ? (
            <button
              type="button"
              className="button buttonPrimary"
              onClick={() => navigate(`/enrollments/new${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`)}
              disabled={!isSupabaseConfigured}
            >
              Add enrollments
            </button>
          ) : null}
        </div>
      </div>

      <div className="card" aria-label="Enrollment list">
        <div className="cardTitle">Enrollments</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading enrollments…</p>
        ) : rows.length === 0 ? (
          <p className="cardBody muted">
            No enrollments found. {role !== "learner" ? "Try adjusting your filters." : null}
          </p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>Session</th>
                  <th style={{ width: "22%" }}>Course</th>
                  <th style={{ width: "20%" }}>Learner</th>
                  <th style={{ width: "14%" }}>Enrolled</th>
                  <th style={{ width: "10%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cellTitle">{r.session?.title || "—"}</div>
                      <div className="cellSub mono">
                        Session: {safeShortId(r.session_id)}
                        {r.session?.starts_at ? (
                          <>
                            {" "}
                            · Starts: <span className="mono">{formatDateTime(r.session.starts_at)}</span>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {r.session?.course?.id ? (
                        <Link className="inlineLink" to={`/courses/${r.session.course.id}`}>
                          {r.session.course.title}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="mono" title={r.user_id}>
                      {safeShortId(r.user_id)}
                    </td>
                    <td className="mono">{formatDateTime(r.created_at)}</td>
                    <td>
                      <div className="rowActions">
                        <Link className="button buttonSecondary" to={`/enrollments/${r.id}`}>
                          View
                        </Link>
                        {canManage ? (
                          <button
                            type="button"
                            className="button buttonDanger"
                            onClick={() => onRemove(r)}
                            disabled={!isSupabaseConfigured}
                          >
                            Remove
                          </button>
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
          Learners can only view their own enrollments. Admins/instructors can filter by course, session, or learner id and
          manage enrollments (write actions are also protected by Supabase RLS policies).
        </p>
      </div>
    </>
  );
}
