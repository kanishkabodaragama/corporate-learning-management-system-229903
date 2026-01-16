import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAuthorization } from "../auth/useAuthorization";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { fetchReportsDashboard } from "../data/reports";

const RANGE_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function formatNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function formatPercent(p) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return `${p.toFixed(1)}%`;
}

function formatScore(p) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return `${p.toFixed(1)}%`;
}

function safeShortId(id) {
  if (!id) return "—";
  const s = String(id);
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function Sparkline({ points, ariaLabel }) {
  const values = Array.isArray(points) ? points.map((p) => Number(p?.value ?? 0)) : [];
  const hasData = values.length > 0 && values.some((v) => Number.isFinite(v) && v !== 0);

  if (!Array.isArray(points) || points.length === 0) {
    return <p className="cardBody muted">No data.</p>;
  }

  // If the window is all zeros, show a subtle empty-state.
  if (!hasData) {
    return <p className="cardBody muted">No activity in this range.</p>;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const W = 140;
  const H = 42;
  const PAD = 3;

  const coords = values.map((v, idx) => {
    const x = PAD + (idx * (W - PAD * 2)) / Math.max(1, values.length - 1);
    const y = PAD + ((max - v) * (H - PAD * 2)) / span;
    return { x, y };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const last = values[values.length - 1];

  return (
    <div className="sparklineRow">
      <svg
        className="sparklineSvg"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
      >
        <polyline className="sparklineLine" points={polyline} fill="none" />
        <circle
          className="sparklineDot"
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r="2.4"
        />
      </svg>

      <div className="sparklineMeta">
        <div className="metricValue">{formatNumber(last)}</div>
        <div className="metricSubLabel">Most recent bucket</div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="card metricCard">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
      {hint ? <div className="metricHint">{hint}</div> : null}
    </div>
  );
}

// PUBLIC_INTERFACE
export default function ReportsPage() {
  const { user } = useAuth();
  const { role, roleSource, isRoleLoading, roleLoadError, isProfilesTableMissing } = useAuthorization();

  const [rangeDays, setRangeDays] = useState(30);

  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    setIsLoading(true);
    setError("");

    const { data, error: e } = await fetchReportsDashboard({ days: rangeDays });

    setDashboard(data ?? null);
    setError(e || "");
    setIsLoading(false);
  }, [rangeDays]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = dashboard?.metrics ?? null;
  const trends = dashboard?.trends ?? null;
  const tables = dashboard?.tables ?? null;

  const windowLabel = useMemo(() => {
    const opt = RANGE_OPTIONS.find((o) => o.days === rangeDays);
    return opt ? `Last ${opt.label}` : `Last ${rangeDays} days`;
  }, [rangeDays]);

  return (
    <section className="page" aria-label="Reports">
      <header>
        <h1 className="pageTitle">Reports</h1>
        <p className="pageDesc">
          KPI snapshot and lightweight trends across courses, sessions, enrollments, quizzes, and attendance.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <div className="card noticeCard" role="note">
          <div className="cardTitle">Supabase not configured</div>
          <p className="cardBody">
            Reports are unavailable until <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code> are
            set.
          </p>
        </div>
      ) : null}

      <div className="card toolbarCard" aria-label="Report controls">
        <div className="toolbarLeft">
          <div className="fieldInline">
            <label className="labelSmall" htmlFor="report-range">
              Time range
            </label>

            <div className="segmented" role="group" aria-label="Time range selector" id="report-range">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  className={rangeDays === opt.days ? "segmentedButton segmentedButtonActive" : "segmentedButton"}
                  aria-pressed={rangeDays === opt.days}
                  onClick={() => setRangeDays(opt.days)}
                  disabled={isLoading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pill" title="Selected reporting window">
            {windowLabel}
          </div>
        </div>

        <div className="toolbarRight">
          <div className="pill" title="Role enforced by route guard">
            Admin only
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alertError" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading && !dashboard ? (
        <div className="card" aria-label="Loading reports">
          <div className="cardTitle">Loading</div>
          <p className="cardBody">Fetching analytics…</p>
        </div>
      ) : null}

      {!isLoading && dashboard ? (
        <>
          <div className="metricsGrid" aria-label="Key metrics">
            <MetricCard label="Total courses" value={formatNumber(metrics?.totalCourses)} hint="All time" />
            <MetricCard label="Active sessions" value={formatNumber(metrics?.activeSessions)} hint={windowLabel} />
            <MetricCard label="Total enrollments" value={formatNumber(metrics?.totalEnrollments)} hint={windowLabel} />
            <MetricCard
              label="Completion rate"
              value={formatPercent(metrics?.completionRate)}
              hint="Enrollments with present/late attendance"
            />
            <MetricCard label="Average quiz score" value={formatScore(metrics?.avgQuizScore)} hint="Submitted attempts" />
            <MetricCard
              label="Attendance rate"
              value={formatPercent(metrics?.attendanceRate)}
              hint="Present/late over attendance marks"
            />
          </div>

          <div className="reportGrid" aria-label="Trends">
            <div className="card">
              <div className="cardTitle">Enrollments trend</div>
              <p className="cardBody">Enrollments created over time ({windowLabel}).</p>
              <div className="spacer12" />
              <Sparkline points={trends?.enrollments || []} ariaLabel="Enrollments trend chart" />
              <div className="spacer8" />
              <div className="metricSubLabel muted">Buckets are daily for 7/30 days; weekly for 90 days.</div>
            </div>

            <div className="card">
              <div className="cardTitle">Quiz submissions trend</div>
              <p className="cardBody">Submitted quiz attempts over time ({windowLabel}).</p>
              <div className="spacer12" />
              <Sparkline points={trends?.quizSubmissions || []} ariaLabel="Quiz submissions trend chart" />
            </div>

            <div className="card">
              <div className="cardTitle">Attendance marks trend</div>
              <p className="cardBody">Attendance records marked over time ({windowLabel}).</p>
              <div className="spacer12" />
              <Sparkline points={trends?.attendanceMarks || []} ariaLabel="Attendance marks trend chart" />
            </div>

            <div className="card">
              <div className="cardTitle">Quick notes</div>
              <p className="cardBody">
                This dashboard is intentionally lightweight (client-side aggregation). For larger datasets, move these
                calculations into Postgres views/functions or dedicated reporting tables.
              </p>

              <div className="spacer12" />

              <div className="kvGrid">
                <div className="kvItem">
                  <div className="kvKey">Role</div>
                  <div className="kvValue">{role}</div>
                </div>
                <div className="kvItem">
                  <div className="kvKey">Role source</div>
                  <div className="kvValue">{roleSource}</div>
                </div>
                <div className="kvItem">
                  <div className="kvKey">Auth user</div>
                  <div className="kvValue mono" title={user?.id}>
                    {safeShortId(user?.id)}
                  </div>
                </div>
              </div>

              {isRoleLoading ? <p className="helpText">Loading permissions…</p> : null}
              {roleLoadError ? <p className="helpText">Note: {roleLoadError}</p> : null}
              {isProfilesTableMissing ? (
                <p className="helpText">
                  Profiles table not found; role is derived from auth metadata/default. Consider creating{" "}
                  <code>public.profiles</code> for stronger RBAC.
                </p>
              ) : null}
            </div>
          </div>

          <div className="reportGrid" aria-label="Tables">
            <div className="card">
              <div className="cardTitle">Top courses by enrollments</div>
              <p className="cardBody">Most enrolled courses in the selected window.</p>

              <div className="spacer12" />

              {Array.isArray(tables?.topCoursesByEnrollments) && tables.topCoursesByEnrollments.length > 0 ? (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: "60%" }}>Course</th>
                        <th style={{ width: "20%" }}>Enrollments</th>
                        <th style={{ width: "20%" }}>Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.topCoursesByEnrollments.map((row) => (
                        <tr key={row.courseId}>
                          <td>
                            <div className="cellTitle">
                              <Link className="inlineLink" to={`/courses/${row.courseId}`}>
                                {row.title}
                              </Link>
                            </div>
                            <div className="cellSub mono">ID: {safeShortId(row.courseId)}</div>
                          </td>
                          <td className="mono">{formatNumber(row.enrollments)}</td>
                          <td className="mono">{formatNumber(row.sessions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cardBody muted">No enrollments in this window yet.</p>
              )}
            </div>

            <div className="card">
              <div className="cardTitle">Recent quiz attempts</div>
              <p className="cardBody">Latest submitted attempts in the selected window.</p>

              <div className="spacer12" />

              {Array.isArray(tables?.recentQuizAttempts) && tables.recentQuizAttempts.length > 0 ? (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: "44%" }}>Quiz</th>
                        <th style={{ width: "22%" }}>Learner</th>
                        <th style={{ width: "22%" }}>Attempt</th>
                        <th style={{ width: "12%" }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.recentQuizAttempts.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="cellTitle">{a.quizTitle}</div>
                            <div className="cellSub mono">{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</div>
                          </td>
                          <td className="mono" title={a.userId}>
                            {a.userShortId || safeShortId(a.userId)}
                          </td>
                          <td className="mono" title={a.id}>
                            {a.attemptShortId || safeShortId(a.id)}
                          </td>
                          <td className="mono">{formatScore(a.scorePercent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cardBody muted">No submitted attempts found in this window.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
