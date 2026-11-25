import { useEffect, useState } from "react";
import { getTeacherClasses,getTeacherStudentDetail } from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser, TeacherClassOverview,TeacherStudentDetail } from "../../../types";
import {
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  GraduationCapIcon,
  UsersIcon,
  WarningIcon,
} from "../../../components/icons";

interface MyClassesProps {
  user: AuthUser;
  onOpenLesson: (lessonId: string) => void;
}

export function MyClasses({ user, onOpenLesson }: MyClassesProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<TeacherClassOverview[]>([]);
  const [profile,setProfile] = useState<TeacherStudentDetail|null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"students" | "chapters" | "timetable" | "lessons">("students");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getTeacherClasses()
      .then((data) => {
        if (isMounted) {
          setClasses(data);
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
      <div className="portal-loading-state">
        <div className="spinner" />
        <p>Loading authorized class sections &amp; enrollments...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-error-card">
        <WarningIcon width={24} height={24} />
        <div>
          <h4>Failed to load classes</h4>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="empty-state-card">
        <UsersIcon width={36} height={36} />
        <h3>No Assigned Classes Found</h3>
        <p>Your faculty profile currently has no class sections assigned. Contact school administration.</p>
      </div>
    );
  }

  if(profile) return <section className="dashboard-card"><button className="btn btn-outline" onClick={()=>setProfile(null)}>Back to roster</button>
    <h2>{profile.student?.full_name || profile.student_id}</h2><p>{profile.student_id} · {profile.total_attempts || 0} quiz answers</p>
    <h3>Topic performance</h3>{profile.topic_analysis?.length?<table className="class-data-table"><thead><tr><th>Topic</th><th>Correct answers</th><th>Mastery</th></tr></thead><tbody>{profile.topic_analysis.map(t=><tr key={t.topic}><td>{t.topic}</td><td>{t.correct} / {t.attempts}</td><td>{Math.round(100*t.score)}%</td></tr>)}</tbody></table>:<p>No quiz attempts yet.</p>}
    <h3>Lesson history</h3>{profile.lesson_history?.length?<ul>{profile.lesson_history.map(e=><li key={e.id}>{e.lesson_title} · {e.event_type.replace(/_/g," ")} · {new Date(e.created_at).toLocaleString()}</li>)}</ul>:<p>No lesson activity yet.</p>}</section>;
  const selectedClass = classes[selectedIndex] || classes[0];

  return (
    <div className="my-classes-container">
      {/* Header */}
      <div className="classes-header-bar">
        <div>
          <h2>My Assigned Classes &amp; Sections</h2>
          <p className="header-subtitle">
            Role-Based Authorization: You have access strictly to your assigned academic sections and students.
          </p>
        </div>
      </div>

      {/* Class Section Selector Strip */}
      <div className="class-selector-strip" role="tablist">
        {classes.map((cls, idx) => (
          <button
            key={idx}
            type="button"
            className={`class-chip-btn ${selectedIndex === idx ? "active" : ""}`}
            onClick={() => setSelectedIndex(idx)}
          >
            <div className="chip-badge-letter">
              Class {cls.class_level}{cls.section}
            </div>
            <div className="chip-title-col">
              <span className="chip-subject">{cls.subject_label}</span>
              <span className="chip-count">{cls.students_count} students</span>
            </div>
          </button>
        ))}
      </div>

      {/* Selected Class Workspace */}
      <div className="selected-class-card">
        <div className="class-card-hero">
          <div className="hero-class-badge">
            Class {selectedClass.class_level}{selectedClass.section}
          </div>
          <div className="hero-class-info">
            <h3>{selectedClass.subject_label}</h3>
            <p>
              Section {selectedClass.section} · {selectedClass.students_count} Enrolled Students · {selectedClass.chapters.length} Syllabus Chapters
            </p>
          </div>
        </div>

        {/* 4 Tabs */}
        <div className="class-tabs-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "students"}
            className={`tab-btn ${activeTab === "students" ? "active" : ""}`}
            onClick={() => setActiveTab("students")}
          >
            <UsersIcon width={15} height={15} />
            Enrolled Students ({selectedClass.students_count})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chapters"}
            className={`tab-btn ${activeTab === "chapters" ? "active" : ""}`}
            onClick={() => setActiveTab("chapters")}
          >
            <BookIcon width={15} height={15} />
            Syllabus Chapters ({selectedClass.chapters.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "timetable"}
            className={`tab-btn ${activeTab === "timetable" ? "active" : ""}`}
            onClick={() => setActiveTab("timetable")}
          >
            <ClockIcon width={15} height={15} />
            Section Timetable
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "lessons"}
            className={`tab-btn ${activeTab === "lessons" ? "active" : ""}`}
            onClick={() => setActiveTab("lessons")}
          >
            <FileTextIcon width={15} height={15} />
            Classroom Lesson History ({selectedClass.lessons.length})
          </button>
        </div>

        {/* TAB 1: ENROLLED STUDENTS */}
        {activeTab === "students" && (
          <div className="class-tab-pane">
            <table className="class-data-table">
              <thead>
                <tr>
                  <th>Roll / ID</th>
                  <th>Student Name</th>
                  <th>Lessons opened</th>
                  <th>Last activity</th>
                  <th>Curriculum Mastery</th>
                  <th>Quiz accuracy</th>
                </tr>
              </thead>
              <tbody>
                {selectedClass.students.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      No students currently registered in Class {selectedClass.class_level}{selectedClass.section}.
                    </td>
                  </tr>
                ) : (
                  selectedClass.students.map((st: any) => (
                    <tr key={st.id}>
                      <td>
                        <span className="code-pill">{st.student_identifier || "ID-UNSET"}</span>
                      </td>
                      <td><button className="btn btn-outline" onClick={()=>getTeacherStudentDetail(st.student_identifier || st.id).then(setProfile).catch(e=>setError(messageOf(e)))}>{st.full_name}</button></td>
                      <td>{st.accessed}</td>
                      <td>{st.last_activity?new Date(st.last_activity).toLocaleString():"No activity yet"}</td>
                      <td>
                        <div className="mastery-cell">
                          <span className="mastery-num">{Math.round((st.avg_mastery || 0.5) * 100)}%</span>
                          <div className="progress-bar-tiny">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.round((st.avg_mastery || 0.5) * 100)}%`,
                                backgroundColor: st.avg_mastery >= 0.75 ? "var(--color-success)" : st.avg_mastery < 0.5 ? "var(--color-danger)" : "var(--color-warning)",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>{st.attempts_count?Math.round(st.accuracy*100)+"%":"No attempts"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: CHAPTERS */}
        {activeTab === "chapters" && (
          <div className="class-tab-pane">
            <div className="chapters-grid">
              {selectedClass.chapters.map((ch) => (
                <div key={ch.chapter_number} className="chapter-info-box">
                  <div className="box-number">Chapter {ch.chapter_number}</div>
                  <h4>{ch.title}</h4>
                  <p>{ch.description || "NCERT Aligned Curriculum Chapter"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: TIMETABLE */}
        {activeTab === "timetable" && (
          <div className="class-tab-pane">
            <table className="class-data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Time Slot</th>
                  <th>Subject</th>
                  <th>Assigned Faculty</th>
                </tr>
              </thead>
              <tbody>
                {selectedClass.timetable.map((slot) => (
                  <tr key={slot.id}>
                    <td><strong>{slot.day_of_week}</strong></td>
                    <td>Period {slot.period}</td>
                    <td>{slot.time_slot}</td>
                    <td>{slot.subject}</td>
                    <td>{slot.teacher_name || "Faculty"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: LESSON HISTORY */}
        {activeTab === "lessons" && (
          <div className="class-tab-pane">
            <table className="class-data-table">
              <thead>
                <tr>
                  <th>Lesson Title</th>
                  <th>Teaching Date</th>
                  <th>Chapter</th>
                  <th>Materials</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedClass.lessons.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      No lessons published yet for Class {selectedClass.class_level}{selectedClass.section}.
                    </td>
                  </tr>
                ) : (
                  selectedClass.lessons.map((lesson) => (
                    <tr key={lesson.id}>
                      <td className="lesson-name-bold">{lesson.title}</td>
                      <td>{lesson.teaching_date}</td>
                      <td>Chapter {lesson.chapter_number}: {lesson.chapter_title}</td>
                      <td>
                        <div className="material-badges-row">
                          {lesson.has_transcript && <span className="badge-micro badge-transcript">Transcript</span>}
                          {lesson.has_notes && <span className="badge-micro badge-notes">Notes</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${lesson.status}`}>
                          {lesson.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => onOpenLesson(lesson.id)}
                        >
                          View Lesson
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
