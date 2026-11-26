import { useEffect, useState } from "react";
import { subscribeRealtime } from "../../../realtime";
import {
  getTeacherGaps,
  getTeacherImprovement,
  getTeacherStudentDetail,
  getTeacherStudents,
} from "../../../api";
import { messageOf } from "../../../format";
import type {
  AuthUser,
  TeacherGapsAnalytics,
  TeacherImprovementTracking,
  TeacherStudentDetail,
  TeacherStudentItem,
} from "../../../types";
import {
  AwardIcon,
  BarChartIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  RefreshCwIcon,
  SearchIcon,
  TrendingUpIcon,
  UsersIcon,
  WarningIcon,
  XIcon,
} from "../../../components/icons";

interface PerformanceInsightsProps {
  user: AuthUser;
}

export function PerformanceInsights({ user }: PerformanceInsightsProps) {
  const [activeTab, setActiveTab] = useState<"directory" | "gaps" | "improvement">("directory");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [students, setStudents] = useState<TeacherStudentItem[]>([]);
  const [gapsData, setGapsData] = useState<TeacherGapsAnalytics | null>(null);
  const [improvementData, setImprovementData] = useState<TeacherImprovementTracking | null>(null);

  // Selected student profile modal
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<TeacherStudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Search filter
  const [search, setSearch] = useState("");

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      getTeacherStudents(),
      getTeacherGaps(),
      getTeacherImprovement(),
    ])
      .then(([studentsRes, gapsRes, impRes]) => {
        setStudents(studentsRes.directory || []);
        setGapsData(gapsRes);
        setImprovementData(impRes);
        setError(null);
      })
      .catch((err) => {
        if (!silent) setError(messageOf(err));
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    fetchData(false);
    return subscribeRealtime(
      ["student_activity", "quiz_updated"],
      () => fetchData(true),
    );
  }, []);

  const handleOpenStudentDetail = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setDetailLoading(true);
    try {
      const detail = await getTeacherStudentDetail(studentId);
      setStudentDetail(detail);
    } catch (err) {
      alert(messageOf(err));
      setSelectedStudentId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.student_identifier?.toLowerCase().includes(q) || Boolean(s.email?.toLowerCase().includes(q));
  });

  return (
    <div className="performance-insights-container">
      {/* Header */}
      <div className="insights-header-bar">
        <div>
          <h2>Academic Performance &amp; Learning Analytics</h2>
          <p className="header-subtitle">
            Classroom mastery diagnostics, knowledge-gap heatmap, and individual student progress profiles.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="insights-tabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "directory"}
          className={`tab-btn ${activeTab === "directory" ? "active" : ""}`}
          onClick={() => setActiveTab("directory")}
        >
          <UsersIcon width={16} height={16} />
          Student Learning Profiles ({students.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "gaps"}
          className={`tab-btn ${activeTab === "gaps" ? "active" : ""}`}
          onClick={() => setActiveTab("gaps")}
        >
          <WarningIcon width={16} height={16} />
          Knowledge Gap Heatmap
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "improvement"}
          className={`tab-btn ${activeTab === "improvement" ? "active" : ""}`}
          onClick={() => setActiveTab("improvement")}
        >
          <TrendingUpIcon width={16} height={16} />
          Improvement Tracking
        </button>
      </div>

      {error && (
        <div className="form-error-alert" style={{ marginBottom: 20 }}>
          <WarningIcon width={16} height={16} />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: STUDENT DIRECTORY & PROFILES */}
      {activeTab === "directory" && (
        <div className="insights-tab-content">
          <div className="table-controls-bar">
            <div className="search-wrap">
              <SearchIcon width={16} height={16} />
              <input
                type="text"
                placeholder="Search students by name, roll number or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-search-input"
              />
            </div>
            <span className="count-label">Showing {filteredStudents.length} students</span>
          </div>

          <div className="directory-table-card">
            <table className="insights-data-table">
              <thead>
                <tr>
                  <th>Roll / ID</th>
                  <th>Student Name</th>
                  <th>Class / Section</th>
                  <th>Curriculum Mastery</th>
                  <th>Questions Attempted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      No students found matching "{search}".
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => (
                    <tr key={st.id}>
                      <td>
                        <span className="code-pill">{st.student_identifier || "ID-UNSET"}</span>
                      </td>
                      <td className="student-name-bold">{st.full_name}</td>
                      <td>Class {st.class_level}</td>
                      <td>
                        <div className="mastery-cell">
                          <span className="mastery-num">{Math.round((st.average_mastery || 0.5) * 100)}%</span>
                          <div className="progress-bar-tiny">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.round((st.average_mastery || 0.5) * 100)}%`,
                                backgroundColor: st.average_mastery >= 0.75 ? "var(--color-success)" : st.average_mastery < 0.55 ? "var(--color-danger)" : "var(--color-warning)",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>{st.total_attempts || 0}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => handleOpenStudentDetail(st.id)}
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: KNOWLEDGE GAP HEATMAP */}
      {activeTab === "gaps" && (
        <div className="insights-tab-content">
          <div className="gaps-heatmap-card">
            <div className="card-header-bar">
              <div>
                <h3>Curriculum Topic Gap Diagnostics</h3>
                <p className="tab-desc">
                  Identifies syllabus topics where student cohort mastery falls below proficiency thresholds.
                </p>
              </div>
            </div>

            <div className="heatmap-topics-grid">
              {!gapsData || gapsData.critical_gaps.length === 0 ? (
                <div className="all-good-box">
                  <CheckCircleIcon width={32} height={32} />
                  <h4>No severe topic gaps detected across assigned sections!</h4>
                </div>
              ) : (
                gapsData.critical_gaps.map((gap, i) => (
                  <div key={i} className="topic-heatmap-box">
                    <div className="heatmap-header">
                      <span className="topic-title">{gap.topic}</span>
                      <span className="topic-score-badge" style={{ backgroundColor: gap.score < 0.5 ? "var(--color-danger-bg)" : "var(--color-warning-bg)" }}>
                        {Math.round(gap.score * 100)}% Score
                      </span>
                    </div>
                    <div className="topic-progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.round(gap.score * 100)}%`,
                          backgroundColor: gap.score < 0.5 ? "var(--color-danger)" : "var(--color-warning)",
                        }}
                      />
                    </div>
                    <div className="heatmap-meta">
                      <span>{gap.student_name}</span>
                      <span>{gap.subject_label}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IMPROVEMENT TRACKING */}
      {activeTab === "improvement" && (
        <div className="insights-tab-content">
          <div className="improvement-card">
            <h3>Chronological Cohort Improvement</h3>
            <p className="tab-desc">
              Tracks the observed accuracy and response latency progression across consecutive assessment attempts.
            </p>

            <table className="insights-data-table">
              <thead>
                <tr>
                  <th>Session Cohort / Date</th>
                  <th>Attempts Evaluated</th>
                  <th>Observed Accuracy</th>
                  <th>Avg Response Time</th>
                </tr>
              </thead>
              <tbody>
                {!improvementData || improvementData.progression.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 24 }}>
                      No longitudinal attempt data accumulated yet.
                    </td>
                  </tr>
                ) : (
                  improvementData.progression.map((prog, idx) => (
                    <tr key={idx}>
                      <td>Cohort {prog.date}</td>
                      <td>{prog.attempts}</td>
                      <td>
                        <span className="score-pill">{Math.round(prog.accuracy * 100)}%</span>
                      </td>
                      <td>{(prog.avg_response_ms / 1000).toFixed(1)}s</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STUDENT PROFILE MODAL */}
      {selectedStudentId && (
        <div className="modal-backdrop" onClick={() => setSelectedStudentId(null)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Student Learning Profile</h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedStudentId(null)}
                aria-label="Close"
              >
                <XIcon width={18} height={18} />
              </button>
            </div>

            <div className="modal-body">
              {detailLoading || !studentDetail ? (
                <div className="portal-loading-state">
                  <div className="spinner" />
                  <p>Loading student profile and diagnostic history...</p>
                </div>
              ) : (
                <div className="student-profile-modal-content">
                  <div className="profile-hero-card">
                    <div className="hero-avatar">
                      {studentDetail.student?.full_name?.charAt(0).toUpperCase() ?? "S"}
                    </div>
                    <div className="hero-info">
                      <h4>{studentDetail.student?.full_name ?? "Unknown"}</h4>
                      <p>
                        Roll: <strong>{studentDetail.student?.student_identifier || "ID-UNSET"}</strong> · Class {studentDetail.student?.class_level ?? "?"} · {studentDetail.student?.email ?? ""}
                      </p>
                    </div>
                    <div className="hero-kpis">
                      <div className="modal-kpi">
                        <span className="kpi-num">{Math.round((studentDetail.overall_mastery ?? 0) * 100)}%</span>
                        <span className="kpi-text">Overall Mastery</span>
                      </div>
                      <div className="modal-kpi">
                        <span className="kpi-num">{Math.round((studentDetail.overall_accuracy ?? 0) * 100)}%</span>
                        <span className="kpi-text">Quiz Accuracy</span>
                      </div>
                    </div>
                  </div>

                  {/* Topic breakdown */}
                  <h4 style={{ marginTop: 20 }}>Curriculum Topic Mastery</h4>
                  <div className="modal-topic-table-wrap">
                    <table className="insights-data-table">
                      <thead>
                        <tr>
                          <th>Topic</th>
                          <th>Subject</th>
                          <th>Mastery Score</th>
                          <th>Attempts</th>
                          <th>Classification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(studentDetail.topic_analysis ?? []).map((t, idx) => (
                          <tr key={idx}>
                            <td>{t.topic}</td>
                            <td>{t.subject_label}</td>
                            <td>{Math.round(t.score * 100)}%</td>
                            <td>{t.attempts} ({t.correct} correct)</td>
                            <td>
                              <span className={`badge badge-${t.gap_classification === "proficient" ? "success" : t.gap_classification === "needs_review" ? "warning" : "danger"}`}>
                                {t.gap_classification.replace(/_/g, " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
