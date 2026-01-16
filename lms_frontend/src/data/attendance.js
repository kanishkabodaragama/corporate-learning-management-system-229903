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
    throw new Error("You do not have permission to record attendance.");
  }
  if (!actorUserId) {
    throw new Error("Missing signed-in user.");
  }
  if (!sessionId) {
    throw new Error("Missing session id.");
  }

  // Instructors should only record attendance for their own sessions (recommended UX guard).
  if (role === "instructor") {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, instructor_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) throw new Error(formatSupabaseError(error));
    if (!data) throw new Error("Session not found.");
    if (data.instructor_id !== actorUserId) {
      throw new Error("You can only record attendance for sessions you instruct.");
    }
  }
}

function normalizeStatus(status) {
  const v = String(status || "").toLowerCase().trim();
  if (v === "present" || v === "absent" || v === "late") return v;
  return "absent";
}

function normalizeSort(sortKey) {
  switch (sortKey) {
    case "marked_asc":
      return { field: "marked_at", ascending: true };
    case "marked_desc":
    default:
      return { field: "marked_at", ascending: false };
  }
}

// PUBLIC_INTERFACE
/**
 * List attendance records for a session.
 *
 * RBAC behavior (client-side UX guard; RLS should enforce at DB level):
 * - admin/instructor: allowed (instructor limited to own sessions)
 * - learner: allowed only when session records include their own via RLS;
 *   for this app, learners generally use listAttendanceForUser().
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  sessionId: string,
 *  sort?: "marked_desc" | "marked_asc",
 * }} params
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function listAttendanceForSession({ role, userId, sessionId, sort = "marked_desc" }) {
  try {
    if (!sessionId) return { data: [], error: "Missing session id." };

    const { field, ascending } = normalizeSort(sort);

    let query = supabase
      .from("attendance")
      .select("id, session_id, user_id, status, marked_at, marked_by")
      .eq("session_id", sessionId)
      .order(field, { ascending });

    if (role === "instructor" && userId) {
      // Restrict to own sessions for better UX (RLS should enforce too).
      // This can be further hardened via policies; here we just guard reads.
      const { data: s, error: sErr } = await supabase
        .from("sessions")
        .select("id, instructor_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (sErr) return { data: [], error: formatSupabaseError(sErr) };
      if (!s) return { data: [], error: "Session not found." };
      if (s.instructor_id !== userId) return { data: [], error: "Access denied for this session." };
    }

    const { data, error } = await query;
    if (error) return { data: [], error: formatSupabaseError(error) };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * List attendance records for a user (typically learner self-view).
 *
 * RBAC:
 * - learner: can only request own records (targetUserId forced to userId)
 * - instructor/admin: can request a specific user, but instructor should only see their sessions
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  targetUserId?: string | null,
 *  page?: number,
 *  pageSize?: number,
 * }} params
 * @returns {Promise<{ data: any[], count: number | null, error: string | null }>}
 */
export async function listAttendanceForUser({
  role,
  userId,
  targetUserId = null,
  page = 0,
  pageSize = 50,
}) {
  try {
    const effectiveTarget = role === "learner" ? userId : targetUserId || userId;
    if (!effectiveTarget) return { data: [], count: null, error: "Missing user id." };

    let query = supabase
      .from("attendance")
      .select(
        `
        id,
        session_id,
        user_id,
        status,
        marked_at,
        marked_by,
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
      `,
        { count: "exact" }
      )
      .eq("user_id", effectiveTarget)
      .order("marked_at", { ascending: false });

    if (role === "instructor" && userId) {
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
 * Upsert attendance records for a session (one row per enrolled learner).
 *
 * DB should have a unique constraint on (session_id, user_id).
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  sessionId: string,
 *  records: Array<{ user_id: string, status: "present"|"absent"|"late" }>,
 * }} params
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function upsertAttendanceForSession({ role, actorUserId, sessionId, records }) {
  try {
    await assertCanWriteForSession({ role, actorUserId, sessionId });

    const safeRecords = Array.isArray(records) ? records : [];
    const payload = safeRecords
      .map((r) => ({
        session_id: sessionId,
        user_id: String(r?.user_id || "").trim(),
        status: normalizeStatus(r?.status),
        marked_at: new Date().toISOString(),
        marked_by: actorUserId,
      }))
      .filter((r) => r.user_id);

    if (payload.length === 0) return { data: [], error: "No attendance records to save." };

    const { data, error } = await supabase
      .from("attendance")
      .upsert(payload, { onConflict: "session_id,user_id" })
      .select("id, session_id, user_id, status, marked_at, marked_by");

    if (error) return { data: [], error: formatSupabaseError(error) };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}
