import { useEffect, useMemo, useState } from "react";
import { getStudentSubjectsTree } from "../../../api";
import { subscribeRealtime } from "../../../realtime";
import { messageOf } from "../../../format";
import type { AuthUser, SubjectTree } from "../../../types";
import {
  BookIcon,
  CheckCircleIcon,
  CalendarIcon,
  FileTextIcon,
  MicIcon,
  WarningIcon,
} from "../../../components/icons";

interface MySubjectsProps {
  user: AuthUser;
  onSelectLesson: (lessonId: string) => void;
  onNavigateTranscribe?: () => void;
}

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

export function MySubjects({ user, onSelectLesson, onNavigateTranscribe }: MySubjectsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectsTree, setSubjectsTree] = useState<SubjectTree[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [activeContentTab, setActiveContentTab] = useState<"lectures" | "materials">("lectures");

  useEffect(() => {
    let isMounted = true;
    const loadTree = (silent = false) => {
      if (!silent) setLoading(true);
      getStudentSubjectsTree()
        .then((tree) => {
          if (isMounted) {
            setSubjectsTree(tree);
            if (!silent) {
              const preferred = tree.find((subject) => subject.subject_code.toLowerCase() === "science") || tree[0];
              if (preferred) setSelectedSubject(preferred.subject_code);
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
      <header className="subjects-header-banner">
        <div>
          <h1>My Subjects</h1>
          <p>Browse your enrolled subjects and access recently published lectures.</p>
          <p className="header-subtitle">
            Class {user.class_level}{user.section || "A"} · Class, section, subject, chapter, and lesson.
          </p>
        </div>
        {onNavigateTranscribe && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onNavigateTranscribe}>
            <MicIcon width={14} height={14} /> Generate Notes from Audio
          </button>
        )}
      </header>

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
