import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { createQuiz, getQuizWithQuestions, replaceQuizStructure, updateQuiz } from "../../data/quizzes";
import { validateQuizInput } from "../../features/quizzes/validation";

function makeLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeBuilderQuestions(quiz) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  return questions.map((q) => ({
    localId: q.id || makeLocalId("q"),
    prompt: q.prompt || "",
    question_type: q.question_type === "multi" ? "multi" : "single",
    points: typeof q.points === "number" ? q.points : 1,
    options: Array.isArray(q.options)
      ? q.options.map((o) => ({
          localId: o.id || makeLocalId("o"),
          label: o.label || "",
          is_correct: Boolean(o.is_correct),
        }))
      : [],
  }));
}

// PUBLIC_INTERFACE
export default function QuizBuilderPage({ mode }) {
  const navigate = useNavigate();
  const { quizId } = useParams();

  const { user } = useAuth();
  const { role, canAccess } = useAuthorization();

  const canManage = canAccess(["admin", "instructor"]);

  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "Edit quiz" : "Create quiz";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const [questions, setQuestions] = useState([
    {
      localId: makeLocalId("q"),
      prompt: "",
      question_type: "single",
      points: 1,
      options: [
        { localId: makeLocalId("o"), label: "", is_correct: true },
        { localId: makeLocalId("o"), label: "", is_correct: false },
      ],
    },
  ]);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const ownerId = useMemo(() => user?.id || "", [user?.id]);

  const load = useCallback(async () => {
    if (!isEdit || !quizId) return;

    setIsLoading(true);
    setFormError("");

    const { data, error } = await getQuizWithQuestions(quizId);
    if (error) {
      setFormError(error);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setFormError("Quiz not found.");
      setIsLoading(false);
      return;
    }

    setTitle(data.title || "");
    setDescription(data.description || "");
    setIsPublished(Boolean(data.is_published));
    setQuestions(normalizeBuilderQuestions(data));

    setIsLoading(false);
  }, [isEdit, quizId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    load();
  }, [load]);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        localId: makeLocalId("q"),
        prompt: "",
        question_type: "single",
        points: 1,
        options: [
          { localId: makeLocalId("o"), label: "", is_correct: true },
          { localId: makeLocalId("o"), label: "", is_correct: false },
        ],
      },
    ]);
  };

  const removeQuestion = (localId) => {
    setQuestions((prev) => prev.filter((q) => q.localId !== localId));
  };

  const moveQuestion = (localId, dir) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.localId === localId);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;

      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const updateQuestion = (localId, patch) => {
    setQuestions((prev) => prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q)));
  };

  const addOption = (qLocalId) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.localId === qLocalId
          ? { ...q, options: [...q.options, { localId: makeLocalId("o"), label: "", is_correct: false }] }
          : q
      )
    );
  };

  const removeOption = (qLocalId, oLocalId) => {
    setQuestions((prev) =>
      prev.map((q) => (q.localId === qLocalId ? { ...q, options: q.options.filter((o) => o.localId !== oLocalId) } : q))
    );
  };

  const updateOption = (qLocalId, oLocalId, patch) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== qLocalId) return q;
        return { ...q, options: q.options.map((o) => (o.localId === oLocalId ? { ...o, ...patch } : o)) };
      })
    );
  };

  const toggleCorrectSingle = (qLocalId, oLocalId) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== qLocalId) return q;
        if (q.question_type !== "single") return q;
        return { ...q, options: q.options.map((o) => ({ ...o, is_correct: o.localId === oLocalId })) };
      })
    );
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setErrors({});

    const normalizedQuestions = questions.map((q) => ({
      prompt: q.prompt,
      question_type: q.question_type,
      points: q.points,
      options: q.options.map((o) => ({ label: o.label, is_correct: Boolean(o.is_correct) })),
    }));

    const validation = validateQuizInput({ title, questions: normalizedQuestions });
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (!isSupabaseConfigured) {
      setFormError("Supabase is not configured.");
      return;
    }

    if (!canManage) {
      setFormError("You don’t have permission to create or edit quizzes.");
      return;
    }

    if (!ownerId && !isEdit) {
      setFormError("Missing owner id (sign-in required).");
      return;
    }

    setIsSaving(true);

    if (isEdit) {
      const { data, error } = await updateQuiz(quizId, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        is_published: Boolean(isPublished),
      });

      if (error) {
        setFormError(error);
        setIsSaving(false);
        return;
      }

      const { error: sErr } = await replaceQuizStructure({
        role,
        quizId: data?.id || quizId,
        questions: normalizedQuestions.map((q) => ({
          prompt: q.prompt.trim(),
          question_type: q.question_type === "multi" ? "multi" : "single",
          points: typeof q.points === "number" ? q.points : 1,
          options: q.options.map((o) => ({ label: o.label.trim(), is_correct: Boolean(o.is_correct) })),
        })),
      });

      if (sErr) {
        setFormError(sErr);
        setIsSaving(false);
        return;
      }

      navigate(`/quizzes/${data?.id || quizId}`);
      return;
    }

    const { data, error } = await createQuiz({
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      is_published: Boolean(isPublished),
      owner_id: ownerId,
    });

    if (error) {
      setFormError(error);
      setIsSaving(false);
      return;
    }

    const { error: sErr } = await replaceQuizStructure({
      role,
      quizId: data?.id,
      questions: normalizedQuestions.map((q) => ({
        prompt: q.prompt.trim(),
        question_type: q.question_type === "multi" ? "multi" : "single",
        points: typeof q.points === "number" ? q.points : 1,
        options: q.options.map((o) => ({ label: o.label.trim(), is_correct: Boolean(o.is_correct) })),
      })),
    });

    if (sErr) {
      setFormError(sErr);
      setIsSaving(false);
      return;
    }

    navigate(`/quizzes/${data?.id}`);
  };

  return (
    <>
      <div className="card subHeaderCard" aria-label="Quiz builder header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{pageTitle}</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Build questions and answer options. Scoring is auto-graded for single and multi-select questions.
              </span>
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to={isEdit ? `/quizzes/${quizId}` : "/quizzes"}>
              Cancel
            </Link>
          </div>
        </div>
      </div>

      <div className="card" aria-label="Quiz builder form">
        <div className="cardTitle">Details</div>

        {!canManage ? (
          <div className="alert alertError" role="alert">
            You don’t have permission to create or edit quizzes.
          </div>
        ) : null}

        {formError ? (
          <div className="alert alertError" role="alert">
            {formError}
          </div>
        ) : null}

        {isLoading ? (
          <p className="cardBody">Loading…</p>
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <div className="formField">
              <label className="label" htmlFor="quiz-title">
                Title
              </label>
              <input
                id="quiz-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Workplace Safety Quiz"
                disabled={!canManage || isSaving}
                required
              />
              {errors.title ? <div className="fieldError">{errors.title}</div> : null}
            </div>

            <div className="formField">
              <label className="label" htmlFor="quiz-description">
                Description
              </label>
              <textarea
                id="quiz-description"
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional short instructions for learners…"
                disabled={!canManage || isSaving}
                rows={4}
              />
            </div>

            <div className="formRow">
              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  disabled={!canManage || isSaving}
                />
                <span>
                  Publish quiz (learners can take it when assigned)
                  <span className="helpText" style={{ display: "block" }}>
                    Draft quizzes should be visible only to admins/owners (recommended with RLS).
                  </span>
                </span>
              </label>
            </div>

            <div className="card" aria-label="Questions" style={{ padding: 14 }}>
              <div className="cardTitle">Questions</div>

              {errors.questions ? <div className="alert alertError">{errors.questions}</div> : null}

              {questions.map((q, idx) => {
                const qe = Array.isArray(errors.questionErrors) ? errors.questionErrors[idx] : null;

                return (
                  <div key={q.localId} className="card" style={{ padding: 14, marginTop: 12 }} aria-label={`Question ${idx + 1}`}>
                    <div className="subHeaderRow" style={{ marginBottom: 8 }}>
                      <div className="subHeaderTitle" style={{ fontSize: 14 }}>
                        Question {idx + 1}
                      </div>
                      <div className="rowActions">
                        <button
                          type="button"
                          className="button buttonSecondary"
                          onClick={() => moveQuestion(q.localId, -1)}
                          disabled={idx === 0 || isSaving}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="button buttonSecondary"
                          onClick={() => moveQuestion(q.localId, +1)}
                          disabled={idx === questions.length - 1 || isSaving}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="button buttonDanger"
                          onClick={() => removeQuestion(q.localId)}
                          disabled={questions.length <= 1 || isSaving}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="formField">
                      <label className="label" htmlFor={`q-prompt-${q.localId}`}>
                        Prompt
                      </label>
                      <input
                        id={`q-prompt-${q.localId}`}
                        className="input"
                        value={q.prompt}
                        onChange={(e) => updateQuestion(q.localId, { prompt: e.target.value })}
                        placeholder="Write the question…"
                        disabled={isSaving}
                      />
                      {qe?.prompt ? <div className="fieldError">{qe.prompt}</div> : null}
                    </div>

                    <div className="formRow formRow2">
                      <div className="formField">
                        <label className="label" htmlFor={`q-type-${q.localId}`}>
                          Type
                        </label>
                        <select
                          id={`q-type-${q.localId}`}
                          className="select"
                          value={q.question_type}
                          onChange={(e) => updateQuestion(q.localId, { question_type: e.target.value })}
                          disabled={isSaving}
                        >
                          <option value="single">Single choice</option>
                          <option value="multi">Multi select</option>
                        </select>
                      </div>

                      <div className="formField">
                        <label className="label" htmlFor={`q-points-${q.localId}`}>
                          Points (optional)
                        </label>
                        <input
                          id={`q-points-${q.localId}`}
                          className="input mono"
                          value={String(q.points ?? 1)}
                          onChange={(e) => {
                            const num = Number(e.target.value);
                            updateQuestion(q.localId, { points: Number.isFinite(num) ? num : 1 });
                          }}
                          inputMode="numeric"
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    {qe?.correct ? <div className="alert alertError">{qe.correct}</div> : null}
                    {qe?.options ? <div className="alert alertError">{qe.options}</div> : null}

                    <div className="card" style={{ padding: 12, marginTop: 10 }} aria-label="Options">
                      <div className="subHeaderRow" style={{ marginBottom: 8 }}>
                        <div className="cardTitle">Options</div>
                        <div className="rowActions">
                          <button type="button" className="button buttonSecondary" onClick={() => addOption(q.localId)} disabled={isSaving}>
                            Add option
                          </button>
                        </div>
                      </div>

                      {q.options.map((o, oIdx) => {
                        const oe = Array.isArray(qe?.optionErrors) ? qe.optionErrors[oIdx] : null;

                        return (
                          <div key={o.localId} className="formRow formRow2" style={{ marginBottom: 10 }}>
                            <div className="formField" style={{ flex: "1 1 520px" }}>
                              <label className="labelSmall" htmlFor={`o-label-${q.localId}-${o.localId}`}>
                                Label
                              </label>
                              <input
                                id={`o-label-${q.localId}-${o.localId}`}
                                className="input"
                                value={o.label}
                                onChange={(e) => updateOption(q.localId, o.localId, { label: e.target.value })}
                                placeholder={`Option ${oIdx + 1}`}
                                disabled={isSaving}
                              />
                              {oe?.label ? <div className="fieldError">{oe.label}</div> : null}
                            </div>

                            <div className="formField" style={{ flex: "0 0 220px" }}>
                              <label className="labelSmall">Correct</label>
                              <label className="checkRow" style={{ margin: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(o.is_correct)}
                                  onChange={(e) => {
                                    if (q.question_type === "single") {
                                      toggleCorrectSingle(q.localId, o.localId);
                                    } else {
                                      updateOption(q.localId, o.localId, { is_correct: e.target.checked });
                                    }
                                  }}
                                  disabled={isSaving}
                                />
                                <span>{q.question_type === "single" ? "Mark as the correct answer" : "Included"}</span>
                              </label>
                            </div>

                            <div className="formField" style={{ flex: "0 0 auto", justifyContent: "flex-end" }}>
                              <label className="labelSmall" style={{ visibility: "hidden" }}>
                                Remove
                              </label>
                              <button
                                type="button"
                                className="button buttonDanger"
                                onClick={() => removeOption(q.localId, o.localId)}
                                disabled={q.options.length <= 2 || isSaving}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      <p className="helpText">
                        For single-choice questions, only one option can be correct. For multi-select, learners must
                        select the exact correct set to earn credit.
                      </p>
                    </div>
                  </div>
                );
              })}

              <div className="formActions">
                <button type="button" className="button buttonSecondary" onClick={addQuestion} disabled={isSaving}>
                  Add question
                </button>
              </div>
            </div>

            <div className="formActions">
              <button type="submit" className="button buttonPrimary" disabled={!canManage || isSaving}>
                {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create quiz"}
              </button>
              <Link className="button buttonSecondary" to={isEdit ? `/quizzes/${quizId}` : "/quizzes"}>
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
