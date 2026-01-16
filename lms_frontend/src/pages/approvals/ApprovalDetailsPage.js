import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import {
  decideCoursePublishRequest,
  getCoursePublishRequestById,
  getEnrollmentRequestById,
  reviewEnrollmentRequest,
} from "../../data/approvals";
import { formatDateTime } from "../../utils/datetime";

function normalizeCategory(category) {
  const c = String(category || "").toLowerCase().trim();
  if (c === "enrollment") return "enrollment";
  if (c === "publishing") return "publishing";
  return null;
}

function badgeClass(kind, status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "badge badgeSuccess";
  if (s === "pending") return "badge badgeWarning";
  if (s === "denied" || (kind === "publishing" && s === "returned")) return "badge badgeError";
  return "badge badgeNeutral";
}

function statusLabel(kind, status) {
  if (kind === "publishing" && status === "returned") return "Returned";
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "denied") return "Denied";
  return status || "—";
}

function canAct({ kind, role, userId, data }) {
  if (!data || data.status !== "pending") return false;

  if (kind === "enrollment") {
    if (role === "admin") return true;
    if (role === "instructor") return data?.session?.instructor_id && userId && data.session.instructor_id === userId;
    return false;
  }

  if (kind === "publishing") {
    return role === "admin";
  }

  return false;
}

function DecisionModal({ open, title, confirmLabel, confirmTone, onClose, onConfirm, busy }) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close modal" disabled={busy}>
            ×
          </button>
        </div>

        <div className="modalBody">
          <div className="formField">
            <label className="label" htmlFor="approval-comment">
              Comment (optional)
            </label>
            <textarea
              id="approval-comment"
              className="textarea"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add an optional note for audit/feedback…"
              disabled={busy}
            />
          </div>
        </div>

        <div className="modalActions">
          <button type="button" className="button buttonSecondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={["button", confirmTone === "danger" ? "buttonDanger" : "buttonPrimary"].join(" ")}
            onClick={() => onConfirm(comment)}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// PUBLIC_INTERFACE
export default function ApprovalDetailsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useAuthorization();
  const { category, requestId } = useParams();

  const kind = useMemo(() => normalizeCategory(category), [category]);

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [decisionState, setDecisionState] = useState(null); // { action: "approve"|"deny" }
  const [isDeciding, setIsDeciding] = useState(false);

  const load = useCallback(async () => {
    if (!kind || !requestId) return;

    setIsLoading(true);
    setError("");

    if (kind === "enrollment") {
      const { data: r, error: e } = await getEnrollmentRequestById({ requestId });
      if (e) {
        setError(e);
        setData(null);
        setIsLoading(false);
        return;
      }
      setData(r);
      setIsLoading(false);
      return;
    }

    const { data: r, error: e } = await getCoursePublishRequestById({ requestId });
    if (e) {
      setError(e);
      setData(null);
      setIsLoading(false);
      return;
    }
    setData(r);
    setIsLoading(false);
  }, [kind, requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const title = useMemo(() => {
    if (!kind) return "Approval";
    if (kind === "enrollment") return data?.session?.title || "Enrollment request";
    return data?.course?.title || "Publishing request";
  }, [kind, data]);

  const updatedAt = useMemo(() => {
    if (!data) return null;
    if (kind === "enrollment") return data.reviewed_at || data.requested_at;
    return data.decided_at || data.requested_at;
  }, [data, kind]);

  const actionable = useMemo(() => canAct({ kind, role, userId: user?.id, data }), [kind, role, user?.id, data]);

  const onConfirmDecision = async (comment) => {
    if (!decisionState || !actionable) return;
    setIsDeciding(true);
    setError("");

    if (kind === "enrollment") {
      const { error: e } = await reviewEnrollmentRequest({
        role,
        actorUserId: user?.id,
        requestId,
        decision: decisionState.action === "approve" ? "approve" : "deny",
        comment,
      });

      if (e) {
        setError(e);
        setIsDeciding(false);
        return;
      }
    } else if (kind === "publishing") {
      const { error: e } = await decideCoursePublishRequest({
        role,
        actorUserId: user?.id,
        requestId,
        decision: decisionState.action === "approve" ? "approve" : "return",
        comment,
      });

      if (e) {
        setError(e);
        setIsDeciding(false);
        return;
      }
    }

    setIsDeciding(false);
    setDecisionState(null);
    await load();
  };

  if (!kind) {
    return (
      <div className="card" aria-label="Invalid approval route">
        <div className="cardTitle">Approval not found</div>
        <p className="cardBody muted">This approval link is invalid.</p>
        <div className="rowActions" style={{ marginTop: 12 }}>
          <Link className="button buttonSecondary" to="/approvals">
            Back to approvals
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Approvals require <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code>.
          </p>
        </div>
      ) : null}

      <div className="card subHeaderCard" aria-label="Approval header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className="badge badgeNeutral">{kind === "enrollment" ? "Enrollment" : "Publishing"}</span>
              <span className={badgeClass(kind, data?.status)}>{statusLabel(kind, data?.status)}</span>
              <span className="muted">
                Updated: <span className="mono">{formatDateTime(updatedAt)}</span>
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/approvals">
              Back
            </Link>

            {actionable ? (
              <>
                <button type="button" className="button buttonPrimary" onClick={() => setDecisionState({ action: "approve" })}>
                  Approve
                </button>
                <button type="button" className="button buttonDanger" onClick={() => setDecisionState({ action: "deny" })}>
                  {kind === "publishing" ? "Return" : "Deny"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card" aria-label="Approval details">
        <div className="cardTitle">Details</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading…</p>
        ) : !data ? (
          <p className="cardBody muted">Approval request not found or you don’t have access.</p>
        ) : kind === "enrollment" ? (
          <>
            <div className="kvGrid">
              <div className="kvItem">
                <div className="kvKey">Request ID</div>
                <div className="kvValue mono">{data.id}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Learner</div>
                <div className="kvValue mono">{data.user_id}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Session</div>
                <div className="kvValue">
                  {data.session?.id ? (
                    <Link className="inlineLink" to={`/sessions/${data.session.id}`}>
                      {data.session.title}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Course</div>
                <div className="kvValue">
                  {data.session?.course?.id ? (
                    <Link className="inlineLink" to={`/courses/${data.session.course.id}`}>
                      {data.session.course.title}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Requested</div>
                <div className="kvValue mono">{formatDateTime(data.requested_at)}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Reviewed</div>
                <div className="kvValue mono">{formatDateTime(data.reviewed_at)}</div>
              </div>
            </div>

            {data.reviewer_comment ? (
              <div style={{ marginTop: 12 }}>
                <div className="labelSmall">Reviewer comment</div>
                <p className="cardBody" style={{ marginTop: 6 }}>
                  {data.reviewer_comment}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="kvGrid">
              <div className="kvItem">
                <div className="kvKey">Request ID</div>
                <div className="kvValue mono">{data.id}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Requested by</div>
                <div className="kvValue mono">{data.requested_by}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Course</div>
                <div className="kvValue">
                  {data.course?.id ? (
                    <Link className="inlineLink" to={`/courses/${data.course.id}`}>
                      {data.course.title}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Requested</div>
                <div className="kvValue mono">{formatDateTime(data.requested_at)}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Decided</div>
                <div className="kvValue mono">{formatDateTime(data.decided_at)}</div>
              </div>
              <div className="kvItem">
                <div className="kvKey">Published</div>
                <div className="kvValue">
                  <span className={data.course?.is_published ? "badge badgeSuccess" : "badge badgeNeutral"}>
                    {data.course?.is_published ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {data.admin_comment ? (
              <div style={{ marginTop: 12 }}>
                <div className="labelSmall">Admin comment</div>
                <p className="cardBody" style={{ marginTop: 6 }}>
                  {data.admin_comment}
                </p>
              </div>
            ) : null}
          </>
        )}

        <div className="rowActions" style={{ marginTop: 14 }}>
          <button type="button" className="button buttonSecondary" onClick={() => navigate("/approvals")}>
            Back to list
          </button>
        </div>
      </div>

      <DecisionModal
        open={Boolean(decisionState)}
        title={decisionState?.action === "approve" ? `Approve “${title}”?` : kind === "publishing" ? `Return “${title}” for changes?` : `Deny “${title}”?`}
        confirmLabel={decisionState?.action === "approve" ? "Approve" : kind === "publishing" ? "Return" : "Deny"}
        confirmTone={decisionState?.action === "approve" ? "primary" : "danger"}
        onClose={() => setDecisionState(null)}
        onConfirm={onConfirmDecision}
        busy={isDeciding}
      />
    </>
  );
}
