import { useCallback, useEffect, useState } from "react";
import { getStudentOverview } from "../api";
import { messageOf } from "../format";
import type { AuthUser, StudentOverview } from "../types";
import {
  ArrowRightIcon,
  AwardIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  HelpCircleIcon,
  MicIcon,
  RefreshCwIcon,
  SparkIcon,
  TrendingUpIcon,
  WarningIcon,
} from "./icons";

interface StudentOverviewViewProps {
  user: AuthUser;
  onNavigate: (view: "capture" | "ask" | "quiz" | "pdf" | "progress") => void;
  onSelectTopicForQuiz?: (topic: string) => void;
}

export function StudentOverviewView({
  user,
  onNavigate,
  onSelectTopicForQuiz,
}: StudentOverviewViewProps) {
  const [data, setData] = useState<StudentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentOverview();
      setData(res);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const firstName = user.full_name.split(" ")[0] || user.full_name;

  return (
    <div className="student-overview-container">
      {/* Welcome Banner */}
      <div className="student-welcome-banner">
        <div className="welcome-banner-content">
          <div className="welcome-badge">
            <span className="badge-dot" />
            <span>Class {user.class_level ?? 10} · Academic Session</span>
          </div>
          <h2 className="welcome-heading">Welcome back, {firstName}! 👋</h2>
          <p className="welcome-subtext">
            {data?.recommended_next
              ? `Recommended next: ${data.recommended_next}. Continue where you left off.`
              : "Continue where you left off. Review your recent lecture summaries, strengthen diagnosed knowledge gaps, or test yourself with adaptive NCERT drills."}
          </p>

          <div className="welcome-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigate("capture")}
            >
              <MicIcon />
              <span>Record or Transcribe Lecture</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigate("quiz")}
            >
              <SparkIcon />
              <span>Take Adaptive Quiz</span>
            </button>
          </div>
        </div>

        <div className="welcome-banner-stats">
          <div className="welcome-stat-pill">
            <AwardIcon />
            <div>
              <span className="stat-pill-num">
                {data ? `${Math.round(data.overall_mastery * 100)}%` : "—"}
              </span>
              <span className="stat-pill-label">Overall Mastery</span>
            </div>
          </div>
          <div className="welcome-stat-pill">
            <CheckCircleIcon />
            <div>
              <span className="stat-pill-num">
                {data ? `${Math.round(data.overall_accuracy * 100)}%` : "—"}
              </span>
              <span className="stat-pill-label">Quiz Accuracy</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="inline-warning error" style={{ margin: "16px 0" }}>
          <WarningIcon />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="study-loading" style={{ padding: "40px 0", textAlign: "center" }}>
          <span className="spinner" />
          <p style={{ marginTop: "12px", color: "var(--text-muted)" }}>
            Loading your offline learning records…
          </p>
        </div>
      ) : data ? (
        <>
          {/* Quick Nav Cards */}
          <div className="student-quick-grid">
            <div
              className="quick-card"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate("capture")}
              onKeyDown={(e) => e.key === "Enter" && onNavigate("capture")}
            >
              <div className="quick-card-icon mic">
                <MicIcon />
              </div>
              <div className="quick-card-info">
                <h3>Lecture Studio</h3>
                <p>Live microphone speech-to-text, file upload &amp; LLM note synthesis.</p>
              </div>
              <ChevronRightIcon className="quick-card-arrow" />
            </div>

            <div
              className="quick-card"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate("quiz")}
              onKeyDown={(e) => e.key === "Enter" && onNavigate("quiz")}
            >
              <div className="quick-card-icon spark">
                <SparkIcon />
              </div>
              <div className="quick-card-info">
                <h3>Adaptive Practice</h3>
                <p>AI-generated NCERT quizzes with diagnostic remediation flashcards.</p>
              </div>
              <ChevronRightIcon className="quick-card-arrow" />
            </div>

            <div
              className="quick-card"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate("ask")}
              onKeyDown={(e) => e.key === "Enter" && onNavigate("ask")}
            >
              <div className="quick-card-icon ask">
                <HelpCircleIcon />
              </div>
              <div className="quick-card-info">
                <h3>Ask NCERT</h3>
                <p>Conversational Q&amp;A grounded with exact textbook chapter citations.</p>
              </div>
              <ChevronRightIcon className="quick-card-arrow" />
            </div>

            <div
              className="quick-card"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate("pdf")}
              onKeyDown={(e) => e.key === "Enter" && onNavigate("pdf")}
            >
              <div className="quick-card-icon book">
                <BookIcon />
              </div>
              <div className="quick-card-info">
                <h3>Knowledge Studio</h3>
                <p>Official NCERT syllabus units and interactive textbook reader.</p>
              </div>
              <ChevronRightIcon className="quick-card-arrow" />
            </div>
          </div>

          {/* Metric Cards Row */}
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Lectures Transcribed</span>
              <div className="metric-value">{data.total_lectures}</div>
              <span className="metric-meta">Saved in offline SQLite storage</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Questions Practiced</span>
              <div className="metric-value">{data.quiz_attempts}</div>
              <span className="metric-meta">Across all syllabus topics</span>
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
              <span className="metric-meta">First-attempt success rate</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Curriculum Mastery</span>
              <div className="metric-value" style={{ color: "var(--accent-text)" }}>
                {Math.round(data.overall_mastery * 100)}%
              </div>
              <span className="metric-meta">Exponential moving average</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Topics Needing Review</span>
              <div
                className="metric-value"
                style={{
                  color:
                    data.topics_requiring_revision.length > 0
                      ? "var(--warning-text)"
                      : "var(--success-text)",
                }}
              >
                {data.topics_requiring_revision.length}
              </div>
              <span className="metric-meta">Identified for targeted practice</span>
            </div>
          </div>

          {/* Two-Column Section: Revision Focus & Recent Activity */}
          <div className="student-dashboard-split">
            {/* Left: Recommended Practice / Knowledge Gaps */}
            <div className="dashboard-section-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Targeted Revision &amp; Diagnostic Focus</h3>
                  <p className="card-subtitle">
                    Topics flagged by our offline decision-tree classifier needing extra review.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigate("progress")}
                >
                  <TrendingUpIcon />
                  <span>Full Progress</span>
                </button>
              </div>

              {data.topics_requiring_revision.length === 0 ? (
                <div className="empty-state-box">
                  <CheckCircleIcon style={{ width: 36, height: 36, color: "var(--success-text)" }} />
                  <h4>Great job! No critical gaps detected.</h4>
                  <p>
                    All your practiced topics currently meet the proficiency threshold. You can explore new chapters or challenge yourself with advanced drills!
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onNavigate("quiz")}
                  >
                    Take a Random Practice Quiz
                  </button>
                </div>
              ) : (
                <div className="revision-topic-list">
                  {data.topics_requiring_revision.map((item) => {
                    const acc = item.attempts > 0 ? item.correct / item.attempts : item.score;
                    const isCritical = acc < 0.4;
                    return (
                      <div key={item.topic} className="revision-topic-card">
                        <div className="revision-topic-main">
                          <div className="revision-topic-header">
                            <strong className="revision-topic-name">{item.topic}</strong>
                            <span
                              className={`nlm-tier-chip ${
                                isCritical ? "critical_gap" : "needs_review"
                              }`}
                            >
                              {isCritical ? "Critical Gap" : "Needs Review"}
                            </span>
                          </div>
                          <div className="revision-topic-meta">
                            <span>
                              Mastery:{" "}
                              <strong style={{ color: "var(--accent-text)" }}>
                                {Math.round(item.score * 100)}%
                              </strong>
                            </span>
                            <span>·</span>
                            <span>
                              Accuracy:{" "}
                              <strong
                                style={{
                                  color:
                                    acc < 0.4
                                      ? "var(--danger-text)"
                                      : "var(--warning-text)",
                                }}
                              >
                                {Math.round(acc * 100)}%
                              </strong>
                            </span>
                            <span>·</span>
                            <span>{item.attempts} attempts</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            if (onSelectTopicForQuiz) {
                              onSelectTopicForQuiz(item.topic);
                            }
                            onNavigate("quiz");
                          }}
                        >
                          <span>Practice</span>
                          <ArrowRightIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Recent Attempts & Activity */}
            <div className="dashboard-section-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Recent Quiz Activity</h3>
                  <p className="card-subtitle">Latest question answers and response latencies.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void loadOverview()}
                  aria-label="Refresh overview"
                >
                  <RefreshCwIcon />
                </button>
              </div>

              {data.recent_activity.length === 0 ? (
                <div className="empty-state-box">
                  <SparkIcon style={{ width: 32, height: 32, color: "var(--text-muted)" }} />
                  <h4>No questions answered yet.</h4>
                  <p>
                    Take an adaptive quiz to practice questions grounded in your syllabus.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onNavigate("quiz")}
                  >
                    Start Adaptive Practice
                  </button>
                </div>
              ) : (
                <div className="recent-sessions-list">
                  {data.recent_activity.map((act, idx) => (
                    <div key={`${act.topic}-${idx}`} className="recent-session-card">
                      <div className="recent-session-info">
                        <strong className="recent-session-title">{act.topic}</strong>
                        <div className="recent-session-badges">
                          <span
                            className={`badge ${act.correct ? "badge-success" : "badge-danger"}`}
                          >
                            {act.correct ? "Correct" : "Incorrect"}
                          </span>
                          <span className="badge">
                            {(act.response_ms / 1000).toFixed(1)}s
                          </span>
                          <span className="session-date">
                            {new Date(act.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
