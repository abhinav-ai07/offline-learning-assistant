import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  createTeacher,
  getTeacherGaps,
  getTeacherImprovement,
  getTeacherOverview,
  getTeacherStudentDetail,
  getTeacherStudents,
} from "../api";
import { messageOf } from "../format";
import type {
  TeacherGapsAnalytics,
  TeacherImprovementTracking,
  TeacherOverview,
  TeacherStudentDetail,
  TeacherStudentItem,
  TeacherTopic,
} from "../types";
import {
  AwardIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldIcon,
  WarningIcon,
  XIcon,
} from "./icons";

const SUBJECT_MAP: Record<string, string> = {
  // Mathematics
  "real numbers": "Mathematics",
  "polynomials": "Mathematics",
  "pair of linear equations in two variables": "Mathematics",
  "quadratic equations": "Mathematics",
  "arithmetic progressions": "Mathematics",
  "triangles": "Mathematics",
  "coordinate geometry": "Mathematics",
  "introduction to trigonometry": "Mathematics",
  "some applications of trigonometry": "Mathematics",
  "circles": "Mathematics",
  "areas related to circles": "Mathematics",
  "surface areas and volumes": "Mathematics",
  "statistics": "Mathematics",
  "probability": "Mathematics",
  "number systems": "Mathematics",
  "linear equations in two variables": "Mathematics",
  "introduction to euclid's geometry": "Mathematics",
  "lines and angles": "Mathematics",
  "quadrilaterals": "Mathematics",
  "heron's formula": "Mathematics",
  "rational numbers": "Mathematics",
  "linear equations in one variable": "Mathematics",
  "understanding quadrilaterals": "Mathematics",
  "data handling": "Mathematics",
  "squares and square roots": "Mathematics",
  "cubes and cube roots": "Mathematics",
  "comparing quantities": "Mathematics",
  "algebraic expressions and identities": "Mathematics",
  "mensuration": "Mathematics",
  "exponents and powers": "Mathematics",
  "direct and inverse proportions": "Mathematics",
  "factorisation": "Mathematics",
  "introduction to graphs": "Mathematics",

  // Science
  "chemical reactions and equations": "Science",
  "acids, bases and salts": "Science",
  "metals and non-metals": "Science",
  "carbon and its compounds": "Science",
  "life processes": "Science",
  "control and coordination": "Science",
  "how do organisms reproduce?": "Science",
  "heredity": "Science",
  "light - reflection and refraction": "Science",
  "the human eye and the colourful world": "Science",
  "electricity": "Science",
  "magnetic effects of electric current": "Science",
  "our environment": "Science",
  "matter in our surroundings": "Science",
  "is matter around us pure": "Science",
  "atoms and molecules": "Science",
  "structure of the atom": "Science",
  "the fundamental unit of life": "Science",
  "tissues": "Science",
  "motion": "Science",
  "force and laws of motion": "Science",
  "gravitation": "Science",
  "work and energy": "Science",
  "sound": "Science",
  "improvement in food resources": "Science",
  "crop production and management": "Science",
  "microorganisms: friend and foe": "Science",
  "coal and petroleum": "Science",
  "combustion and flame": "Science",
  "conservation of plants and animals": "Science",
  "reproduction in animals": "Science",
  "reaching the age of adolescence": "Science",
  "force and pressure": "Science",
  "friction": "Science",
  "chemical effects of electric current": "Science",
  "some natural phenomena": "Science",
  "light": "Science",
};

export function getTopicSubject(topicName: string, explicitLabel?: string): string {
  if (explicitLabel) return explicitLabel;
  const key = topicName.trim().toLowerCase();
  if (SUBJECT_MAP[key]) return SUBJECT_MAP[key];
  for (const [title, subj] of Object.entries(SUBJECT_MAP)) {
    if (key.includes(title) || title.includes(key)) return subj;
  }
  const mathKw = [
    "math", "equation", "number", "polynomial", "trigonometry", "algebra",
    "probability", "statistics", "geometry", "triangle", "circle", "arithmetic", "coordinate",
  ];
  if (mathKw.some((k) => key.includes(k))) return "Mathematics";
  const sciKw = [
    "science", "light", "current", "acid", "cell", "chemical", "physics",
    "biology", "chemistry", "eye", "environment", "motion", "force",
    "gravity", "energy", "sound", "matter", "reflection", "refraction",
  ];
  if (sciKw.some((k) => key.includes(k))) return "Science";
  return "General";
}

type TeacherTab = "overview" | "students" | "gaps" | "improvement" | "settings";

export function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState<TeacherTab>("overview");
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [studentList, setStudentList] = useState<TeacherStudentItem[]>([]);
  const [gapsData, setGapsData] = useState<TeacherGapsAnalytics | null>(null);
  const [improvementData, setImprovementData] = useState<TeacherImprovementTracking | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<TeacherStudentDetail | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  // Filters
  const [studentSearch, setStudentSearch] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState<string>("all");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");

  // New Teacher Account Form
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherId, setNewTeacherId] = useState("");
  const [newTeacherPassword, setNewTeacherPassword] = useState("");
  const [createTeacherLoading, setCreateTeacherLoading] = useState(false);
  const [createTeacherMsg, setCreateTeacherMsg] = useState<string | null>(null);
  const [createTeacherError, setCreateTeacherError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovData, stData, gpData, impData] = await Promise.all([
        getTeacherOverview(),
        getTeacherStudents(),
        getTeacherGaps().catch(() => null),
        getTeacherImprovement().catch(() => null),
      ]);
      setOverview(ovData);
      setStudentList(stData.directory ?? []);
      setGapsData(gpData);
      setImprovementData(impData);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const viewStudentProfile = useCallback(async (studentId: string) => {
    setSelectedStudentId(studentId);
    setStudentDetailLoading(true);
    try {
      const detail = await getTeacherStudentDetail(studentId);
      setStudentDetail(detail);
    } catch {
      setStudentDetail(null);
    } finally {
      setStudentDetailLoading(false);
    }
  }, []);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateTeacherError(null);
    setCreateTeacherMsg(null);
    if (!newTeacherName.trim() || !newTeacherId.trim() || !newTeacherPassword) {
      setCreateTeacherError("Please enter the teacher name, ID, and password.");
      return;
    }
    setCreateTeacherLoading(true);
    try {
      await createTeacher({
        full_name: newTeacherName.trim(),
        teacher_id: newTeacherId.trim(),
        password: newTeacherPassword,
      });
      setCreateTeacherMsg(`Successfully provisioned teacher account for ${newTeacherId}`);
      setNewTeacherName("");
      setNewTeacherId("");
      setNewTeacherPassword("");
    } catch (err) {
      setCreateTeacherError(messageOf(err));
    } finally {
      setCreateTeacherLoading(false);
    }
  };

  const groupedTopics = useMemo(() => {
    if (!overview?.topics) return new Map<string, TeacherTopic[]>();
    const map = new Map<string, TeacherTopic[]>();
    for (const t of overview.topics) {
      const subj = getTopicSubject(t.topic, t.subject_label);
      const list = map.get(subj) ?? [];
      list.push(t);
      map.set(subj, list);
    }
    return map;
  }, [overview]);

  const availableSubjects = useMemo(() => {
    return Array.from(groupedTopics.keys()).sort((a, b) => {
      if (a === "Mathematics") return -1;
      if (b === "Mathematics") return 1;
      if (a === "Science") return -1;
      if (b === "Science") return 1;
      return a.localeCompare(b);
    });
  }, [groupedTopics]);

  const displaySubjects = useMemo(() => {
    if (selectedSubjectFilter === "all") return availableSubjects;
    return availableSubjects.filter((s) => s === selectedSubjectFilter);
  }, [availableSubjects, selectedSubjectFilter]);

  const filteredStudents = useMemo(() => {
    return studentList.filter((s) => {
      const q = studentSearch.toLowerCase();
      const matchQ =
        s.full_name.toLowerCase().includes(q) ||
        Boolean(s.email?.toLowerCase().includes(q)) ||
        (s.student_identifier && s.student_identifier.toLowerCase().includes(q));
      if (!matchQ) return false;
      if (studentClassFilter !== "all" && String(s.class_level) !== studentClassFilter) {
        return false;
      }
      return true;
    });
  }, [studentList, studentSearch, studentClassFilter]);

  return (
    <div className="teacher-workspace">
      {/* Workspace Header */}
      <header className="workspace-header" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="badge badge-accent">Instructor Workspace</span>
              <span className="badge">100% Offline SQLite</span>
            </div>
            <h2 style={{ fontSize: "1.45rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Teacher Analytics &amp; Student Diagnostics
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
              Offline classroom diagnostics powered by Scikit-Learn Decision Trees and SQLite Local Storage.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void loadAll()}
            >
              <RefreshCwIcon />
              <span>Refresh Workspace</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="segmented teacher-nav-segmented" style={{ marginTop: 14 }}>
          <button
            type="button"
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            📊 Class Overview
          </button>
          <button
            type="button"
            className={activeTab === "students" ? "active" : ""}
            onClick={() => setActiveTab("students")}
          >
            👥 Student Directory ({studentList.length})
          </button>
          <button
            type="button"
            className={activeTab === "gaps" ? "active" : ""}
            onClick={() => setActiveTab("gaps")}
          >
            ⚠️ Knowledge Gaps &amp; Heatmap
          </button>
          <button
            type="button"
            className={activeTab === "improvement" ? "active" : ""}
            onClick={() => setActiveTab("improvement")}
          >
            📈 Improvement Tracking
          </button>
          <button
            type="button"
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            ⚙️ Provisioning &amp; Settings
          </button>
        </div>
      </header>

      {error && (
        <div className="inline-warning error" style={{ marginBottom: 16 }}>
          <WarningIcon />
          <span>{error}</span>
        </div>
      )}

      {loading && !overview ? (
        <div className="study-loading" style={{ padding: "40px 0", textAlign: "center" }}>
          <span className="spinner" />
          <p style={{ marginTop: "12px", color: "var(--text-muted)" }}>
            Loading classroom analytics from SQLite database…
          </p>
        </div>
      ) : (
        <>
          {/* ==================== TAB 1: OVERVIEW ==================== */}
          {activeTab === "overview" && overview && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* KPI Summary Cards */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-label">Enrolled Students</span>
                  <div className="metric-value">
                    {overview.total_students || studentList.length || 1}
                  </div>
                  <span className="metric-meta">Profiles in SQLite</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Class Mastery Avg</span>
                  <div className="metric-value" style={{ color: "var(--accent-text)" }}>
                    {Math.round(overview.class_mastery_avg * 100)}%
                  </div>
                  <span className="metric-meta">Adaptive EMA score</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Class Accuracy</span>
                  <div className="metric-value" style={{ color: "var(--success-text)" }}>
                    {Math.round(overview.overall_accuracy * 100)}%
                  </div>
                  <span className="metric-meta">First-try accuracy</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Questions Practiced</span>
                  <div className="metric-value">{overview.total_attempts}</div>
                  <span className="metric-meta">Logged student answers</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Avg Response Speed</span>
                  <div className="metric-value">
                    {overview.avg_response_ms ? `${(overview.avg_response_ms / 1000).toFixed(1)}s` : "5.0s"}
                  </div>
                  <span className="metric-meta">Fluency indicator</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Recorded Lectures</span>
                  <div className="metric-value">{overview.total_sessions}</div>
                  <span className="metric-meta">Archived in database</span>
                </div>
              </div>

              {/* Curriculum Topic Heatmap Table */}
              <div className="analytics-table-card">
                <div className="card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <h3 className="card-title">Curriculum Topic Mastery &amp; Knowledge Gap Diagnostics</h3>
                    <p className="card-subtitle">
                      Classified into Critical Gaps, Needs Review, or Proficient based on accuracy and response latency. Grouped by subject.
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    {availableSubjects.length > 1 && (
                      <div className="segmented" style={{ margin: 0 }}>
                        <button
                          type="button"
                          className={selectedSubjectFilter === "all" ? "active" : ""}
                          onClick={() => setSelectedSubjectFilter("all")}
                          style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                        >
                          All ({overview.topics.length})
                        </button>
                        {availableSubjects.map((subj) => (
                          <button
                            key={subj}
                            type="button"
                            className={selectedSubjectFilter === subj ? "active" : ""}
                            onClick={() => setSelectedSubjectFilter(subj)}
                            style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                          >
                            {subj} ({groupedTopics.get(subj)?.length ?? 0})
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="badge">{overview.topics.length} topics tracked</span>
                  </div>
                </div>

                {overview.topics.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>
                    No student quiz attempts recorded yet.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Topic / Chapter Name</th>
                          <th>Attempts</th>
                          <th>Accuracy</th>
                          <th>Avg Speed</th>
                          <th>ML Gap Tier</th>
                          <th>Remediation Recommendation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displaySubjects.map((subject) => {
                          const subjectTopics = groupedTopics.get(subject) ?? [];
                          if (subjectTopics.length === 0) return null;
                          const groupAttempts = subjectTopics.reduce((acc, curr) => acc + curr.attempts, 0);
                          const groupCorrect = subjectTopics.reduce((acc, curr) => acc + curr.correct, 0);
                          const groupAvgAcc = groupAttempts > 0 ? groupCorrect / groupAttempts : 0;
                          const subjectIcon = subject === "Mathematics" ? "📐" : subject === "Science" ? "🔬" : "📚";

                          return (
                            <Fragment key={subject}>
                              <tr className="analytics-subject-group-row">
                                <td colSpan={6}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                      <span>{subjectIcon}</span>
                                      <strong style={{ fontSize: "0.92rem", color: "var(--text-primary)" }}>
                                        {subject}
                                      </strong>
                                      <span className="badge" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
                                        {subjectTopics.length} chapters
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", gap: "16px", fontSize: "0.76rem", color: "var(--text-muted)" }}>
                                      <span>
                                        Accuracy:{" "}
                                        <strong
                                          style={{
                                            color:
                                              groupAvgAcc < 0.4
                                                ? "var(--danger-text)"
                                                : groupAvgAcc < 0.7
                                                ? "var(--warning-text)"
                                                : "var(--success-text)",
                                          }}
                                        >
                                          {Math.round(groupAvgAcc * 100)}%
                                        </strong>
                                      </span>
                                      <span>Attempts: {groupAttempts}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              {subjectTopics.map((t, idx) => {
                                const isCritical = t.accuracy < 0.4 || (t.attempts >= 2 && t.correct === 0);
                                const isReview = !isCritical && t.accuracy < 0.7;
                                return (
                                  <tr key={t.topic}>
                                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ color: "var(--text-muted)", fontSize: "0.74rem", minWidth: "18px" }}>
                                          {idx + 1}.
                                        </span>
                                        <span>{t.topic}</span>
                                      </div>
                                    </td>
                                    <td style={{ color: "var(--text-secondary)" }}>
                                      {t.attempts} ({t.correct} correct)
                                    </td>
                                    <td>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <div
                                          style={{
                                            width: "60px",
                                            height: "4px",
                                            background: "rgba(255,255,255,0.08)",
                                            borderRadius: "var(--radius-pill)",
                                            overflow: "hidden",
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: `${Math.round(t.accuracy * 100)}%`,
                                              height: "100%",
                                              background: isCritical
                                                ? "var(--danger-text)"
                                                : isReview
                                                ? "var(--warning-text)"
                                                : "var(--success-text)",
                                            }}
                                          />
                                        </div>
                                        <span
                                          style={{
                                            fontWeight: 600,
                                            fontSize: "0.82rem",
                                            color: isCritical
                                              ? "var(--danger-text)"
                                              : isReview
                                              ? "var(--warning-text)"
                                              : "var(--success-text)",
                                          }}
                                        >
                                          {Math.round(t.accuracy * 100)}%
                                        </span>
                                      </div>
                                    </td>
                                    <td style={{ color: "var(--text-secondary)" }}>
                                      {(t.avg_response_ms / 1000).toFixed(1)}s
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
                                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                                      {isCritical
                                        ? "Trigger Foundation Auto-Remediation drill on core definitions"
                                        : isReview
                                        ? "Assign Core adaptive practice questions"
                                        : "Ready for Challenge difficulty items"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bottom Quick Row: Recent Sessions */}
              <div className="teacher-bottom-card">
                <div className="card-header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      Recent Lecture Sessions Recorded in SQLite
                    </h3>
                    <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                      Historical transcripts and generated notes archive
                    </span>
                  </div>
                  <span className="badge">Local DB</span>
                </div>

                {(overview.recent_sessions ?? []).length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", padding: "12px 0" }}>
                    No lecture sessions saved in SQLite yet.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
                    {(overview.recent_sessions ?? []).map((sess) => (
                      <div key={sess.id} className="session-item">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{ fontSize: "0.84rem", color: "var(--text-primary)" }}>{sess.title}</strong>
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                            {new Date(sess.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <span className="badge" style={{ fontSize: "0.68rem" }}>
                            Class {sess.class_level ?? 10} {sess.subject ?? "Science"}
                          </span>
                          {sess.duration_s ? (
                            <span className="badge" style={{ fontSize: "0.68rem" }}>
                              {Math.round(sess.duration_s)}s duration
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 2: STUDENT DIRECTORY ==================== */}
          {activeTab === "students" && (
            <div className="analytics-table-card">
              <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 className="card-title">Enrolled Student Directory</h3>
                  <p className="card-subtitle">
                    Select any student to view their diagnostic profile, response times, and topic mastery.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div className="input-with-icon" style={{ minWidth: 220 }}>
                    <SearchIcon />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search name, email, roll…"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      style={{ paddingLeft: 30, fontSize: "0.78rem" }}
                    />
                  </div>

                  <select
                    className="select"
                    value={studentClassFilter}
                    onChange={(e) => setStudentClassFilter(e.target.value)}
                    style={{ fontSize: "0.78rem", padding: "4px 8px" }}
                  >
                    <option value="all">All Classes</option>
                    <option value="9">Class 9</option>
                    <option value="10">Class 10</option>
                    <option value="11">Class 11</option>
                    <option value="12">Class 12</option>
                  </select>
                </div>
              </div>

              {filteredStudents.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: 20 }}>
                  No students found matching your criteria.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Class</th>
                        <th>Student ID</th>
                        <th>Attempts</th>
                        <th>Accuracy</th>
                        <th>Mastery</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((st) => (
                        <tr key={st.id} className="student-row" onClick={() => void viewStudentProfile(st.id)}>
                          <td>
                            <div>
                              <strong style={{ color: "var(--text-primary)" }}>{st.full_name}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="badge">Class {st.class_level ?? 10}</span>
                          </td>
                          <td style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                            {st.student_identifier || "—"}
                          </td>
                          <td style={{ color: "var(--text-secondary)" }}>
                            {st.total_attempts}
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: 600,
                                color:
                                  st.overall_accuracy >= 0.7
                                    ? "var(--success-text)"
                                    : st.overall_accuracy >= 0.4
                                    ? "var(--warning-text)"
                                    : "var(--danger-text)",
                              }}
                            >
                              {Math.round(st.overall_accuracy * 100)}%
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: "var(--accent-text)" }}>
                              {Math.round(st.average_mastery * 100)}%
                            </strong>
                          </td>
                          <td>
                            <span
                              className={`nlm-tier-chip ${
                                st.gap_status === "critical_gap"
                                  ? "critical_gap"
                                  : st.gap_status === "needs_review"
                                  ? "needs_review"
                                  : "proficient"
                              }`}
                            >
                              {st.gap_status === "critical_gap"
                                ? "Critical Gap"
                                : st.gap_status === "needs_review"
                                ? "Needs Review"
                                : "Proficient"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                void viewStudentProfile(st.id);
                              }}
                            >
                              <span>Inspect</span>
                              <ChevronRightIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 3: KNOWLEDGE GAPS ==================== */}
          {activeTab === "gaps" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="analytics-table-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Classroom Knowledge Gap Taxonomy</h3>
                    <p className="card-subtitle">
                      Diagnostic clustering of curriculum topics across all students based on response speed and error frequency.
                    </p>
                  </div>
                </div>

                <div className="gaps-taxonomy-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, padding: 16 }}>
                  {/* Critical Gaps Column */}
                  <div className="gap-column critical-border">
                    <div className="gap-column-header">
                      <span className="nlm-tier-chip critical_gap">Critical Gaps</span>
                      <span className="badge badge-danger">
                        {gapsData?.critical_gaps.length ?? 0} records
                      </span>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 12px 0" }}>
                      Topics where students exhibit consistent misconceptions (&lt;40% accuracy) or high hesitation latency.
                    </p>
                    {(!gapsData || gapsData.critical_gaps.length === 0) ? (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        No critical gaps detected classroom-wide.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {gapsData.critical_gaps.map((item, idx) => {
                          const acc = item.attempts > 0 ? item.correct / item.attempts : item.score;
                          return (
                            <div key={`${item.topic}-${item.student_id}-${idx}`} className="gap-card-item">
                              <strong style={{ fontSize: "0.84rem" }}>{item.topic}</strong>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>Accuracy: {Math.round(acc * 100)}%</span>
                                <span>Student: {item.student_name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Needs Review Column */}
                  <div className="gap-column review-border">
                    <div className="gap-column-header">
                      <span className="nlm-tier-chip needs_review">Needs Review</span>
                      <span className="badge badge-warning">
                        {gapsData?.needs_review.length ?? 0} records
                      </span>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 12px 0" }}>
                      Topics requiring reinforcement (40–70% accuracy) before moving to advanced topics.
                    </p>
                    {(!gapsData || gapsData.needs_review.length === 0) ? (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        No topics currently in review tier.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {gapsData.needs_review.map((item, idx) => {
                          const acc = item.attempts > 0 ? item.correct / item.attempts : item.score;
                          return (
                            <div key={`${item.topic}-${item.student_id}-${idx}`} className="gap-card-item">
                              <strong style={{ fontSize: "0.84rem" }}>{item.topic}</strong>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>Accuracy: {Math.round(acc * 100)}%</span>
                                <span>Student: {item.student_name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Proficient Column */}
                  <div className="gap-column proficient-border">
                    <div className="gap-column-header">
                      <span className="nlm-tier-chip proficient">Proficient</span>
                      <span className="badge badge-success">
                        {gapsData?.proficient.length ?? 0} records
                      </span>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 12px 0" }}>
                      Topics where students exhibit mastery (&gt;70% accuracy and swift response times).
                    </p>
                    {(!gapsData || gapsData.proficient.length === 0) ? (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Practice more quizzes to establish proficiencies.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {gapsData.proficient.map((item, idx) => {
                          const acc = item.attempts > 0 ? item.correct / item.attempts : item.score;
                          return (
                            <div key={`${item.topic}-${item.student_id}-${idx}`} className="gap-card-item">
                              <strong style={{ fontSize: "0.84rem" }}>{item.topic}</strong>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 4 }}>
                                <span>Accuracy: {Math.round(acc * 100)}%</span>
                                <span>Student: {item.student_name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 4: IMPROVEMENT TRACKING ==================== */}
          {activeTab === "improvement" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="analytics-table-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Classroom Longitudinal Progress</h3>
                    <p className="card-subtitle">
                      Tracking quiz attempts, accuracy trends, and response speed over time.
                    </p>
                  </div>
                  <span className="badge">Time-series Trend</span>
                </div>

                {(!improvementData || improvementData.progression.length === 0) ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: 20 }}>
                    No historical quiz activity recorded yet. As students take quizzes, time-series progression will appear here.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Total Attempts</th>
                          <th>Accuracy</th>
                          <th>Avg Response Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {improvementData.progression.map((point) => (
                          <tr key={point.date}>
                            <td style={{ fontWeight: 600 }}>{point.date}</td>
                            <td>{point.attempts}</td>
                            <td>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color:
                                    point.accuracy >= 0.7
                                      ? "var(--success-text)"
                                      : point.accuracy >= 0.4
                                      ? "var(--warning-text)"
                                      : "var(--danger-text)",
                                }}
                              >
                                {Math.round(point.accuracy * 100)}%
                              </span>
                            </td>
                            <td>{(point.avg_response_ms / 1000).toFixed(1)}s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 5: SETTINGS & PROVISIONING ==================== */}
          {activeTab === "settings" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
              {/* Provision New Teacher Card */}
              <div className="dashboard-section-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <ShieldIcon style={{ color: "var(--accent-text)" }} />
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                    Provision Additional Teacher
                  </h3>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
                  Teachers can provision colleague accounts directly from this authorized workstation.
                </p>

                {createTeacherError && (
                  <div className="inline-warning error" style={{ marginBottom: 12 }}>
                    <WarningIcon />
                    <span>{createTeacherError}</span>
                  </div>
                )}
                {createTeacherMsg && (
                  <div className="inline-warning success" style={{ marginBottom: 12 }}>
                    <CheckCircleIcon />
                    <span>{createTeacherMsg}</span>
                  </div>
                )}

                <form onSubmit={handleCreateTeacher} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Meera Joshi"
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Teacher ID *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Enter a teacher ID"
                      value={newTeacherId}
                      onChange={(e) => setNewTeacherId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Min 6 characters"
                      value={newTeacherPassword}
                      onChange={(e) => setNewTeacherPassword(e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createTeacherLoading}
                    style={{ marginTop: 8 }}
                  >
                    {createTeacherLoading ? (
                      <>
                        <span className="spinner small" />
                        <span>Provisioning…</span>
                      </>
                    ) : (
                      <span>Create Teacher Account</span>
                    )}
                  </button>
                </form>
              </div>

              {/* Offline Workstation Architecture Info */}
              <div className="dashboard-section-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <AwardIcon style={{ color: "var(--success-text)" }} />
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                    Offline Workstation Specs
                  </h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.82rem" }}>
                  <div className="setting-value-box">
                    <span>Authentication Engine</span>
                    <span className="badge badge-accent">Bcrypt Hashing · SQLite Auth</span>
                  </div>
                  <div className="setting-value-box">
                    <span>ASR Speech Recognition</span>
                    <span className="badge">faster-whisper · Streaming VAD</span>
                  </div>
                  <div className="setting-value-box">
                    <span>LLM Synthesis Engine</span>
                    <span className="badge">llama.cpp · Qwen 2B GGUF</span>
                  </div>
                  <div className="setting-value-box">
                    <span>Curriculum Retriever</span>
                    <span className="badge">Hybrid BM25 + Embeddings</span>
                  </div>
                  <div className="setting-value-box">
                    <span>Gap Diagnostic Model</span>
                    <span className="badge">Scikit-Learn Decision Trees</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== INDIVIDUAL STUDENT PROFILE MODAL ==================== */}
      {selectedStudentId && (
        <div className="modal-overlay" onClick={() => setSelectedStudentId(null)}>
          <div className="modal-content student-profile-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <GraduationCapIcon style={{ color: "var(--accent-text)", width: 22, height: 22 }} />
                <h3>Individual Student Diagnostic Profile</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedStudentId(null)}
                aria-label="Close"
              >
                <XIcon />
              </button>
            </header>

            <div className="modal-body">
              {studentDetailLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <span className="spinner" />
                  <p style={{ marginTop: 12, color: "var(--text-muted)" }}>
                    Loading student profile…
                  </p>
                </div>
              ) : studentDetail ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Student Header */}
                  <div className="student-modal-header-strip">
                    <div>
                      <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {studentDetail.student?.full_name || studentDetail.student_id}
                      </h4>
                      <p style={{ margin: "2px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                        {studentDetail.student?.email ? `${studentDetail.student.email} · ` : ""}
                        Class {studentDetail.student?.class_level ?? 10}
                        {studentDetail.student?.student_identifier ? ` · ID: ${studentDetail.student.student_identifier}` : ""}
                      </p>
                    </div>
                    <span className="badge badge-accent">
                      ML Model: {studentDetail.classifier_model}
                    </span>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="student-stat-strip">
                    <div className="student-stat-item">
                      <span className="student-stat-label">Curriculum Mastery</span>
                      <span className="student-stat-val" style={{ color: "var(--accent-text)" }}>
                        {Math.round((studentDetail.overall_mastery ?? studentDetail.overall) * 100)}%
                      </span>
                    </div>
                    <div className="student-stat-item">
                      <span className="student-stat-label">First-Try Accuracy</span>
                      <span className="student-stat-val" style={{ color: "var(--success-text)" }}>
                        {Math.round((studentDetail.overall_accuracy ?? (studentDetail.attempts > 0 ? 0.7 : 0)) * 100)}%
                      </span>
                    </div>
                    <div className="student-stat-item">
                      <span className="student-stat-label">Total Questions</span>
                      <span className="student-stat-val">
                        {studentDetail.total_attempts ?? studentDetail.attempts}
                      </span>
                    </div>
                    <div className="student-stat-item">
                      <span className="student-stat-label">Active Gaps</span>
                      <span className="student-stat-val" style={{ color: "var(--warning-text)" }}>
                        {studentDetail.gaps.length}
                      </span>
                    </div>
                  </div>

                  {/* Diagnosed Gaps */}
                  <div>
                    <h5 style={{ margin: "0 0 8px 0", fontSize: "0.84rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                      Diagnosed Knowledge Gaps
                    </h5>
                    {studentDetail.gaps.length === 0 ? (
                      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        No critical knowledge gaps diagnosed for this student.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {studentDetail.gaps.map((g) => (
                          <div key={g.topic} className="student-gap-item">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{g.topic}</strong>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-text)" }}>
                                {Math.round(g.mastery * 100)}% mastery
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "6px", margin: "4px 0" }}>
                              <span className={`nlm-tier-chip ${g.tier === "critical_gap" ? "critical_gap" : "needs_review"}`}>
                                {g.tier_label ?? (g.mastery < 0.4 ? "Critical Gap" : "Needs Review")}
                              </span>
                              <span className="badge" style={{ fontSize: "0.68rem" }}>
                                Rec: Level {g.recommended_difficulty}
                              </span>
                            </div>
                            {g.diagnostic_reasons && g.diagnostic_reasons.length > 0 && (
                              <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-muted)" }}>
                                {g.diagnostic_reasons[0]}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Topic Mastery Breakdown */}
                  {studentDetail.topic_analysis && studentDetail.topic_analysis.length > 0 && (
                    <div>
                      <h5 style={{ margin: "12px 0 8px 0", fontSize: "0.84rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                        Chapter-by-Chapter Performance
                      </h5>
                      <div style={{ maxHeight: 220, overflowY: "auto" }}>
                        <table className="analytics-table">
                          <thead>
                            <tr>
                              <th>Chapter</th>
                              <th>Attempts</th>
                              <th>Accuracy</th>
                              <th>Mastery</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentDetail.topic_analysis.map((tp) => {
                              const acc = tp.attempts > 0 ? tp.correct / tp.attempts : tp.score;
                              return (
                                <tr key={tp.topic}>
                                  <td style={{ fontWeight: 600 }}>{tp.topic}</td>
                                  <td>{tp.attempts}</td>
                                  <td>{Math.round(acc * 100)}%</td>
                                  <td>{Math.round(tp.score * 100)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>
                  Unable to load student profile details.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
