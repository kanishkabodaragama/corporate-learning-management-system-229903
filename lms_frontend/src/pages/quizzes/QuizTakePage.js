import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { createQuizAttempt, finalizeAttempt, getQuizWithQuestions } from "../../data/quizzes";
import { gradeQuizAttempt } from "../../features/quizzes/grading";

// PUBLIC_INTERFACE
export default function QuizTakePage() {
  const navigate = useNavigate();
  const { quizId } = useParams();
  const [searchParams] = useSearchParams();

  const { user } = useAuth();
  const { role } = useAuthorization();

  const assignmentId = searchParams.get("assignmentId") || null;

  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);

  const [answers, setAnswers] = useState({}); // questionId -> optionIds[]
  const [isStarted, setIsStarted] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => quiz?.title || "Quiz", [quiz?.title]);

  const load = useCallback(async () => {
    if (!quizId) return;

    setIsLoading(true);
    setError("");

    const { data, error: qErr } = await getQuizWithQuestions(quizId);
    if (qErr) {
      setQuiz(null);
      setError(qErr);
      setIsLoading(false);
      return;
    }

    setQuiz(data);
    setIsLoading(false);
  }, [quizId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    load();
  }, [load]);

  const startAttempt = async () => {
    setError("");

    if (role !== "learner") {
      setError("Only learners can take quizzes in this MVP.");
      return;
    }

    if (!user?.id) {
      setError("Sign-in required.");
      return;
    }

    setIsSubmitting(true);

    const { data, error: aErr } = await createQuizAttempt({
      userId: user.id,
      quizId,
      assignmentId,
    });

    if (aErr) {
      setError(aErr);
      setIsSubmitting(false);
      return;
    }

    setAttempt(data);
    setIsStarted(true);
    setIsSubmitting(false);
  };

  const onSelectSingle = (questionId, optionId) => {
    setAnswers((prev) => ({ ...prev, [questionId]: [optionId] }));
  };

  const onToggleMulti = (questionId, optionId) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const set = new Set(current);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      return { ...prev, [questionId]: Array.from(set) };
    });
  };

  const onSubmit = async () => {
    setError("");

    if (!attempt?.id) {
      setError("Start the attempt first.");
      return;
    }
    if (!quiz) {
      setError("Quiz not loaded.");
      return;
    }

    setIsSubmitting(true);

    const graded = gradeQuizAttempt(quiz, answers);

    const { error: fErr } = await finalizeAttempt({
      attemptId: attempt.id,
      items: graded.items,
      summary: {
        totalQuestions: graded.totalQuestions,
        correctCount: graded.correctCount,
        scorePercent: graded.scorePercent,
      },
    });

    if (fErr) {
      setError(fErr);
      setIsSubmitting(false);
      return;
    }

    navigate(`/quizzes/attempts/${attempt.id}`);
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Quiz take header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className="muted">Answer all questions, then submit to receive an auto-graded score.</span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/quizzes">
              Back
            </Link>
          </div>
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Quizzes data is unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      <div className="card" aria-label="Quiz content">
        <div className="cardTitle">Attempt</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading quiz…</p>
        ) : !quiz ? (
          <p className="cardBody muted">Quiz not found or you don’t have access.</p>
        ) : !isStarted ? (
          <>
            {quiz.description ? <p className="cardBody">{quiz.description}</p> : null}
            <p className="cardBody muted" style={{ marginTop: 10 }}>
              When you start, an attempt record will be created in Supabase.
            </p>

            <div className="formActions">
              <button type="button" className="button buttonPrimary" onClick={startAttempt} disabled={isSubmitting}>
                {isSubmitting ? "Starting…" : "Start attempt"}
              </button>
              <Link className="button buttonSecondary" to="/quizzes">
                Cancel
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="helpText">
              Tip: Single-choice questions use radio buttons; multi-select uses checkboxes. For multi-select, you must
              select the exact correct set to earn credit.
            </p>

            {quiz.questions.map((q, idx) => {
              const selected = Array.isArray(answers[q.id]) ? answers[q.id] : [];

              return (
                <div key={q.id} className="card" style={{ marginTop: 12 }}>
                  <div className="cardTitle">
                    Q{idx + 1}. {q.prompt}
                  </div>

                  <div className="form">
                    {q.options.map((o) => {
                      const isChecked = selected.includes(o.id);

                      return (
                        <label key={o.id} className="checkRow">
                          {q.question_type === "multi" ? (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => onToggleMulti(q.id, o.id)}
                              disabled={isSubmitting}
                            />
                          ) : (
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              checked={isChecked}
                              onChange={() => onSelectSingle(q.id, o.id)}
                              disabled={isSubmitting}
                            />
                          )}
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="formActions">
              <button type="button" className="button buttonPrimary" onClick={onSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Submit attempt"}
              </button>
              <Link className="button buttonSecondary" to="/quizzes">
                Exit
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
