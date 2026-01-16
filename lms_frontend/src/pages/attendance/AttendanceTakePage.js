import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { getSessionById } from "../../data/sessions";
import { listEnrollments } from "../../data/enrollments";
import { listAttendanceForSession, upsertAttendanceForSession } from "../../data/attendance";
import { formatDateTime } from "../../utils/datetime";

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
];

function safeShortId(id) {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

// PUBLIC_INTERFACE
export default function AttendanceTakePage() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const { role } = useAuthorization();

  const [session, setSession] = useState(null);

  const [search, setSearch] = useState("");

  const [rows, setRows] = useState([]); // { user_id, status, marked_at? }
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError("");

    const { data: s, error: sErr } = await getSessionById(sessionId);
    if (sErr) {
      setSession(null);
      setRows([]);
      setError(sErr);
      setIsLoading(false);
      return;
    }

    setSession(s);

    // Pull enrollments for the session (roster)
    const { data: eData, error: eErr } = await listEnrollments({
      role,
      userId: user?.id,
      search: "",
      sort: "created_desc",
      page: 0,
      pageSize: 500,
      courseId: null,
      sessionId,
      learnerId: null,
    });

    if (eErr) {
      setRows([]);
      setError(eErr);
      setIsLoading(false);
      return;
    }

    // Pull existing attendance records for this session
    const { data: aData, error: aErr } = await listAttendanceForSession({
      role,
      userId: user?.id,
      sessionId,
    });

    if (aErr) {
      // Still allow roster display; attendance can be saved later if RLS allows.
      setError(aErr);
    }

    const attendanceMap = new Map();
    for (const a of Array.isArray(aData) ? aData : []) {
      attendanceMap.set(a.user_id, a);
    }

    const merged = (Array.isArray(eData) ? eData : []).map((en) => {
      const a = attendanceMap.get(en.user_id);
      return {
        user_id: en.user_id,
        status: a?.status || "absent",
        marked_at: a?.marked_at || null,
      };
    });

    merged.sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)));

    setRows(merged);
    setIsLoading(false);
  }, [sessionId, role, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = String(search || "").toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => String(r.user_id).toLowerCase().includes(q));
  }, [rows, search]);

  const setAllStatus = (status) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  };

  const onSave = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    if (!sessionId) {
      setError("Missing session id.");
      return;
    }
    if (!user?.id) {
      setError("Missing signed-in user.");
      return;
    }

    setIsSaving(true);
    setError("");

    const { error: saveErr } = await upsertAttendanceForSession({
      role,
      actorUserId: user.id,
      sessionId,
      records: rows.map((r) => ({ user_id: r.user_id, status: r.status })),
    });

    if (saveErr) {
      setError(saveErr);
      setIsSaving(false);
      return;
    }

    setLastSavedAt(new Date().toISOString());
    setIsSaving(false);

    // Reload to pick up marked_at values from DB (best-effort).
    await load();
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Attendance header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">Take attendance</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Session: <span className="mono">{safeShortId(sessionId)}</span>
              </span>
              {session?.starts_at ? (
                <span className="muted">
                  Starts: <span className="mono">{formatDateTime(session.starts_at)}</span>
                </span>
              ) : null}
              {lastSavedAt ? (
                <span className="pill">
                  Saved: <span className="mono">{formatDateTime(lastSavedAt)}</span>
                </span>
              ) : (
                <span className="pill">Not saved yet</span>
              )}
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/attendance">
              Back
            </Link>
            <Link className="button buttonSecondary" to={`/sessions/${encodeURIComponent(sessionId || "")}`}>
              View session
            </Link>
            <button
              type="button"
              className="button buttonPrimary"
              onClick={onSave}
              disabled={!isSupabaseConfigured || isSaving || isLoading}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="card toolbarCard" aria-label="Attendance roster controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="att-roster-search">
              Filter roster
            </label>
            <input
              id="att-roster-search"
              className="input mono"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by learner user id…"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="toolbarRight">
          <div className="rowActions">
            <button type="button" className="button buttonSecondary" onClick={() => setAllStatus("present")} disabled={isLoading}>
              Mark all present
            </button>
            <button type="button" className="button buttonSecondary" onClick={() => setAllStatus("late")} disabled={isLoading}>
              Mark all late
            </button>
            <button type="button" className="button buttonSecondary" onClick={() => setAllStatus("absent")} disabled={isLoading}>
              Mark all absent
            </button>
          </div>
        </div>
      </div>

      <div className="card" aria-label="Attendance roster">
        <div className="cardTitle">{session?.title ? `Roster · ${session.title}` : "Roster"}</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading roster…</p>
        ) : rows.length === 0 ? (
          <p className="cardBody muted">No enrolled learners found for this session.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "44%" }}>Learner</th>
                  <th style={{ width: "26%" }}>Status</th>
                  <th style={{ width: "30%" }}>Last marked</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="mono" title={r.user_id}>
                      {r.user_id}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={r.status}
                        onChange={(e) => {
                          const next = e.target.value;
                          setRows((prev) =>
                            prev.map((x) => (x.user_id === r.user_id ? { ...x, status: next } : x))
                          );
                        }}
                        disabled={isSaving}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{r.marked_at ? formatDateTime(r.marked_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="helpText">
          Attendance rows are saved via upsert on (session_id, user_id). Instructors are restricted (recommended) to
          sessions they instruct; DB-level RLS should enforce this.
        </p>
      </div>
    </>
  );
}
