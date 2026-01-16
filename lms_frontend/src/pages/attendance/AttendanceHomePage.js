import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { listCourses } from "../../data/courses";
import { listSessions } from "../../data/sessions";
import { listEnrollments } from "../../data/enrollments";
import { listAttendanceForUser } from "../../data/attendance";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 10;

function statusBadgeClass(status) {
  const v = String(status || "").toLowerCase().trim();
  if (v === "present") return "badge badgeSuccess";
  if (v === "late") return "badge badgeWarning";
  if (v === "absent") return "badge badgeError";
  return "badge badgeNeutral";
}

// PUBLIC_INTERFACE
export default function AttendanceHomePage() {
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [page, setPage] = useState(0);

  const [courseOptions, setCourseOptions] = useState([]);

  const [sessions, setSessions] = useState([]);
  const [sessionsCount, setSessionsCount] = useState(null);

  const [myEnrollments, setMyEnrollments] = useState([]);
  const [myAttendance, setMyAttendance] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCoursesForFilter = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const { data } = await listCourses({
      role,
      userId: user?.id,
      search: "",
      sort: "title_asc",
      page: 0,
      pageSize: 300,
    });

    setCourseOptions(Array.isArray(data) ? data : []);
  }, [role, user?.id]);

  const loadForManager = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data, count, error: e } = await listSessions({
      role,
      userId: user?.id,
      search,
      sort: "starts_desc",
      page,
      pageSize: PAGE_SIZE,
      courseId: courseId || null,
    });

    if (e) {
      setSessions([]);
      setSessionsCount(null);
      setError(e);
      setIsLoading(false);
      return;
    }

    setSessions(data);
    setSessionsCount(count);
    setIsLoading(false);
  }, [role, user?.id, search, page, courseId]);

  const loadForLearner = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data: eData, error: eErr } = await listEnrollments({
      role,
      userId: user?.id,
      search,
      sort: "created_desc",
      page: 0,
      pageSize: 100,
      courseId: null,
      sessionId: null,
      learnerId: null,
    });

    if (eErr) {
      setMyEnrollments([]);
      setMyAttendance([]);
      setError(eErr);
      setIsLoading(false);
      return;
    }

    const { data: aData, error: aErr } = await listAttendanceForUser({
      role,
      userId: user?.id,
      targetUserId: user?.id,
      page: 0,
      pageSize: 300,
    });

    if (aErr) {
      setMyEnrollments(eData);
      setMyAttendance([]);
      setError(aErr);
      setIsLoading(false);
      return;
    }

    setMyEnrollments(eData);
    setMyAttendance(aData);
    setIsLoading(false);
  }, [role, user?.id, search]);

  useEffect(() => {
    loadCoursesForFilter();
  }, [loadCoursesForFilter]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (canManage) {
      loadForManager();
    } else {
      loadForLearner();
    }
  }, [canManage, loadForManager, loadForLearner]);

  const totalPages = useMemo(() => {
    if (typeof sessionsCount !== "number") return null;
    return Math.max(1, Math.ceil(sessionsCount / PAGE_SIZE));
  }, [sessionsCount]);

  const canPrev = page > 0;
  const canNext = useMemo(() => {
    if (typeof totalPages === "number") return page + 1 < totalPages;
    return sessions.length === PAGE_SIZE;
  }, [page, totalPages, sessions.length]);

  const attendanceBySessionId = useMemo(() => {
    const map = new Map();
    for (const row of Array.isArray(myAttendance) ? myAttendance : []) {
      if (row?.session_id) map.set(row.session_id, row);
    }
    return map;
  }, [myAttendance]);

  return (
    <>
      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Attendance is unavailable until <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code> are
            set.
          </p>
        </div>
      ) : null}

      <div className="card toolbarCard" aria-label="Attendance controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="att-search">
              Search
            </label>
            <input
              id="att-search"
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

          {canManage ? (
            <div className="fieldInline">
              <label className="labelSmall" htmlFor="att-course">
                Course
              </label>
              <select
                id="att-course"
                className="select"
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
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
          ) : null}
        </div>

        <div className="toolbarRight">
          <div className="pill">{canManage ? "Attendance taking" : "Self view"}</div>
        </div>
      </div>

      <div className="card" aria-label="Attendance content">
        <div className="cardTitle">{canManage ? "Sessions" : "My attendance"}</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? <p className="cardBody">Loading…</p> : null}

        {!isLoading && canManage ? (
          sessions.length === 0 ? (
            <p className="cardBody muted">No sessions found. Try adjusting your search/filter.</p>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "44%" }}>Session</th>
                    <th style={{ width: "30%" }}>Course</th>
                    <th style={{ width: "14%" }}>Starts</th>
                    <th style={{ width: "12%" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="cellTitle">{s.title}</div>
                        {s.location ? <div className="cellSub">{s.location}</div> : null}
                      </td>
                      <td>
                        {s.course?.id ? (
                          <Link className="inlineLink" to={`/courses/${s.course.id}`}>
                            {s.course.title}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="mono">{formatDateTime(s.starts_at)}</td>
                      <td>
                        <Link className="button buttonPrimary" to={`/attendance/sessions/${s.id}`}>
                          Take
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {!isLoading && !canManage ? (
          myEnrollments.length === 0 ? (
            <p className="cardBody muted">No enrollments found. Enrollments determine which sessions appear here.</p>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "44%" }}>Session</th>
                    <th style={{ width: "30%" }}>Course</th>
                    <th style={{ width: "14%" }}>Starts</th>
                    <th style={{ width: "12%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myEnrollments
                    .filter((e) => {
                      if (!search.trim()) return true;
                      return String(e?.session?.title || "").toLowerCase().includes(search.toLowerCase());
                    })
                    .map((e) => {
                      const session = e.session;
                      const att = attendanceBySessionId.get(e.session_id);
                      const status = att?.status || null;

                      return (
                        <tr key={e.id}>
                          <td>
                            <div className="cellTitle">{session?.title || "—"}</div>
                            <div className="cellSub">
                              Enrollment: <span className="mono">{e.id}</span>
                            </div>
                          </td>
                          <td>
                            {session?.course?.id ? (
                              <Link className="inlineLink" to={`/courses/${session.course.id}`}>
                                {session.course.title}
                              </Link>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="mono">{formatDateTime(session?.starts_at)}</td>
                          <td>
                            <span className={statusBadgeClass(status)}>{status ? status.toUpperCase() : "—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      {canManage ? (
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
            Attendance-taking is restricted to admins/instructors (and instructors should only see their own sessions, per
            recommended RLS).
          </p>
        </div>
      ) : null}
    </>
  );
}
