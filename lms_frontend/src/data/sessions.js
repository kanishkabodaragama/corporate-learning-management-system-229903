import { supabase } from "../lib/supabaseClient";

function formatSupabaseError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Unexpected database error";
}

function normalizeSort(sortKey) {
  switch (sortKey) {
    case "starts_asc":
      return { field: "starts_at", ascending: true };
    case "starts_desc":
      return { field: "starts_at", ascending: false };
    case "title_asc":
      return { field: "title", ascending: true };
    case "title_desc":
      return { field: "title", ascending: false };
    case "updated_asc":
      return { field: "updated_at", ascending: true };
    case "updated_desc":
    default:
      return { field: "updated_at", ascending: false };
  }
}

// PUBLIC_INTERFACE
/**
 * List sessions with basic search/sort/pagination support.
 *
 * Notes:
 * - UI applies a role-based filter:
 *   - learner: published-only
 *   - instructor: own sessions only (instructor_id = auth user)
 *   - admin: all sessions
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  search?: string,
 *  sort?: string,
 *  page?: number,
 *  pageSize?: number,
 *  courseId?: string | null,
 * }} params
 * @returns {Promise<{ data: any[], count: number | null, error: string | null }>}
 */
export async function listSessions({
  role,
  userId,
  search = "",
  sort = "updated_desc",
  page = 0,
  pageSize = 10,
  courseId = null,
}) {
  try {
    const { field, ascending } = normalizeSort(sort);

    let query = supabase
      .from("sessions")
      .select(
        "id, title, starts_at, ends_at, location, capacity, is_published, course_id, instructor_id, created_at, updated_at, course:courses(id, title, is_published)",
        { count: "exact" }
      )
      .order(field, { ascending });

    const trimmedSearch = typeof search === "string" ? search.trim() : "";
    if (trimmedSearch) {
      query = query.ilike("title", `%${trimmedSearch}%`);
    }

    if (courseId) {
      query = query.eq("course_id", courseId);
    }

    if (role === "learner") {
      query = query.eq("is_published", true);
    } else if (role === "instructor" && userId) {
      query = query.eq("instructor_id", userId);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) return { data: [], count: null, error: formatSupabaseError(error) };
    return { data: Array.isArray(data) ? data : [], count: typeof count === "number" ? count : null, error: null };
  } catch (err) {
    return { data: [], count: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Get a single session by id (includes joined course summary).
 *
 * @param {string} sessionId
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getSessionById(sessionId) {
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, title, starts_at, ends_at, location, capacity, is_published, course_id, instructor_id, created_at, updated_at, course:courses(id, title, is_published)"
      )
      .eq("id", sessionId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Create a session.
 *
 * @param {{
 *  course_id: string,
 *  title: string,
 *  starts_at: string,
 *  ends_at?: string | null,
 *  location?: string | null,
 *  capacity?: number | null,
 *  is_published?: boolean,
 *  instructor_id: string,
 * }} input
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function createSession(input) {
  try {
    const payload = {
      course_id: input.course_id,
      title: input.title,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      location: input.location ?? null,
      capacity: typeof input.capacity === "number" ? input.capacity : input.capacity ?? null,
      is_published: Boolean(input.is_published),
      instructor_id: input.instructor_id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("sessions")
      .insert(payload)
      .select(
        "id, title, starts_at, ends_at, location, capacity, is_published, course_id, instructor_id, created_at, updated_at, course:courses(id, title, is_published)"
      )
      .single();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Update a session.
 *
 * @param {string} sessionId
 * @param {{
 *  course_id?: string,
 *  title?: string,
 *  starts_at?: string,
 *  ends_at?: string | null,
 *  location?: string | null,
 *  capacity?: number | null,
 *  is_published?: boolean,
 *  instructor_id?: string,
 * }} changes
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function updateSession(sessionId, changes) {
  try {
    const payload = {
      ...changes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("sessions")
      .update(payload)
      .eq("id", sessionId)
      .select(
        "id, title, starts_at, ends_at, location, capacity, is_published, course_id, instructor_id, created_at, updated_at, course:courses(id, title, is_published)"
      )
      .single();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Delete a session by id.
 *
 * @param {string} sessionId
 * @returns {Promise<{ error: string | null }>}
 */
export async function deleteSession(sessionId) {
  try {
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (error) return { error: formatSupabaseError(error) };
    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}
