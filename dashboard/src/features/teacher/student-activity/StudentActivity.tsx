import { useEffect, useState } from "react";
import { getTeacherActivity, getTeacherClasses } from "../../../api";
import { messageOf } from "../../../format";
import type { ActivityLogItem, AuthUser, TeacherClassOverview } from "../../../types";
import {
  AwardIcon,
  CheckCircleIcon,
  FileTextIcon,
  FilterIcon,
  SearchIcon,
  UsersIcon,
  WarningIcon,
} from "../../../components/icons";

interface StudentActivityProps {
  user: AuthUser;
}

export function StudentActivity({ user }: StudentActivityProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<TeacherClassOverview[]>([]);
  const [selectedClassIndex, setSelectedClassIndex] = useState<number>(0);
  const [activityEvents, setActivityEvents] = useState<ActivityLogItem[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [searchStudent, setSearchStudent] = useState<string>("");

  useEffect(() => {
    getTeacherClasses()
      .then((data) => {
        setClasses(data);
      })
      .catch(() => {});
  }, []);

  const fetchActivity = () => {
    setLoading(true);
    const cls = classes[selectedClassIndex];
    getTeacherActivity({
      classLevel: cls?.class_level,
      section: cls?.section,
      limit: 100,
    })
      .then((data) => {
        setActivityEvents(data);
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
    fetchActivity();
  }, [classes, selectedClassIndex]);

  const filteredEvents = activityEvents.filter((ev) => {
    if (eventTypeFilter !== "all" && ev.event_type !== eventTypeFilter) return false;
    if (searchStudent.trim()) {
      const q = searchStudent.toLowerCase();
      if (!ev.student_name.toLowerCase().includes(q) && !ev.lesson_title.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="student-activity-container">
      {/* Header */}
      <div className="activity-header-bar">
        <div>
          <h2>Student Activity &amp; Classroom Timeline</h2>
          <p className="header-subtitle">
            Verified audit trail of classroom engagement and assessment completions across your assigned classes.
          </p>
        </div>
      </div>

      {/* Class Section Selector */}
      {classes.length > 0 && (
        <div className="class-selector-strip" role="tablist">
          {classes.map((cls, idx) => (
            <button
              key={idx}
              type="button"
              className={`class-chip-btn ${selectedClassIndex === idx ? "active" : ""}`}
              onClick={() => setSelectedClassIndex(idx)}
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
      )}

      {/* Distinction Banner */}
      <div className="engagement-vs-learning-banner">
        <div className="banner-item">
          <span className="dot dot-passive" />
          <span><strong>Engagement Events:</strong> Opened Lesson, Accessed Transcript, Read Notes</span>
        </div>
        <div className="banner-item">
          <span className="dot dot-active" />
          <span><strong>Evidence of Learning:</strong> Quiz Completed, Assessed Mastery, Topic Practice</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="activity-filters-row">
        <div className="filter-group">
          <SearchIcon width={16} height={16} />
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search by student or lesson..."
            value={searchStudent}
            onChange={(e) => setSearchStudent(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Event Type:</label>
          <select
            className="filter-select"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
          >
            <option value="all">All Event Types</option>
            <option value="opened">Opened Lesson</option>
            <option value="transcript_read">Transcript Accessed</option>
            <option value="notes_read">Notes Read</option>
            <option value="marked_complete">Marked as Studied</option>
            <option value="quiz_completed">Quiz Completed</option>
          </select>
        </div>
      </div>

      {/* Events Table */}
      <div className="activity-table-card">
        {loading ? (
          <div className="portal-loading-state">
            <div className="spinner" />
            <p>Loading activity events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state-card">
            <CheckCircleIcon width={36} height={36} />
            <h4>No activity recorded for this criteria</h4>
            <p>Student reading and assessment actions will appear here in chronological order.</p>
          </div>
        ) : (
          <table className="activity-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Student</th>
                <th>Class / Sec</th>
                <th>Event Type</th>
                <th>Lesson / Topic</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev) => {
                const isMastery = ev.event_type === "quiz_completed" || ev.event_type === "marked_complete";
                return (
                  <tr key={ev.id}>
                    <td className="timestamp-cell">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                    <td className="student-cell">
                      <strong>{ev.student_name}</strong>
                    </td>
                    <td>Class {ev.class_level}{ev.section}</td>
                    <td>
                      <span className={`event-badge badge-${ev.event_type}`}>
                        {ev.event_type === "opened"
                          ? "Opened Lesson"
                          : ev.event_type === "transcript_read"
                          ? "Transcript Accessed"
                          : ev.event_type === "notes_read"
                          ? "Notes Studied"
                          : ev.event_type === "marked_complete"
                          ? "Marked Complete"
                          : ev.event_type === "quiz_completed"
                          ? "Quiz Completed"
                          : ev.event_type}
                      </span>
                    </td>
                    <td className="lesson-title-cell">{ev.lesson_title}</td>
                    <td>
                      {isMastery ? (
                        <span className="learning-evidence-tag active">Active Learning</span>
                      ) : (
                        <span className="learning-evidence-tag passive">Engagement</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
