function normalizeType(value) {
  return value === "multi" ? "multi" : "single";
}

// PUBLIC_INTERFACE
/**
 * Validate quiz builder payload (title + question structure).
 *
 * @param {{
 *  title: string,
 *  questions: Array<{
 *    prompt: string,
 *    question_type: "single" | "multi",
 *    points?: number,
 *    options: Array<{ label: string, is_correct: boolean }>
 *  }>
 * }} input
 * @returns {{ isValid: boolean, errors: any }}
 */
export function validateQuizInput(input) {
  const errors = {};

  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Title is required.";
  else if (title.length < 3) errors.title = "Title must be at least 3 characters.";

  const questions = Array.isArray(input?.questions) ? input.questions : [];
  if (questions.length === 0) errors.questions = "Add at least one question.";

  const questionErrors = questions.map((q) => {
    const qe = {};
    const prompt = typeof q?.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) qe.prompt = "Question prompt is required.";

    const type = normalizeType(q?.question_type);
    const options = Array.isArray(q?.options) ? q.options : [];

    if (options.length < 2) qe.options = "Add at least two options.";

    const optionErrors = options.map((o) => {
      const oe = {};
      const label = typeof o?.label === "string" ? o.label.trim() : "";
      if (!label) oe.label = "Option label is required.";
      return oe;
    });

    const correctCount = options.filter((o) => Boolean(o?.is_correct)).length;
    if (type === "single" && correctCount !== 1) {
      qe.correct = "Single-choice questions must have exactly one correct option.";
    }
    if (type === "multi" && correctCount < 1) {
      qe.correct = "Multi-select questions must have at least one correct option.";
    }

    if (optionErrors.some((oe) => Object.keys(oe).length > 0)) {
      qe.optionErrors = optionErrors;
    }

    return qe;
  });

  if (questionErrors.some((qe) => Object.keys(qe).length > 0)) {
    errors.questionErrors = questionErrors;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
