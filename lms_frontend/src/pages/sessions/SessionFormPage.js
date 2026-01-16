import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { createSession, getSessionById, updateSession } from "../../data/sessions";
import { listCourses } from "../../data/courses";
import { validateSessionInput } from "../../features/sessions/validation";
import { toDatetimeLocalValue, toIsoFromDatetimeLocal } from "../../utils/datetime";

// PUBLIC_INTERFACE
export default function SessionFormPage({ mode }) {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();

  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "Edit session" : "Create session";

  const preselectedCourseId = searchParams.get("courseId") || "";

  const [courseId, setCourseId] = useState(preselectedCourseId);
  const [title, setTitle] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const [courseOptions, setCourseOptions] = useState([]);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const instructorId = useMemo(() => user?.id || "", [user?.id]);

  const loadCourseOptions = useCallback(async () => {
    if (!canManage) return;
    const { data, error: e } = await listCourses({
      role,
      userId: user?.id,
      search: "",
      sort: "title_asc",
      page: 0,
      pageSize: 300,
    });
    if (!e) setCourseOptions(data);
  }, [canManage, role, user?.id]);

  const load = useCallback(async () => {
    await loadCourseOptions();

    if (!isEdit || !sessionId) return;

    setIsLoading(true);
    setFormError("");

    const { data, error } = await getSessionById(sessionId);
    if (error) {
      setFormError(error);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setFormError("Session not found.");
      setIsLoading(false);
      return;
    }

    setCourseId(data.course_id || "");
    setTitle(data.title || "");
    setStartsAtLocal(toDatetimeLocalValue(data.starts_at));
    setEndsAtLocal(toDatetimeLocalValue(data.ends_at));
    setLocation(data.location || "");
    setCapacity(data.capacity === null || data.capacity === undefined ? "" : String(data.capacity));
    setIsPublished(Boolean(data.is_published));

    setIsLoading(false);
  }, [isEdit, sessionId, loadCourseOptions]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setErrors({});

    const validation = validateSessionInput({
      course_id: courseId,
      title,
      starts_at_local: startsAtLocal,
      ends_at_local: endsAtLocal,
      capacity,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (!isSupabaseConfigured) {
      setFormError("Supabase is not configured.");
      return;
    }

    if (!instructorId) {
      setFormError("Missing instructor id (sign-in required).");
      return;
    }

    const startsAtIso = toIsoFromDatetimeLocal(startsAtLocal);
    const endsAtIso = toIsoFromDatetimeLocal(endsAtLocal);

    if (!startsAtIso) {
      setErrors((prev) => ({ ...prev, starts_at_local: "Start date/time is invalid." }));
      return;
    }

    const capVal = String(capacity).trim() === "" ? null : Number(capacity);

    setIsSaving(true);

    if (isEdit) {
      const { data, error } = await updateSession(sessionId, {
        course_id: courseId.trim(),
        title: title.trim(),
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        location: location.trim() ? location.trim() : null,
        capacity: capVal,
        is_published: Boolean(isPublished),
        // Keep instructor_id stable unless admin chooses to change it later (not exposed here).
      });

      if (error) {
        setFormError(error);
        setIsSaving(false);
        return;
      }

      navigate(`/sessions/${data?.id || sessionId}`);
      return;
    }

    const { data, error } = await createSession({
      course_id: courseId.trim(),
      title: title.trim(),
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      location: location.trim() ? location.trim() : null,
      capacity: capVal,
      is_published: Boolean(isPublished),
      instructor_id: instructorId,
    });

    if (error) {
      setFormError(error);
      setIsSaving(false);
      return;
    }

    navigate(`/sessions/${data?.id}`);
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Session form header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{pageTitle}</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Admins and instructors can schedule sessions. Learners are read-only.
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to={isEdit ? `/sessions/${sessionId}` : "/sessions"}>
              Cancel
            </Link>
          </div>
        </div>
      </div>

      <div className="card" aria-label="Session form">
        <div className="cardTitle">Details</div>

        {!canManage ? (
          <div className="alert alertError" role="alert">
            You don’t have permission to create or edit sessions.
          </div>
        ) : null}

        {formError ? (
          <div className="alert alertError" role="alert">
            {formError}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading…</p>
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <div className="formField">
              <label className="label" htmlFor="session-course">
                Course
              </label>
              <select
                id="session-course"
                className="select"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                disabled={!canManage || isSaving}
                required
              >
                <option value="">Select a course…</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {errors.course_id ? <div className="fieldError">{errors.course_id}</div> : null}
              {canManage && courseOptions.length === 0 ? (
                <div className="helpText">
                  No courses available. Create a course first, or ensure RLS allows you to view your courses.
                </div>
              ) : null}
            </div>

            <div className="formField">
              <label className="label" htmlFor="session-title">
                Title
              </label>
              <input
                id="session-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Live Q&A: Safety Procedures"
                disabled={!canManage || isSaving}
                required
              />
              {errors.title ? <div className="fieldError">{errors.title}</div> : null}
            </div>

            <div className="formRow formRow2">
              <div className="formField">
                <label className="label" htmlFor="session-start">
                  Starts
                </label>
                <input
                  id="session-start"
                  className="input mono"
                  type="datetime-local"
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                  disabled={!canManage || isSaving}
                  required
                />
                {errors.starts_at_local ? <div className="fieldError">{errors.starts_at_local}</div> : null}
              </div>

              <div className="formField">
                <label className="label" htmlFor="session-end">
                  Ends (optional)
                </label>
                <input
                  id="session-end"
                  className="input mono"
                  type="datetime-local"
                  value={endsAtLocal}
                  onChange={(e) => setEndsAtLocal(e.target.value)}
                  disabled={!canManage || isSaving}
                />
                {errors.ends_at_local ? <div className="fieldError">{errors.ends_at_local}</div> : null}
              </div>
            </div>

            <div className="formRow formRow2">
              <div className="formField">
                <label className="label" htmlFor="session-location">
                  Location (optional)
                </label>
                <input
                  id="session-location"
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Room 3B / Zoom link"
                  disabled={!canManage || isSaving}
                />
              </div>

              <div className="formField">
                <label className="label" htmlFor="session-capacity">
                  Capacity (optional)
                </label>
                <input
                  id="session-capacity"
                  className="input mono"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g., 25"
                  inputMode="numeric"
                  disabled={!canManage || isSaving}
                />
                {errors.capacity ? <div className="fieldError">{errors.capacity}</div> : null}
              </div>
            </div>

            <div className="formRow">
              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  disabled={!canManage || isSaving}
                />
                <span>
                  Publish session (learners can see it)
                  <span className="helpText" style={{ display: "block" }}>
                    Draft sessions are visible to admins and the owning instructor only (recommended with RLS).
                  </span>
                </span>
              </label>
            </div>

            <div className="formActions">
              <button type="submit" className="button buttonPrimary" disabled={!canManage || isSaving}>
                {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create session"}
              </button>
              <Link className="button buttonSecondary" to={isEdit ? `/sessions/${sessionId}` : "/sessions"}>
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
