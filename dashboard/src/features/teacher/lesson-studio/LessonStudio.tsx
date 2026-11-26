import { useEffect, useState } from "react";
import {
  createNotes,
  createTeacherLesson,
  getClassChapters, getTeacherClasses,getTeacherLesson,updateTeacherLesson,
  publishTeacherLesson,
  transcribeFile,
} from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser, ChapterInfo, DemoLine } from "../../../types";
import {
  ArrowLeftIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  FileTextIcon,
  MicIcon,
  PlayIcon,
  RefreshCwIcon,
  SparkIcon,
  UploadIcon,
  WarningIcon,
} from "../../../components/icons";
import { AudioRecorder } from "../../../shared/components/AudioRecorder";
import { MathMarkdown } from "../../../shared/components/MathMarkdown";

interface LessonStudioProps {
  user: AuthUser;
  lessonId?: string;
  onLessonPublished: (lessonId: string) => void;
  onNavigateLibrary: () => void;
}

type StudioStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function LessonStudio({
  user,
  onLessonPublished,
  onNavigateLibrary, lessonId,
}: LessonStudioProps) {
  const [currentStep, setCurrentStep] = useState<StudioStep>(1);

  // Step 1: Context State
  const [classLevel, setClassLevel] = useState<number>(user.class_level || 10);
  const [section, setSection] = useState<string>(user.section || "A");
  const [subject, setSubject] = useState<string>("science");
  const [assignments,setAssignments] = useState<{class_level:number;section:string;subject:string}[]>([]);
  const [customChapter,setCustomChapter] = useState("");
  const [audioPath,setAudioPath] = useState<string>();
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [selectedChapterNumber, setSelectedChapterNumber] = useState<number>(1);
  const [lessonTitle, setLessonTitle] = useState("");
  const [teachingDate, setTeachingDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Step 2: Audio State
  const [audioSource, setAudioSource] = useState<"upload" | "record">("upload");
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  // Step 3: Transcription State
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptLines, setTranscriptLines] = useState<DemoLine[]>([]);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Step 4: Notes State
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [notesMarkdown, setNotesMarkdown] = useState("");
  const [notesResult, setNotesResult] = useState<any>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Step 5 & 6: Saved Lesson & Publishing State
  const [createdLessonId, setCreatedLessonId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);

  useEffect(()=>{
    getTeacherClasses().then(rows=>{
      setAssignments(rows);
      if(rows[0] && !lessonId){setClassLevel(rows[0].class_level);setSection(rows[0].section);setSubject(rows[0].subject);}
    }).catch(e=>setStudioError(messageOf(e)));
    if(lessonId) getTeacherLesson(lessonId).then(l=>{
      setClassLevel(l.class_level);setSection(l.section);setSubject(l.subject);setSelectedChapterNumber(l.chapter_number);
      setNotesResult(l.notes_json);setCustomChapter(l.chapter_title);setLessonTitle(l.title);setTeachingDate(l.teaching_date);setTranscript(l.transcript);setNotesMarkdown(l.notes_markdown);
      setAudioPath(l.audio_path||undefined);setCreatedLessonId(l.id);setCurrentStep(6);
    }).catch(e=>setStudioError(messageOf(e)));
  },[lessonId]);
  // Load chapters when classLevel or subject changes
  useEffect(() => {
    getClassChapters(classLevel, subject)
      .then((data) => {
        setChapters(data);
        if (data.length > 0 && !lessonId) {
          setSelectedChapterNumber(data[0].chapter_number);
          if (!lessonTitle) {
            setLessonTitle(`${data[0].title} — Lecture`);
          }
        }
      })
      .catch(() => {});
  }, [classLevel, subject]);

  const activeChapter = chapters.find((c) => c.chapter_number === selectedChapterNumber) || {
    chapter_number: selectedChapterNumber,
    title: customChapter.trim(),
  };

  // Step 2: Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedAudioFile(file);
    }
  };

  // Step 2: Handle Browser Recording Complete
  const handleRecordingComplete = (file: File, durationSecs: number, liveLines?: DemoLine[]) => {
    setSelectedAudioFile(file);
    setAudioDuration(durationSecs);
    if (liveLines && liveLines.length > 0) {
      setTranscriptLines(liveLines);
      setTranscript(liveLines.map((l) => l.text).join(" "));
    }
  };

  // Step 3: Run Faster-Whisper Transcription on uploaded/recorded file
  const handleRunTranscription = async () => {
    if (!selectedAudioFile) {
      setTranscribeError("Please select or record an audio file first.");
      return;
    }
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const resp = await transcribeFile(selectedAudioFile, {
        classLevel,
        subject,
        profile: "auto",
        useLlm: false, // We generate notes in the dedicated step 4
      });

      setAudioPath(resp.audio_path);
      setTranscript(resp.transcript || "");
      const lines: DemoLine[] = resp.lines?.map((l: any) => ({
        text: l.text,
        start: l.start || 0,
        end: l.end || 0,
      })) || [];
      setTranscriptLines(lines);
      setCurrentStep(4); // Go to transcript preview
    } catch (err) {
      setTranscribeError(messageOf(err));
    } finally {
      setTranscribing(false);
    }
  };

  // Step 4: Run Structured Notes Generation
  const handleGenerateNotes = async () => {
    if (!transcript.trim()) {
      setNotesError("Cannot generate notes without a transcript. Please provide or transcribe classroom audio.");
      return;
    }
    setGeneratingNotes(true);
    setNotesError(null);
    try {
      let lines = transcriptLines;
      if (!lines || lines.length === 0) {
        lines = transcript.split(/(?<=[.?!])\s+/).map((sentence, idx) => ({
          text: sentence,
          start: idx * 4,
          end: (idx + 1) * 4,
        }));
      }

      const resp = await createNotes({
        lines,
        title: lessonTitle,
        class_level: classLevel,
        subject,
        profile: "auto",
        use_llm: true,
        use_syllabus: true,
      });

      setNotesMarkdown(resp.markdown);
      setNotesResult(resp.notes);
      setCurrentStep(6); // Go to review step
    } catch (err) {
      setNotesError(messageOf(err));
    } finally {
      setGeneratingNotes(false);
    }
  };

  async function saveLesson(payload: Parameters<typeof createTeacherLesson>[0]) {
    if(createdLessonId){ await updateTeacherLesson(createdLessonId,payload);return {lesson_id:createdLessonId}; }
    return createTeacherLesson(payload);
  }
  // Step 5: Save as Draft
  const handleSaveDraft = async () => {
    setStudioError(null);
    try {
      const resp = await saveLesson({
        title: lessonTitle,
        class_level: classLevel,
        section,
        subject,
        chapter_number: activeChapter.chapter_number,
        chapter_title: activeChapter.title,
        teaching_date: teachingDate,
        transcript,
        notes_markdown: notesMarkdown,
        notes_json: notesResult || {},
        status: "draft",
        audio_filename: selectedAudioFile?.name,
        audio_path: audioPath,
      });
      setCreatedLessonId(resp.lesson_id);
      alert("Lesson successfully saved as Draft! You can view or publish it anytime from the Lesson Library.");
      onNavigateLibrary();
    } catch (err) {
      setStudioError(messageOf(err));
    }
  };

  // Step 6: Publish to Class
  const handlePublish = async () => {
    setPublishing(true);
    setStudioError(null);
    try {
      // 1. Create lesson in ready_for_review / draft first
      const createResp = await saveLesson({
        title: lessonTitle,
        class_level: classLevel,
        section,
        subject,
        chapter_number: activeChapter.chapter_number,
        chapter_title: activeChapter.title,
        teaching_date: teachingDate,
        transcript,
        notes_markdown: notesMarkdown,
        notes_json: notesResult || {},
        status: "ready_for_review",
        audio_filename: selectedAudioFile?.name,
        audio_path: audioPath,
      });

      const lessonId = createResp.lesson_id;
      setCreatedLessonId(lessonId);

      // 2. Publish to Class
      const pubResp = await publishTeacherLesson(lessonId);
      setPublishSuccess(pubResp.message);
      setTimeout(() => {
        onLessonPublished(lessonId);
      }, 1500);
    } catch (err) {
      setStudioError(messageOf(err));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="lesson-studio-container">
      {/* Studio Header */}
      <div className="studio-header-strip">
        <div>
          <h2>Lesson Studio — Core Teacher Workflow</h2>
          <p className="header-subtitle">
            Prepare a dated classroom lesson and review its transcript and notes before publication.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onNavigateLibrary}>
          View Lesson Library
        </button>
      </div>

      {/* Stepper Bar */}
      <nav className="studio-stepper" aria-label="Publishing steps">
        {(["Lecture details","Record or upload","Generate transcript","Review transcript","Generate notes","Review notes","Publish"] as const).map((title,i)=>{
          const step=i+1 as StudioStep;
          const enabled=step===1 || (step===2 && lessonTitle.trim() && activeChapter.title) || (step===3 && selectedAudioFile) || ((step===4 || step===5) && transcript.trim()) || (step>=6 && notesMarkdown.trim());
          return <button key={title} type="button" aria-current={step===currentStep?"step":undefined} className="step-item" disabled={!enabled || transcribing || generatingNotes || publishing} onClick={()=>setCurrentStep(step)}><span>{i+1}</span>{title}</button>;
        })}
      </nav>

      {/* Global studio alerts */}
      {studioError && (
        <div className="form-error-alert" style={{ marginBottom: 20 }}>
          <WarningIcon width={16} height={16} />
          <span>{studioError}</span>
        </div>
      )}

      {publishSuccess && (
        <div className="form-success-alert" style={{ marginBottom: 20 }}>
          <CheckCircleIcon width={18} height={18} />
          <span>{publishSuccess}</span>
        </div>
      )}

      {/* ===================== STEP 1: ACADEMIC CONTEXT ===================== */}
      {currentStep === 1 && (
        <div className="studio-card">
          <h3>Step 1: Academic Location &amp; Lesson Identity</h3>
          <p className="tab-desc">
            Define the class, section, subject, NCERT chapter, and date for this classroom lesson.
          </p>

          <div className="form-grid">
            <div className="form-row">
              <div className="form-group form-col">
                <label>Teaching assignment</label>
                <select className="form-select" value={JSON.stringify([classLevel,section,subject])} onChange={e=>{
                  const [level,sec,sub] = JSON.parse(e.target.value);
                  setClassLevel(level);setSection(sec);setSubject(sub);
                }}>{assignments.map(a=>{const key=JSON.stringify([a.class_level,a.section,a.subject]);return <option key={key} value={key}>Class {a.class_level}{a.section} · {a.subject}</option>})}</select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group form-col" style={{ flex: 2 }}>
                <label>NCERT Chapter *</label>
                <select
                  className="form-select"
                  value={selectedChapterNumber}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    setSelectedChapterNumber(num);
                    const ch = chapters.find((c) => c.chapter_number === num);
                    if (ch) setLessonTitle(`${ch.title} — Lecture`);
                  }}
                >
                  <option value={Math.max(0,...chapters.map(c=>c.chapter_number))+1}>New chapter</option>
                  {chapters.map((ch) => (
                    <option key={ch.chapter_number} value={ch.chapter_number}>
                      Chapter {ch.chapter_number}: {ch.title}
                    </option>
                  ))}
                </select>{!chapters.some(c=>c.chapter_number===selectedChapterNumber) && <label>Chapter title<input required value={customChapter} onChange={e=>setCustomChapter(e.target.value)}/></label>}
              </div>

              <div className="form-group form-col">
                <label>Teaching Date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={teachingDate}
                  onChange={(e) => setTeachingDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Lesson Title *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Chemical Reactions and Equations — Types of Reactions"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                required
              />
              <small className="form-hint">A clear title helps students locate today's material in their dashboard.</small>
            </div>
          </div>

          <div className="studio-step-actions">
            <span />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrentStep(2)}
              disabled={!lessonTitle.trim() || !activeChapter.title || !assignments.length}
            >
              Continue to Step 2: Classroom Audio <ChevronRightIcon width={16} height={16} />
            </button>
          </div>
        </div>
      )}

      {/* ===================== STEP 2: CLASSROOM AUDIO ===================== */}
      {currentStep === 2 && (
        <div className="studio-card">
          <h3>Step 2: Provide Classroom Audio</h3>
          <p className="tab-desc">
            Provide the spoken audio recorded during today's classroom lecture. Choose between direct browser microphone recording or uploading an existing audio file.
          </p>

          <div className="audio-mode-selector">
            <button
              type="button"
              className={`mode-btn ${audioSource === "upload" ? "active" : ""}`}
              onClick={() => setAudioSource("upload")}
            >
              <UploadIcon width={18} height={18} />
              Upload Audio File (.wav, .mp3, .m4a)
            </button>
            <button
              type="button"
              className={`mode-btn ${audioSource === "record" ? "active" : ""}`}
              onClick={() => setAudioSource("record")}
            >
              <MicIcon width={18} height={18} />
              Record with Browser Microphone
            </button>
          </div>

          {audioSource === "upload" ? (
            <div className="upload-dropzone">
              <input
                type="file"
                id="audio-file-input"
                accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <label htmlFor="audio-file-input" className="dropzone-label">
                <UploadIcon width={36} height={36} />
                <h4>Select classroom audio file</h4>
                <p>Supports WAV, MP3, M4A, OGG, and WEBM up to 250MB</p>
                {selectedAudioFile ? (
                  <div className="selected-file-chip">
                    <FileTextIcon width={15} height={15} />
                    <span>Selected: <strong>{selectedAudioFile.name}</strong> ({Math.round(selectedAudioFile.size / 1024 / 1024)} MB)</span>
                  </div>
                ) : (
                  <span className="btn btn-outline btn-sm">Browse Local Files</span>
                )}
              </label>
            </div>
          ) : (
            <AudioRecorder onRecordingComplete={handleRecordingComplete} />
          )}

          <div className="studio-step-actions"><button className="btn btn-primary" disabled={!selectedAudioFile} onClick={()=>setCurrentStep(3)}>Continue to transcription</button></div>
        </div>
      )}
      {currentStep === 3 && (
        <div className="studio-step-card"><h3>Generate transcript</h3><p>{selectedAudioFile?.name}</p>
          {transcribeError && (
            <div className="form-error-alert" style={{ marginTop: 16 }}>
              <WarningIcon width={16} height={16} />
              <span>{transcribeError}</span>
            </div>
          )}

          <div className="studio-step-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(1)}>
              <ArrowLeftIcon width={14} height={14} /> Back to Context
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunTranscription}
              disabled={!selectedAudioFile || transcribing}
            >
              {transcribing ? (
                <>
                  <RefreshCwIcon width={16} height={16} className="spin" />
                  Transcribing with Faster-Whisper...
                </>
              ) : (
                <>
                  Generate Transcript with Whisper <ChevronRightIcon width={16} height={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ===================== STEP 3: TRANSCRIPT PREVIEW & EDIT ===================== */}
      {currentStep === 4 && (
        <div className="studio-card">
          <div className="card-header-bar">
            <div>
              <h3>Step 3: Verify Classroom Transcript</h3>
              <p className="tab-desc">
                Transcribed locally using Faster-Whisper ASR. You may edit any technical terms or spoken words before generating notes.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleRunTranscription}
              disabled={transcribing}
            >
              <RefreshCwIcon width={14} height={14} /> Retry Transcription
            </button>
          </div>

          <div className="transcript-editor-box">
            <textarea
              className="form-textarea transcript-textarea"
              rows={12}
              value={transcript}
              onChange={(e) => {setTranscript(e.target.value);setTranscriptLines([]);}}
              placeholder="Spoken classroom transcript..."
            />
          </div>

          {notesError && (
            <div className="form-error-alert" style={{ marginTop: 16 }}>
              <WarningIcon width={16} height={16} />
              <span>{notesError}</span>
            </div>
          )}

          <div className="studio-step-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(2)}>
              <ArrowLeftIcon width={14} height={14} /> Back to Audio
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateNotes}
              disabled={!transcript.trim() || generatingNotes}
            >
              {generatingNotes ? (
                <>
                  <SparkIcon width={16} height={16} className="spin" />
                  Generating Structured Notes via Local LLM...
                </>
              ) : (
                <>
                  Generate Structured Notes <SparkIcon width={16} height={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ===================== STEP 4: NOTES GENERATION ===================== */}
      {currentStep === 5 && (
        <div className="studio-card">
          <h3>Step 4: Generate Structured Notes</h3>
          <p className="tab-desc">
            Local LLM synthesizes structured topic headings, definitions, teacher explanations, examples, and key takeaways strictly from the verified transcript.
          </p>

          {notesError && (
            <div className="form-error-alert" style={{ marginBottom: 16 }}>
              <WarningIcon width={16} height={16} />
              <span>{notesError}</span>
            </div>
          )}

          <div className="notes-generation-trigger-card">
            <SparkIcon width={36} height={36} />
            <h4>Ready to synthesize notes for Class {classLevel}{section} {subject.toUpperCase()}</h4>
            <p>Transcript length: {transcript.split(/\s+/).length} words · Chapter: {activeChapter.title}</p>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleGenerateNotes}
              disabled={generatingNotes}
            >
              {generatingNotes ? "Synthesizing Notes..." : "Synthesize Structured Notes"}
            </button>
          </div>
        </div>
      )}

      {/* ===================== STEP 5: REVIEW & EDIT ===================== */}
      {currentStep === 6 && (
        <div className="studio-card">
          <div className="card-header-bar">
            <div>
              <h3>Step 5: Review &amp; Edit Notes Before Publishing</h3>
              <p className="tab-desc">
                Review the AI-generated notes. You can edit Markdown text directly to adjust wording for your students.
              </p>
            </div>
            <div className="pane-buttons">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleGenerateNotes}
                disabled={generatingNotes}
              >
                <RefreshCwIcon width={14} height={14} /> Regenerate Notes
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSaveDraft}
              >
                Save as Draft
              </button>
            </div>
          </div>

          <div className="review-split-view">
            {/* Left: Markdown Editor */}
            <div className="review-editor-pane">
              <label className="pane-label">
                <EditIcon width={14} height={14} /> Notes Markdown Editor
              </label>
              <textarea
                className="form-textarea notes-editor-textarea"
                rows={16}
                value={notesMarkdown}
                onChange={(e) => setNotesMarkdown(e.target.value)}
              />
            </div>

            {/* Right: Live Preview */}
            <div className="review-preview-pane">
              <label className="pane-label">Student View Preview</label>
              <MathMarkdown className="preview-markdown-box markdown-body">
                {notesMarkdown || "_No notes content._"}
              </MathMarkdown>
            </div>
          </div>

          <div className="studio-step-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(4)}>
              <ArrowLeftIcon width={14} height={14} /> Back to Transcript
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrentStep(7)}
              disabled={!notesMarkdown.trim()}
            >
              Proceed to Step 6: Publish to Class <ChevronRightIcon width={16} height={16} />
            </button>
          </div>
        </div>
      )}

      {/* ===================== STEP 6: PUBLISH TO CLASS ===================== */}
      {currentStep === 7 && (
        <div className="studio-card">
          <h3>Step 6: Publish Classroom Lesson</h3>
          <p className="tab-desc">
            Publish this lecture to the daily timeline for Class {classLevel}{section}. Once published, all enrolled students will immediately receive in-app notifications and access.
          </p>

          <div className="publish-summary-card">
            <div className="summary-row">
              <span className="summary-label">Target Audience:</span>
              <span className="summary-value"><strong>Class {classLevel}{section}</strong> ({subject.toUpperCase()})</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">NCERT Chapter:</span>
              <span className="summary-value">Chapter {activeChapter.chapter_number}: {activeChapter.title}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Lesson Title:</span>
              <span className="summary-value"><strong>{lessonTitle}</strong></span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Teaching Date:</span>
              <span className="summary-value">{teachingDate}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Classroom Materials:</span>
              <span className="summary-value">Verified Transcript + Formatted Structured Notes</span>
            </div>
          </div>

          <div className="publish-confirm-box">
            <CheckCircleIcon width={28} height={28} />
            <div>
              <h4>Ready to Publish to Class {classLevel}{section}</h4>
              <p>
                Students will be able to review what was taught today, access notes, and solve doubts with Ask ILA.
              </p>
            </div>
          </div>

          <div className="studio-step-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(6)}>
              <ArrowLeftIcon width={14} height={14} /> Back to Review
            </button>

            <div className="publish-actions-right">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSaveDraft}
              >
                Save as Draft Only
              </button>

              <button
                type="button"
                className="btn btn-primary btn-publish-final"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <>
                    <RefreshCwIcon width={16} height={16} className="spin" />
                    Publishing to Class {classLevel}{section}...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon width={18} height={18} />
                    Publish to Class Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
