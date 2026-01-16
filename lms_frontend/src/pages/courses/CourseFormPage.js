import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { createCourse, getCourseById, updateCourse } from "../../data/courses";
import { validateCourseInput } from "../../features/courses/validation";

// PUBLIC_INTERFACE
export default function CourseFormPage({ mode }) {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);
  const canPublishDirectly = role === "admin";

  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "Edit course" : "Create course";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  // Admin-only advanced field (optional).
  const [ownerId, setOwnerId] = useState("");

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const effectiveOwnerId = useMemo(() => {
    if (role === "admin" && ownerId.trim()) return ownerId.trim();
    return user?.id || "";
  }, [role, ownerId, user?.id]);

  const load = useCallback(async () => {
    if (!isEdit || !courseId) return;

    setIsLoading(true);
    setFormError("");

    const { data, error } = await getCourseById(courseId);
    if (error) {
      setFormError(error);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setFormError("Course not found.");
      setIsLoading(false);
      return;
    }

    setTitle(data.title || "");
    setDescription(data.description || "");
    setIsPublished(Boolean(data.is_published));
    setOwnerId(data.owner_id || "");
    setIsLoading(false);
  }, [isEdit, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setErrors({});

    const validation = validateCourseInput({
      title,
      description,
      owner_id: role === "admin" ? ownerId : undefined,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (!isSupabaseConfigured) {
      setFormError("Supabase is not configured.");
      return;
    }

    if (!effectiveOwnerId) {
      setFormError("Missing owner id (sign-in required).");
      return;
    }

    setIsSaving(true);

    if (isEdit) {
      const payload = {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        ...(role === "admin" ? { is_published: Boolean(isPublished) } : {}),
        ...(role === "admin" && ownerId.trim() ? { owner_id: ownerId.trim() } : {}),
      };

      const { data, error } = await updateCourse(courseId, payload);

      if (error) {
        setFormError(error);
        setIsSaving(false);
        return;
      }

      navigate(`/courses/${data?.id || courseId}`);
      return;
    }

    const { data, error } = await createCourse({
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      // Instructors do not publish directly (publishing is handled via approvals).
      is_published: role === "admin" ? Boolean(isPublished) : false,
      owner_id: effectiveOwnerId,
    });

    if (error) {
      setFormError(error);
      setIsSaving(false);
      return;
    }

    navigate(`/courses/${data?.id}`);
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Course form header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{pageTitle}</div>
            <div className="subHeaderMeta">
              <span className="muted">
                {role === "admin"
                  ? "Admins can manage the catalog and publishing."
                  : "Instructors can create and manage their own courses (publishing requires approval)."}
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to={isEdit ? `/courses/${courseId}` : "/courses"}>
              Cancel
            </Link>
          </div>
        </div>
      </div>

      <div className="card" aria-label="Course form">
        <div className="cardTitle">Details</div>

        {!canManage ? (
          <div className="alert alertError" role="alert">
            You don’t have permission to create or edit courses.
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
              <label className="label" htmlFor="course-title">
                Title
              </label>
              <input
                id="course-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Workplace Safety Fundamentals"
                disabled={!canManage || isSaving}
                required
              />
              {errors.title ? <div className="fieldError">{errors.title}</div> : null}
            </div>

            <div className="formField">
              <label className="label" htmlFor="course-description">
                Description
              </label>
              <textarea
                id="course-description"
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short overview for learners…"
                disabled={!canManage || isSaving}
                rows={5}
              />
            </div>

            {canPublishDirectly ? (
              <div className="formRow">
                <label className="checkRow">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    disabled={!canManage || isSaving}
                  />
                  <span>
                    Publish course (learners can see it)
                    <span className="helpText" style={{ display: "block" }}>
                      Draft courses are visible to admins and the owning instructor only (recommended with RLS).
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <div className="alert" style={{ borderColor: "rgba(55, 65, 81, 0.22)", background: "rgba(55, 65, 81, 0.06)" }}>
                Publishing is handled via the Approvals workflow. After saving, open the course and “Submit for approval”.
              </div>
            )}

            {role === "admin" ? (
              <div className="formField">
                <label className="label" htmlFor="course-owner">
                  Owner User ID (admin only)
                </label>
                <input
                  id="course-owner"
                  className="input mono"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  placeholder={user?.id || "auth.users.id UUID"}
                  disabled={!canManage || isSaving}
                />
                {errors.owner_id ? <div className="fieldError">{errors.owner_id}</div> : null}
                <div className="helpText">Leave blank to keep current owner (or default to your user id when creating).</div>
              </div>
            ) : null}

            <div className="formActions">
              <button type="submit" className="button buttonPrimary" disabled={!canManage || isSaving}>
                {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create course"}
              </button>
              <Link className="button buttonSecondary" to={isEdit ? `/courses/${courseId}` : "/courses"}>
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
