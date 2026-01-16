import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { deleteCourse, listCourses } from "../../data/courses";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 10;

function roleFriendlyLabel(role) {
  if (role === "learner") return "Published courses";
  if (role === "instructor") return "My courses";
  return "All courses";
}

// PUBLIC_INTERFACE
export default function CoursesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated_desc");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const label = useMemo(() => roleFriendlyLabel(role), [role]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data, count: nextCount, error: loadErr } = await listCourses({
      role,
      userId: user?.id,
      search,
      sort,
      page,
      pageSize: PAGE_SIZE,
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
  }, [role, user?.id, search, sort, page]);

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
    // Fallback: if count isn't available, allow Next when the current page is full.
    return rows.length === PAGE_SIZE;
  }, [page, totalPages, rows.length]);

  const onDelete = async (course) => {
    if (!canManage) return;

    const ok = window.confirm(`Delete course "${course.title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setIsLoading(true);
    setError("");

    const { error: delErr } = await deleteCourse(course.id);
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
            Courses data is unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      <div className="card toolbarCard" aria-label="Courses controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="course-search">
              Search
            </label>
            <input
              id="course-search"
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
            <label className="labelSmall" htmlFor="course-sort">
              Sort
            </label>
            <select
              id="course-sort"
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
              <option value="starts_desc" disabled>
                (placeholder)
              </option>
            </select>
          </div>
        </div>

        <div className="toolbarRight">
          <div className="pill" aria-label="View scope">
            {label}
          </div>

          {canManage ? (
            <button
              type="button"
              className="button buttonPrimary"
              onClick={() => navigate("/courses/new")}
              disabled={!isSupabaseConfigured}
            >
              New course
            </button>
          ) : null}
        </div>
      </div>

      <div className="card" aria-label="Courses list">
        <div className="cardTitle">Courses</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading courses…</p>
        ) : rows.length === 0 ? (
          <p className="cardBody muted">
            No courses found.{" "}
            {canManage ? (
              <>
                You can{" "}
                <button type="button" className="buttonLink" onClick={() => navigate("/courses/new")}>
                  create a new course
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
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cellTitle">{c.title}</div>
                      {c.description ? <div className="cellSub">{c.description}</div> : null}
                    </td>
                    <td>
                      <span className={c.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                        {c.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="mono">{formatDateTime(c.updated_at || c.created_at)}</td>
                    <td>
                      <div className="rowActions">
                        <Link className="button buttonSecondary" to={`/courses/${c.id}`}>
                          View
                        </Link>
                        {canManage ? (
                          <>
                            <Link className="button buttonSecondary" to={`/courses/${c.id}/edit`}>
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="button buttonDanger"
                              onClick={() => onDelete(c)}
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
          Search, sort, and pagination are implemented with Supabase queries (basic version). Additional filters (category,
          enrollments, advanced sorting) can be added later.
        </p>
      </div>
    </>
  );
}
