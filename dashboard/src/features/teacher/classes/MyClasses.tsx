import { useEffect, useState, type CSSProperties } from "react";
import { getTeacherClasses,getTeacherStudentDetail } from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser, TeacherClassOverview,TeacherClassStudent,TeacherStudentDetail } from "../../../types";
import {
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  GraduationCapIcon,
  SearchIcon,
  TrendingUpIcon,
  UsersIcon,
  WarningIcon,
} from "../../../components/icons";

interface MyClassesProps {
  user: AuthUser;
  onOpenLesson: (lessonId: string) => void;
  onNavigateInsights: () => void;
}

export function MyClasses({ user, onOpenLesson, onNavigateInsights }: MyClassesProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<TeacherClassOverview[]>([]);
  const [profile,setProfile] = useState<TeacherStudentDetail|null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"students" | "chapters" | "timetable" | "lessons">("students");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"all" | "attempted" | "unattempted">("all");

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
  const students = selectedClass.students as TeacherClassStudent[];
  const query = studentSearch.trim().toLowerCase();
  const filteredStudents = students.filter((student) => {
    const matchesSearch = !query
      || student.full_name.toLowerCase().includes(query)
      || (student.student_identifier || "").toLowerCase().includes(query);
    const matchesFilter = studentFilter === "all"
      || (studentFilter === "attempted" ? student.attempts_count > 0 : student.attempts_count === 0);
    return matchesSearch && matchesFilter;
  });
  const studentsWithMastery = students.filter(
    (student): student is TeacherClassStudent & { avg_mastery: number } => typeof student.avg_mastery === "number",
  );
  const averageMastery = studentsWithMastery.length
    ? Math.round(studentsWithMastery.reduce((total, student) => total + student.avg_mastery, 0) / studentsWithMastery.length * 100)
    : 0;
  const studentsWithAttempts = students.filter((student) => student.attempts_count > 0);
  const studentsWithAccuracy = studentsWithAttempts.filter(
    (student): student is TeacherClassStudent & { accuracy: number } => typeof student.accuracy === "number",
  );
  const averageAccuracy = studentsWithAccuracy.length
    ? Math.round(studentsWithAccuracy.reduce((total, student) => total + student.accuracy, 0) / studentsWithAccuracy.length * 100)
    : 0;

  const learningInsight = (student: TeacherClassStudent) => {
    if (!student.attempts_count) return { label: "No quiz attempts yet", kind: "warning" };
    if (student.avg_mastery === null || student.avg_mastery === undefined) return { label: "Mastery unavailable", kind: "neutral" };
    if (student.avg_mastery < 0.6) return { label: "Needs attention", kind: "warning" };
    if (student.avg_mastery >= 0.7) return { label: "Good progress", kind: "positive" };
    return { label: "Keep practising", kind: "neutral" };
  };

  const exportStudents = () => {
    const csvValue = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["Roll / ID", "Student name", "Lessons opened", "Curriculum mastery", "Quiz accuracy", "Last activity", "Learning insight"],
      ...filteredStudents.map((student) => {
        const insight = learningInsight(student);
        return [
          student.student_identifier || student.id,
          student.full_name,
          student.accessed,
          student.avg_mastery == null ? "No data" : `${Math.round(student.avg_mastery * 100)}%`,
          student.attempts_count ? student.accuracy == null ? "Unavailable" : `${Math.round(student.accuracy * 100)}%` : "No attempts",
          student.last_activity || "No activity yet",
          insight.label,
        ];
      }),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvValue).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `class-${selectedClass.class_level}${selectedClass.section}-student-analytics.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="my-classes-container">
      <div className="classes-header-bar">
        <div>
          <h1>My Classes &amp; Student Analytics</h1>
          <p className="header-subtitle">Manage your assigned classes and track each student’s learning progress, performance and activity.</p>
        </div>
      </div>

      <div className="classes-context-row">
        <label className="class-selection-card">
          <span>Teaching assignment</span>
          <select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>
            {classes.map((cls, index) => (
              <option key={`${cls.class_level}-${cls.section}-${cls.subject}`} value={index}>
                Class {cls.class_level}{cls.section} · {cls.subject_label} · Section {cls.section}
              </option>
            ))}
          </select>
        </label>

        <div className="class-tabs-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "students"}
            className={`tab-btn ${activeTab === "students" ? "active" : ""}`}
            onClick={() => setActiveTab("students")}
          >
            <UsersIcon width={15} height={15} />
            Students &amp; Analytics
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chapters"}
            className={`tab-btn ${activeTab === "chapters" ? "active" : ""}`}
            onClick={() => setActiveTab("chapters")}
          >
            <BookIcon width={15} height={15} />
            Syllabus ({selectedClass.chapters.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "timetable"}
            className={`tab-btn ${activeTab === "timetable" ? "active" : ""}`}
            onClick={() => setActiveTab("timetable")}
          >
            <ClockIcon width={15} height={15} />
            Timetable
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "lessons"}
            className={`tab-btn ${activeTab === "lessons" ? "active" : ""}`}
            onClick={() => setActiveTab("lessons")}
          >
            <FileTextIcon width={15} height={15} />
            Lesson History ({selectedClass.lessons.length})
          </button>
        </div>
      </div>

      <div className="selected-class-card">
        <section className="class-performance-overview">
          <h2>Class {selectedClass.class_level}{selectedClass.section} – Performance Overview</h2>
          <div className="class-performance-metrics">
            <div className="class-performance-metric">
              <span className="teacher-stat-icon"><UsersIcon width={20} height={20} /></span>
              <strong>{selectedClass.students_count}</strong>
              <span>Total Students</span>
            </div>
            <div className="class-performance-metric">
              <span className="teacher-stat-icon"><BookIcon width={20} height={20} /></span>
              <strong>{selectedClass.chapters.length}</strong>
              <span>Syllabus Chapters</span>
            </div>
            <div className="class-performance-metric class-mastery-metric">
              <span className="mastery-ring" style={{ "--mastery": `${averageMastery}%` } as CSSProperties}>
                {studentsWithMastery.length ? `${averageMastery}%` : "—"}
              </span>
              <span><strong>Avg. Curriculum</strong><small>Mastery</small></span>
            </div>
            <div className="class-performance-metric">
              <span className="teacher-stat-icon"><CheckCircleIcon width={20} height={20} /></span>
              <strong>{studentsWithAccuracy.length ? `${averageAccuracy}%` : "—"}</strong>
              <span>Avg. Quiz Accuracy</span>
            </div>
          </div>
        </section>

        {/* Students and analytics */}
        {activeTab === "students" && (
          <div className="class-tab-pane">
            <div className="student-analytics-heading">
              <h2><UsersIcon width={18} height={18} /> Students in Class {selectedClass.class_level}{selectedClass.section} ({selectedClass.students_count})</h2>
              <div className="student-analytics-controls">
                <label className="student-search-control">
                  <SearchIcon width={16} height={16} />
                  <input
                    type="search"
                    aria-label="Search students"
                    placeholder="Search student by name or roll number..."
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                  />
                </label>
                <select aria-label="Filter students" value={studentFilter} onChange={(event) => setStudentFilter(event.target.value as typeof studentFilter)}>
                  <option value="all">All Students</option>
                  <option value="attempted">With Quiz Attempts</option>
                  <option value="unattempted">No Quiz Attempts</option>
                </select>
                <button type="button" className="btn btn-outline btn-sm" onClick={exportStudents}>
                  <DownloadIcon width={15} height={15} /> Export
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={onNavigateInsights}>
                  <TrendingUpIcon width={15} height={15} /> Advanced analytics
                </button>
              </div>
            </div>
            <table className="class-data-table">
              <thead>
                <tr>
                  <th>Roll / ID</th>
                  <th>Student Name</th>
                  <th>Lessons opened</th>
                  <th>Curriculum Mastery</th>
                  <th>Quiz accuracy</th>
                  <th>Last activity</th>
                  <th>Learning insight</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 24 }}>
                      {students.length === 0
                        ? `No students currently registered in Class ${selectedClass.class_level}${selectedClass.section}.`
                        : "No students match your search or filter."}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const mastery = st.avg_mastery == null ? null : Math.round(st.avg_mastery * 100);
                    const insight = learningInsight(st);
                    return (
                    <tr key={st.id}>
                      <td>
                        <span className="code-pill">{st.student_identifier || "ID-UNSET"}</span>
                      </td>
                      <td><strong>{st.full_name}</strong></td>
                      <td>{st.accessed}</td>
                      <td>
                        <div className="mastery-cell">
                          <span className="mastery-num">{mastery == null ? "—" : `${mastery}%`}</span>
                          <div className="progress-bar-tiny">
                            <div className="progress-fill" style={{ width: `${mastery ?? 0}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>{st.attempts_count ? st.accuracy == null ? "Unavailable" : `${Math.round(st.accuracy * 100)}%` : "No attempts"}</td>
                      <td>{st.last_activity ? new Date(st.last_activity).toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) : "No activity yet"}</td>
                      <td><span className={`learning-insight insight-${insight.kind}`}>{insight.label}</span></td>
                      <td><button className="btn btn-outline btn-xs" onClick={() => getTeacherStudentDetail(st.student_identifier || st.id).then(setProfile).catch((err) => setError(messageOf(err)))}>View Profile</button></td>
                    </tr>
                  )})
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
