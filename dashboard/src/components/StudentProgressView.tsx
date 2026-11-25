import { useCallback, useEffect, useMemo, useState } from "react";
import { getStudentProgress } from "../api";
import { messageOf } from "../format";
import type { StudentProgress } from "../types";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  WarningIcon,
} from "./icons";

interface StudentProgressViewProps {
  onPracticeTopic?: (topic: string) => void;
}

export function StudentProgressView({ onPracticeTopic }: StudentProgressViewProps) {
  const [data, setData] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentProgress();
      setData(res);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const filteredTopics = useMemo(() => {
    if (!data?.topic_mastery) return [];
    return data.topic_mastery.filter((t) => {
      const matchesSearch = t.topic.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (tierFilter === "all") return true;
      if (tierFilter === "critical") return t.status === "critical_gap";
      if (tierFilter === "review") return t.status === "needs_review";
      if (tierFilter === "proficient") return t.status === "proficient";
      return true;
    });
  }, [data, searchQuery, tierFilter]);

  const overallMastery = useMemo(() => {
    if (!data?.topic_mastery || data.topic_mastery.length === 0) return 0;
    const sum = data.topic_mastery.reduce((acc, curr) => acc + curr.score, 0);
    return sum / data.topic_mastery.length;
  }, [data]);

  return (
    <div className="student-progress-container">
      {/* View Header */}
      <header className="workspace-header" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <p className="kicker" style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--accent-text)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px 0" }}>
              Personal Learning Analytics
            </p>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              My Topic Mastery &amp; Progress
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
              Comprehensive breakdown of quiz attempts, accuracy rates, and machine learning diagnosed knowledge gaps.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void loadProgress()}
            >
              <RefreshCwIcon />
              <span>Refresh Analytics</span>
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="inline-warning error" style={{ marginBottom: 16 }}>
          <WarningIcon />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="study-loading" style={{ padding: "40px 0", textAlign: "center" }}>
          <span className="spinner" />
          <p style={{ marginTop: "12px", color: "var(--text-muted)" }}>
            Calculating your performance statistics…
          </p>
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Overall Mastery</span>
              <div className="metric-value" style={{ color: "var(--accent-text)" }}>
                {Math.round(overallMastery * 100)}%
              </div>
              <span className="metric-meta">Curriculum progress EMA</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Overall Accuracy</span>
              <div
                className="metric-value"
                style={{
                  color:
                    data.overall_accuracy >= 0.7
                      ? "var(--success-text)"
                      : data.overall_accuracy >= 0.4
                      ? "var(--warning-text)"
                      : "var(--danger-text)",
                }}
              >
                {Math.round(data.overall_accuracy * 100)}%
              </div>
              <span className="metric-meta">Across {data.total_attempts} questions</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Topics Explored</span>
              <div className="metric-value">{data.topic_mastery.length}</div>
              <span className="metric-meta">Active curriculum chapters</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Remediation Drills</span>
              <div className="metric-value">{data.remediation_history.length}</div>
              <span className="metric-meta">Generated study packs</span>
            </div>
          </div>

          {/* Highlights: Strong vs Focus */}
          <div className="student-dashboard-split" style={{ marginBottom: 20 }}>
            <div className="dashboard-section-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <CheckCircleIcon style={{ color: "var(--success-text)" }} />
                <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 600 }}>
                  Strongest Topics ({data.strong_topics.length})
                </h4>
              </div>
              {data.strong_topics.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                  Practice more questions to establish proficiency ratings.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.strong_topics.map((t: string) => (
                    <span key={t} className="badge badge-success" style={{ fontSize: "0.74rem" }}>
                      ✓ {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-section-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <WarningIcon style={{ color: "var(--warning-text)" }} />
                <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 600 }}>
                  Priority Revision Topics ({data.weak_topics.length})
                </h4>
              </div>
              {data.weak_topics.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                  No high-priority weak topics detected right now!
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.weak_topics.map((t: string) => (
                    <span
                      key={t}
                      className="badge badge-danger"
                      style={{ fontSize: "0.74rem", cursor: onPracticeTopic ? "pointer" : "default" }}
                      onClick={() => onPracticeTopic && onPracticeTopic(t)}
                    >
                      ! {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Topic Breakdown Table */}
          <div className="analytics-table-card">
            <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3 className="card-title">Chapter Mastery &amp; Accuracy Breakdown</h3>
                <p className="card-subtitle">
                  Inspect your scores per topic and launch targeted practice sessions.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* Search Bar */}
                <div className="input-with-icon" style={{ minWidth: 200 }}>
                  <SearchIcon />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search chapters…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: 30, fontSize: "0.78rem" }}
                  />
                </div>

                {/* Filter Pills */}
                <div className="segmented" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className={tierFilter === "all" ? "active" : ""}
                    onClick={() => setTierFilter("all")}
                    style={{ padding: "4px 8px", fontSize: "0.74rem" }}
                  >
                    All ({data.topic_mastery.length})
                  </button>
                  <button
                    type="button"
                    className={tierFilter === "critical" ? "active" : ""}
                    onClick={() => setTierFilter("critical")}
                    style={{ padding: "4px 8px", fontSize: "0.74rem" }}
                  >
                    Critical
                  </button>
                  <button
                    type="button"
                    className={tierFilter === "review" ? "active" : ""}
                    onClick={() => setTierFilter("review")}
                    style={{ padding: "4px 8px", fontSize: "0.74rem" }}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    className={tierFilter === "proficient" ? "active" : ""}
                    onClick={() => setTierFilter("proficient")}
                    style={{ padding: "4px 8px", fontSize: "0.74rem" }}
                  >
                    Proficient
                  </button>
                </div>
              </div>
            </div>

            {filteredTopics.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", padding: 20 }}>
                {data.topic_mastery.length === 0
                  ? "No quiz attempts recorded yet. Take an adaptive quiz to start logging progress!"
                  : "No topics match the selected search or filter criteria."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Topic / Chapter</th>
                      <th>Attempts</th>
                      <th>Accuracy</th>
                      <th>Mastery</th>
                      <th>Status Tier</th>
                      <th>Last Attempt</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTopics.map((t) => {
                      const isCritical = t.status === "critical_gap";
                      const isReview = t.status === "needs_review";
                      const accuracy = t.attempts > 0 ? t.correct / t.attempts : t.score;
                      return (
                        <tr key={t.topic}>
                          <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {t.topic}
                          </td>
                          <td style={{ color: "var(--text-secondary)" }}>
                            {t.attempts} ({t.correct} correct)
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: "0.82rem",
                                color:
                                  accuracy < 0.4
                                    ? "var(--danger-text)"
                                    : accuracy < 0.7
                                    ? "var(--warning-text)"
                                    : "var(--success-text)",
                              }}
                            >
                              {Math.round(accuracy * 100)}%
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{
                                  width: 50,
                                  height: 4,
                                  background: "rgba(255,255,255,0.08)",
                                  borderRadius: "var(--radius-pill)",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.round(t.score * 100)}%`,
                                    height: "100%",
                                    background: isCritical
                                      ? "var(--danger-text)"
                                      : isReview
                                      ? "var(--warning-text)"
                                      : "var(--success-text)",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                                {Math.round(t.score * 100)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`nlm-tier-chip ${
                                isCritical
                                  ? "critical_gap"
                                  : isReview
                                  ? "needs_review"
                                  : "proficient"
                              }`}
                            >
                              {isCritical
                                ? "Critical Gap"
                                : isReview
                                ? "Needs Review"
                                : "Proficient"}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                            {t.updated_at
                              ? new Date(t.updated_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => onPracticeTopic && onPracticeTopic(t.topic)}
                            >
                              <span>Practice</span>
                              <ArrowRightIcon />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Remediation History Section */}
          {data.remediation_history.length > 0 && (
            <div className="dashboard-section-card" style={{ marginTop: 20 }}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">Completed Remediation Study Packs</h3>
                  <p className="card-subtitle">
                    Drill sessions generated automatically to resolve diagnosed knowledge gaps.
                  </p>
                </div>
                <span className="badge">{data.remediation_history.length} packs</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
                {data.remediation_history.map((pack) => (
                  <div key={pack.pack_id} className="revision-topic-card">
                    <div className="revision-topic-main">
                      <div className="revision-topic-header">
                        <strong className="revision-topic-name">{pack.topic}</strong>
                        <span className="badge badge-accent">Auto-Remediation Pack</span>
                      </div>
                      <div className="revision-topic-meta">
                        <span>Score: {Math.round(pack.score * 100)}%</span>
                        <span>·</span>
                        <span>{pack.completed ? "Completed" : "In Progress"}</span>
                        <span>·</span>
                        <span>{new Date(pack.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onPracticeTopic && onPracticeTopic(pack.topic)}
                    >
                      <span>Review Drill</span>
                      <ArrowRightIcon />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
