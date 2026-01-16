import { supabase } from "../lib/supabaseClient";

function formatSupabaseError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Unexpected database error";
}

function normalizeQuizSort(sortKey) {
  switch (sortKey) {
    case "title_asc":
      return { field: "title", ascending: true };
    case "title_desc":
      return { field: "title", ascending: false };
    case "created_asc":
      return { field: "created_at", ascending: true };
    case "created_desc":
      return { field: "created_at", ascending: false };
    case "updated_asc":
      return { field: "updated_at", ascending: true };
    case "updated_desc":
    default:
      return { field: "updated_at", ascending: false };
  }
}

function isWriteRole(role) {
  return role === "admin" || role === "instructor";
}

/**
 * Attempt to compute learner-visible quiz assignments based on enrollments:
 * - session-scoped assignments: session_id in learner enrollments
 * - course-scoped assignments: course_id in learner enrolled sessions' course_id
 */
async function getLearnerScopeIds(userId) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("session_id, session:sessions(id, course_id)")
    .eq("user_id", userId);

  if (error) return { sessionIds: [], courseIds: [], error: formatSupabaseError(error) };

  const rows = Array.isArray(data) ? data : [];
  const sessionIds = Array.from(new Set(rows.map((r) => r.session_id).filter(Boolean)));
  const courseIds = Array.from(new Set(rows.map((r) => r?.session?.course_id).filter(Boolean)));

  return { sessionIds, courseIds, error: null };
}

// PUBLIC_INTERFACE
/**
 * List quizzes for admin/instructor (with basic search/sort/pagination).
 *
 * Learners should generally use listMyAssignedQuizzes() instead.
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
export async function listQuizzes({
  role,
  userId,
  search = "",
  sort = "updated_desc",
  page = 0,
  pageSize = 10,
}) {
  try {
    const { field, ascending } = normalizeQuizSort(sort);

    let query = supabase
      .from("quizzes")
      .select("id, title, description, is_published, owner_id, created_at, updated_at", {
        count: "exact",
      })
      .order(field, { ascending });

    const trimmedSearch = typeof search === "string" ? search.trim() : "";
    if (trimmedSearch) query = query.ilike("title", `%${trimmedSearch}%`);

    if (role === "instructor" && userId) query = query.eq("owner_id", userId);

    // Learners can list published quizzes (mostly for admin debugging). Primary UX is assignments.
    if (role === "learner") query = query.eq("is_published", true);

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
 * Fetch a quiz record by id.
 *
 * @param {string} quizId
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getQuizById(quizId) {
  try {
    const { data, error } = await supabase
      .from("quizzes")
      .select("id, title, description, is_published, owner_id, created_at, updated_at")
      .eq("id", quizId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Create a quiz (metadata only; questions are saved separately).
 *
 * @param {{
 *  title: string,
 *  description?: string | null,
 *  is_published?: boolean,
 *  owner_id: string,
 * }} input
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function createQuiz(input) {
  try {
    const payload = {
      title: input.title,
      description: input.description ?? null,
      is_published: Boolean(input.is_published),
      owner_id: input.owner_id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("quizzes")
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
 * Update quiz metadata.
 *
 * @param {string} quizId
 * @param {{ title?: string, description?: string | null, is_published?: boolean }} changes
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function updateQuiz(quizId, changes) {
  try {
    const payload = { ...changes, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from("quizzes")
      .update(payload)
      .eq("id", quizId)
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
 * Delete a quiz by id. (Questions/options/assignments should cascade in schema.)
 *
 * @param {string} quizId
 * @returns {Promise<{ error: string | null }>}
 */
export async function deleteQuiz(quizId) {
  try {
    const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
    if (error) return { error: formatSupabaseError(error) };
    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Fetch a quiz with its questions and options (for taking and for builder load).
 *
 * IMPORTANT:
 * - Ordering is applied client-side via order_index.
 *
 * @param {string} quizId
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getQuizWithQuestions(quizId) {
  try {
    const { data, error } = await supabase
      .from("quizzes")
      .select(
        `
        id,
        title,
        description,
        is_published,
        owner_id,
        created_at,
        updated_at,
        questions:quiz_questions(
          id,
          prompt,
          question_type,
          order_index,
          points,
          options:quiz_options(
            id,
            label,
            order_index,
            is_correct
          )
        )
      `
      )
      .eq("id", quizId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    if (!data) return { data: null, error: null };

    const normalized = {
      ...data,
      questions: Array.isArray(data.questions)
        ? data.questions
            .slice()
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .map((q) => ({
              ...q,
              options: Array.isArray(q.options)
                ? q.options.slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                : [],
            }))
        : [],
    };

    return { data: normalized, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Replace all quiz questions/options with the provided structure.
 *
 * This is a simple MVP implementation: it deletes existing questions (cascades options)
 * then re-inserts the new structure.
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  quizId: string,
 *  questions: Array<{
 *    prompt: string,
 *    question_type: "single" | "multi",
 *    points?: number,
 *    options: Array<{ label: string, is_correct: boolean }>
 *  }>
 * }} params
 * @returns {Promise<{ error: string | null }>}
 */
export async function replaceQuizStructure({ role, quizId, questions }) {
  try {
    if (!isWriteRole(role)) return { error: "You do not have permission to edit quizzes." };
    if (!quizId) return { error: "Missing quiz id." };

    // Delete existing questions (options should cascade).
    const { error: delErr } = await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
    if (delErr) return { error: formatSupabaseError(delErr) };

    const safeQuestions = Array.isArray(questions) ? questions : [];

    for (let i = 0; i < safeQuestions.length; i += 1) {
      const q = safeQuestions[i];
      const points = typeof q?.points === "number" && Number.isFinite(q.points) ? q.points : 1;

      const { data: insertedQ, error: qErr } = await supabase
        .from("quiz_questions")
        .insert({
          quiz_id: quizId,
          prompt: String(q?.prompt || "").trim(),
          question_type: q?.question_type === "multi" ? "multi" : "single",
          order_index: i,
          points,
        })
        .select("id")
        .single();

      if (qErr) return { error: formatSupabaseError(qErr) };
      const questionId = insertedQ?.id;
      if (!questionId) return { error: "Failed to create question." };

      const opts = Array.isArray(q?.options) ? q.options : [];
      if (opts.length === 0) continue;

      const payload = opts.map((opt, idx) => ({
        question_id: questionId,
        label: String(opt?.label || "").trim(),
        order_index: idx,
        is_correct: Boolean(opt?.is_correct),
      }));

      const { error: oErr } = await supabase.from("quiz_options").insert(payload);
      if (oErr) return { error: formatSupabaseError(oErr) };
    }

    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Create an assignment for a quiz to a course or session.
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  actorUserId: string | null | undefined,
 *  quizId: string,
 *  courseId?: string | null,
 *  sessionId?: string | null,
 *  startsAt?: string | null,
 *  dueAt?: string | null,
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function createQuizAssignment({
  role,
  actorUserId,
  quizId,
  courseId = null,
  sessionId = null,
  startsAt = null,
  dueAt = null,
}) {
  try {
    if (!isWriteRole(role)) return { data: null, error: "You do not have permission to assign quizzes." };
    if (!actorUserId) return { data: null, error: "Missing signed-in user." };
    if (!quizId) return { data: null, error: "Missing quiz id." };
    if (!courseId && !sessionId) return { data: null, error: "Please select a course or a session to assign." };

    const payload = {
      quiz_id: quizId,
      course_id: courseId,
      session_id: sessionId,
      starts_at: startsAt,
      due_at: dueAt,
      is_active: true,
      assigned_by: actorUserId,
    };

    const { data, error } = await supabase
      .from("quiz_assignments")
      .insert(payload)
      .select("id, quiz_id, course_id, session_id, starts_at, due_at, is_active, created_at")
      .single();

    if (error) return { data: null, error: formatSupabaseError(error) };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * List assignments for a given quiz (admin/instructor UX).
 *
 * @param {string} quizId
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function listQuizAssignments(quizId) {
  try {
    const { data, error } = await supabase
      .from("quiz_assignments")
      .select(
        `
        id,
        quiz_id,
        course_id,
        session_id,
        starts_at,
        due_at,
        is_active,
        created_at,
        course:courses(id, title),
        session:sessions(id, title, course_id, course:courses(id, title))
      `
      )
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: formatSupabaseError(error) };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Delete a quiz assignment (admin/instructor UX).
 *
 * @param {{ role: "admin" | "instructor" | "learner", assignmentId: string }} params
 * @returns {Promise<{ error: string | null }>}
 */
export async function deleteQuizAssignment({ role, assignmentId }) {
  try {
    if (!isWriteRole(role)) return { error: "You do not have permission to modify assignments." };
    if (!assignmentId) return { error: "Missing assignment id." };

    const { error } = await supabase.from("quiz_assignments").delete().eq("id", assignmentId);
    if (error) return { error: formatSupabaseError(error) };
    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * List quizzes assigned to a learner (derived from enrollments).
 * Returns rows with assignment + embedded quiz/course/session and a latestAttempt (if any).
 *
 * @param {{ userId: string }} params
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function listMyAssignedQuizzes({ userId }) {
  try {
    if (!userId) return { data: [], error: "Missing signed-in user." };

    const { sessionIds, courseIds, error: scopeErr } = await getLearnerScopeIds(userId);
    if (scopeErr) return { data: [], error: scopeErr };

    if (sessionIds.length === 0 && courseIds.length === 0) return { data: [], error: null };

    let query = supabase
      .from("quiz_assignments")
      .select(
        `
        id,
        quiz_id,
        course_id,
        session_id,
        starts_at,
        due_at,
        is_active,
        created_at,
        quiz:quizzes(id, title, description, is_published, owner_id),
        course:courses(id, title),
        session:sessions(id, title, course_id, course:courses(id, title))
      `
      )
      .eq("is_active", true);

    if (sessionIds.length > 0 && courseIds.length > 0) {
      // For OR filters, PostgREST syntax is string-based.
      query = query.or(
        `session_id.in.(${sessionIds.join(",")}),course_id.in.(${courseIds.join(",")})`
      );
    } else if (sessionIds.length > 0) {
      query = query.in("session_id", sessionIds);
    } else if (courseIds.length > 0) {
      query = query.in("course_id", courseIds);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return { data: [], error: formatSupabaseError(error) };

    const assignments = Array.isArray(data) ? data : [];
    if (assignments.length === 0) return { data: [], error: null };

    const assignmentIds = assignments.map((a) => a.id).filter(Boolean);

    const { data: attempts, error: aErr } = await supabase
      .from("quiz_attempts")
      .select("id, assignment_id, quiz_id, status, submitted_at, score_percent, correct_count, total_questions")
      .eq("user_id", userId)
      .in("assignment_id", assignmentIds)
      .order("submitted_at", { ascending: false });

    if (aErr) return { data: assignments, error: null }; // best-effort

    const latestByAssignment = new Map();
    (Array.isArray(attempts) ? attempts : []).forEach((att) => {
      if (!att?.assignment_id) return;
      if (!latestByAssignment.has(att.assignment_id)) latestByAssignment.set(att.assignment_id, att);
    });

    const merged = assignments.map((a) => ({
      ...a,
      latestAttempt: latestByAssignment.get(a.id) ?? null,
    }));

    return { data: merged, error: null };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Create an attempt row (in_progress).
 *
 * @param {{
 *  userId: string,
 *  quizId: string,
 *  assignmentId?: string | null
 * }} params
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function createQuizAttempt({ userId, quizId, assignmentId = null }) {
  try {
    if (!userId) return { data: null, error: "Missing signed-in user." };
    if (!quizId) return { data: null, error: "Missing quiz id." };

    const payload = {
      quiz_id: quizId,
      user_id: userId,
      assignment_id: assignmentId,
      status: "in_progress",
      started_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("quiz_attempts")
      .insert(payload)
      .select(
        "id, quiz_id, user_id, assignment_id, status, started_at, submitted_at, total_questions, correct_count, score_percent, created_at"
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
 * Fetch an attempt with items (for review page).
 *
 * @param {string} attemptId
 * @returns {Promise<{ data: any | null, error: string | null }>}
 */
export async function getAttemptWithItems(attemptId) {
  try {
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select(
        `
        id,
        quiz_id,
        user_id,
        assignment_id,
        status,
        started_at,
        submitted_at,
        total_questions,
        correct_count,
        score_percent,
        created_at,
        quiz:quizzes(id, title, description),
        items:quiz_attempt_items(
          id,
          question_id,
          question_prompt,
          question_type,
          options,
          selected_option_ids,
          correct_option_ids,
          is_correct,
          points,
          created_at
        )
      `
      )
      .eq("id", attemptId)
      .maybeSingle();

    if (error) return { data: null, error: formatSupabaseError(error) };
    if (!data) return { data: null, error: null };

    const normalized = {
      ...data,
      items: Array.isArray(data.items) ? data.items : [],
    };

    return { data: normalized, error: null };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * Finalize an attempt: insert attempt_items (snapshot) then update attempt summary fields.
 *
 * @param {{
 *  attemptId: string,
 *  items: any[],
 *  summary: { totalQuestions: number, correctCount: number, scorePercent: number },
 * }} params
 * @returns {Promise<{ error: string | null }>}
 */
export async function finalizeAttempt({ attemptId, items, summary }) {
  try {
    if (!attemptId) return { error: "Missing attempt id." };

    const safeItems = Array.isArray(items) ? items : [];

    if (safeItems.length > 0) {
      const payload = safeItems.map((it) => ({
        attempt_id: attemptId,
        question_id: it.question_id ?? null,
        question_prompt: String(it.question_prompt || "").trim(),
        question_type: it.question_type === "multi" ? "multi" : "single",
        options: Array.isArray(it.options) ? it.options : [],
        selected_option_ids: Array.isArray(it.selected_option_ids) ? it.selected_option_ids : [],
        correct_option_ids: Array.isArray(it.correct_option_ids) ? it.correct_option_ids : [],
        is_correct: Boolean(it.is_correct),
        points: typeof it.points === "number" && Number.isFinite(it.points) ? it.points : 1,
      }));

      const { error: iErr } = await supabase.from("quiz_attempt_items").insert(payload);
      if (iErr) return { error: formatSupabaseError(iErr) };
    }

    const { error: uErr } = await supabase
      .from("quiz_attempts")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        total_questions: summary?.totalQuestions ?? safeItems.length,
        correct_count: summary?.correctCount ?? 0,
        score_percent: summary?.scorePercent ?? 0,
      })
      .eq("id", attemptId);

    if (uErr) return { error: formatSupabaseError(uErr) };
    return { error: null };
  } catch (err) {
    return { error: formatSupabaseError(err) };
  }
}

// PUBLIC_INTERFACE
/**
 * List attempts for a quiz (admin/instructor UX, or learner self).
 *
 * @param {{
 *  role: "admin" | "instructor" | "learner",
 *  userId: string | null | undefined,
 *  quizId: string
 * }} params
 * @returns {Promise<{ data: any[], error: string | null }>}
 */
export async function listAttemptsForQuiz({ role, userId, quizId }) {
  try {
    if (!quizId) return { data: [], error: "Missing quiz id." };

    let query = supabase
      .from("quiz_attempts")
      .select(
        `
        id,
        quiz_id,
        user_id,
        assignment_id,
        status,
        started_at,
        submitted_at,
        total_questions,
        correct_count,
        score_percent,
        created_at
      `
      )
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: false });

    if (role === "learner") {
      if (!userId) return { data: [], error: "Missing signed-in user." };
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: formatSupabaseError(error) };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { data: [], error: formatSupabaseError(err) };
  }
}
