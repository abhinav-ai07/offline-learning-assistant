import { useEffect, useState } from "react";
import { archiveTeacherLesson, getTeacherLessons, publishTeacherLesson } from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser, LessonSummary } from "../../../types";
import {
  ArchiveIcon,
  BookIcon,
  CheckCircleIcon,
  EditIcon,
  FileTextIcon,
  FilterIcon,
  FolderIcon,
  SearchIcon,
  WarningIcon,
} from "../../../components/icons";

interface LessonLibraryProps {
  user: AuthUser;
  onOpenLesson: (lessonId: string) => void;
  onEditInStudio: (lessonId: string) => void;
}

export function LessonLibrary({ user, onOpenLesson, onEditInStudio }: LessonLibraryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [allLessons, setAllLessons] = useState<LessonSummary[]>([]);

  // Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<number | undefined>(undefined);

  const fetchLessons = () => {
    setLoading(true);
    getTeacherLessons({
      classLevel: classFilter,
      subject: subjectFilter === "all" ? undefined : subjectFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() || undefined,
    })
      .then((data) => {
        setLessons(data);
        setError(null);
      })
      .catch((err) => {
        setError(messageOf(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLessons();
  }, [statusFilter, subjectFilter, classFilter]);

  useEffect(() => {
    let isMounted = true;
    getTeacherLessons()
      .then((data) => {
        if (isMounted) setAllLessons(data);
      })
      .catch((err) => {
        if (isMounted) setError(messageOf(err));
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLessons();
  };

  const handlePublishClick = async (lessonId: string) => {
    if (!window.confirm("Publish this lesson to the class daily timeline?")) return;
    try {
      await publishTeacherLesson(lessonId);
      fetchLessons();
      getTeacherLessons().then(setAllLessons).catch((err) => setError(messageOf(err)));
    } catch (err) {
      alert(messageOf(err));
    }
  };

  const handleArchiveClick = async (lessonId: string) => {
    if (!window.confirm("Archive this lesson? It will be hidden from student active lists.")) return;
    try {
      await archiveTeacherLesson(lessonId);
      fetchLessons();
      getTeacherLessons().then(setAllLessons).catch((err) => setError(messageOf(err)));
    } catch (err) {
      alert(messageOf(err));
    }
  };

  return (
    <div className="lesson-library-container">
      {/* Top Header */}
      <div className="library-header-bar">
        <div>
          <h2>Lesson Library &amp; Curriculum Archives</h2>
          <p className="header-subtitle">
            Classroom lectures organized by Class &rarr; Subject &rarr; Chapter &rarr; Date.
          </p>
        </div>
      </div>

      <section className="library-stats-grid" aria-label="Lesson library summary">
        <div className="library-stat-card"><span><BookIcon width={20} height={20} /></span><span><strong>{allLessons.length}</strong><small>Total Lessons</small></span></div>
        <div className="library-stat-card"><span><CheckCircleIcon width={20} height={20} /></span><span><strong>{allLessons.filter((lesson) => lesson.status === "published").length}</strong><small>Published</small></span></div>
        <div className="library-stat-card"><span><FileTextIcon width={20} height={20} /></span><span><strong>{allLessons.filter((lesson) => lesson.has_transcript).length}</strong><small>Transcripts</small></span></div>
        <div className="library-stat-card"><span><EditIcon width={20} height={20} /></span><span><strong>{allLessons.filter((lesson) => lesson.has_notes).length}</strong><small>Notes</small></span></div>
      </section>

      {/* Filter and Search Bar */}
      <div className="library-filter-panel">
        <form onSubmit={handleSearchSubmit} className="search-box-wrap">
          <SearchIcon width={16} height={16} />
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search lessons by title, chapter or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            Search
          </button>
        </form>

        <div className="filter-dropdowns-row">
          <div className="filter-group">
            <label>Status:</label>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="ready_for_review">Ready for Review</option>
              <option value="draft">Drafts</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Subject:</label>
            <select
              className="filter-select"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="all">All Subjects</option>
              <option value="science">Science</option>
              <option value="maths">Mathematics</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Class:</label>
            <select
              className="filter-select"
              value={classFilter === undefined ? "all" : String(classFilter)}
              onChange={(e) => setClassFilter(e.target.value === "all" ? undefined : Number(e.target.value))}
            >
              <option value="all">All Classes</option>
              <option value="9">Class 9</option>
              <option value="10">Class 10</option>
              <option value="11">Class 11</option>
              <option value="12">Class 12</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="form-error-alert" style={{ marginBottom: 20 }}>
          <WarningIcon width={16} height={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Table of Lessons */}
      <div className="library-table-card">
        {loading ? (
          <div className="portal-loading-state">
            <div className="spinner" />
            <p>Loading library records...</p>
          </div>
        ) : lessons.length === 0 ? (
          <div className="empty-state-card">
            <FolderIcon width={36} height={36} />
            <h4>No classroom lessons match your filters</h4>
            <p>Create and publish new lessons using Lesson Studio.</p>
          </div>
        ) : (
          <table className="library-data-table">
            <thead>
              <tr>
                <th>Lesson Title</th>
                <th>Academic Location</th>
                <th>Teaching Date</th>
                <th>Materials</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson) => (
                <tr key={lesson.id} className="library-row">
                  <td className="lesson-name-col">
                    <span className="lesson-main-name">{lesson.title}</span>
                    <span className="lesson-sub-meta">Faculty: {lesson.teacher_name || "Faculty"}</span>
                  </td>
                  <td>
                    <span className="location-pill">Class {lesson.class_level}{lesson.section}</span>
                    <span className="subject-pill">{lesson.subject.toUpperCase()}</span>
                    <div className="chapter-meta-text">Ch {lesson.chapter_number}: {lesson.chapter_title}</div>
                  </td>
                  <td>{lesson.teaching_date}</td>
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
                    <div className="row-action-buttons">
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => onOpenLesson(lesson.id)}
                      >
                        View
                      </button>
                      {lesson.status !== "published" && lesson.status !== "archived" && (
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={() => handlePublishClick(lesson.id)}
                        >
                          Publish
                        </button>
                      )}
                      {lesson.status !== "archived" && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleArchiveClick(lesson.id)}
                          title="Archive lesson"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

