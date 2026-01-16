import { supabase } from "../lib/supabaseClient";

function formatSupabaseError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Unexpected database error";
}

function normalizeSort(sortKey) {
  switch (sortKey) {
    case "title_asc":
      return { field: "title", ascending: true };
    case "title_desc":
      return { field: "title", ascending: false };
    case "created_desc":
      return { field: "created_at", ascending: false };
    case "created_asc":
      return { field: "created_at", ascending: true };
    case "updated_asc":
      return { field: "updated_at", ascending: true };
    case "updated_desc":
    default:
      return { field: "updated_at", ascending: false };
  }
}

// PUBLIC_INTERFACE
/**
 * List courses with basic search/sort/pagination support.
 *
 * Notes:
 * - RBAC is enforced both by the UI and (recommended) Supabase RLS policies.
 * - This client also applies a role-based filter for a better UX:
 *   - learner: published-only
 *   - instructor: own courses only
 *   - admin: all courses
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  search?: string,
 *  sort?: string,
 *  page?: number,
 *  pageSize?: number,
 * }} params
 * @returns {Promise<{ data: any[], count: number | null, error: string | null }>}
 */
export async function listCourses({
  role,
  userId,
  search = "",
  sort = "updated_desc",
  page = 0,
  pageSize = 10,
}) {
  try {
    const { field, ascending } = normalizeSort(sort);

    let query = supabase
      .from("courses")
      .select("id, title, description, is_published, owner_id, created_at, updated_at", { count: "exact" })
      .order(field, { ascending });

    const trimmedSearch = typeof search === "string" ? search.trim() : "";
    if (trimmedSearch) {
      // Simple title search. (Placeholder: can be expanded to full-text search later.)
      query = query.ilike("title", `%${trimmedSearch}%`);
    }

    if (role === "learner") {
      query = query.eq("is_published", true);
    } else if (role === "instructor" && userId) {
      query = query.eq("owner_id", userId);
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
 * Get a single course by id.
 *
 * @param {string} courseId
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getCourseById(courseId) {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, is_published, owner_id, created_at, updated_at")
      .eq("id", courseId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Create a course.
 *
 * @param {{
 *  title: string,
 *  description?: string | null,
 *  is_published?: boolean,
 *  owner_id: string,
 * }} input
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function createCourse(input) {
  try {
    const payload = {
      title: input.title,
      description: input.description ?? null,
      is_published: Boolean(input.is_published),
      owner_id: input.owner_id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("courses")
      .insert(payload)
      .select("id, title, description, is_published, owner_id, created_at, updated_at")
      .single();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Update a course.
 *
 * @param {string} courseId
 * @param {{
 *  title?: string,
 *  description?: string | null,
 *  is_published?: boolean,
 *  owner_id?: string,
 * }} changes
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function updateCourse(courseId, changes) {
  try {
    const payload = {
      ...changes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("courses")
      .update(payload)
      .eq("id", courseId)
      .select("id, title, description, is_published, owner_id, created_at, updated_at")
      .single();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Delete a course by id.
 *
 * @param {string} courseId
 * @returns {Promise<{ error: string | null }>}
 */
export async function deleteCourse(courseId) {
  try {
    const { error } = await supabase.from("courses").delete().eq("id", courseId);
    if (error) return { error: formatSupabaseError(error) };
    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}
