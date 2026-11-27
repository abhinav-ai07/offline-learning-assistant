import { useEffect, useState } from "react";
<<<<<<< HEAD
import { getStudentOverview, getStudentSubjectsTree } from "../../../api";
=======
import { getStudentOverview } from "../../../api";
import { subscribeRealtime } from "../../../realtime";
>>>>>>> origin/main
import { messageOf } from "../../../format";
import type { AuthUser, LessonSummary } from "../../../types";
import {
  AwardIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  FileTextIcon,
  GraduationCapIcon,
<<<<<<< HEAD
=======
  HelpCircleIcon,
  MicIcon,
>>>>>>> origin/main
  PlayIcon,
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
}: StudentOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [recentLessons, setRecentLessons] = useState<LessonSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleSearch = (event: Event) => {
      setSearchQuery((event as CustomEvent<string>).detail || "");
    };
    window.addEventListener("ila:student-search", handleSearch);
    return () => window.removeEventListener("ila:student-search", handleSearch);
  }, []);

  useEffect(() => {
    let isMounted = true;
<<<<<<< HEAD
    setLoading(true);
    Promise.all([getStudentOverview(), getStudentSubjectsTree()])
      .then(([data, subjects]) => {
        if (isMounted) {
          setOverviewData(data);
          const publishedLessons = subjects.flatMap((subject) =>
            subject.chapters.flatMap((chapter) => chapter.lessons),
          );
          publishedLessons.sort((a, b) =>
            new Date(b.published_at || b.teaching_date).getTime() - new Date(a.published_at || a.teaching_date).getTime(),
          );
          setRecentLessons(publishedLessons);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) setError(messageOf(err));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
=======
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
>>>>>>> origin/main
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
  const accuracy = Math.round((overviewData?.overall_accuracy || 0) * 100);
  const totalAttempts = overviewData?.quiz_attempts || 0;
  const classroomLessons = todayLessons.length ? todayLessons : recentLessons.slice(0, 2);
  const firstName = (user.full_name || user.student_identifier || "Student").split(/\s+/)[0];
  const displayFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleLessons = normalizedSearch
    ? classroomLessons.filter((lesson) => `${lesson.title} ${lesson.subject} ${lesson.chapter_title} ${lesson.teacher_name || ""}`.toLowerCase().includes(normalizedSearch))
    : classroomLessons;
  const latestLesson = visibleLessons[0] || null;

  return (
    <div className="student-overview-container">
      <section className="student-welcome-banner">
        <div className="welcome-content">
          <div className="welcome-tag">
            <GraduationCapIcon width={16} height={16} />
            <span>
              Class {user.class_level || 10}{user.section || "A"}
              {overviewData?.academic_year && ` · ${overviewData.academic_year}`}
            </span>
          </div>
<<<<<<< HEAD
          <h2>Welcome back, {displayFirstName}!</h2>
          <p>Continue learning, explore new lectures and practice with quizzes.</p>
=======
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
>>>>>>> origin/main
        </div>
        <svg className="student-overview-illustration" viewBox="0 0 420 150" aria-hidden="true">
          <path d="M0 116c48-35 86-27 133-4 42 21 86 13 125-16 45-33 87-33 162 0v54H0z" fill="#d9f0e2" />
          <path d="M45 115c42-22 81-18 126 2 42 18 89 6 129-19 38-23 76-20 120-1v40H45z" fill="#c6e7d4" />
          <rect x="268" y="46" width="104" height="70" rx="7" fill="#08765a" />
          <rect x="275" y="52" width="90" height="58" rx="3" fill="#eaf7ef" />
          <path d="m295 89 20-20 18 14 12-10 15 15" fill="none" stroke="#55a782" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M256 118h128l-13 9H270z" fill="#064e47" />
          <rect x="67" y="100" width="112" height="17" rx="4" fill="#0b8061" />
          <rect x="58" y="86" width="121" height="16" rx="4" fill="#fff" stroke="#91c9ac" strokeWidth="3" />
          <rect x="76" y="72" width="103" height="16" rx="4" fill="#75bd94" />
          <path d="M114 72v16m13-16v16" stroke="#eaf7ef" strokeWidth="3" />
          <circle cx="209" cy="103" r="13" fill="#f3c78c" />
          <path d="M199 101c2-13 20-14 22 0" fill="#315247" />
          <path d="M194 124c3-14 28-14 31 0" fill="#3c8b73" />
        </svg>
      </section>

      <section className="academic-kpi-grid student-overview-stats" aria-label="Student summary">
        <button type="button" className="kpi-card student-overview-stat" onClick={onNavigatePractice}>
          <span className="kpi-icon-wrap icon-green"><AwardIcon width={22} height={22} /></span>
          <span className="kpi-content">
            <span className="kpi-label">Quiz Accuracy</span>
            <span className="kpi-value-row">
              <strong className="kpi-number">{accuracy}%</strong>
              <span className="kpi-sub">{totalAttempts} Questions</span>
            </span>
          </span>
        </button>
        <button type="button" className="kpi-card student-overview-stat published-stat" onClick={onNavigateSubjects}>
          <span className="kpi-icon-wrap icon-purple"><BookIcon width={22} height={22} /></span>
          <span className="kpi-content">
            <span className="kpi-label">Lectures Published Today</span>
            <span className="kpi-value-row">
              <strong className="kpi-number">{todayLessons.length}</strong>
              <span className="kpi-sub">{todayLessons.length === 1 ? "New Lecture" : "New Lectures"}</span>
            </span>
          </span>
        </button>
      </section>

      {latestLesson && (
        <section className="student-continue-learning">
          <div className="continue-learning-card">
            <span className="card-kicker"><PlayIcon width={13} height={13} /> Continue Learning</span>
            <h3 className="continue-title" title={latestLesson.title}>{latestLesson.title}</h3>
            <div className="continue-meta">
              <span>Teacher: {latestLesson.teacher_name || "Classroom Teacher"}</span>
              <span className="continue-meta-divider" />
              <span><CalendarIcon width={15} height={15} />{latestLesson.teaching_date}</span>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenLesson(latestLesson.id)}>
              <PlayIcon width={14} height={14} /> Resume Lesson
            </button>
          </div>
        </section>
      )}
      {!latestLesson && (
        <section className="student-continue-learning student-continue-learning-empty">
          <div className="continue-learning-card">
            <span className="card-kicker"><PlayIcon width={13} height={13} /> Continue Learning</span>
            <h3 className="continue-title">No lesson to resume yet</h3>
            <div className="continue-meta">Newly published classroom lessons will appear here.</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNavigateSubjects}>Browse Subjects</button>
          </div>
        </section>
      )}

      <section className="student-classroom-material">
        <div className="student-section-heading">
          <h2>{todayLessons.length ? "Today’s classroom material" : "Recently published classroom material"}</h2>
          <button type="button" className="btn-link" onClick={onNavigateSubjects}>
            View all subjects <ChevronRightIcon width={16} height={16} />
          </button>
        </div>
        {visibleLessons.length === 0 ? (
          <div className="empty-state-card student-material-empty">
            <BookIcon width={28} height={28} />
            <p>{normalizedSearch ? "No classroom material matches your search." : "No published classroom material is available yet."}</p>
          </div>
        ) : (
          <div className="student-today-lessons">
            {visibleLessons.map((lesson) => (
              <article className="student-today-lesson" key={lesson.id}>
                <span className="student-lesson-icon"><PlayIcon width={19} height={19} /></span>
                <div className="student-today-lesson-content">
                  <div className="student-today-lesson-heading">
                    <h3>{lesson.chapter_title} — {lesson.title}</h3>
                    {lesson.status === "published" && (
                      <span className="student-published-badge"><CheckCircleIcon width={13} height={13} /> Published</span>
                    )}
                  </div>
                  <span className="student-today-lesson-meta">Teacher: {lesson.teacher_name || "Classroom Teacher"}</span>
                  <span className="student-today-lesson-meta"><CalendarIcon width={14} height={14} />{lesson.teaching_date}</span>
                  <div className="student-lesson-actions">
                    {lesson.has_transcript && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenLesson(lesson.id)}>
                        <FileTextIcon width={15} height={15} /> Transcript
                      </button>
                    )}
                    {lesson.has_notes && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenLesson(lesson.id)}>
                        <FileTextIcon width={15} height={15} /> Notes
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
<<<<<<< HEAD
=======

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
>>>>>>> origin/main
    </div>
  );
}
