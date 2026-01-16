import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useAuthorization } from "../../auth/useAuthorization";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { getAttemptWithItems } from "../../data/quizzes";
import { formatDateTime } from "../../utils/datetime";

function toSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).map((v) => String(v || "").trim()).filter(Boolean));
}

// PUBLIC_INTERFACE
export default function QuizAttemptReviewPage() {
  const { attemptId } = useParams();
  const { user } = useAuth();
  const { role } = useAuthorization();

  const [attempt, setAttempt] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => attempt?.quiz?.title || "Attempt review", [attempt?.quiz?.title]);

  const load = useCallback(async () => {
    if (!attemptId) return;

    setIsLoading(true);
    setError("");

    const { data, error: e } = await getAttemptWithItems(attemptId);
    if (e) {
      setAttempt(null);
      setError(e);
      setIsLoading(false);
      return;
    }

    setAttempt(data);
    setIsLoading(false);
  }, [attemptId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    load();
  }, [load]);

  const accessHint = useMemo(() => {
    if (!attempt) return null;
    if (role === "learner" && user?.id && attempt.user_id !== user.id) {
      return "This attempt does not belong to you (or RLS should prevent access).";
    }
    return null;
  }, [attempt, role, user?.id]);

  return (
    <>
      <div className="card subHeaderCard" aria-label="Attempt header">
        <div className="subHeaderRow">
          <div>
            <div className="subHeaderTitle">{title}</div>
            <div className="subHeaderMeta">
              <span className="muted">
                Submitted: <span className="mono">{formatDateTime(attempt?.submitted_at || attempt?.created_at)}</span>
              </span>
              {typeof attempt?.score_percent === "number" ? (
                <span className="badge badgeSuccess">Score: {attempt.score_percent}%</span>
              ) : (
                <span className="badge badgeNeutral">Score pending</span>
              )}
            </div>
          </div>

          <div className="rowActions">
            <Link className="button buttonSecondary" to="/quizzes">
              Back to quizzes
            </Link>
          </div>
        </div>
      </div>

      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Attempts are unavailable until <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code> are set.
          </p>
        </div>
      ) : null}

      <div className="card" aria-label="Attempt overview">
        <div className="cardTitle">Summary</div>

        {error ? (
          <div className="alert alertError" role="alert">
            {error}
          </div>
        ) : null}

        {accessHint ? (
          <div className="alert alertError" role="alert">
            {accessHint}
          </div>
        ) : null}

        {isLoading && !attempt ? (
          <p className="cardBody">Loading…</p>
        ) : attempt ? (
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvKey">Attempt ID</div>
              <div className="kvValue mono">{attempt.id}</div>
            </div>
            <div className="kvItem">
              <div className="kvKey">Learner ID</div>
              <div className="kvValue mono">{attempt.user_id}</div>
            </div>
            <div className="kvItem">
              <div className="kvKey">Correct</div>
              <div className="kvValue mono">
                {typeof attempt.correct_count === "number" && typeof attempt.total_questions === "number"
                  ? `${attempt.correct_count}/${attempt.total_questions}`
                  : "—"}
              </div>
            </div>
          </div>
        ) : (
          <p className="cardBody muted">Attempt not found or you don’t have access.</p>
        )}
      </div>

      {attempt?.items?.length ? (
        <div className="card" aria-label="Attempt questions">
          <div className="cardTitle">Questions</div>

          {attempt.items.map((it, idx) => {
            const selected = toSet(it.selected_option_ids);
            const correct = toSet(it.correct_option_ids);

            const options = Array.isArray(it.options) ? it.options : [];

            return (
              <div key={it.id} className="card" style={{ marginTop: 12 }}>
                <div className="subHeaderRow" style={{ marginBottom: 8 }}>
                  <div className="cardTitle" style={{ margin: 0 }}>
                    Q{idx + 1}. {it.question_prompt}
                  </div>
                  <span className={it.is_correct ? "badge badgeSuccess" : "badge badgeError"}>
                    {it.is_correct ? "Correct" : "Incorrect"}
                  </span>
                </div>

                <div className="form">
                  {options.map((o) => {
                    const isSelected = selected.has(String(o.id));
                    const isCorrect = correct.has(String(o.id));
                    const badgeClass = isCorrect ? "badge badgeSuccess" : isSelected ? "badge badgeNeutral" : "badge";

                    return (
                      <div key={o.id} className="checkRow" aria-label="Option review">
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", width: "100%" }}>
                          <div className="mono" style={{ minWidth: 22 }}>
                            {isSelected ? "✓" : " "}
                          </div>
                          <div style={{ flex: "1 1 auto" }}>{o.label}</div>
                          <span className={badgeClass}>{isCorrect ? "Correct" : isSelected ? "Selected" : "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="helpText">
                  Multi-select questions require an exact match of all correct options to be marked correct in this MVP.
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
