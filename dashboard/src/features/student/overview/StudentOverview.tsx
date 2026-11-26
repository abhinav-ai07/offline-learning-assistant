import { useEffect, useState } from "react";
import { getStudentOverview } from "../../../api";
import { subscribeRealtime } from "../../../realtime";
import { messageOf } from "../../../format";
import type { AuthUser, LessonSummary, TimetableSlot } from "../../../types";
import {
  AwardIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  HelpCircleIcon,
  MicIcon,
  PlayIcon,
  TrendingUpIcon,
  WarningIcon,
} from "../../../components/icons";

interface StudentOverviewProps {
  user: AuthUser;
  onOpenLesson: (lessonId: string) => void;
  onNavigateSubjects: () => void;
  onNavigateTranscribe?: () => void;
  onNavigatePractice: () => void;
  onNavigateProgress: () => void;
}

export function StudentOverview({
  user,
  onOpenLesson,
  onNavigateSubjects,
  onNavigateTranscribe,
  onNavigatePractice,
  onNavigateProgress,
}: StudentOverviewProps) {
  const [recentSubjects]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem("ila-recent-subjects-"+user.id)||"[]")}catch{return []}});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    const loadOverview = (silent = false) => {
      if (!silent) setLoading(true);
      getStudentOverview()
        .then((data) => {
          if (isMounted) {
            setOverviewData(data);
            setError(null);
          }
        })
        .catch((err) => {
          if (isMounted && !silent) setError(messageOf(err));
        })
        .finally(() => {
          if (isMounted && !silent) setLoading(false);
        });
    };
    loadOverview(false);
    const unsub = subscribeRealtime(
      ["lesson_published", "lesson_updated", "lesson_archived", "quiz_updated", "student_activity"],
      () => loadOverview(true),
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  if (loading) {
    return (
      <div className="portal-loading-state">
        <div className="spinner" />
        <p>Loading your classroom updates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-error-card">
        <WarningIcon width={24} height={24} />
        <div>
          <h4>Failed to load student overview</h4>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const todayLessons: LessonSummary[] = overviewData?.today_lessons || [];
  const timetable: TimetableSlot[] = overviewData?.timetable || [];
  const accuracy = Math.round((overviewData?.overall_accuracy || 0) * 100);
  const mastery = Math.round((overviewData?.overall_mastery || 0.5) * 100);
  const totalAttempts = overviewData?.quiz_attempts || 0;
  const weakTopics = overviewData?.topics_requiring_revision || [];

  const latestLesson = todayLessons.length > 0 ? todayLessons[0] : null;

  return (
    <div className="student-overview-container">
      {/* ===================== A. WELCOME BANNER ===================== */}
      <section className="student-welcome-banner">
        <div className="welcome-content">
          <div className="welcome-tag">
            <GraduationCapIcon width={16} height={16} />
            <span>Class {user.class_level || 10}{user.section || "A"}{overviewData?.academic_year && " · "+overviewData.academic_year}</span>
          </div>
          <h2>Welcome back, {(user.full_name || user.student_identifier || "Student").split(" ")[0]}!</h2>
          <p>
            Here is your daily classroom material, published lectures, and learning tasks for today.
          </p>
          {onNavigateTranscribe && (
            <div className="welcome-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onNavigateTranscribe}
              >
                <MicIcon width={14} height={14} /> Generate Transcript &amp; Notes from Audio
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onNavigateSubjects}
              >
                <BookIcon width={14} height={14} /> Browse My Subjects
              </button>
            </div>
          )}
        </div>

        {latestLesson && (
          <div className="continue-learning-card">
            <span className="card-kicker">Continue Learning</span>
            <h4 className="continue-title" title={latestLesson.title}>{latestLesson.title}</h4>
            <div className="continue-meta">
              <span>{latestLesson.subject.toUpperCase()}</span>
              <span>·</span>
              <span>{latestLesson.teaching_date}</span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenLesson(latestLesson.id)}
            >
              <PlayIcon width={14} height={14} />
              Resume Lesson
            </button>
          </div>
        )}
      </section>

      {/* ===================== METRICS STRIP ===================== */}
      <section className="academic-kpi-grid">
        <div className="kpi-card" onClick={onNavigateProgress} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-blue">
            <TrendingUpIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Curriculum Mastery</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{mastery}%</span>
              <span className="kpi-sub">EMA Model</span>
            </div>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigatePractice} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-green">
            <AwardIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Quiz Accuracy</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{accuracy}%</span>
              <span className="kpi-sub">{totalAttempts} Questions</span>
            </div>
          </div>
        </div>

        <div className="kpi-card" onClick={onNavigateSubjects} style={{ cursor: "pointer" }}>
          <div className="kpi-icon-wrap icon-purple">
            <BookIcon width={20} height={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Class Lectures</span>
            <div className="kpi-value-row">
              <span className="kpi-number">{todayLessons.length}</span>
              <span className="kpi-sub">Published for Class</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== TWO COLUMN WORKSPACE ===================== */}
      <div className="overview-two-col">
        {/* Left Column: Today's Classroom Updates & Timetable */}
        <div className="col-main">
          {/* B. TODAY'S CLASSROOM UPDATES */}
          <div className="dashboard-card">
            <div className="card-header-bar">
              <div className="header-title-group">
                <h3>Today's Classroom Material</h3>
                <span className="header-sub">Daily verified lectures, transcripts, and notes published by your teachers</span>
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={onNavigateSubjects}
              >
                View all subjects <ChevronRightIcon width={14} height={14} />
              </button>
            </div>

            <div className="lesson-updates-list">
              {todayLessons.length === 0 ? (
                <div className="empty-state-card">
                  <BookIcon width={32} height={32} />
                  <h4>No lectures published yet today</h4>
                  <p>When your teachers publish today's classroom recordings and notes, they will appear here.</p>
                </div>
              ) : (
                todayLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="lesson-update-row"
                    onClick={() => onOpenLesson(lesson.id)}
                  >
                    <div className="lesson-subject-badge">
                      <span>{lesson.subject.slice(0, 3).toUpperCase()}</span>
                    </div>

                    <div className="lesson-info-col">
                      <div className="lesson-title-line">
                        <span className="lesson-title">{lesson.title}</span>
                        {lesson.status === "published" && (
                          <span className="badge badge-published">Published</span>
                        )}
                      </div>
                      <div className="lesson-meta-line">
                        <span>{lesson.chapter_title}</span>
                        <span>·</span>
                        <span>Teacher: {lesson.teacher_name || "Faculty"}</span>
                        <span>·</span>
                        <span>{lesson.teaching_date}</span>
                      </div>
                    </div>

                    <div className="lesson-status-tags">
                      {lesson.has_transcript && (
                        <span className="pill pill-transcript" title="Classroom audio transcript available">
                          Transcript
                        </span>
                      )}
                      {lesson.has_notes && (
                        <span className="pill pill-notes" title="Structured notes generated">
                          Notes
                        </span>
                      )}
                      {lesson.completed ? (
                        <span className="pill pill-completed" title="You marked this lesson as studied">
                          <CheckCircleIcon width={12} height={12} /> Studied
                        </span>
                      ) : (
                        <span className="pill pill-pending">Pending</span>
                      )}
                    </div>

                    <div className="lesson-action-col">
                      <button type="button" className="btn-action-icon" aria-label="Open Lesson">
                        <ChevronRightIcon width={18} height={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* E. WEEKLY TIMETABLE */}
          <div className="dashboard-card" style={{ marginTop: 24 }}>
            <div className="card-header-bar">
              <div className="header-title-group">
                <h3>Weekly Timetable</h3>
                <span className="header-sub">Daily class schedule for Class {user.class_level}{user.section || "A"}</span>
              </div>
            </div>

            <div className="timetable-table-wrapper">
              <table className="timetable-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Time</th>
                    <th>Subject</th>
                    <th>Faculty</th>
                  </tr>
                </thead>
                <tbody>
                  {timetable.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: 20 }}>
                        Class timetable will be synchronized by school administration.
                      </td>
                    </tr>
                  ) : (
                    timetable.slice(0, 5).map((slot) => (
                      <tr key={slot.id || `${slot.period}-${slot.subject}`}>
                        <td>
                          <span className="period-badge">Period {slot.period}</span>
                        </td>
                        <td className="slot-time">
                          <ClockIcon width={13} height={13} /> {slot.time_slot}
                        </td>
                        <td className="slot-subject">{slot.subject}</td>
                        <td className="slot-teacher">{slot.teacher_name || "Assigned Faculty"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Pending Assessments & Important Reminders */}
        <div className="col-side">
          {/* D. PENDING ASSESSMENTS / WEAK TOPICS */}
          <div className="dashboard-card">
            <div className="card-header-bar">
              <div className="header-title-group">
                <h4>Suggested Practice</h4>
              </div>
            </div>

            <div className="suggested-practice-body">
              {weakTopics.length > 0 ? (
                <>
                  <p className="card-desc">
                    Targeted practice recommended based on your recent quiz responses:
                  </p>
                  <div className="weak-topic-list">
                    {weakTopics.map((item: any, idx: number) => {
                      const pct = Math.round(item.score * 100);
                      const isCritical = item.score < 0.5;
                      const levelLabel = isCritical ? "Critical" : item.score < 0.65 ? "Needs Review" : "Developing";
                      return (
                        <div key={idx} className="weak-topic-item">
                          <div className="topic-header">
                            <span className="topic-name">{item.topic}</span>
                            <div className={`topic-proficiency-box ${isCritical ? "is-critical" : "is-review"}`}>
                              <span className="proficiency-pct">{pct}%</span>
                              <span className="proficiency-level">{levelLabel}</span>
                            </div>
                          </div>
                          <div className="topic-progress-bar">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: isCritical ? "var(--danger)" : "var(--warning)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    onClick={onNavigatePractice}
                    style={{ marginTop: 16 }}
                  >
                    Start Adaptive Practice
                  </button>
                </>
              ) : (
                <div className="all-good-box">
                  <CheckCircleIcon width={28} height={28} />
                  <h5>No critical knowledge gaps!</h5>
                  <p>You have maintained solid mastery across your attempted topics.</p>
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    onClick={onNavigatePractice}
                  >
                    Take a Challenge Quiz
                  </button>
                </div>
              )}
            </div>
          </div>

          {recentSubjects.length>0 && <section className="dashboard-card"><h3>Recently studied subjects</h3><p>{recentSubjects.join(" · ")}</p><button className="btn btn-outline" onClick={onNavigateSubjects}>Browse my subjects</button></section>}
          {([["Recently published notes",overviewData?.recent_notes],["Pending lecture quizzes",overviewData?.pending_quizzes]] as const).map(([title,items])=>
            <section className="dashboard-card" key={title}><h3>{title}</h3>{items?.length?items.map((l:{id:string;title:string})=><p key={l.id}><button className="btn btn-outline" onClick={()=>onOpenLesson(l.id)}>{l.title}</button></p>):<p>Nothing pending.</p>}</section>)}
          {!!overviewData?.assignments?.length && <section className="dashboard-card"><h3>Upcoming assignments</h3>{overviewData.assignments.map((a:{title:string;due_date:string},i:number)=><p key={i}>{a.title} · {a.due_date}</p>)}</section>}
        </div>
      </div>
    </div>
  );
}
