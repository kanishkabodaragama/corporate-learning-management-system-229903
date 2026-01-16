import { supabase } from "../lib/supabaseClient";

function formatSupabaseError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  return "Unexpected database error";
}

const MS_DAY = 24 * 60 * 60 * 1000;

function toUtcStartOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toUtcEndExclusive(date) {
  // End boundary is exclusive to make bucket math stable: [start, end)
  return new Date(date.getTime() + 1);
}

function normalizeDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return 30;
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

function getBucketConfig(days) {
  // Keep charts readable: 7/30 => daily, 90 => weekly
  if (days >= 60) return { unit: "week", stepMs: 7 * MS_DAY };
  return { unit: "day", stepMs: MS_DAY };
}

function buildBuckets({ days, now = new Date() }) {
  const safeDays = normalizeDays(days);
  const { unit, stepMs } = getBucketConfig(safeDays);

  const utcToday = toUtcStartOfDay(now);
  const start = new Date(utcToday.getTime() - (safeDays - 1) * MS_DAY);

  // For weekly buckets, we still start exactly at "days ago"; chart is last N days grouped in weeks.
  const startMs = start.getTime();
  const endMsExclusive = utcToday.getTime() + MS_DAY; // include today

  const bucketCount = Math.max(1, Math.ceil((endMsExclusive - startMs) / stepMs));

  const buckets = Array.from({ length: bucketCount }).map((_, idx) => {
    const bucketStartMs = startMs + idx * stepMs;
    const bucketEndMs = Math.min(endMsExclusive, bucketStartMs + stepMs);

    const d = new Date(bucketStartMs);
    const label =
      unit === "day"
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : `Wk of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

    return {
      index: idx,
      label,
      startMs: bucketStartMs,
      endMs: bucketEndMs,
    };
  });

  return { buckets, start, endExclusive: new Date(endMsExclusive), unit, stepMs };
}

function bucketizeCount({ rows, dateField, days }) {
  const { buckets, start, endExclusive, stepMs } = buildBuckets({ days });
  const counts = Array.from({ length: buckets.length }).map(() => 0);

  const startMs = start.getTime();
  const endMs = endExclusive.getTime();

  for (const row of Array.isArray(rows) ? rows : []) {
    const iso = row?.[dateField];
    if (!iso) continue;

    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < startMs || t >= endMs) continue;

    const idx = Math.floor((t - startMs) / stepMs);
    if (idx >= 0 && idx < counts.length) counts[idx] += 1;
  }

  return buckets.map((b, i) => ({ label: b.label, value: counts[i] }));
}

function normalizeAttendanceStatus(status) {
  const v = String(status || "").toLowerCase().trim();
  if (v === "present" || v === "late" || v === "absent") return v;
  return "absent";
}

function isAttended(status) {
  const v = normalizeAttendanceStatus(status);
  return v === "present" || v === "late";
}

function safePercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function safeAverage(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

function shortId(id) {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

// PUBLIC_INTERFACE
/**
 * Fetch the Reports dashboard payload (KPIs + trends + tables) for a given time window.
 *
 * Data notes / definitions (MVP):
 * - "Active sessions" = sessions with starts_at within the selected window.
 * - "Completion rate" = enrollments within the window where the learner has an attendance
 *   record marked as present/late within the window for that same (session_id, user_id).
 * - "Attendance rate" = share of attendance rows in the window that are present/late.
 * - "Average quiz score" = average of quiz_attempts.score_percent for submitted attempts in the window.
 *
 * RLS note:
 * - This dashboard is intended for admins. If Supabase RLS blocks reads, the function returns
 *   a best-effort payload and an aggregated error message.
 *
 * @param {{ days: 7 | 30 | 90 }} params
 * @returns {Promise<{ data: {
 *   window: { days: number, sinceIso: string, nowIso: string },
 *   metrics: {
 *     totalCourses: number | null,
 *     activeSessions: number | null,
 *     totalEnrollments: number | null,
 *     completionRate: number | null,
 *     avgQuizScore: number | null,
 *     attendanceRate: number | null
 *   },
 *   trends: {
 *     enrollments: Array<{label: string, value: number}>,
 *     quizSubmissions: Array<{label: string, value: number}>,
 *     attendanceMarks: Array<{label: string, value: number}>
 *   },
 *   tables: {
 *     topCoursesByEnrollments: Array<{ courseId: string, title: string, enrollments: number, sessions: number }>,
 *     recentQuizAttempts: Array<{ id: string, userId: string, quizId: string|null, quizTitle: string, submittedAt: string|null, scorePercent: number|null }>
 *   }
 * } | null, error: string | null }>}
 */
export async function fetchReportsDashboard({ days }) {
  const safeDays = normalizeDays(days);

  const now = new Date();
  const nowIso = now.toISOString();
  const sinceIso = new Date(now.getTime() - safeDays * MS_DAY).toISOString();

  const errors = [];

  try {
    const [
      coursesCountRes,
      sessionsRes,
      enrollmentsRes,
      attendanceRes,
      quizAttemptsRes,
    ] = await Promise.all([
      supabase.from("courses").select("id", { count: "exact", head: true }),
      supabase
        .from("sessions")
        .select("id, starts_at", { count: "exact" })
        .gte("starts_at", sinceIso)
        .lte("starts_at", nowIso),
      supabase
        .from("enrollments")
        .select(
          `
            id,
            session_id,
            user_id,
            created_at,
            session:sessions!inner(
              id,
              starts_at,
              course_id,
              course:courses(id, title)
            )
          `,
          { count: "exact" }
        )
        .gte("created_at", sinceIso)
        .lte("created_at", nowIso),
      supabase
        .from("attendance")
        .select("session_id, user_id, status, marked_at")
        .gte("marked_at", sinceIso)
        .lte("marked_at", nowIso),
      supabase
        .from("quiz_attempts")
        .select(
          `
            id,
            quiz_id,
            user_id,
            status,
            submitted_at,
            score_percent,
            quiz:quizzes(id, title)
          `
        )
        .eq("status", "submitted")
        .gte("submitted_at", sinceIso)
        .lte("submitted_at", nowIso)
        .order("submitted_at", { ascending: false })
        .limit(2500),
    ]);

    const totalCourses = typeof coursesCountRes?.count === "number" ? coursesCountRes.count : null;
    if (coursesCountRes?.error) errors.push(`Courses: ${formatSupabaseError(coursesCountRes.error)}`);

    const sessions = Array.isArray(sessionsRes?.data) ? sessionsRes.data : [];
    const activeSessions = typeof sessionsRes?.count === "number" ? sessionsRes.count : sessions.length;
    if (sessionsRes?.error) errors.push(`Sessions: ${formatSupabaseError(sessionsRes.error)}`);

    const enrollments = Array.isArray(enrollmentsRes?.data) ? enrollmentsRes.data : [];
    const totalEnrollments =
      typeof enrollmentsRes?.count === "number" ? enrollmentsRes.count : enrollments.length;
    if (enrollmentsRes?.error) errors.push(`Enrollments: ${formatSupabaseError(enrollmentsRes.error)}`);

    const attendance = Array.isArray(attendanceRes?.data) ? attendanceRes.data : [];
    if (attendanceRes?.error) errors.push(`Attendance: ${formatSupabaseError(attendanceRes.error)}`);

    const quizAttempts = Array.isArray(quizAttemptsRes?.data) ? quizAttemptsRes.data : [];
    if (quizAttemptsRes?.error) errors.push(`Quiz attempts: ${formatSupabaseError(quizAttemptsRes.error)}`);

    // Attendance rate
    const attendanceAttendedCount = attendance.filter((a) => isAttended(a?.status)).length;
    const attendanceRate = safePercent(attendanceAttendedCount, attendance.length);

    // Completion rate (based on enrollments and attendance)
    const attendedEnrollmentKeySet = new Set(
      attendance
        .filter((a) => isAttended(a?.status))
        .map((a) => `${a.session_id}:${a.user_id}`)
        .filter(Boolean)
    );

    const completedEnrollments = enrollments.filter((e) =>
      attendedEnrollmentKeySet.has(`${e.session_id}:${e.user_id}`)
    ).length;

    const completionRate = safePercent(completedEnrollments, enrollments.length);

    // Average quiz score (submitted attempts)
    const avgQuizScore = safeAverage(quizAttempts.map((a) => a?.score_percent));

    // Trends
    const trends = {
      enrollments: bucketizeCount({ rows: enrollments, dateField: "created_at", days: safeDays }),
      quizSubmissions: bucketizeCount({ rows: quizAttempts, dateField: "submitted_at", days: safeDays }),
      attendanceMarks: bucketizeCount({ rows: attendance, dateField: "marked_at", days: safeDays }),
    };

    // Top courses by enrollments (within window)
    const courseAgg = new Map();
    for (const e of enrollments) {
      const courseId = e?.session?.course?.id || e?.session?.course_id || null;
      const title = e?.session?.course?.title || "Untitled course";

      if (!courseId) continue;
      if (!courseAgg.has(courseId)) {
        courseAgg.set(courseId, { courseId, title, enrollments: 0, sessionIds: new Set() });
      }
      const entry = courseAgg.get(courseId);
      entry.enrollments += 1;
      if (e?.session_id) entry.sessionIds.add(e.session_id);
    }

    const topCoursesByEnrollments = Array.from(courseAgg.values())
      .map((c) => ({
        courseId: c.courseId,
        title: c.title,
        enrollments: c.enrollments,
        sessions: c.sessionIds.size,
      }))
      .sort((a, b) => b.enrollments - a.enrollments)
      .slice(0, 8);

    // Recent quiz attempts (within window)
    const recentQuizAttempts = quizAttempts.slice(0, 10).map((a) => ({
      id: a?.id ? String(a.id) : "",
      userId: a?.user_id ? String(a.user_id) : "",
      quizId: a?.quiz_id ? String(a.quiz_id) : null,
      quizTitle: a?.quiz?.title || "Quiz",
      submittedAt: a?.submitted_at ?? null,
      scorePercent: typeof a?.score_percent === "number" ? a.score_percent : null,
      attemptShortId: shortId(a?.id),
      userShortId: shortId(a?.user_id),
    }));

    return {
      data: {
        window: { days: safeDays, sinceIso, nowIso },
        metrics: {
          totalCourses,
          activeSessions,
          totalEnrollments,
          completionRate,
          avgQuizScore,
          attendanceRate,
        },
        trends,
        tables: {
          topCoursesByEnrollments,
          recentQuizAttempts,
        },
      },
      error: errors.length ? errors.join(" • ") : null,
    };
  } catch (err) {
    return { data: null, error: formatSupabaseError(err) };
  }
}
