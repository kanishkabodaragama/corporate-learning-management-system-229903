import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { listSessions } from "../../data/sessions";
import { addEnrollmentsBulk } from "../../data/enrollments";

// PUBLIC_INTERFACE
export default function EnrollmentAddPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user } = useAuth();
  const { role } = useAuthorization();

  const preselectedSessionId = searchParams.get("sessionId") || "";

  const [sessionId, setSessionId] = useState(preselectedSessionId);
  const [learnerIdsText, setLearnerIdsText] = useState("");
  const [sessionOptions, setSessionOptions] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [resultRows, setResultRows] = useState([]);

  const parsedLearnerIds = useMemo(() => {
    // Accept comma/newline/space separated uuids.
    const raw = String(learnerIdsText || "");
    const parts = raw
      .split(/[\s,]+/g)
      .map((v) => v.trim())
      .filter(Boolean);
    return Array.from(new Set(parts));
  }, [learnerIdsText]);

  const loadSessions = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const { data } = await listSessions({
      role,
      userId: user?.id,
      search: "",
      sort: "starts_desc",
      page: 0,
      pageSize: 400,
      courseId: null,
    });

    setSessionOptions(Array.isArray(data) ? data : []);
  }, [role, user?.id]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setResultRows([]);

    if (!isSupabaseConfigured) {
      setFormError("Supabase is not configured.");
      return;
    }

    if (!sessionId.trim()) {
      setFormError("Please select a session.");
      return;
    }

    if (parsedLearnerIds.length === 0) {
      setFormError("Please paste at least one learner user id.");
      return;
    }

    setIsLoading(true);

    const { data, error } = await addEnrollmentsBulk({
      role,
      actorUserId: user?.id,
      sessionId: sessionId.trim(),
      learnerIds: parsedLearnerIds,
    });

    if (error) {
      setFormError(error);
      setIsLoading(false);
      return;
    }

    setResultRows(data);
    setIsLoading(false);
  };

  const onDone = () => {
    // Go back to enrollments list with session filter for convenience.
    navigate(`/enrollments?sessionId=${encodeURIComponent(sessionId || "")}`);
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Add enrollments header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">Add learners to a session</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Paste learner user ids (UUIDs). Duplicates are ignored via unique constraint (recommended).
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/enrollments">
              Cancel
            </Link>
          </div>
        </div>
      </div>

      <div className="card" aria-label="Add enrollments form">
        <div className="cardTitle">Enrollment form</div>

        {formError ? (
          <div className="alert alertError" role="alert">
            {formError}
          </div>
        ) : null}

        <form className="form" onSubmit={onSubmit}>
          <div className="formField">
            <label className="label" htmlFor="enroll-add-session">
              Session
            </label>
            <select
              id="enroll-add-session"
              className="select"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={!isSupabaseConfigured || isLoading}
              required
            >
              <option value="">Select a session…</option>
              {sessionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {sessionOptions.length === 0 ? (
              <div className="helpText">
                No sessions available. Ensure you have access to sessions (RLS) and that at least one session exists.
              </div>
            ) : null}
          </div>

          <div className="formField">
            <label className="label" htmlFor="enroll-add-learners">
              Learner User IDs
            </label>
            <textarea
              id="enroll-add-learners"
              className="textarea mono"
              rows={6}
              value={learnerIdsText}
              onChange={(e) => setLearnerIdsText(e.target.value)}
              placeholder={"uuid1\nuuid2\nuuid3"}
              disabled={!isSupabaseConfigured || isLoading}
            />
            <div className="helpText">
              Parsed: <strong>{parsedLearnerIds.length}</strong> unique id(s).
            </div>
          </div>

          <div className="formActions">
            <button type="submit" className="button buttonPrimary" disabled={!isSupabaseConfigured || isLoading}>
              {isLoading ? "Adding…" : "Add enrollments"}
            </button>
            <button type="button" className="button buttonSecondary" onClick={onDone} disabled={isLoading}>
              Done
            </button>
          </div>
        </form>
      </div>

      {resultRows.length > 0 ? (
        <div className="card" aria-label="Enrollment results">
          <div className="cardTitle">Result</div>
          <p className="cardBody">
            Created/ensured <strong>{resultRows.length}</strong> enrollment row(s).
          </p>
          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Enrollment ID</th>
                  <th style={{ width: "35%" }}>Learner</th>
                  <th style={{ width: "20%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td className="mono">{r.user_id}</td>
                    <td>
                      <Link className="button buttonSecondary" to={`/enrollments/${r.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="helpText">
            If a learner was already enrolled, the unique constraint prevents duplicates (recommended schema uses
            (session_id,user_id) unique).
          </p>
        </div>
      ) : null}
    </>
  );
}
