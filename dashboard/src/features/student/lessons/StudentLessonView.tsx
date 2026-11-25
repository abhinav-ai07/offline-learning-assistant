import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getStudentLessonDetail,
  markLessonComplete,
  recordLessonActivity,
} from "../../../api";
import { messageOf } from "../../../format";
import type { LessonDetail } from "../../../types";
import {
  ArrowLeftIcon,
  AwardIcon,
  BookIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  MessageSquareIcon,
  PrinterIcon,
  SearchIcon,
  WarningIcon,
} from "../../../components/icons";

interface StudentLessonViewProps {
  lessonId: string;
  studentKey:string;
  onBack: () => void;
  onAskAboutLesson: (lesson: LessonDetail) => void;
  onStartQuiz: (lesson: LessonDetail) => void;
}

type LessonTab = "overview" | "transcript" | "notes" | "concepts" | "examples" | "quiz";

export function StudentLessonView({
  lessonId,studentKey,
  onBack,
  onAskAboutLesson,
  onStartQuiz,
}: StudentLessonViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<LessonTab>("overview");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    getStudentLessonDetail(lessonId)
      .then((data) => {
        if (isMounted) {
          setLesson(data.lesson);
          try {
            const key="ila-recent-subjects-"+studentKey;
            const old: string[]=JSON.parse(localStorage.getItem(key)||"[]");
            localStorage.setItem(key,JSON.stringify([data.lesson.subject,...old.filter(s=>s!==data.lesson.subject)].slice(0,4)));
          } catch { /* Browsers may disable local history. */ }
          setIsCompleted(Boolean(data.completion?.completed));
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
  }, [lessonId]);

  // Record tab reading activities
  const handleTabChange = (tab: LessonTab) => {
    setActiveTab(tab);
    if (tab === "transcript") {
      recordLessonActivity(lessonId, "transcript_read");
    } else if (tab === "notes") {
      recordLessonActivity(lessonId, "notes_read");
    }
  };

  const handleToggleCompleted = async () => {
    const nextState = !isCompleted;
    setIsCompleted(nextState);
    try {
      await markLessonComplete(lessonId, nextState);
    } catch {
      setIsCompleted(!nextState);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadNotes = () => {
    if (!lesson) return;
    const blob = new Blob([lesson.notes_markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${lesson.title.replace(/\s+/g, "_")}_Notes.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyTranscript = () => {
    if (!lesson) return;
    navigator.clipboard.writeText(lesson.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter transcript text based on search term
  const transcriptParagraphs = useMemo(() => {
    if (!lesson || !lesson.transcript) return [];
    const raw = lesson.transcript.split(/\n\n+/).filter((p) => p.trim().length > 0);
    const paras = raw.length > 0 ? raw : [lesson.transcript];
    if (!transcriptSearch.trim()) return paras;
    const q = transcriptSearch.toLowerCase();
    return paras.filter((p) => p.toLowerCase().includes(q));
  }, [lesson, transcriptSearch]);

  if (loading) {
    return (
      <div className="portal-loading-state">
        <div className="spinner" />
        <p>Loading published classroom lesson...</p>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="portal-error-card">
        <WarningIcon width={24} height={24} />
        <div>
          <h4>Unable to load lesson</h4>
          <p>{error || "Lesson not found."}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginTop: 12 }}>
            <ArrowLeftIcon width={14} height={14} /> Back to My Subjects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="student-lesson-viewer">
      {/* Top Action Bar */}
      <div className="lesson-top-bar">
        <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
          <ArrowLeftIcon width={14} height={14} /> Back to Subjects
        </button>

        <div className="lesson-header-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onAskAboutLesson(lesson)}
            title="Ask doubts using this lesson's transcript and notes as context"
          >
            <MessageSquareIcon width={15} height={15} />
            Ask ILA about this Lesson
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onStartQuiz(lesson)}
          >
            <AwardIcon width={15} height={15} />
            Take Lesson Quiz
          </button>

          <button
            type="button"
            className={`btn btn-sm ${isCompleted ? "btn-success" : "btn-primary"}`}
            onClick={handleToggleCompleted}
          >
            <CheckCircleIcon width={15} height={15} />
            {isCompleted ? "Studied & Completed" : "Mark as Studied"}
          </button>
        </div>
      </div>

      {/* Lesson Header Banner */}
      <div className="lesson-hero-card">
        <div className="hero-kicker">
          <span className="badge badge-published">Published Lesson</span>
          <span>Class {lesson.class_level}{lesson.section}</span>
          <span>·</span>
          <span>{lesson.subject.toUpperCase()}</span>
          <span>·</span>
          <span>Chapter {lesson.chapter_number}: {lesson.chapter_title}</span>
        </div>
        <h2 className="lesson-main-title">{lesson.title}</h2>
        <div className="hero-meta-row">
          <span>Faculty: <strong>{lesson.teacher_name || "Classroom Teacher"}</strong></span>
          <span>·</span>
          <span>Teaching Date: {lesson.teaching_date}</span>
          <span>·</span>
          <span>Duration: {Math.round((lesson.duration_s || 0) / 60)} mins</span>
        </div>
      </div>

      {/* 6 Tabs Navigation */}
      <div className="lesson-tabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => handleTabChange("overview")}
        >
          1. Lesson Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "transcript"}
          className={`tab-btn ${activeTab === "transcript" ? "active" : ""}`}
          onClick={() => handleTabChange("transcript")}
        >
          2. Class Transcript
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "notes"}
          className={`tab-btn ${activeTab === "notes" ? "active" : ""}`}
          onClick={() => handleTabChange("notes")}
        >
          3. Generated Notes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "concepts"}
          className={`tab-btn ${activeTab === "concepts" ? "active" : ""}`}
          onClick={() => handleTabChange("concepts")}
        >
          4. Important Concepts ({lesson.key_concepts?.length || 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "examples"}
          className={`tab-btn ${activeTab === "examples" ? "active" : ""}`}
          onClick={() => handleTabChange("examples")}
        >
          5. Examples &amp; Key Points
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "quiz"}
          className={`tab-btn ${activeTab === "quiz" ? "active" : ""}`}
          onClick={() => handleTabChange("quiz")}
        >
          6. Lesson Quiz
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="tab-pane-card">
          <h3>Lesson Summary &amp; Academic Scope</h3>
          <p className="tab-desc">
            This lecture was delivered in class for Class {lesson.class_level}{lesson.section} under NCERT {lesson.subject} syllabus.
          </p>

          <div className="overview-details-grid">
            <div className="detail-item">
              <span className="detail-label">Subject</span>
              <span className="detail-value">{lesson.subject.toUpperCase()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">NCERT Chapter</span>
              <span className="detail-value">Chapter {lesson.chapter_number}: {lesson.chapter_title}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Conducted By</span>
              <span className="detail-value">{lesson.teacher_name || "Faculty"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Classroom Date</span>
              <span className="detail-value">{lesson.teaching_date}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Your Study Status</span>
              <span className={`detail-value ${isCompleted ? "text-success" : "text-warning"}`}>
                {isCompleted ? "Marked as Studied" : "Pending Review"}
              </span>
            </div>
          </div>

          <div className="overview-quick-actions">
            <h4>Recommended Study Workflow</h4>
            <ol className="study-steps-list">
              <li>Read the <strong>Class Transcript</strong> to review what was discussed in the classroom.</li>
              <li>Study the structured <strong>Generated Notes</strong> and download or print them for revision.</li>
              <li>Master the <strong>Important Concepts</strong> and worked <strong>Examples</strong>.</li>
              <li>Test your understanding with the <strong>Lesson Quiz</strong>.</li>
              <li>Ask any doubts using <strong>Ask ILA</strong> to get answers grounded in this lecture.</li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB 2: CLASS TRANSCRIPT */}
      {activeTab === "transcript" && (
        <div className="tab-pane-card">
          <div className="pane-header-actions">
            <div>
              <h3>Teacher's Classroom Transcript</h3>
              <p className="tab-desc">
                Original spoken lecture transcribed using local Faster-Whisper ASR. Grounded directly in classroom audio.
              </p>
            </div>
            <div className="pane-buttons">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleCopyTranscript}
              >
                <CopyIcon width={14} height={14} />
                {copied ? "Copied!" : "Copy Transcript"}
              </button>
            </div>
          </div>

          <div className="transcript-search-bar">
            <SearchIcon width={16} height={16} />
            <input
              type="text"
              placeholder="Search words or phrases within this transcript..."
              value={transcriptSearch}
              onChange={(e) => setTranscriptSearch(e.target.value)}
              className="transcript-search-input"
            />
            {transcriptSearch && (
              <button
                type="button"
                className="btn-clear"
                onClick={() => setTranscriptSearch("")}
              >
                Clear
              </button>
            )}
          </div>

          <div className="transcript-paragraphs-box">
            {transcriptParagraphs.length === 0 ? (
              <div className="empty-state-text">No transcript text found matching "{transcriptSearch}".</div>
            ) : (
              transcriptParagraphs.map((para, i) => (
                <p key={i} className="transcript-paragraph">
                  {para}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GENERATED NOTES */}
      {activeTab === "notes" && (
        <div className="tab-pane-card">
          <div className="pane-header-actions">
            <div>
              <h3>AI-Generated Classroom Notes</h3>
              <p className="tab-desc">
                Structured notes synthesized from this classroom lecture by local LLM. Grounded strictly in the transcript.
              </p>
            </div>
            <div className="pane-buttons">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handlePrint}
                title="Print or save as PDF"
              >
                <PrinterIcon width={14} height={14} /> Print
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleDownloadNotes}
                title="Download notes markdown"
              >
                <DownloadIcon width={14} height={14} /> Download Markdown
              </button>
            </div>
          </div>

          <div className="notes-rendered-content markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {lesson.notes_markdown || "_No notes generated for this lesson._"}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* TAB 4: IMPORTANT CONCEPTS */}
      {activeTab === "concepts" && (
        <div className="tab-pane-card">
          <h3>Key Definitions &amp; Important Concepts</h3>
          <p className="tab-desc">
            Essential academic definitions and terms emphasized during this classroom lesson.
          </p>

          <div className="concepts-cards-grid">
            {(!lesson.key_concepts || lesson.key_concepts.length === 0) ? (
              <div className="empty-state-text">No key concepts registered. Check Generated Notes for topics.</div>
            ) : (
              lesson.key_concepts.map((concept, index) => (
                <div key={index} className="concept-card">
                  <div className="concept-index">#{index + 1}</div>
                  <h4 className="concept-title">{concept.title}</h4>
                  <p className="concept-definition">{concept.definition}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: EXAMPLES & KEY POINTS */}
      {activeTab === "examples" && (
        <div className="tab-pane-card">
          <h3>Examples, Formulas &amp; Worked Points</h3>
          <p className="tab-desc">
            Practical examples, chemical equations, mathematical derivations, or application problems taught in this lesson.
          </p>

          <div className="examples-list">
            {(!lesson.examples || lesson.examples.length === 0) ? (
              <div className="empty-state-text">No additional examples registered for this lecture.</div>
            ) : (
              lesson.examples.map((ex, idx) => (
                <div key={idx} className="example-item-card">
                  <div className="example-badge">Example {idx + 1}</div>
                  <h4 className="example-headline">{ex.title || ex.reaction || ex.type || `Point ${idx + 1}`}</h4>
                  {ex.reaction && (
                    <div className="example-formula-box">
                      <code>{ex.reaction}</code>
                    </div>
                  )}
                  {ex.type && <div className="example-tag">Classification: {ex.type}</div>}
                  {ex.notes && <p className="example-notes">{ex.notes}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: LESSON QUIZ */}
      {activeTab === "quiz" && (
        <div className="tab-pane-card">
          <div className="quiz-launcher-box">
            <AwardIcon width={36} height={36} />
            <h3>Check Understanding: {lesson.title}</h3>
            <p>
              Assess how well you understood the concepts taught in this lecture with an adaptive NCERT-aligned quiz.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onStartQuiz(lesson)}
            >
              Start 5-Question Lesson Quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
