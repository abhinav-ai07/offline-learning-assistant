import { useEffect, useMemo, useState } from "react";
import { getStudentSubjectsTree } from "../../../api";
import { subscribeRealtime } from "../../../realtime";
import { messageOf } from "../../../format";
<<<<<<< HEAD
import type { AuthUser, SubjectTree } from "../../../types";
import { BookIcon, CalendarIcon, CheckCircleIcon, FileTextIcon, WarningIcon } from "../../../components/icons";
=======
import type { AuthUser, LessonSummary, SubjectTree } from "../../../types";
import {
  BookIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  LayersIcon,
  MicIcon,
  WarningIcon,
} from "../../../components/icons";
>>>>>>> origin/main

interface MySubjectsProps {
  user: AuthUser;
  onSelectLesson: (lessonId: string) => void;
  onNavigateTranscribe?: () => void;
}

<<<<<<< HEAD
function SubjectIcon({ name }: { name: string }) {
  const subject = name.toLowerCase();
  if (subject.includes("math")) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M7 11h2m3 0h2m3 0h.01M7 15h2m3 0h2m3 0h.01M7 19h2m3 0h2"/></svg>;
  }
  if (subject === "science") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 16h8"/></svg>;
  }
  if (subject.includes("social")) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>;
  }
  return <BookIcon width={28} height={28} />;
}

export function MySubjects({ user, onSelectLesson }: MySubjectsProps) {
=======
export function MySubjects({ user, onSelectLesson, onNavigateTranscribe }: MySubjectsProps) {
>>>>>>> origin/main
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectsTree, setSubjectsTree] = useState<SubjectTree[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [activeContentTab, setActiveContentTab] = useState<"lectures" | "materials">("lectures");

  useEffect(() => {
    let isMounted = true;
<<<<<<< HEAD
    getStudentSubjectsTree()
      .then((tree) => {
        if (!isMounted) return;
        setSubjectsTree(tree);
        const preferred = tree.find((subject) => subject.subject_code.toLowerCase() === "science") || tree[0];
        if (preferred) setSelectedSubject(preferred.subject_code);
        setError(null);
      })
      .catch((err) => {
        if (isMounted) setError(messageOf(err));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
=======
    const loadTree = (silent = false) => {
      if (!silent) setLoading(true);
      getStudentSubjectsTree()
        .then((tree) => {
          if (isMounted) {
            setSubjectsTree(tree);
            if (!silent && tree.length > 0 && !selectedSubject) {
              setSelectedSubject(tree[0].subject_code);
              if (tree[0].chapters.length > 0) {
                setExpandedChapters({ [tree[0].chapters[0].chapter_number]: true });
              }
            }
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
    loadTree(false);
    const unsub = subscribeRealtime(
      ["lesson_published", "lesson_updated", "lesson_archived", "student_lesson_created", "student_activity"],
      () => loadTree(true),
    );
>>>>>>> origin/main
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const activeSubject = subjectsTree.find((subject) => subject.subject_code === selectedSubject) || subjectsTree[0];
  const lessons = useMemo(() => activeSubject?.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({ lesson, chapterTitle: chapter.title })),
  ) || [], [activeSubject]);
  const materialLessons = lessons.filter(({ lesson }) => lesson.has_notes);

  if (loading) {
    return <div className="portal-loading-state"><div className="spinner" /><p>Loading your subjects...</p></div>;
  }

  if (error) {
    return (
      <div className="portal-error-card">
        <WarningIcon width={24} height={24} />
        <div><h4>Failed to load subjects</h4><p>{error}</p></div>
      </div>
    );
  }

  return (
    <div className="my-subjects-container">
<<<<<<< HEAD
      <header className="subjects-header-banner">
        <h1>My Subjects</h1>
        <p>Browse your enrolled subjects and access recently published lectures.</p>
      </header>
=======
      {/* Top Banner */}
      <div className="subjects-header-banner">
        <div>
          <h2>My Subjects &amp; Classroom Lectures</h2>
          <p className="header-subtitle">
            Class {user.class_level}{user.section || "A"} · Academic Hierarchy: Class &rarr; Section &rarr; Subject &rarr; Chapter &rarr; Daily Lesson
          </p>
        </div>
        {onNavigateTranscribe && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onNavigateTranscribe}>
            <MicIcon width={14} height={14} /> Generate Notes from Audio
          </button>
        )}
      </div>
>>>>>>> origin/main

      <div className="subject-selector-strip" role="tablist" aria-label="Subjects">
        {subjectsTree.map((subject) => (
          <button
            key={subject.subject_code}
            type="button"
            role="tab"
            aria-selected={activeSubject?.subject_code === subject.subject_code}
            className={`subject-chip-btn${activeSubject?.subject_code === subject.subject_code ? " active" : ""}`}
            onClick={() => {
              setSelectedSubject(subject.subject_code);
              setActiveContentTab("lectures");
            }}
          >
            <SubjectIcon name={subject.subject_name} />
            <strong>{subject.subject_name}</strong>
            <span className="chip-badge">{subject.total_lessons} Published Lectures</span>
          </button>
        ))}
      </div>

      {activeSubject && (
        <section className="subject-detail-workspace">
          <header className="subject-kpi-bar">
            <span className="subject-detail-icon"><SubjectIcon name={activeSubject.subject_name} /></span>
            <div className="subject-kpi-info">
              <h2>{activeSubject.subject_name}</h2>
              <p>Class {user.class_level}{user.section || "A"}</p>
            </div>
            <div className="subject-progress-stats">
              <span>Subject Progress</span>
              <div className="progress-bar-mini"><span style={{ width: `${activeSubject.progress_pct}%` }} /></div>
              <strong>{activeSubject.progress_pct}%</strong>
            </div>
          </header>

          <div className="student-subject-tabs" role="tablist" aria-label={`${activeSubject.subject_name} content`}>
            <button type="button" role="tab" aria-selected={activeContentTab === "lectures"} className={activeContentTab === "lectures" ? "active" : ""} onClick={() => setActiveContentTab("lectures")}>
              <span className="student-tab-play">▶</span> Published Lectures ({activeSubject.total_lessons})
            </button>
            <button type="button" role="tab" aria-selected={activeContentTab === "materials"} className={activeContentTab === "materials" ? "active" : ""} onClick={() => setActiveContentTab("materials")}>
              <BookIcon width={16} height={16} /> Study Material
            </button>
          </div>

          {activeContentTab === "lectures" ? (
            <div className="student-subject-lecture-list">
              {lessons.length === 0 ? (
                <div className="empty-state-card"><BookIcon width={28} height={28} /><p>No published lectures for this subject yet.</p></div>
              ) : lessons.map(({ lesson, chapterTitle }, index) => (
                <article className="student-subject-lecture" key={lesson.id}>
                  <span className="student-lesson-icon"><span>▶</span></span>
                  <div className="student-subject-lecture-main">
                    <h3>Lecture {index + 1}: {lesson.title}</h3>
                    <div className="student-subject-lecture-meta">
                      <span><CalendarIcon width={14} height={14} />{lesson.teaching_date}</span>
                      <span><span className="student-meta-person">♙</span>Teacher: {lesson.teacher_name || "Faculty"}</span>
                      <span>{chapterTitle}</span>
                    </div>
<<<<<<< HEAD
=======

                    {isExpanded && (
                      <div className="chapter-lessons-container">
                        {chapter.lessons.length === 0 ? (
                          <div className="no-lessons-in-chapter">
                            <p>No classroom lessons have been published for this chapter yet.</p>
                          </div>
                        ) : (
                          <div className="lessons-table-wrapper">
                            <table className="lessons-table">
                              <thead>
                                <tr>
                                  <th>Lesson Title</th>
                                  <th>Teaching Date</th>
                                  <th>Faculty</th>
                                  <th>Status</th>
                                  <th>Study Status</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {chapter.lessons.map((lesson) => (
                                  <tr key={lesson.id} className="lesson-row">
                                    <td className="lesson-name-cell">
                                      <div className="lesson-name-title">{lesson.title}</div>
                                      <div className="lesson-sub-info">
                                        {lesson.is_student_generated || lesson.status === "student_private"
                                          ? `Added on ${lesson.teaching_date} (Self-Study)`
                                          : `Published on ${lesson.published_at ? new Date(lesson.published_at).toLocaleDateString() : lesson.teaching_date}`}
                                      </div>
                                    </td>
                                    <td className="lesson-date-cell">{lesson.teaching_date}</td>
                                    <td className="lesson-teacher-cell">
                                      {lesson.is_student_generated || lesson.status === "student_private"
                                        ? "You (Self-Study)"
                                        : (lesson.teacher_name || "Faculty")}
                                    </td>
                                    <td>
                                      <div className="material-badges-row">
                                        {(lesson.is_student_generated || lesson.status === "student_private") && (
                                          <span className="badge-micro badge-self-study" title="Auto-sorted self-study audio notes">
                                            Self-Study
                                          </span>
                                        )}
                                        {lesson.has_transcript && (
                                          <span className="badge-micro badge-transcript" title="Classroom transcript available">
                                            Transcript
                                          </span>
                                        )}
                                        {lesson.has_notes && (
                                          <span className="badge-micro badge-notes" title="Generated notes available">
                                            Notes
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      {lesson.completed ? (
                                        <span className="study-status studied">
                                          <CheckCircleIcon width={13} height={13} /> Studied
                                        </span>
                                      ) : (
                                        <span className="study-status pending">Pending</span>
                                      )}
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        onClick={() => onSelectLesson(lesson.id)}
                                      >
                                        Open Lesson
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
>>>>>>> origin/main
                  </div>
                  <div className="student-subject-lecture-actions">
                    {lesson.has_transcript && <button type="button" className="btn btn-outline btn-sm" onClick={() => onSelectLesson(lesson.id)}><FileTextIcon width={16} height={16} />Transcript</button>}
                    {lesson.has_notes && <button type="button" className="btn btn-outline btn-sm" onClick={() => onSelectLesson(lesson.id)}><FileTextIcon width={16} height={16} />Notes</button>}
                    {lesson.completed && <span className="student-lecture-completed"><CheckCircleIcon width={14} height={14} /> Studied</span>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="student-study-material-list">
              {materialLessons.length === 0 ? (
                <div className="empty-state-card"><BookIcon width={28} height={28} /><p>Published study notes will appear here.</p></div>
              ) : materialLessons.map(({ lesson, chapterTitle }) => (
                <article className="student-material-card" key={lesson.id}>
                  <FileTextIcon width={20} height={20} />
                  <div><strong>{lesson.title}</strong><span>{chapterTitle} · {lesson.teaching_date}</span></div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onSelectLesson(lesson.id)}>Open notes</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
