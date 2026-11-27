import { useEffect, useState } from "react";
import { getTeacherOverview, getTeacherLessons, getTeacherClasses } from "../../../api";
import { messageOf } from "../../../format";
import type {
  AuthUser,
  LessonSummary,
  TeacherActivityEvent,
  TeacherAssignedClass,
  TeacherClassOverview,
  TeacherOverview as TeacherOverviewData,
  TeacherStudentAttention,
} from "../../../types";
import {
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  EditIcon,
  FileTextIcon,
  GraduationCapIcon,
  PlayIcon,
  TrendingUpIcon,
  UploadIcon,
  UsersIcon,
  WarningIcon,
} from "../../../components/icons";
import { EmptyState, LoadingState } from "../../../shared/components/AcademicUI";

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
  const [allLessons, setAllLessons] = useState<LessonSummary[]>([]);
  const [recentLessons, setRecentLessons] = useState<LessonSummary[]>([]);
  const [classDetails, setClassDetails] = useState<TeacherClassOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeacherOverviewData | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getTeacherOverview(), getTeacherLessons(), getTeacherClasses()])
      .then(([overview, lessons, classes]) => {
        if (!isMounted) return;
        setData(overview);
        setAllLessons(lessons);
        setRecentLessons(lessons.filter((lesson) => lesson.status === "published").slice(0, 1));
        setClassDetails(classes);
        setError(null);
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

  if (loading) return <LoadingState>Loading your class overview…</LoadingState>;

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

  if (!data) return <LoadingState>Preparing dashboard…</LoadingState>;

  const assignedClasses: TeacherAssignedClass[] = Array.isArray(data.assigned_classes)
    ? data.assigned_classes
    : [];
  const recentActivity: TeacherActivityEvent[] = Array.isArray(data.recent_activity)
    ? data.recent_activity
    : [];
  const studentsNeedingHelp: TeacherStudentAttention[] = Array.isArray(
    data.students_needing_attention_list,
  )
    ? data.students_needing_attention_list
    : [];
  const totalStudents = data.total_students ?? 0;
  const publishedCount = data.total_published_lessons ?? 0;
  const reviewCount = data.lessons_awaiting_review ?? 0;
  const draftCount = data.draft_lessons ?? 0;
  const transcriptCount = allLessons.filter((lesson) => lesson.has_transcript).length;
  const notesCount = allLessons.filter((lesson) => lesson.has_notes).length;

  return (
    <div className="teacher-overview-container">
      <section className="teacher-dashboard-heading">
        <div>
          <h1>Good day, {user.full_name || user.student_identifier || "Teacher"}!</h1>
          <p>Manage your classes, create lessons and track student learning — all in one place.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNavigateStudio}>
          <PlayIcon width={16} height={16} />
          Open Lesson Studio
        </button>
      </section>

      <section className="teacher-stat-grid" aria-label="Teaching summary">
        <button type="button" className="teacher-stat-card" onClick={onNavigateClasses}>
          <span className="teacher-stat-icon"><UsersIcon width={20} height={20} /></span>
          <span className="teacher-stat-number">{assignedClasses.length}</span>
          <span className="teacher-stat-label">Assigned {assignedClasses.length === 1 ? "Class" : "Classes"}</span>
        </button>
        <button type="button" className="teacher-stat-card" onClick={onNavigateLibrary}>
          <span className="teacher-stat-icon"><PlayIcon width={20} height={20} /></span>
          <span className="teacher-stat-number">{publishedCount}</span>
          <span className="teacher-stat-label">Published {publishedCount === 1 ? "Lesson" : "Lessons"}</span>
        </button>
        <button type="button" className="teacher-stat-card" onClick={onNavigateLibrary}>
          <span className="teacher-stat-icon"><FileTextIcon width={20} height={20} /></span>
          <span className="teacher-stat-number">{transcriptCount}</span>
          <span className="teacher-stat-label">Transcripts</span>
        </button>
        <button type="button" className="teacher-stat-card" onClick={onNavigateLibrary}>
          <span className="teacher-stat-icon"><EditIcon width={20} height={20} /></span>
          <span className="teacher-stat-number">{notesCount}</span>
          <span className="teacher-stat-label">Notes</span>
        </button>
      </section>

      <div className="teacher-overview-panels">
        <section className="teacher-panel">
          <div className="teacher-panel-heading">
            <h2><PlayIcon width={18} height={18} /> Recently Published Lesson</h2>
            <button type="button" className="teacher-text-link" onClick={onNavigateLibrary}>
              View library <ChevronRightIcon width={14} height={14} />
            </button>
          </div>
          {recentLessons.length ? recentLessons.map((lesson) => (
            <button type="button" className="teacher-recent-lesson" key={lesson.id} onClick={onNavigateLibrary}>
              <span>
                <strong>{lesson.title}</strong>
                <small>Class {lesson.class_level}{lesson.section} · {lesson.subject.toUpperCase()} · {lesson.teaching_date}</small>
              </span>
              <span className="teacher-outline-action">View</span>
            </button>
          )) : <EmptyState>Your published lessons will appear here.</EmptyState>}
        </section>

        <section className="teacher-panel teacher-actions-panel">
          <div className="teacher-panel-heading">
            <h2><CheckCircleIcon width={18} height={18} /> Today’s Actions</h2>
          </div>
          <button type="button" className="teacher-action-link" onClick={onNavigateStudio}>
            <span><UploadIcon width={17} height={17} /> Upload &amp; create a new lesson</span>
            <ChevronRightIcon width={16} height={16} />
          </button>
          <button type="button" className="teacher-action-link" onClick={onNavigateLibrary}>
            <span><BookIcon width={17} height={17} /> Review and publish lessons
              {(reviewCount + draftCount) > 0 && <small>{reviewCount} awaiting review · {draftCount} drafts</small>}
            </span>
            <ChevronRightIcon width={16} height={16} />
          </button>
        </section>
      </div>

      <section className="teacher-panel teacher-classes-panel">
        <div className="teacher-panel-heading">
          <div>
            <h2><UsersIcon width={18} height={18} /> My Classes</h2>
            <p>Your assigned classes for the current academic session.</p>
          </div>
          <button type="button" className="teacher-text-link" onClick={onNavigateClasses}>
            View analytics <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
        {assignedClasses.length ? (
          <div className="teacher-class-list">
            {assignedClasses.map((classInfo) => (
              <button
                type="button"
                className="teacher-class-row"
                key={`${classInfo.class_level}-${classInfo.section}-${classInfo.subject}`}
                onClick={onNavigateClasses}
              >
                <span className="teacher-class-icon"><GraduationCapIcon width={20} height={20} /></span>
                <span className="teacher-class-copy">
                  <strong>Class {classInfo.class_level}{classInfo.section}</strong>
                  <small>{classInfo.subject.toUpperCase()} · Section {classInfo.section} · {classDetails.find((detail) => detail.class_level === classInfo.class_level && detail.section === classInfo.section && detail.subject === classInfo.subject)?.students_count ?? totalStudents} Students</small>
                </span>
                <span className="teacher-outline-action">View Class <ChevronRightIcon width={14} height={14} /></span>
              </button>
            ))}
          </div>
        ) : <EmptyState>No class assignments found.</EmptyState>}
      </section>

      <details className="teacher-extra-insights">
        <summary><TrendingUpIcon width={17} height={17} /> Recent activity and student support</summary>
        <div className="teacher-extra-grid">
          <section className="teacher-panel">
            <div className="teacher-panel-heading">
              <h2>Recent Classroom Activity</h2>
              <button type="button" className="teacher-text-link" onClick={onNavigateActivity}>
                Full activity log <ChevronRightIcon width={14} height={14} />
              </button>
            </div>
            {recentActivity.length ? (
              <ul className="teacher-activity-list">
                {recentActivity.slice(0, 4).map((event) => (
                  <li key={event.id}>
                    <strong>{event.student_name}</strong>
                    <span>{event.event_type.replace(/_/g, " ")} · {event.lesson_title}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState>No student activity recorded yet.</EmptyState>}
          </section>
          <section className="teacher-panel">
            <div className="teacher-panel-heading">
              <h2>Students Needing Attention</h2>
              <button type="button" className="teacher-text-link" onClick={onNavigateInsights}>
                Open analytics <ChevronRightIcon width={14} height={14} />
              </button>
            </div>
            {studentsNeedingHelp.length ? (
              <ul className="teacher-activity-list">
                {studentsNeedingHelp.slice(0, 4).map((student, index) => (
                  <li key={`${student.full_name}-${index}`}>
                    <strong>{student.full_name}</strong>
                    <span>Review {student.weak_topic || "learning progress"}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState>No critical student gaps found.</EmptyState>}
          </section>
        </div>
      </details>
    </div>
  );
}
