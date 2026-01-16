function toIdSet(ids) {
  const arr = Array.isArray(ids) ? ids : [];
  return new Set(arr.map((v) => String(v || "").trim()).filter(Boolean));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// PUBLIC_INTERFACE
/**
 * Compute basic auto-grading for a quiz attempt.
 *
 * Rules:
 * - single-choice: correct if selected option set exactly equals correct option set
 * - multi-select: correct if selected option set exactly equals correct option set
 * - unanswered: incorrect
 *
 * Returns:
 * - summary: totalQuestions, correctCount, scorePercent
 * - items: snapshot rows for quiz_attempt_items
 *
 * @param {{
 *  questions: Array<{
 *    id: string,
 *    prompt: string,
 *    question_type: "single" | "multi",
 *    points?: number,
 *    options: Array<{ id: string, label: string, is_correct: boolean }>
 *  }>
 * }} quiz
 * @param {Record<string, string[]>} answers Map questionId -> selected option ids (array)
 * @returns {{
 *  totalQuestions: number,
 *  correctCount: number,
 *  scorePercent: number,
 *  items: any[],
 * }}
 */
export function gradeQuizAttempt(quiz, answers) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const ans = answers && typeof answers === "object" ? answers : {};

  let correctCount = 0;

  const items = questions.map((q) => {
    const selectedIds = Array.isArray(ans[q.id]) ? ans[q.id] : [];
    const selectedSet = toIdSet(selectedIds);

    const options = Array.isArray(q.options) ? q.options : [];
    const correctIds = options.filter((o) => Boolean(o.is_correct)).map((o) => o.id);
    const correctSet = toIdSet(correctIds);

    const isCorrect = selectedSet.size > 0 && setsEqual(selectedSet, correctSet);
    if (isCorrect) correctCount += 1;

    const snapshotOptions = options.map((o) => ({
      id: o.id,
      label: o.label,
      is_correct: Boolean(o.is_correct),
    }));

    return {
      question_id: q.id,
      question_prompt: q.prompt,
      question_type: q.question_type === "multi" ? "multi" : "single",
      options: snapshotOptions,
      selected_option_ids: Array.from(selectedSet),
      correct_option_ids: Array.from(correctSet),
      is_correct: isCorrect,
      points: typeof q.points === "number" && Number.isFinite(q.points) ? q.points : 1,
    };
  });

  const totalQuestions = questions.length;
  const scorePercent = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 10000) / 100;

  return { totalQuestions, correctCount, scorePercent, items };
}
