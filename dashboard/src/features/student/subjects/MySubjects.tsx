import { useEffect, useState } from "react";
import { getStudentSubjectsTree } from "../../../api";
import { subscribeRealtime } from "../../../realtime";
import { messageOf } from "../../../format";
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

interface MySubjectsProps {
  user: AuthUser;
  onSelectLesson: (lessonId: string) => void;
  onNavigateTranscribe?: () => void;
}

export function MySubjects({ user, onSelectLesson, onNavigateTranscribe }: MySubjectsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectsTree, setSubjectsTree] = useState<SubjectTree[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let isMounted = true;
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
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const toggleChapter = (chapterNum: number) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapterNum]: !prev[chapterNum],
    }));
  };

  if (loading) {
    return (
      <div className="portal-loading-state">
        <div className="spinner" />
        <p>Loading your curriculum &amp; subjects tree...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-error-card">
        <WarningIcon width={24} height={24} />
        <div>
          <h4>Failed to load subjects</h4>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const activeSubject = subjectsTree.find((s) => s.subject_code === selectedSubject) || subjectsTree[0];

  return (
    <div className="my-subjects-container">
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

      {/* Subject Selection Tabs */}
      <div className="subject-selector-strip" role="tablist">
        {subjectsTree.map((subj) => (
          <button
            key={subj.subject_code}
            type="button"
            role="tab"
            aria-selected={activeSubject?.subject_code === subj.subject_code}
            className={`subject-chip-btn ${activeSubject?.subject_code === subj.subject_code ? "active" : ""}`}
            onClick={() => {
              setSelectedSubject(subj.subject_code);
              if (subj.chapters.length > 0) {
                setExpandedChapters({ [subj.chapters[0].chapter_number]: true });
              }
            }}
          >
            <BookIcon width={16} height={16} />
            <span className="chip-label">{subj.subject_name}</span>
            <span className="chip-badge">{subj.total_lessons} lessons</span>
          </button>
        ))}
      </div>

      {/* Chapters & Lessons Tree */}
      {activeSubject && (
        <div className="subject-detail-workspace">
          <div className="subject-kpi-bar">
            <div className="subject-kpi-info">
              <h3>{activeSubject.subject_name}</h3>
              <p>NCERT Class {user.class_level} Curriculum · {activeSubject.chapters.length} Chapters</p>
            </div>
            <div className="subject-progress-stats">
              <span className="progress-text">
                {activeSubject.completed_lessons} of {activeSubject.total_lessons} lessons studied ({activeSubject.progress_pct}%)
              </span>
              <div className="progress-bar-mini">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${activeSubject.progress_pct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="chapters-accordion-list">
            {activeSubject.chapters.length === 0 ? (
              <div className="empty-state-card">
                <FolderIcon width={32} height={32} />
                <h4>No chapters loaded for {activeSubject.subject_name}</h4>
              </div>
            ) : (
              activeSubject.chapters.map((chapter) => {
                const isExpanded = Boolean(expandedChapters[chapter.chapter_number]);
                return (
                  <div key={chapter.chapter_number} className={`chapter-card ${isExpanded ? "expanded" : ""}`}>
                    <div
                      className="chapter-header-row"
                      onClick={() => toggleChapter(chapter.chapter_number)}
                    >
                      <div className="chapter-title-group">
                        <span className="chapter-number-pill">Chapter {chapter.chapter_number}</span>
                        <h4 className="chapter-title">{chapter.title}</h4>
                      </div>

                      <div className="chapter-meta-group">
                        <span className="lessons-count-tag">
                          {chapter.lessons_count} {chapter.lessons_count === 1 ? "lesson" : "lessons"}
                        </span>
                        {chapter.completed_count > 0 && (
                          <span className="completed-tag">
                            <CheckCircleIcon width={12} height={12} /> {chapter.completed_count} studied
                          </span>
                        )}
                        <span className="expand-chevron">
                          {isExpanded ? <ChevronUpIcon width={16} height={16} /> : <ChevronDownIcon width={16} height={16} />}
                        </span>
                      </div>
                    </div>

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
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronUpIcon(props: any) {
  return (
    <svg width={props.width || 16} height={props.height || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
