import { supabase } from "../lib/supabaseClient";
import { addEnrollment } from "./enrollments";
import { updateCourse } from "./courses";

function formatSupabaseError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Unexpected database error";
}

function normalizeApprovalsStatus(status) {
  if (!status) return "all";
  const s = String(status).toLowerCase().trim();
  if (["pending", "approved", "denied", "all"].includes(s)) return s;
  return "all";
}

function normalizeApprovalsType(type) {
  if (!type) return "all";
  const t = String(type).toLowerCase().trim();
  if (["all", "enrollment", "publishing"].includes(t)) return t;
  return "all";
}

function assertUser(userId) {
  if (!userId) throw new Error("Missing signed-in user.");
}

function assertRole(role) {
  if (!role) throw new Error("Missing role.");
}

function isAdmin(role) {
  return role === "admin";
}

function isInstructor(role) {
  return role === "instructor";
}

/**
 * For the UI we treat "Denied" as:
 * - enrollment_requests.status = 'denied'
 * - course_publish_requests.status = 'returned'
 */
function mapDeniedStatusForTable({ table, uiStatus }) {
  if (uiStatus !== "denied") return uiStatus;
  return table === "course_publish_requests" ? "returned" : "denied";
}

function toApprovalListItemFromEnrollmentRequest(r) {
  const createdAt = r.requested_at ?? r.created_at ?? null;
  const updatedAt = r.reviewed_at ?? createdAt;

  return {
    kind: "enrollment",
    id: r.id,
    status: r.status,
    created_at: createdAt,
    updated_at: updatedAt,
    requester_id: r.user_id,
    reviewer_id: r.reviewed_by ?? null,
    reviewer_comment: r.reviewer_comment ?? null,
    session: r.session ?? null,
  };
}

function toApprovalListItemFromCoursePublishRequest(r) {
  const createdAt = r.requested_at ?? r.created_at ?? null;
  const updatedAt = r.decided_at ?? createdAt;

  return {
    kind: "publishing",
    id: r.id,
    status: r.status,
    created_at: createdAt,
    updated_at: updatedAt,
    requester_id: r.requested_by,
    reviewer_id: r.decided_by ?? null,
    reviewer_comment: r.admin_comment ?? null,
    course: r.course ?? null,
  };
}

// PUBLIC_INTERFACE
/**
 * List enrollment requests with RBAC-aware filters.
 *
 * Expected tables (recommended in assets/supabase.md):
 * - public.enrollment_requests
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  status?: "pending" | "approved" | "denied" | "all",
 *  mineOnly?: boolean,
 *  page?: number,
 *  pageSize?: number,
 * }} params
 * @returns {Promise<{ data: any[], count: number | null, error: string | null }>}
 */
export async function listEnrollmentRequests({
  role,
  userId,
  status = "all",
  mineOnly = false,
  page = 0,
  pageSize = 25,
}) {
  try {
    assertRole(role);
    const normalizedStatus = normalizeApprovalsStatus(status);

    // Use inner join so instructor filters on embedded session fields work reliably.
    let query = supabase
      .from("enrollment_requests")
      .select(
        `
        id,
        session_id,
        user_id,
        status,
        requested_at,
        reviewed_at,
        reviewed_by,
        reviewer_comment,
        session:sessions!inner(
          id,
          title,
          starts_at,
          ends_at,
          location,
          instructor_id,
          course_id,
          course:courses(
            id,
            title
          )
        )
      `,
        { count: "exact" }
      )
      .order("requested_at", { ascending: false });

    if (normalizedStatus !== "all") {
      query = query.eq("status", mapDeniedStatusForTable({ table: "enrollment_requests", uiStatus: normalizedStatus }));
    }

    if (mineOnly) {
      // "Mine" = requests I submitted (learner).
      assertUser(userId);
      query = query.eq("user_id", userId);
    } else if (role === "learner") {
      assertUser(userId);
      query = query.eq("user_id", userId);
    } else if (role === "instructor") {
      assertUser(userId);
      query = query.eq("session.instructor_id", userId);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) return { data: [], count: null, error: formatSupabaseError(error) };

    return {
      data: Array.isArray(data) ? data : [],
      count: typeof count === "number" ? count : null,
      error: null,
    };
  } catch (err) {
    return { data: [], count: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Get a single enrollment request by id (includes session+course summary).
 *
 * @param {{ requestId: string }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getEnrollmentRequestById({ requestId }) {
  try {
    const { data, error } = await supabase
      .from("enrollment_requests")
      .select(
        `
        id,
        session_id,
        user_id,
        status,
        requested_at,
        reviewed_at,
        reviewed_by,
        reviewer_comment,
        session:sessions(
          id,
          title,
          starts_at,
          ends_at,
          location,
          instructor_id,
          course_id,
          course:courses(id, title)
        )
      `
      )
      .eq("id", requestId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Get the enrollment request for a learner+session pair (if any).
 *
 * @param {{ sessionId: string, userId: string }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getEnrollmentRequestForSession({ sessionId, userId }) {
  try {
    const { data, error } = await supabase
      .from("enrollment_requests")
      .select(
        `
        id,
        session_id,
        user_id,
        status,
        requested_at,
        reviewed_at,
        reviewed_by,
        reviewer_comment
      `
      )
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Create (or re-open) an enrollment request for a learner.
 *
 * Note: This uses upsert on (session_id,user_id) so repeated clicks update the same row back to pending.
 *
 * @param {{
 *  sessionId: string,
 *  userId: string,
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function createEnrollmentRequest({ sessionId, userId }) {
  try {
    assertUser(userId);
    if (!sessionId) return { data: null, error: "Missing session id." };

    const payload = {
      session_id: sessionId,
      user_id: userId,
      status: "pending",
      requested_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      reviewer_comment: null,
    };

    const { data, error } = await supabase
      .from("enrollment_requests")
      .upsert(payload, { onConflict: "session_id,user_id" })
      .select("id, session_id, user_id, status, requested_at, reviewed_at, reviewed_by, reviewer_comment")
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Approve or deny an enrollment request.
 *
 * RBAC (client-side guard; RLS should enforce):
 * - admin: can approve/deny any
 * - instructor: can approve/deny requests for sessions they instruct
 *
 * When approved, this also upserts into public.enrollments.
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  requestId: string,
 *  decision: "approve" | "deny",
 *  comment?: string,
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function reviewEnrollmentRequest({ role, actorUserId, requestId, decision, comment = "" }) {
  try {
    assertRole(role);
    assertUser(actorUserId);

    if (!(isAdmin(role) || isInstructor(role))) {
      return { data: null, error: "You do not have permission to review enrollment requests." };
    }

    const { data: req, error: reqErr } = await getEnrollmentRequestById({ requestId });
    if (reqErr) return { data: null, error: reqErr };
    if (!req) return { data: null, error: "Enrollment request not found." };

    if (req.status !== "pending") {
      return { data: null, error: "This request is no longer pending." };
    }

    if (role === "instructor") {
      const instructorId = req?.session?.instructor_id;
      if (!instructorId || instructorId !== actorUserId) {
        return { data: null, error: "You can only review enrollment requests for sessions you instruct." };
      }
    }

    const normalizedDecision = String(decision).toLowerCase().trim();
    if (!["approve", "deny"].includes(normalizedDecision)) {
      return { data: null, error: "Invalid decision." };
    }

    if (normalizedDecision === "approve") {
      const { error: enrollErr } = await addEnrollment({
        role,
        actorUserId,
        sessionId: req.session_id,
        learnerId: req.user_id,
      });

      if (enrollErr) return { data: null, error: enrollErr };
    }

    const nextStatus = normalizedDecision === "approve" ? "approved" : "denied";

    const { data, error } = await supabase
      .from("enrollment_requests")
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: actorUserId,
        reviewer_comment: comment?.trim() ? comment.trim() : null,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select(
        `
        id,
        session_id,
        user_id,
        status,
        requested_at,
        reviewed_at,
        reviewed_by,
        reviewer_comment
      `
      )
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    if (!data) return { data: null, error: "Unable to update request (it may have changed)." };

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * List course publishing requests.
 *
 * Expected tables:
 * - public.course_publish_requests
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  status?: "pending" | "approved" | "denied" | "all",
 *  mineOnly?: boolean,
 *  page?: number,
 *  pageSize?: number,
 * }} params
 * @returns {Promise<{ data: any[], count: number | null, error: string | null }>}
 */
export async function listCoursePublishRequests({
  role,
  userId,
  status = "all",
  mineOnly = false,
  page = 0,
  pageSize = 25,
}) {
  try {
    assertRole(role);
    const normalizedStatus = normalizeApprovalsStatus(status);

    // Learners don't have a publishing approval flow in this app.
    if (role === "learner") {
      return { data: [], count: 0, error: null };
    }

    let query = supabase
      .from("course_publish_requests")
      .select(
        `
        id,
        course_id,
        requested_by,
        status,
        requested_at,
        decided_at,
        decided_by,
        admin_comment,
        course:courses!inner(
          id,
          title,
          description,
          is_published,
          owner_id,
          created_at,
          updated_at
        )
      `,
        { count: "exact" }
      )
      .order("requested_at", { ascending: false });

    if (normalizedStatus !== "all") {
      query = query.eq(
        "status",
        mapDeniedStatusForTable({ table: "course_publish_requests", uiStatus: normalizedStatus })
      );
    }

    if (mineOnly) {
      // "Mine" = requests I submitted (instructor).
      assertUser(userId);
      query = query.eq("requested_by", userId);
    } else if (role === "instructor") {
      assertUser(userId);
      query = query.eq("requested_by", userId);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) return { data: [], count: null, error: formatSupabaseError(error) };

    return {
      data: Array.isArray(data) ? data : [],
      count: typeof count === "number" ? count : null,
      error: null,
    };
  } catch (err) {
    return { data: [], count: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Get a single course publishing request by id.
 *
 * @param {{ requestId: string }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getCoursePublishRequestById({ requestId }) {
  try {
    const { data, error } = await supabase
      .from("course_publish_requests")
      .select(
        `
        id,
        course_id,
        requested_by,
        status,
        requested_at,
        decided_at,
        decided_by,
        admin_comment,
        course:courses(
          id,
          title,
          description,
          is_published,
          owner_id,
          created_at,
          updated_at
        )
      `
      )
      .eq("id", requestId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Get the course publishing request for a course (if any).
 *
 * @param {{ courseId: string }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getCoursePublishRequestForCourse({ courseId }) {
  try {
    const { data, error } = await supabase
      .from("course_publish_requests")
      .select("id, course_id, requested_by, status, requested_at, decided_at, decided_by, admin_comment")
      .eq("course_id", courseId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Submit a course for publishing approval (instructor flow).
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  courseId: string,
 *  comment?: string,
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function submitCoursePublishRequest({ role, actorUserId, courseId, comment = "" }) {
  try {
    assertRole(role);
    assertUser(actorUserId);
    if (!courseId) return { data: null, error: "Missing course id." };

    if (!(isAdmin(role) || isInstructor(role))) {
      return { data: null, error: "You do not have permission to submit publishing requests." };
    }

    if (role === "instructor") {
      // UX guard: verify instructor owns this course.
      const { data: course, error: cErr } = await supabase
        .from("courses")
        .select("id, owner_id, is_published")
        .eq("id", courseId)
        .maybeSingle();

      if (cErr) return { data: null, error: formatSupabaseError(cErr) };
      if (!course) return { data: null, error: "Course not found." };
      if (course.owner_id !== actorUserId) {
        return { data: null, error: "You can only submit publishing requests for courses you own." };
      }
      if (course.is_published) {
        return { data: null, error: "This course is already published." };
      }
    }

    const payload = {
      course_id: courseId,
      requested_by: actorUserId,
      status: "pending",
      requested_at: new Date().toISOString(),
      decided_at: null,
      decided_by: null,
      admin_comment: comment?.trim() ? comment.trim() : null, // optional (can be repurposed as initial note)
    };

    const { data, error } = await supabase
      .from("course_publish_requests")
      .upsert(payload, { onConflict: "course_id" })
      .select("id, course_id, requested_by, status, requested_at, decided_at, decided_by, admin_comment")
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Decide a course publishing request (admin approves or returns with comment).
 *
 * If approved, this also updates public.courses.is_published = true.
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  requestId: string,
 *  decision: "approve" | "return",
 *  comment?: string,
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function decideCoursePublishRequest({ role, actorUserId, requestId, decision, comment = "" }) {
  try {
    assertRole(role);
    assertUser(actorUserId);

    if (!isAdmin(role)) {
      return { data: null, error: "Only admins can decide course publishing requests." };
    }

    const normalizedDecision = String(decision).toLowerCase().trim();
    if (!["approve", "return"].includes(normalizedDecision)) {
      return { data: null, error: "Invalid decision." };
    }

    const { data: req, error: reqErr } = await getCoursePublishRequestById({ requestId });
    if (reqErr) return { data: null, error: reqErr };
    if (!req) return { data: null, error: "Publishing request not found." };

    if (req.status !== "pending") {
      return { data: null, error: "This request is no longer pending." };
    }

    if (normalizedDecision === "approve") {
      const { error: publishErr } = await updateCourse(req.course_id, { is_published: true });
      if (publishErr) return { data: null, error: publishErr };
    }

    const nextStatus = normalizedDecision === "approve" ? "approved" : "returned";

    const { data, error } = await supabase
      .from("course_publish_requests")
      .update({
        status: nextStatus,
        decided_at: new Date().toISOString(),
        decided_by: actorUserId,
        admin_comment: comment?.trim() ? comment.trim() : null,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id, course_id, requested_by, status, requested_at, decided_at, decided_by, admin_comment")
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    if (!data) return { data: null, error: "Unable to update request (it may have changed)." };

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Unified approvals list used by the Approvals UI.
 *
 * NOTE: This merges results from two tables client-side for a simpler UI.
 * It intentionally keeps pagination simple (merge+slice).
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  status?: "pending" | "approved" | "denied" | "all",
 *  type?: "all" | "enrollment" | "publishing",
 *  mineOnly?: boolean,
 *  page?: number,
 *  pageSize?: number,
 * }} params
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function listApprovals({
  role,
  userId,
  status = "pending",
  type = "all",
  mineOnly = false,
  page = 0,
  pageSize = 25,
}) {
  try {
    assertRole(role);
    const normalizedStatus = normalizeApprovalsStatus(status);
    const normalizedType = normalizeApprovalsType(type);

    const fetchSize = Math.max(50, pageSize * (page + 1));

    const [enrollmentRes, publishingRes] = await Promise.all([
      normalizedType === "publishing"
        ? Promise.resolve({ data: [], error: null })
        : listEnrollmentRequests({
            role,
            userId,
            status: normalizedStatus,
            mineOnly,
            page: 0,
            pageSize: fetchSize,
          }),
      normalizedType === "enrollment"
        ? Promise.resolve({ data: [], error: null })
        : listCoursePublishRequests({
            role,
            userId,
            status: normalizedStatus,
            mineOnly,
            page: 0,
            pageSize: fetchSize,
          }),
    ]);

    const error = enrollmentRes.error || publishingRes.error;
    if (error) return { data: [], error };

    const enrollmentItems = (Array.isArray(enrollmentRes.data) ? enrollmentRes.data : []).map(
      toApprovalListItemFromEnrollmentRequest
    );
    const publishingItems = (Array.isArray(publishingRes.data) ? publishingRes.data : []).map(
      toApprovalListItemFromCoursePublishRequest
    );

    const merged = [...enrollmentItems, ...publishingItems].sort((a, b) => {
      const ad = a.updated_at || a.created_at || "";
      const bd = b.updated_at || b.created_at || "";
      return String(bd).localeCompare(String(ad));
    });

    const from = page * pageSize;
    const to = from + pageSize;

    return {
      data: merged.slice(from, to),
      error: null,
    };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}
