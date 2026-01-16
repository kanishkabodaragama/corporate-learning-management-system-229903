import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { deleteSession, getSessionById } from "../../data/sessions";
import { formatDateTime } from "../../utils/datetime";

// PUBLIC_INTERFACE
export default function SessionDetailsPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const [session, setSession] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => session?.title || "Session", [session?.title]);

  const load = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError("");

    const { data, error: e } = await getSessionById(sessionId);
    if (e) {
      setSession(null);
      setError(e);
      setIsLoading(false);
      return;
    }

    setSession(data);
    setIsLoading(false);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async () => {
    if (!canManage || !session?.id) return;

    const ok = window.confirm(`Delete session "${session.title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setIsLoading(true);
    setError("");

    const { error: delErr } = await deleteSession(session.id);
    if (delErr) {
      setError(delErr);
      setIsLoading(false);
      return;
    }

    navigate("/sessions");
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Session header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className={session?.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                {session?.is_published ? "Published" : "Draft"}
              </span>
              <span className="muted">
                Starts: <span className="mono">{formatDateTime(session?.starts_at)}</span>
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/sessions">
              Back
            </Link>

            {canManage ? (
              <>
                <Link className="button buttonSecondary" to={`/sessions/${sessionId}/edit`}>
                  Edit
                </Link>
                <button
                  type="button"
                  className="button buttonDanger"
                  onClick={onDelete}
                  disabled={!isSupabaseConfigured || isLoading}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card" aria-label="Session overview">
        <div className="cardTitle">Overview</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading && !session ? (
          <p className="cardBody">Loading…</p>
        ) : session ? (
          <>
            <div className="kvGrid">
              <div className="kvItem">
                <div className="kvKey">Session ID</div>
                <div className="kvValue mono">{session.id}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Course</div>
                <div className="kvValue">
                  {session.course?.id ? (
                    <Link className="inlineLink" to={`/courses/${session.course.id}`}>
                      {session.course.title}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Ends</div>
                <div className="kvValue mono">{formatDateTime(session.ends_at)}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Location</div>
                <div className="kvValue">{session.location || "—"}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Capacity</div>
                <div className="kvValue">{session.capacity ?? "—"}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Instructor ID</div>
                <div className="kvValue mono">{session.instructor_id || "—"}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Created</div>
                <div className="kvValue mono">{formatDateTime(session.created_at)}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="cardBody muted">Session not found or you don’t have access.</p>
        )}
      </div>
    </>
  );
}
