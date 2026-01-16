import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { getEnrollmentById, removeEnrollmentById } from "../../data/enrollments";
import { listAttendanceForSession } from "../../data/attendance";
import { formatDateTime } from "../../utils/datetime";

function safeShortId(id) {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

// PUBLIC_INTERFACE
export default function EnrollmentDetailsPage() {
  const navigate = useNavigate();
  const { enrollmentId } = useParams();

  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();
  const canManage = canAccess(["admin", "instructor"]);

  const [enrollment, setEnrollment] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => enrollment?.session?.title || "Enrollment", [enrollment?.session?.title]);

  const load = useCallback(async () => {
    if (!enrollmentId) return;

    setIsLoading(true);
    setError("");

    const { data, error: e } = await getEnrollmentById({ enrollmentId });
    if (e) {
      setEnrollment(null);
      setAttendanceStatus(null);
      setError(e);
      setIsLoading(false);
      return;
    }

    setEnrollment(data);

    // Best-effort: show attendance status for this learner/session if available.
    if (data?.session_id && data?.user_id) {
      const { data: a, error: aErr } = await listAttendanceForSession({
        role,
        userId: user?.id,
        sessionId: data.session_id,
      });

      if (!aErr) {
        const row = (Array.isArray(a) ? a : []).find((r) => r.user_id === data.user_id);
        setAttendanceStatus(row?.status || null);
      }
    }

    setIsLoading(false);
  }, [enrollmentId, role, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRemove = async () => {
    if (!canManage || !enrollment?.id) return;

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
      setError(delErr);
      setIsLoading(false);
      return;
    }

    navigate("/enrollments");
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Enrollment header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Enrollment ID: <span className="mono">{safeShortId(enrollmentId)}</span>
              </span>
              {attendanceStatus ? (
                <span className="pill">Attendance: {String(attendanceStatus).toUpperCase()}</span>
              ) : (
                <span className="pill">Attendance: —</span>
              )}
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/enrollments">
              Back
            </Link>

            {canManage && enrollment?.session_id ? (
              <Link className="button buttonSecondary" to={`/attendance/sessions/${enrollment.session_id}`}>
                Take attendance
              </Link>
            ) : null}

            {canManage ? (
              <button
                type="button"
                className="button buttonDanger"
                onClick={onRemove}
                disabled={!isSupabaseConfigured || isLoading}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <p className="helpText">
            Supabase is not configured. Data shown here may be incomplete until env vars are set.
          </p>
        ) : null}
      </div>

      <div className="card" aria-label="Enrollment details">
        <div className="cardTitle">Details</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading && !enrollment ? (
          <p className="cardBody">Loading…</p>
        ) : enrollment ? (
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvKey">Learner User ID</div>
              <div className="kvValue mono" title={enrollment.user_id}>
                {enrollment.user_id || "—"}
              </div>
            </div>

            <div className="kvItem">
              <div className="kvKey">Session</div>
              <div className="kvValue">
                {enrollment.session?.id ? (
                  <Link className="inlineLink" to={`/sessions/${enrollment.session.id}`}>
                    {enrollment.session.title}
                  </Link>
                ) : (
                  <span className="muted">—</span>
                )}
                <div className="cellSub mono">ID: {safeShortId(enrollment.session_id)}</div>
              </div>
            </div>

            <div className="kvItem">
              <div className="kvKey">Course</div>
              <div className="kvValue">
                {enrollment.session?.course?.id ? (
                  <Link className="inlineLink" to={`/courses/${enrollment.session.course.id}`}>
                    {enrollment.session.course.title}
                  </Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>

            <div className="kvItem">
              <div className="kvKey">Enrolled at</div>
              <div className="kvValue mono">{formatDateTime(enrollment.created_at)}</div>
            </div>

            <div className="kvItem">
              <div className="kvKey">Enrolled by</div>
              <div className="kvValue mono">{enrollment.created_by ? safeShortId(enrollment.created_by) : "—"}</div>
            </div>

            <div className="kvItem">
              <div className="kvKey">Attendance status</div>
              <div className="kvValue">{attendanceStatus ? String(attendanceStatus).toUpperCase() : "—"}</div>
            </div>
          </div>
        ) : (
          <p className="cardBody muted">Enrollment not found or you don’t have access.</p>
        )}
      </div>

      <div className="card" aria-label="Notes">
        <div className="cardTitle">Notes</div>
        <p className="cardBody">
          This page relies on Supabase RLS to ensure learners can only read their own enrollment records. Admin/instructor
          write actions are additionally guarded in the UI and in client helper checks.
        </p>
      </div>
    </>
  );
}
