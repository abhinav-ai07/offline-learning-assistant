import {LoadingState,EmptyState} from "../../../shared/components/AcademicUI";
import { useEffect, useState } from "react";
import { getTeacherOverview,getTeacherLessons } from "../../../api";
import { messageOf } from "../../../format";
import type {
  AuthUser,LessonSummary,
  TeacherOverview as TeacherOverviewData,
  TeacherStudentAttention,
  TeacherActivityEvent,
  TeacherAssignedClass,
} from "../../../types";
import {
  AwardIcon,
  BarChartIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  MicIcon,
  TrendingUpIcon,
  UsersIcon,
  WarningIcon,
} from "../../../components/icons";

interface TeacherOverviewProps {
  user: AuthUser;
  onNavigateStudio: () => void;
  onNavigateClasses: () => void;
  onNavigateLibrary: () => void;
  onNavigateActivity: () => void;
  onNavigateInsights: () => void;
}

export function TeacherOverview({
  user,
  onNavigateStudio,
  onNavigateClasses,
  onNavigateLibrary,
  onNavigateActivity,
  onNavigateInsights,
}: TeacherOverviewProps) {
  const [recentLessons,setRecentLessons]=useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeacherOverviewData | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    Promise.all([getTeacherOverview(),getTeacherLessons({status:"published"})])
      .then(([res,lessons]) => {
        if (isMounted) {
          setData(res);setRecentLessons(lessons.slice(0,4));
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) setError(messageOf(err));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <LoadingState>Loading your class overview…</LoadingState>
    );
  }

  if (error) {
    return (
      <div className="portal-error-card">
        <WarningIcon width={24} height={24} />
        <div>
          <h4>Failed to load teacher overview</h4>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="portal-loading-state">
        <div className="spinner" />
        <p>Preparing dashboard...</p>
      </div>
    );
  }

  // --- Safely derive arrays from the typed response ---
  const assignedClasses: TeacherAssignedClass[] = Array.isArray(data.assigned_classes)
    ? data.assigned_classes
    : [];
  const totalStudents = data.total_students ?? 0;
  const publishedCount = data.total_published_lessons ?? 0;
  const reviewCount = data.lessons_awaiting_review ?? 0;
  const draftCount = data.draft_lessons ?? 0;

  // `recent_activity` is a lesson-event array from the backend
  const recentActivity: TeacherActivityEvent[] = Array.isArray(data.recent_activity)
    ? data.recent_activity
    : [];

  // `students_needing_attention_list` is the proper array for rendering
  const studentsNeedingHelp: TeacherStudentAttention[] = Array.isArray(
    data.students_needing_attention_list
  )
    ? data.students_needing_attention_list
    : [];

  const classAccuracy = Math.round((data.class_accuracy ?? data.class_mastery_avg ?? 0.5) * 100);

  return (
    <div className="teacher-overview-container">
      {/* ===================== HERO / CTA BANNER ===================== */}
      <section className="teacher-hero-banner">
        <div className="hero-text">

          <h2>Good day, {user.full_name || user.student_identifier || "Faculty"}!</h2>
          <p>
            You have {assignedClasses.length} assigned class sections with {totalStudents} enrolled students.
            {reviewCount > 0 && ` There are ${reviewCount} lessons awaiting your review before publication.`}
          </p>
        </div>

        <div className="hero-action-card">
          <span className="cta-kicker">Today's Class Lesson</span>
          <h4>Ready to publish today's lecture?</h4>
          <p>Record from your microphone or upload audio to generate transcript &amp; notes.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNavigateStudio}
          >
            <MicIcon width={16} height={16} />
            Open Lesson Studio
          </button>
        </div>
      </section>

      {/* ===================== METRICS ROW ===================== */}
      <section className="academic-kpi-grid">
        <div className="kpi-card" onClick={onNavigateClasses} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-blue">
            <UsersIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Assigned Students</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{totalStudents}</span>
              <span className="kpi-sub">In {assignedClasses.length} Sections</span>
            </div>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateLibrary} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-green">
            <BookIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Published Lessons</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{publishedCount}</span>
              <span className="kpi-sub">{reviewCount} in review</span>
            </div>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateLibrary} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-orange">
            <FileTextIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Draft Lessons</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{draftCount}</span>
              <span className="kpi-sub">Studio Drafts</span>
            </div>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateInsights} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-purple">
            <TrendingUpIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Class Accuracy</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{classAccuracy}%</span>
              <span className="kpi-sub">Assessment Average</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== TWO COLUMN CONTENT ===================== */}
      <div className="overview-two-col">
        {/* Left Column: Recent Activity & Assigned Classes */}
        <div className="col-main">
          <section className="dashboard-card"><h3>Recently published lessons</h3>{recentLessons.length?<ul className="academic-list">{recentLessons.map(l=><li key={l.id}><strong>{l.title}</strong><span>{l.subject} · {l.teaching_date}</span></li>)}</ul>:<EmptyState>Your published lessons will appear here.</EmptyState>}</section>
          {/* Recent Student Activity */}
          <div className="dashboard-card">
            <div className="card-header-bar">
              <div className="header-title-group">
                <h3>Recent Classroom Learning Activity</h3>
                <span className="header-sub">Chronological student engagements across your published lectures</span>
              </div>
              <button type="button" className="btn-link" onClick={onNavigateActivity}>
                View full activity log <ChevronRightIcon width={14} height={14} />
              </button>
            </div>

            <div className="activity-feed-list">
              {recentActivity.length === 0 ? (
                <div className="empty-state-card">
                  <CheckCircleIcon width={32} height={32} />
                  <h4>No student activity recorded yet</h4>
                  <p>When students open transcripts, read generated notes, or take quizzes, their activity appears here.</p>
                </div>
              ) : (
                recentActivity.map((event: any) => (
                  <div key={event.id} className="activity-feed-item">
                    <div className="activity-icon-badge">
                      {event.event_type === "marked_complete" ? (
                        <CheckCircleIcon width={15} height={15} />
                      ) : event.event_type === "quiz_completed" ? (
                        <AwardIcon width={15} height={15} />
                      ) : (
                        <FileTextIcon width={15} height={15} />
                      )}
                    </div>
                    <div className="activity-details">
                      <div className="activity-header">
                        <span className="activity-student-name">{event.student_name}</span>
                        <span className="activity-type-tag">
                          {event.event_type === "marked_complete"
                            ? "Completed Lesson"
                            : event.event_type === "notes_read"
                            ? "Studied Notes"
                            : event.event_type === "transcript_read"
                            ? "Read Transcript"
                            : event.event_type === "opened"
                            ? "Opened Lesson"
                            : event.event_type}
                        </span>
                      </div>
                      <div className="activity-lesson-meta">
                        <span>{event.lesson_title}</span>
                        <span>·</span>
                        <span>{event.subject?.toUpperCase()} (Class {event.class_level}{event.section})</span>
                        <span>·</span>
                        <span>{new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Assigned Classes Summary */}
          <div className="dashboard-card" style={{ marginTop: 24 }}>
            <div className="card-header-bar">
              <div className="header-title-group">
                <h3>My Assigned Classes</h3>
                <span className="header-sub">Authorized teaching assignments for the current academic session</span>
              </div>
              <button type="button" className="btn-link" onClick={onNavigateClasses}>
                Manage classes <ChevronRightIcon width={14} height={14} />
              </button>
            </div>

            <div className="assigned-classes-grid">
              {assignedClasses.length === 0 ? (
                <p className="empty-state-text">No class assignments found.</p>
              ) : (
                assignedClasses.map((cls: any, i: number) => (
                  <div key={i} className="assigned-class-box" onClick={onNavigateClasses}>
                    <div className="class-badge-large">Class {cls.class_level}{cls.section}</div>
                    <div className="class-box-info">
                      <h4>{cls.subject?.toUpperCase() || "SCIENCE"}</h4>
                      <p>Section {cls.section} · Verified Syllabus</p>
                    </div>
                    <ChevronRightIcon width={16} height={16} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Students Needing Attention */}
        <div className="col-side">
          <div className="dashboard-card">
            <div className="card-header-bar">
              <h4>Students Needing Attention</h4>
            </div>
            <p className="tab-desc">
              Students identified with critical topic gaps or low mastery scores (&lt;60%):
            </p>

            <div className="attention-students-list">
              {studentsNeedingHelp.length === 0 ? (
                <div className="all-good-box">
                  <CheckCircleIcon width={28} height={28} />
                  <h5>No critical student gaps!</h5>
                  <p>Students in your assigned sections are currently performing above threshold.</p>
                </div>
              ) : (
                studentsNeedingHelp.map((st: any, idx: number) => (
                  <div key={idx} className="attention-student-item" onClick={onNavigateInsights}>
                    <div className="attention-avatar">
                      {st.full_name?.charAt(0).toUpperCase() || "S"}
                    </div>
                    <div className="attention-info">
                      <span className="attention-name">{st.full_name}</span>
                      <span className="attention-gap-text">
                        Weak topic: <strong>{st.weak_topic || "Real Numbers"}</strong> ({Math.round((st.score || 0.45) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={onNavigateInsights}
              style={{ marginTop: 16 }}
            >
              Open Diagnostic Heatmap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
