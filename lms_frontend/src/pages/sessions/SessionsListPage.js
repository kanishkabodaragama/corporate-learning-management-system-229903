import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { deleteSession, listSessions } from "../../data/sessions";
import { listCourses } from "../../data/courses";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 10;

// PUBLIC_INTERFACE
export default function SessionsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const initialCourseFilter = searchParams.get("courseId") || "";

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("starts_asc");
  const [page, setPage] = useState(0);
  const [courseFilter, setCourseFilter] = useState(initialCourseFilter);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);

  const [courseOptions, setCourseOptions] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCoursesForFilter = useCallback(async () => {
    if (!canManage) return;
    const { data, error: e } = await listCourses({
      role,
      userId: user?.id,
      search: "",
      sort: "title_asc",
      page: 0,
      pageSize: 200,
    });
    if (!e) setCourseOptions(data);
  }, [canManage, role, user?.id]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data, count: nextCount, error: loadErr } = await listSessions({
      role,
      userId: user?.id,
      search,
      sort,
      page,
      pageSize: PAGE_SIZE,
      courseId: courseFilter || null,
    });

    if (loadErr) {
      setRows([]);
      setCount(null);
      setError(loadErr);
      setIsLoading(false);
      return;
    }

    setRows(data);
    setCount(nextCount);
    setIsLoading(false);
  }, [role, user?.id, search, sort, page, courseFilter]);

  useEffect(() => {
    loadCoursesForFilter();
  }, [loadCoursesForFilter]);

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

  const onDelete = async (session) => {
    if (!canManage) return;

    const ok = window.confirm(`Delete session "${session.title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setIsLoading(true);
    setError("");

    const { error: delErr } = await deleteSession(session.id);
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

  const onCourseFilterChange = (value) => {
    setCourseFilter(value);
    setPage(0);

    if (value) {
      setSearchParams({ courseId: value });
    } else {
      setSearchParams({});
    }
  };

  return (
    <>
      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Sessions data is unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      <div className="card toolbarCard" aria-label="Sessions controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="session-search">
              Search
            </label>
            <input
              id="session-search"
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
            <label className="labelSmall" htmlFor="session-sort">
              Sort
            </label>
            <select
              id="session-sort"
              className="select"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
              disabled={!isSupabaseConfigured}
            >
              <option value="starts_asc">Starts (soonest)</option>
              <option value="starts_desc">Starts (latest)</option>
              <option value="updated_desc">Recently updated</option>
              <option value="title_asc">Title (A–Z)</option>
            </select>
          </div>

          {canManage ? (
            <div className="fieldInline">
              <label className="labelSmall" htmlFor="session-course">
                Course
              </label>
              <select
                id="session-course"
                className="select"
                value={courseFilter}
                onChange={(e) => onCourseFilterChange(e.target.value)}
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
          {canManage ? (
            <button
              type="button"
              className="button buttonPrimary"
              onClick={() => navigate(courseFilter ? `/sessions/new?courseId=${encodeURIComponent(courseFilter)}` : "/sessions/new")}
              disabled={!isSupabaseConfigured}
            >
              New session
            </button>
          ) : null}
        </div>
      </div>

      <div className="card" aria-label="Sessions list">
        <div className="cardTitle">Sessions</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading sessions…</p>
        ) : rows.length === 0 ? (
          <p className="cardBody muted">No sessions found. Try adjusting your search/filter.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "36%" }}>Title</th>
                  <th style={{ width: "26%" }}>Course</th>
                  <th style={{ width: "18%" }}>Starts</th>
                  <th style={{ width: "8%" }}>Pub</th>
                  <th style={{ width: "12%" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
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
                      <span className={s.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                        {s.is_published ? "Y" : "N"}
                      </span>
                    </td>
                    <td>
                      <div className="rowActions">
                        <Link className="button buttonSecondary" to={`/sessions/${s.id}`}>
                          View
                        </Link>
                        {canManage ? (
                          <>
                            <Link className="button buttonSecondary" to={`/sessions/${s.id}/edit`}>
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="button buttonDanger"
                              onClick={() => onDelete(s)}
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
          Search, sort, and pagination are implemented with Supabase queries (basic version). Course filter is available
          for admins/instructors.
        </p>
      </div>
    </>
  );
}
