import { useCallback, useEffect, useMemo, useState } from "react";
import { getStudentProgress, getStudentSubjectsTree } from "../api";
import { messageOf } from "../format";
import type { StudentProgress, SubjectTree } from "../types";
import {
  ArrowRightIcon,
  BarChartIcon,
  BookIcon,
  CheckCircleIcon,
  ClockIcon,
  SearchIcon,
  WarningIcon,
  AwardIcon,
  PlayIcon,
} from "./icons";

interface StudentProgressViewProps {
  onPracticeTopic?: (topic: string) => void;
}

type ProgressTab = "subjects" | "chapters";

export function StudentProgressView({ onPracticeTopic }: StudentProgressViewProps) {
  const [data, setData] = useState<StudentProgress | null>(null);
  const [subjects, setSubjects] = useState<SubjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProgressTab>("subjects");
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubjectsError(null);
    const [progressResult, subjectsResult] = await Promise.allSettled([
      getStudentProgress(),
      getStudentSubjectsTree(),
    ]);
    if (progressResult.status === "fulfilled") {
      setData(progressResult.value);
    } else {
      setData(null);
      setError(messageOf(progressResult.reason));
    }
    if (subjectsResult.status === "fulfilled") {
      setSubjects(subjectsResult.value);
    } else {
      setSubjects([]);
      setSubjectsError(messageOf(subjectsResult.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const filteredTopics = useMemo(() => {
    if (!data?.topic_mastery) return [];
    return data.topic_mastery.filter((topic) => {
      const matchesSearch = `${topic.topic} ${topic.subject_label}`.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (tierFilter === "critical") return topic.status === "critical_gap";
      if (tierFilter === "review") return topic.status === "needs_review";
      if (tierFilter === "proficient") return topic.status === "proficient";
      return true;
    });
  }, [data, searchQuery, tierFilter]);

  const overallMastery = data?.topic_mastery.length
    ? data.topic_mastery.reduce((sum, topic) => sum + topic.score, 0) / data.topic_mastery.length
    : 0;
  const totalLessons = subjects.reduce((total, subject) => total + subject.total_lessons, 0);
  const completedLessons = subjects.reduce((total, subject) => total + subject.completed_lessons, 0);
  const weakTopics = (data?.weak_topics || []).map((item) =>
    typeof item === "string" ? item : item.topic,
  ).filter(Boolean);

  return (
    <div className="student-progress-container">
      <header className="student-page-heading progress-page-heading">
        <div>
          <h1><BarChartIcon width={26} height={26}/>My Progress</h1>
          <p>Track your learning, subject-wise progress, and revision needs.</p>
        </div>
      </header>

      {error && <div className="student-progress-error" role="alert"><WarningIcon width={18} height={18}/>{error}</div>}
      {loading && !data ? (
        <div className="portal-loading-state" role="status"><div className="spinner"/><p>Loading your progress...</p></div>
      ) : data ? (
        <>
          <section className="student-progress-metrics" aria-label="Learning progress summary">
            <article className="student-progress-metric">
              <BookIcon width={30} height={30}/>
              <div><span>Learning Progress</span><strong>{Math.round(overallMastery * 100)}%</strong><div className="student-progress-track"><i style={{width:`${Math.round(overallMastery * 100)}%`}}/></div></div>
            </article>
            <article className="student-progress-metric">
              <AwardIcon width={30} height={30}/>
              <div><span>Quiz Accuracy</span><strong>{Math.round(data.overall_accuracy * 100)}%</strong><div className="student-progress-track"><i style={{width:`${Math.round(data.overall_accuracy * 100)}%`}}/></div></div>
            </article>
            <article className="student-progress-metric">
              <PlayIcon width={30} height={30}/>
              <div><span>Lectures Completed</span><strong>{completedLessons} / {totalLessons}</strong><div className="student-progress-track"><i style={{width:`${totalLessons ? Math.round(completedLessons / totalLessons * 100) : 0}%`}}/></div></div>
            </article>
          </section>

          <div className="student-progress-layout">
            <section className="student-progress-panel student-progress-main">
              <div className="student-progress-tabs" role="tablist" aria-label="Progress detail">
                <button type="button" role="tab" aria-selected={activeTab === "subjects"} className={activeTab === "subjects" ? "active" : ""} onClick={() => setActiveTab("subjects")}>
                  <BookIcon width={16} height={16}/> Subject Progress
                </button>
                <button type="button" role="tab" aria-selected={activeTab === "chapters"} className={activeTab === "chapters" ? "active" : ""} onClick={() => setActiveTab("chapters")}>
                  <BarChartIcon width={16} height={16}/> Chapter Progress
                </button>
              </div>

<<<<<<< HEAD
              {activeTab === "subjects" ? (
                <div className="student-subject-progress-list">
                  {subjectsError && <p className="student-progress-error" role="alert">{subjectsError}</p>}
                  {subjects.length === 0 && !subjectsError && <p className="student-progress-empty">No subject progress is available yet.</p>}
                  {subjects.map((subject) => (
                    <div className="student-subject-progress-row" key={subject.subject_code}>
                      <span className="student-progress-subject-icon"><BookIcon width={20} height={20}/></span>
                      <strong>{subject.subject_name}</strong>
                      <div className="student-progress-track"><i style={{width:`${subject.progress_pct}%`}}/></div>
                      <b>{subject.progress_pct}%</b>
                      <ArrowRightIcon width={17} height={17}/>
=======
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* Search Bar */}
                <div className="input-with-icon" style={{ minWidth: 210 }}>
                  <SearchIcon />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search chapters…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Filter Pills */}
                <div className="segmented" style={{ margin: 0 }}>
                  <button
                    type="button"
                    className={tierFilter === "all" ? "active" : ""}
                    onClick={() => setTierFilter("all")}
                  >
                    All ({data.topic_mastery.length})
                  </button>
                  <button
                    type="button"
                    className={tierFilter === "critical" ? "active" : ""}
                    onClick={() => setTierFilter("critical")}
                  >
                    Critical
                  </button>
                  <button
                    type="button"
                    className={tierFilter === "review" ? "active" : ""}
                    onClick={() => setTierFilter("review")}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    className={tierFilter === "proficient" ? "active" : ""}
                    onClick={() => setTierFilter("proficient")}
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
>>>>>>> origin/main
                    </div>
                  ))}
                </div>
              ) : (
                <div className="student-chapter-progress">
                  <div className="student-chapter-tools">
                    <label className="student-progress-search"><SearchIcon width={16} height={16}/><input aria-label="Search chapters" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search chapters or topics..."/></label>
                    <select aria-label="Filter chapter progress" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}>
                      <option value="all">All topics</option><option value="critical">Critical</option><option value="review">Needs review</option><option value="proficient">Proficient</option>
                    </select>
                  </div>
                  {filteredTopics.length === 0 ? <p className="student-progress-empty">{data.topic_mastery.length ? "No topics match your filters." : "Take a quiz to start tracking chapter progress."}</p> : (
                    <div className="student-chapter-table-wrap">
                      <table className="student-chapter-table">
                        <thead><tr><th>Topic / Chapter</th><th>Subject</th><th>Attempts</th><th>Accuracy</th><th>Mastery</th><th>Action</th></tr></thead>
                        <tbody>{filteredTopics.map((topic) => {
                          const accuracy = topic.attempts > 0 ? topic.correct / topic.attempts : topic.score;
                          return <tr key={`${topic.subject}-${topic.topic}`}>
                            <td><strong>{topic.topic}</strong><span>{topic.status === "critical_gap" ? "Critical gap" : topic.status === "needs_review" ? "Needs review" : "Proficient"}</span></td>
                            <td>{topic.subject_label}</td><td>{topic.attempts}</td><td>{Math.round(accuracy * 100)}%</td><td>{Math.round(topic.score * 100)}%</td>
                            <td><button type="button" className="btn btn-outline btn-sm" onClick={() => onPracticeTopic?.(topic.topic)}>Practice</button></td>
                          </tr>;
                        })}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            <aside className="student-progress-sidebar">
              <section className="student-progress-panel">
                <h2><ClockIcon width={21} height={21}/>Next Revision</h2>
                <p className="student-progress-panel-copy">Chapters to review based on your practice.</p>
                {weakTopics.length > 0 ? <ul className="student-revision-list">{weakTopics.slice(0, 4).map((topic) => (
                  <li key={topic}><span>{topic}</span><button type="button" aria-label={`Practice ${topic}`} onClick={() => onPracticeTopic?.(topic)}><ArrowRightIcon width={15} height={15}/></button></li>
                ))}</ul> : <p className="student-progress-empty">Practice more topics to see your revision recommendations.</p>}
              </section>

              <section className="student-progress-panel">
                <h2><ClockIcon width={21} height={21}/>Recent Activity</h2>
                {data.recent_trend.length > 0 ? <ul className="student-activity-list">{data.recent_trend.slice(0, 3).map((item) => (
                  <li key={item.attempt_id}><span className={item.correct ? "activity-mark good" : "activity-mark"}>{item.correct ? "✓" : "•"}</span><span>{item.correct ? "Correct answer" : "Quiz attempt"}: {item.topic}</span><time>{new Date(item.created_at).toLocaleDateString()}</time></li>
                ))}</ul> : <p className="student-progress-empty">Your quiz activity will show here.</p>}
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
