import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { deleteCourse, getCourseById } from "../../data/courses";
import { listSessions } from "../../data/sessions";
import { getCoursePublishRequestForCourse, submitCoursePublishRequest } from "../../data/approvals";
import { formatDateTime } from "../../utils/datetime";

function PublishRequestModal({ open, onClose, onConfirm, busy }) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Submit for approval">
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalTitle">Submit for approval</div>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close modal" disabled={busy}>
            ×
          </button>
        </div>

        <div className="modalBody">
          <p className="cardBody" style={{ marginBottom: 12 }}>
            Submitting will create (or update) a publishing approval request. An admin will approve or return it with
            feedback.
          </p>

          <div className="formField">
            <label className="label" htmlFor="publish-note">
              Comment (optional)
            </label>
            <textarea
              id="publish-note"
              className="textarea"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional note to the admin reviewer…"
              disabled={busy}
            />
          </div>
        </div>

        <div className="modalActions">
          <button type="button" className="button buttonSecondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button buttonPrimary" onClick={() => onConfirm(comment)} disabled={busy}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// PUBLIC_INTERFACE
export default function CourseDetailsPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);
  const isInstructor = role === "instructor";

  const [course, setCourse] = useState(null);
  const [sessions, setSessions] = useState([]);

  const [publishRequest, setPublishRequest] = useState(null);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingPublish, setIsSubmittingPublish] = useState(false);

  const [error, setError] = useState("");

  const title = useMemo(() => course?.title || "Course", [course?.title]);

  const load = useCallback(async () => {
    if (!courseId) return;

    setIsLoading(true);
    setError("");

    const { data: c, error: cErr } = await getCourseById(courseId);
    if (cErr) {
      setCourse(null);
      setSessions([]);
      setPublishRequest(null);
      setError(cErr);
      setIsLoading(false);
      return;
    }

    setCourse(c);

    const { data: s, error: sErr } = await listSessions({
      role,
      userId: user?.id,
      courseId,
      search: "",
      sort: "starts_asc",
      page: 0,
      pageSize: 25,
    });

    if (sErr) {
      setSessions([]);
      setError(sErr);
      setIsLoading(false);
      return;
    }

    setSessions(s);

    if (isSupabaseConfigured && isInstructor && user?.id) {
      const { data: pr, error: prErr } = await getCoursePublishRequestForCourse({ courseId });
      if (prErr) {
        // Keep course visible; show error in main area.
        setPublishRequest(null);
        setError(prErr);
      } else {
        setPublishRequest(pr ?? null);
      }
    } else {
      setPublishRequest(null);
    }

    setIsLoading(false);
  }, [courseId, role, user?.id, isInstructor, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onDeleteCourse = async () => {
    if (!canManage || !course?.id) return;

    const ok = window.confirm(`Delete course "${course.title}"?\n\nThis will also remove its sessions (if configured).`);
    if (!ok) return;

    setIsLoading(true);
    setError("");

    const { error: delErr } = await deleteCourse(course.id);
    if (delErr) {
      setError(delErr);
      setIsLoading(false);
      return;
    }

    navigate("/courses");
  };

  const onSubmitForApproval = async (comment) => {
    if (!isInstructor || !user?.id || !course?.id) return;

    setIsSubmittingPublish(true);
    setError("");

    const { data, error: e } = await submitCoursePublishRequest({
      role,
      actorUserId: user.id,
      courseId: course.id,
      comment,
    });

    if (e) {
      setError(e);
      setIsSubmittingPublish(false);
      return;
    }

    setPublishRequest(data);
    setIsSubmittingPublish(false);
    setIsPublishModalOpen(false);
  };

  const publishStatusBadge = useMemo(() => {
    const status = publishRequest?.status;
    if (!status) return { cls: "badge badgeNeutral", label: "Not submitted" };
    if (status === "pending") return { cls: "badge badgeWarning", label: "Pending review" };
    if (status === "approved") return { cls: "badge badgeSuccess", label: "Approved" };
    if (status === "returned") return { cls: "badge badgeError", label: "Returned" };
    return { cls: "badge badgeNeutral", label: status };
  }, [publishRequest?.status]);

  return (
    <>
      <div className="card subHeaderCard" aria-label="Course header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className={course?.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                {course?.is_published ? "Published" : "Draft"}
              </span>
              <span className="muted">
                Updated: <span className="mono">{formatDateTime(course?.updated_at || course?.created_at)}</span>
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/courses">
              Back
            </Link>

            {canManage ? (
              <>
                <Link className="button buttonSecondary" to={`/courses/${courseId}/edit`}>
                  Edit
                </Link>
                <button
                  type="button"
                  className="button buttonDanger"
                  onClick={onDeleteCourse}
                  disabled={!isSupabaseConfigured || isLoading}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <p className="helpText">
            Supabase is not configured. Data shown here may be incomplete until env vars are set.
          </p>
        ) : null}
      </div>

      {isInstructor ? (
        <div className="card" aria-label="Publishing approval">
          <div className="cardTitle">Publishing approval</div>

          <div className="subHeaderMeta" style={{ marginBottom: 10 }}>
            <span className={publishStatusBadge.cls}>{publishStatusBadge.label}</span>
            {publishRequest?.id ? (
              <Link className="inlineLink" to={`/approvals/publishing/${publishRequest.id}`}>
                View request
              </Link>
            ) : null}
          </div>

          <p className="cardBody">
            Instructors submit courses for publishing approval. Admins approve or return the request with feedback.
          </p>

          <div className="rowActions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button buttonPrimary"
              onClick={() => setIsPublishModalOpen(true)}
              disabled={!isSupabaseConfigured || Boolean(course?.is_published) || isSubmittingPublish}
            >
              {publishRequest?.status === "returned" ? "Resubmit for approval" : "Submit for approval"}
            </button>
            <Link className="button buttonSecondary" to="/approvals">
              Go to approvals
            </Link>
          </div>

          {course?.is_published ? (
            <p className="helpText">This course is already published.</p>
          ) : null}
        </div>
      ) : null}

      <div className="card" aria-label="Course overview">
        <div className="cardTitle">Overview</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading && !course ? (
          <p className="cardBody">Loading course…</p>
        ) : course ? (
          <>
            <div className="kvGrid">
              <div className="kvItem">
                <div className="kvKey">Course ID</div>
                <div className="kvValue mono">{course.id}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Owner</div>
                <div className="kvValue mono">{course.owner_id || "—"}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Created</div>
                <div className="kvValue mono">{formatDateTime(course.created_at)}</div>
              </div>
            </div>

            {course.description ? <p className="cardBody" style={{ marginTop: 12 }}>{course.description}</p> : null}
          </>
        ) : (
          <p className="cardBody muted">Course not found or you don’t have access.</p>
        )}
      </div>

      <div className="card" aria-label="Course sessions">
        <div className="cardTitle">Sessions</div>

        {canManage ? (
          <div className="rowActions" style={{ marginBottom: 12 }}>
            <Link className="button buttonPrimary" to={`/sessions/new?courseId=${encodeURIComponent(courseId || "")}`}>
              New session
            </Link>
          </div>
        ) : null}

        {isLoading && course ? <p className="cardBody">Loading sessions…</p> : null}

        {!isLoading && sessions.length === 0 ? (
          <p className="cardBody muted">No sessions yet.</p>
        ) : sessions.length > 0 ? (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "46%" }}>Title</th>
                  <th style={{ width: "26%" }}>Starts</th>
                  <th style={{ width: "12%" }}>Published</th>
                  <th style={{ width: "16%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cellTitle">{s.title}</div>
                      {s.location ? <div className="cellSub">{s.location}</div> : null}
                    </td>
                    <td className="mono">{formatDateTime(s.starts_at)}</td>
                    <td>
                      <span className={s.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                        {s.is_published ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>
                      <Link className="button buttonSecondary" to={`/sessions/${s.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <PublishRequestModal
        open={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onConfirm={onSubmitForApproval}
        busy={isSubmittingPublish}
      />
    </>
  );
}
