import { supabase } from "../lib/supabaseClient";

function formatSupabaseError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Unexpected database error";
}

function isWriteRole(role) {
  return role === "admin" || role === "instructor";
}

async function assertCanWriteForSession({ role, actorUserId, sessionId }) {
  if (!isWriteRole(role)) {
    throw new Error("You do not have permission to modify enrollments.");
  }
  if (!actorUserId) {
    throw new Error("Missing signed-in user.");
  }
  if (!sessionId) {
    throw new Error("Missing session id.");
  }

  // Instructors should only manage enrollments for their own sessions (recommended UX guard).
  if (role === "instructor") {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, instructor_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) throw new Error(formatSupabaseError(error));
    if (!data) throw new Error("Session not found.");
    if (data.instructor_id !== actorUserId) {
      throw new Error("You can only manage enrollments for sessions you instruct.");
    }
  }
}

function normalizeSort(sortKey) {
  switch (sortKey) {
    case "created_asc":
      return { field: "created_at", ascending: true };
    case "created_desc":
    default:
      return { field: "created_at", ascending: false };
  }
}

// PUBLIC_INTERFACE
/**
 * List enrollments with optional filters.
 *
 * RBAC behavior (client-side UX guard; RLS should enforce at DB level):
 * - learner: forced to user_id = auth user id
 * - instructor: limited to sessions they instruct (recommended)
 * - admin: all
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  search?: string,
 *  sort?: "created_desc" | "created_asc",
 *  page?: number,
 *  pageSize?: number,
 *  courseId?: string | null,
 *  sessionId?: string | null,
 *  learnerId?: string | null,
 * }} params
 * @returns {Promise<{ data: any[], count: number | null, error: string | null }>}
 */
export async function listEnrollments({
  role,
  userId,
  search = "",
  sort = "created_desc",
  page = 0,
  pageSize = 10,
  courseId = null,
  sessionId = null,
  learnerId = null,
}) {
  try {
    const { field, ascending } = normalizeSort(sort);

    // Use inner join so filters on session/course work reliably.
    let query = supabase
      .from("enrollments")
      .select(
        `
        id,
        session_id,
        user_id,
        created_at,
        created_by,
        session:sessions!inner(
          id,
          title,
          starts_at,
          ends_at,
          location,
          course_id,
          instructor_id,
          course:courses(
            id,
            title
          )
        )
      `,
        { count: "exact" }
      )
      .order(field, { ascending });

    const trimmedSearch = typeof search === "string" ? search.trim() : "";
    if (trimmedSearch) {
      // Search on joined session title (works with PostgREST embedding).
      query = query.ilike("session.title", `%${trimmedSearch}%`);
    }

    if (courseId) query = query.eq("session.course_id", courseId);
    if (sessionId) query = query.eq("session_id", sessionId);

    if (role === "learner") {
      if (!userId) return { data: [], count: null, error: "Missing signed-in user." };
      query = query.eq("user_id", userId);
    } else if (role === "instructor") {
      if (userId) query = query.eq("session.instructor_id", userId);
      if (learnerId) query = query.eq("user_id", learnerId);
    } else {
      // admin
      if (learnerId) query = query.eq("user_id", learnerId);
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
 * Get a single enrollment by id (includes joined session+course summary).
 *
 * NOTE: For learners, RLS should ensure they can only access their own.
 *
 * @param {{ enrollmentId: string }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getEnrollmentById({ enrollmentId }) {
  try {
    const { data, error } = await supabase
      .from("enrollments")
      .select(
        `
        id,
        session_id,
        user_id,
        created_at,
        created_by,
        session:sessions(
          id,
          title,
          starts_at,
          ends_at,
          location,
          course_id,
          instructor_id,
          course:courses(id, title)
        )
      `
      )
      .eq("id", enrollmentId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Add (or ensure) an enrollment for a learner in a session.
 *
 * RBAC:
 * - admin/instructor: allowed
 * - learner: not allowed (view-only per requirements)
 *
 * Uses upsert on (session_id,user_id) to avoid duplicates.
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  sessionId: string,
 *  learnerId: string,
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function addEnrollment({ role, actorUserId, sessionId, learnerId }) {
  try {
    await assertCanWriteForSession({ role, actorUserId, sessionId });

    const payload = {
      session_id: sessionId,
      user_id: learnerId,
      created_by: actorUserId,
    };

    const { data, error } = await supabase
      .from("enrollments")
      .upsert(payload, { onConflict: "session_id,user_id", ignoreDuplicates: true })
      .select(
        `
        id,
        session_id,
        user_id,
        created_at,
        created_by
      `
      )
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Bulk add enrollments for a session (multiple learner ids).
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  sessionId: string,
 *  learnerIds: string[],
 * }} params
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function addEnrollmentsBulk({ role, actorUserId, sessionId, learnerIds }) {
  try {
    await assertCanWriteForSession({ role, actorUserId, sessionId });

    const ids = Array.isArray(learnerIds)
      ? Array.from(new Set(learnerIds.map((v) => String(v || "").trim()).filter(Boolean)))
      : [];

    if (ids.length === 0) return { data: [], error: "Please provide at least one learner user id." };

    const payload = ids.map((learnerId) => ({
      session_id: sessionId,
      user_id: learnerId,
      created_by: actorUserId,
    }));

    const { data, error } = await supabase
      .from("enrollments")
      .upsert(payload, { onConflict: "session_id,user_id", ignoreDuplicates: true })
      .select("id, session_id, user_id, created_at, created_by");

    if (error) return { data: [], error: formatSupabaseError(error) };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Remove an enrollment by enrollment id.
 *
 * RBAC:
 * - admin/instructor: allowed (instructor limited to own sessions)
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  enrollmentId: string,
 * }} params
 * @returns {Promise<{ error: string | null }>}
 */
export async function removeEnrollmentById({ role, actorUserId, enrollmentId }) {
  try {
    if (!isWriteRole(role)) return { error: "You do not have permission to remove enrollments." };
    if (!actorUserId) return { error: "Missing signed-in user." };

    if (role === "instructor") {
      // Verify ownership by fetching joined session instructor_id.
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, session:sessions(id, instructor_id)")
        .eq("id", enrollmentId)
        .maybeSingle();

      if (error) return { error: formatSupabaseError(error) };
      if (!data) return { error: "Enrollment not found." };
      if (data?.session?.instructor_id !== actorUserId) {
        return { error: "You can only manage enrollments for sessions you instruct." };
      }
    }

    const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
    if (error) return { error: formatSupabaseError(error) };
    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}
