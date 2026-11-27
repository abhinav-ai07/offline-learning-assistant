import { useEffect, useState } from "react";
import { getClassSubjects, studentTranscribeFile } from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser, DemoLine, StudentTranscribeResponse, SubjectInfo } from "../../../types";
import {
  BookIcon,
  CheckCircleIcon,
  CopyIcon,
  FileTextIcon,
  MicIcon,
  RefreshCwIcon,
  SparkIcon,
  UploadIcon,
  WarningIcon,
} from "../../../components/icons";
import { AudioRecorder } from "../../../shared/components/AudioRecorder";
import { MathMarkdown } from "../../../shared/components/MathMarkdown";

interface StudentTranscriptViewProps {
  user: AuthUser;
  onOpenLesson: (lessonId: string) => void;
  onNavigateSubjects: () => void;
}

export function StudentTranscriptView({
  user,
  onOpenLesson,
  onNavigateSubjects,
}: StudentTranscriptViewProps) {
  const classLevel = user.class_level || 10;
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("auto");
  const [customTitle, setCustomTitle] = useState("");
  const [audioSource, setAudioSource] = useState<"upload" | "record">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [liveLines, setLiveLines] = useState<DemoLine[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudentTranscribeResponse | null>(null);
  const [previewTab, setPreviewTab] = useState<"notes" | "transcript">("notes");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getClassSubjects(classLevel)
      .then((rows) => setSubjects(rows))
      .catch(() => {});
  }, [classLevel]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setLiveLines([]);
      setError(null);
    }
  };

  const handleRecordingComplete = (file: File, _dur: number, micLines?: DemoLine[]) => {
    setSelectedFile(file);
    setLiveLines(micLines || []);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("Please upload or record an audio file first.");
      return;
    }
    const usePrecomputedMicLines = audioSource === "record" && liveLines.length > 0;
    setProcessing(true);
    setError(null);
    setResult(null);
    try {
      const resp = await studentTranscribeFile(selectedFile, {
        subject: selectedSubject,
        profile: "auto",
        useLlm: true,
        title: customTitle.trim() || undefined,
        lines: usePrecomputedMicLines ? liveLines : undefined,
      });
      setResult(resp);
      setPreviewTab(resp.markdown ? "notes" : "transcript");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!result?.transcript) return;
    navigator.clipboard.writeText(result.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setResult(null);
    setSelectedFile(null);
    setLiveLines([]);
    setCustomTitle("");
    setError(null);
  };

  return (
    <div className="student-transcribe-container">
      <div className="subjects-header-banner">
        <div>
          <h2>Audio Transcript &amp; Smart Chapter Notes</h2>
          <p className="header-subtitle">
            Upload or record lecture/revision audio for Class {classLevel}. On-device ASR transcribes the speech, verifies syllabus topic correlation (rejecting off-topic audio), generates structured notes, and files it into the matching chapter.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onNavigateSubjects}>
          <BookIcon width={14} height={14} /> Browse My Subjects
        </button>
      </div>

      <div className="studio-card">
        <h3>1. Topic Scope &amp; Audio Input</h3>
        <p className="tab-desc">
          Choose a specific subject or let ILA auto-detect the subject and chapter from your Class {classLevel} curriculum.
        </p>

        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group form-col">
              <label htmlFor="student-subject-select">Subject Scope</label>
              <select
                id="student-subject-select"
                className="form-select"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={processing}
              >
                <option value="auto">Auto-detect across all Class {classLevel} subjects</option>
                {subjects.map((subj) => (
                  <option key={subj.code} value={subj.code}>
                    {subj.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group form-col">
              <label htmlFor="student-audio-title">Note Title (Optional)</label>
              <input
                id="student-audio-title"
                type="text"
                className="form-input"
                placeholder="Auto-named from matched chapter if blank"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                disabled={processing}
              />
            </div>
          </div>
        </div>

        <div className="audio-mode-selector">
          <button
            type="button"
            className={`mode-btn ${audioSource === "upload" ? "active" : ""}`}
            onClick={() => setAudioSource("upload")}
            disabled={processing}
          >
            <UploadIcon width={18} height={18} />
            Upload Audio File (.wav, .mp3, .m4a)
          </button>
          <button
            type="button"
            className={`mode-btn ${audioSource === "record" ? "active" : ""}`}
            onClick={() => setAudioSource("record")}
            disabled={processing}
          >
            <MicIcon width={18} height={18} />
            Record with Microphone
          </button>
        </div>

        {audioSource === "upload" ? (
          <div className="upload-dropzone">
            <input
              type="file"
              id="student-audio-file-input"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
              onChange={handleFileChange}
              style={{ display: "none" }}
              disabled={processing}
            />
            <label htmlFor="student-audio-file-input" className="dropzone-label">
              <UploadIcon width={34} height={34} />
              <h4>Select lecture or study audio file</h4>
              <p>Supports WAV, MP3, M4A, OGG, and WEBM up to 250MB</p>
              {selectedFile ? (
                <div className="selected-file-chip">
                  <FileTextIcon width={15} height={15} />
                  <span>
                    Selected: <strong>{selectedFile.name}</strong>{" "}
                    ({Math.max(0.1, selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
              ) : (
                <span className="btn btn-outline btn-sm">Browse Local Files</span>
              )}
            </label>
          </div>
        ) : (
          <AudioRecorder onRecordingComplete={handleRecordingComplete} />
        )}

        {error && (
          <div className="form-error-alert" role="alert" style={{ marginTop: 16 }}>
            <WarningIcon width={16} height={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="studio-step-actions">
          <span className="subtext">
            Off-topic audio with no correlation to Class {classLevel} syllabus topics will be rejected automatically.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!selectedFile || processing}
          >
            {processing ? (
              <>
                <RefreshCwIcon width={16} height={16} className="spin" />
                Transcribing &amp; Verifying Syllabus Match...
              </>
            ) : (
              <>
                <SparkIcon width={16} height={16} />
                Transcribe &amp; Sort Into Chapter
              </>
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className="studio-card">
          <div className="auto-sorted-banner">
            <div className="auto-sorted-info">
              <div className="auto-sorted-kicker">
                <CheckCircleIcon width={16} height={16} />
                <span>Verified &amp; Automatically Sorted Into Chapter</span>
              </div>
              <h3>{result.title}</h3>
              <p className="tab-desc" style={{ marginBottom: 8 }}>
                Filed under <strong>{result.subject_label}</strong> &rarr;{" "}
                <strong>Chapter {result.chapter_number}: {result.chapter_title}</strong>{" "}
                · Syllabus Correlation Score: <strong>{result.correlation_score}</strong>
              </p>
              {result.matched_terms.length > 0 && (
                <div className="matched-terms-row">
                  <span className="subtext">Matched syllabus terms:</span>
                  {result.matched_terms.map((term) => (
                    <span key={term} className="chip-subject">{term}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="pane-buttons">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onOpenLesson(result.lesson_id)}
              >
                Open in Lesson Viewer
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onNavigateSubjects}
              >
                View in My Subjects
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
              >
                New Audio
              </button>
            </div>
          </div>

          {result.notes_error && (
            <div className="form-error-alert" style={{ marginBottom: 16 }}>
              <WarningIcon width={16} height={16} />
              <span>Transcript saved, but note synthesis reported: {result.notes_error}</span>
            </div>
          )}

          <div className="lesson-tabs-nav transcript-preview-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "notes"}
              className={`tab-btn ${previewTab === "notes" ? "active" : ""}`}
              onClick={() => setPreviewTab("notes")}
            >
              Structured Notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "transcript"}
              className={`tab-btn ${previewTab === "transcript" ? "active" : ""}`}
              onClick={() => setPreviewTab("transcript")}
            >
              Generated Transcript
            </button>
          </div>

          {previewTab === "notes" ? (
            <div className="student-notes-sheet">
              <MathMarkdown className="markdown-body">
                {result.markdown || "_No structured notes generated._"}
              </MathMarkdown>
            </div>
          ) : (
            <div>
              <div className="pane-header-actions" style={{ marginBottom: 12 }}>
                <span className="subtext">Duration: {Math.round(result.duration_s)}s</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleCopyTranscript}
                >
                  <CopyIcon width={14} height={14} />
                  {copied ? "Copied!" : "Copy Transcript"}
                </button>
              </div>
              <div className="transcript-paragraphs-box">
                <p className="transcript-paragraph">{result.transcript}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
