import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { deleteSession, getSessionById } from "../../data/sessions";
import { createEnrollmentRequest, getEnrollmentRequestForSession } from "../../data/approvals";
import { formatDateTime } from "../../utils/datetime";

function requestStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return { cls: "badge badgeSuccess", label: "Approved" };
  if (s === "pending") return { cls: "badge badgeWarning", label: "Pending" };
  if (s === "denied") return { cls: "badge badgeError", label: "Denied" };
  return { cls: "badge badgeNeutral", label: "—" };
}

// PUBLIC_INTERFACE
export default function SessionDetailsPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);
  const isLearner = role === "learner";

  const [session, setSession] = useState(null);

  const [enrollmentRequest, setEnrollmentRequest] = useState(null);
  const [requestError, setRequestError] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => session?.title || "Session", [session?.title]);

  const load = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError("");
    setRequestError("");

    const { data, error: e } = await getSessionById(sessionId);
    if (e) {
      setSession(null);
      setError(e);
      setIsLoading(false);
      return;
    }

    setSession(data);

    if (isSupabaseConfigured && isLearner && user?.id) {
      const { data: r, error: rErr } = await getEnrollmentRequestForSession({ sessionId, userId: user.id });
      if (rErr) {
        setEnrollmentRequest(null);
        setRequestError(rErr);
      } else {
        setEnrollmentRequest(r ?? null);
      }
    } else {
      setEnrollmentRequest(null);
    }

    setIsLoading(false);
  }, [sessionId, isLearner, user?.id]);

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

  const onRequestEnrollment = async () => {
    if (!isLearner || !user?.id || !session?.id) return;

    setIsRequesting(true);
    setRequestError("");

    const { data, error: e } = await createEnrollmentRequest({ sessionId: session.id, userId: user.id });
    if (e) {
      setRequestError(e);
      setIsRequesting(false);
      return;
    }

    setEnrollmentRequest(data);
    setIsRequesting(false);
  };

  const requestBadge = useMemo(
    () => requestStatusBadge(enrollmentRequest?.status),
    [enrollmentRequest?.status]
  );

  const canRequestEnrollment = useMemo(() => {
    if (!isLearner) return false;
    if (!isSupabaseConfigured) return false;
    if (!user?.id) return false;
    if (!session?.id) return false;

    // UX guard: only allow requests against published sessions (you can relax this if desired).
    if (!session?.is_published) return false;

    const status = enrollmentRequest?.status;
    return !status || status === "denied";
  }, [isLearner, user?.id, session?.id, session?.is_published, enrollmentRequest?.status]);

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

      {isLearner ? (
        <div className="card" aria-label="Enrollment request">
          <div className="cardTitle">Enrollment</div>

          {requestError ? (
            <div className="alert alertError" role="alert">
              {requestError}
            </div>
          ) : null}

          {!isSupabaseConfigured ? (
            <p className="cardBody muted">Enrollment requests require Supabase configuration.</p>
          ) : !session ? (
            <p className="cardBody muted">Load a session to request enrollment.</p>
          ) : (
            <>
              <div className="subHeaderMeta" style={{ marginBottom: 10 }}>
                <span className={requestBadge.cls}>{requestBadge.label}</span>
                {enrollmentRequest?.id ? (
                  <Link className="inlineLink" to={`/approvals/enrollment/${enrollmentRequest.id}`}>
                    View request
                  </Link>
                ) : null}
              </div>

              <p className="cardBody">
                Request enrollment to be added to this session. An admin or the session’s instructor will approve or deny.
              </p>

              <div className="rowActions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="button buttonPrimary"
                  onClick={onRequestEnrollment}
                  disabled={!canRequestEnrollment || isRequesting}
                >
                  {isRequesting ? "Requesting…" : enrollmentRequest?.status === "denied" ? "Request again" : "Request enrollment"}
                </button>

                <Link className="button buttonSecondary" to="/approvals">
                  Go to requests
                </Link>
              </div>

              {!session.is_published ? (
                <p className="helpText">This session is not published yet, so enrollment requests are disabled.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

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
