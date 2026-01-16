import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { listApprovals, decideCoursePublishRequest, reviewEnrollmentRequest } from "../../data/approvals";
import { formatDateTime } from "../../utils/datetime";

const PAGE_SIZE = 25;

function statusLabel(kind, status) {
  if (kind === "publishing" && status === "returned") return "Returned";
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "denied") return "Denied";
  return status || "—";
}

function statusBadgeClass(kind, status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "badge badgeSuccess";
  if (s === "pending") return "badge badgeWarning";
  if (s === "denied" || (kind === "publishing" && s === "returned")) return "badge badgeError";
  return "badge badgeNeutral";
}

function kindLabel(kind) {
  if (kind === "enrollment") return "Enrollment";
  if (kind === "publishing") return "Publishing";
  return "Request";
}

function itemTitle(item) {
  if (item.kind === "enrollment") {
    return item.session?.title || "Session";
  }
  if (item.kind === "publishing") {
    return item.course?.title || "Course";
  }
  return "Approval";
}

function itemSubtitle(item) {
  if (item.kind === "enrollment") {
    const courseTitle = item.session?.course?.title;
    return courseTitle ? `Course: ${courseTitle}` : null;
  }
  if (item.kind === "publishing") {
    return "Course publishing request";
  }
  return null;
}

function isActionable({ item, role, userId }) {
  if (!item || item.status !== "pending") return false;

  if (item.kind === "enrollment") {
    if (role === "admin") return true;
    if (role === "instructor") {
      return item.session?.instructor_id && userId && item.session.instructor_id === userId;
    }
    return false;
  }

  if (item.kind === "publishing") {
    return role === "admin";
  }

  return false;
}

function buildApprovalLink(item) {
  if (item.kind === "enrollment") return `/approvals/enrollment/${item.id}`;
  return `/approvals/publishing/${item.id}`;
}

function DecisionModal({ open, title, confirmLabel, confirmTone, initialComment, onClose, onConfirm, busy }) {
  const [comment, setComment] = useState(initialComment || "");

  useEffect(() => {
    if (open) setComment(initialComment || "");
  }, [open, initialComment]);

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
            <label className="label" htmlFor="decision-comment">
              Comment (optional)
            </label>
            <textarea
              id="decision-comment"
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
export default function ApprovalsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useAuthorization();

  const [activeTab, setActiveTab] = useState("pending"); // pending | approved | denied | mine
  const [typeFilter, setTypeFilter] = useState("all"); // all | enrollment | publishing

  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);

  const [selectedId, setSelectedId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [decisionState, setDecisionState] = useState(null);
  const [isDeciding, setIsDeciding] = useState(false);

  const mineOnly = activeTab === "mine";
  const status = useMemo(() => {
    if (activeTab === "mine") return "all";
    return activeTab;
  }, [activeTab]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const canPrev = page > 0;
  const canNext = rows.length === PAGE_SIZE;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const { data, error: loadErr } = await listApprovals({
      role,
      userId: user?.id,
      status,
      type: typeFilter,
      mineOnly,
      page,
      pageSize: PAGE_SIZE,
    });

    if (loadErr) {
      setRows([]);
      setError(loadErr);
      setIsLoading(false);
      return;
    }

    setRows(data);
    if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    setIsLoading(false);
  }, [role, user?.id, status, typeFilter, mineOnly, page, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs = useMemo(
    () => [
      { key: "pending", label: "Pending" },
      { key: "approved", label: "Approved" },
      { key: "denied", label: "Denied" },
      { key: "mine", label: "Mine" },
    ],
    []
  );

  const onOpenDecision = (item, action) => {
    if (!item) return;
    setDecisionState({ item, action });
  };

  const onCloseDecision = () => setDecisionState(null);

  const onConfirmDecision = async (comment) => {
    if (!decisionState?.item) return;

    setIsDeciding(true);
    setError("");

    const item = decisionState.item;
    const action = decisionState.action;

    if (item.kind === "enrollment") {
      const decision = action === "approve" ? "approve" : "deny";
      const { error: e } = await reviewEnrollmentRequest({
        role,
        actorUserId: user?.id,
        requestId: item.id,
        decision,
        comment,
      });

      if (e) {
        setError(e);
        setIsDeciding(false);
        return;
      }
    } else if (item.kind === "publishing") {
      const decision = action === "approve" ? "approve" : "return";
      const { error: e } = await decideCoursePublishRequest({
        role,
        actorUserId: user?.id,
        requestId: item.id,
        decision,
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

  const decisionTitle = useMemo(() => {
    if (!decisionState?.item) return "";
    const name = itemTitle(decisionState.item);
    if (decisionState.action === "approve") return `Approve “${name}”?`;
    return decisionState.item.kind === "publishing" ? `Return “${name}” for changes?` : `Deny “${name}”?`;
  }, [decisionState]);

  const decisionConfirmLabel = useMemo(() => {
    if (!decisionState?.item) return "";
    if (decisionState.action === "approve") return "Approve";
    return decisionState.item.kind === "publishing" ? "Return" : "Deny";
  }, [decisionState]);

  const decisionTone = useMemo(() => {
    if (!decisionState?.item) return "primary";
    if (decisionState.action === "approve") return "primary";
    return "danger";
  }, [decisionState]);

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

      <div className="card toolbarCard" aria-label="Approvals controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="approvals-type">
              Type
            </label>
            <select
              id="approvals-type"
              className="select"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
                setSelectedId(null);
              }}
              disabled={!isSupabaseConfigured}
            >
              <option value="all">All</option>
              <option value="enrollment">Enrollment requests</option>
              <option value="publishing">Course publishing</option>
            </select>
          </div>

          <div className="tabsRow" aria-label="Approval filters">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={t.key === activeTab ? "tabButton tabButtonActive" : "tabButton"}
                onClick={() => {
                  setActiveTab(t.key);
                  setPage(0);
                  setSelectedId(null);
                }}
                disabled={!isSupabaseConfigured}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbarRight">
          <span className="pill" aria-label="Role scope">
            {role === "admin" ? "Admin queue" : role === "instructor" ? "Instructor scope" : "My requests"}
          </span>
        </div>
      </div>

      <div className="splitGrid" aria-label="Approvals content">
        <div className="card" aria-label="Approvals list">
          <div className="cardTitle">Requests</div>

          {error ? (
            <div className="alert alertError" role="alert">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <p className="cardBody">Loading approvals…</p>
          ) : rows.length === 0 ? (
            <p className="cardBody muted">
              No requests found for this view. Try a different tab/filter.
            </p>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "14%" }}>Type</th>
                    <th style={{ width: "40%" }}>Item</th>
                    <th style={{ width: "18%" }}>Requester</th>
                    <th style={{ width: "12%" }}>Status</th>
                    <th style={{ width: "16%" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const title = itemTitle(r);
                    const sub = itemSubtitle(r);
                    const actionable = isActionable({ item: r, role, userId: user?.id });

                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        style={{
                          cursor: "pointer",
                          background: r.id === selectedId ? "rgba(55, 65, 81, 0.03)" : undefined,
                        }}
                      >
                        <td>
                          <span className="badge badgeNeutral">{kindLabel(r.kind)}</span>
                        </td>
                        <td>
                          <div className="cellTitle">{title}</div>
                          {sub ? <div className="cellSub">{sub}</div> : null}
                        </td>
                        <td className="mono">{r.requester_id || "—"}</td>
                        <td>
                          <span className={statusBadgeClass(r.kind, r.status)}>{statusLabel(r.kind, r.status)}</span>
                        </td>
                        <td>
                          <div className="rowActions">
                            <button
                              type="button"
                              className="button buttonSecondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(buildApprovalLink(r));
                              }}
                            >
                              View
                            </button>

                            {actionable ? (
                              <>
                                <button
                                  type="button"
                                  className="button buttonPrimary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDecision(r, "approve");
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="button buttonDanger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDecision(r, "deny");
                                  }}
                                >
                                  {r.kind === "publishing" ? "Return" : "Deny"}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="helpText">
            Tips: “Denied” includes returned publishing requests. “Mine” shows requests you submitted (learners: enrollment
            requests; instructors: publishing requests).
          </div>
        </div>

        <div className="card" aria-label="Approval details panel">
          <div className="cardTitle">Details</div>

          {!selected ? (
            <p className="cardBody muted">Select a request from the list to see details here.</p>
          ) : (
            <>
              <div className="subHeaderTitle" style={{ marginBottom: 6 }}>
                {itemTitle(selected)}
              </div>
              <div className="subHeaderMeta" style={{ marginBottom: 12 }}>
                <span className="badge badgeNeutral">{kindLabel(selected.kind)}</span>
                <span className={statusBadgeClass(selected.kind, selected.status)}>
                  {statusLabel(selected.kind, selected.status)}
                </span>
              </div>

              <div className="kvGrid">
                <div className="kvItem">
                  <div className="kvKey">Request ID</div>
                  <div className="kvValue mono">{selected.id}</div>
                </div>
                <div className="kvItem">
                  <div className="kvKey">Requester</div>
                  <div className="kvValue mono">{selected.requester_id || "—"}</div>
                </div>
                <div className="kvItem">
                  <div className="kvKey">Updated</div>
                  <div className="kvValue mono">{formatDateTime(selected.updated_at || selected.created_at)}</div>
                </div>
              </div>

              {selected.reviewer_comment ? (
                <div style={{ marginTop: 12 }}>
                  <div className="labelSmall">Latest comment</div>
                  <p className="cardBody" style={{ marginTop: 6 }}>
                    {selected.reviewer_comment}
                  </p>
                </div>
              ) : null}

              <div className="rowActions" style={{ marginTop: 14 }}>
                <Link className="button buttonSecondary" to={buildApprovalLink(selected)}>
                  Open details
                </Link>

                {isActionable({ item: selected, role, userId: user?.id }) ? (
                  <>
                    <button type="button" className="button buttonPrimary" onClick={() => onOpenDecision(selected, "approve")}>
                      Approve
                    </button>
                    <button type="button" className="button buttonDanger" onClick={() => onOpenDecision(selected, "deny")}>
                      {selected.kind === "publishing" ? "Return" : "Deny"}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card" aria-label="Pagination">
        <div className="paginationRow">
          <div className="muted">
            Page <strong>{page + 1}</strong>
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
            <button type="button" className="button buttonSecondary" onClick={() => setPage((p) => p + 1)} disabled={!canNext || isLoading}>
              Next
            </button>
          </div>
        </div>
        <p className="helpText">Pagination is applied after merging enrollment + publishing requests (simple client-side merge).</p>
      </div>

      <DecisionModal
        open={Boolean(decisionState)}
        title={decisionTitle}
        confirmLabel={decisionConfirmLabel}
        confirmTone={decisionTone}
        initialComment=""
        onClose={onCloseDecision}
        onConfirm={onConfirmDecision}
        busy={isDeciding}
      />
    </>
  );
}
