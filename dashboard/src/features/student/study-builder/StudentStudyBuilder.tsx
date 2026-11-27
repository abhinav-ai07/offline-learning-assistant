import { useEffect, useState, type DragEvent, type ChangeEvent } from "react";
import { getClassSubjects } from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser } from "../../../types";
import { CpuIcon, ImageIcon, MicIcon, UploadIcon } from "../../../components/icons";

interface StudentStudyBuilderProps {
  user: AuthUser;
}

type UploadMode = "audio" | "image";

export function StudentStudyBuilder({ user }: StudentStudyBuilderProps) {
  const [subjects, setSubjects] = useState<{ code: string; name: string }[]>([]);
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<UploadMode>("audio");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getClassSubjects(user.class_level)
      .then((items) => {
        if (!active) return;
        setSubjects(items);
        if (items[0]) setSubject((current) => current === "all" || items.some((item) => item.code === current) ? current : items[0].code);
      })
      .catch((cause) => {
        if (active) setError(messageOf(cause));
      });
    return () => {
      active = false;
    };
  }, [user.class_level]);

  const acceptFile = (candidate?: File) => {
    if (!candidate) return;
    const extension = candidate.name.split(".").pop()?.toLowerCase() || "";
    const valid = mode === "audio"
      ? ["wav", "mp3", "m4a"].includes(extension)
      : ["jpg", "jpeg", "png"].includes(extension);
    if (!valid) {
      setFile(null);
      setError(mode === "audio"
        ? "Choose an audio file in WAV, MP3, or M4A format."
        : "Choose an image in JPG, JPEG, or PNG format.");
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  const changeMode = (nextMode: UploadMode) => {
    setMode(nextMode);
    setFile(null);
    setError(null);
  };

  return (
    <div className="student-study-builder">
      <header className="student-page-heading builder-page-heading">
        <div>
          <h1><CpuIcon width={26} height={26} /> Smart Study Builder</h1>
          <p>Turn your lecture material into structured, chapter-wise study content. Upload a lecture or revision recording (audio/image) to begin.</p>
        </div>
        <svg className="builder-illustration" viewBox="0 0 390 150" aria-hidden="true">
          <path d="M8 116c48-35 88-26 133-3 44 22 88 12 129-16 42-29 77-28 120-7v60H8z" fill="#e1f3e7"/>
          <path d="M52 119c44-22 81-18 126 2 41 18 91 5 131-21 28-18 53-19 81-8v48H52z" fill="#cae9d5"/>
          <rect x="177" y="12" width="103" height="79" rx="8" fill="#fff" stroke="#07835d" strokeWidth="5"/>
          <path d="M198 34h60M198 49h47M198 64h57" stroke="#6fbf91" strokeWidth="5" strokeLinecap="round"/>
          <rect x="118" y="57" width="95" height="60" rx="8" fill="#eaf7ef" stroke="#07835d" strokeWidth="5"/>
          <circle cx="165" cy="86" r="13" fill="#08765a"/>
          <path d="m161 78 13 8-13 8z" fill="#fff"/>
          <path d="M145 104v6m8-9v9m8-15v15m8-9v9m8-13v13" stroke="#51a57d" strokeWidth="3" strokeLinecap="round"/>
          <rect x="273" y="69" width="83" height="52" rx="8" fill="#fff" stroke="#07835d" strokeWidth="5"/>
          <circle cx="295" cy="84" r="5" fill="#78bf94"/>
          <path d="m282 111 19-17 12 11 13-14 20 20" fill="none" stroke="#51a57d" strokeWidth="4" strokeLinejoin="round"/>
        </svg>
      </header>

      <section className="builder-input-card" aria-labelledby="builder-input-heading">
        <div className="builder-section-title">
          <span className="builder-step-number">1</span>
          <div>
            <h2 id="builder-input-heading">Topic Scope &amp; Input</h2>
            <p>Choose the subject and chapter for which you want to generate study material.</p>
          </div>
        </div>

        <div className="builder-topic-fields">
          <label>
            Subject
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="all">Auto-detect across all Class {user.class_level} subjects</option>
              {subjects.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Chapter / Topic (Optional)
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Auto-named from content if left blank"/>
          </label>
        </div>

        <div className="builder-upload-modes" role="group" aria-label="Upload type">
          <button type="button" className={mode === "audio" ? "active" : ""} aria-pressed={mode === "audio"} onClick={() => changeMode("audio")}>
            <MicIcon width={22} height={22}/>
            <span><strong>Upload Audio</strong><small>(.wav, .mp3, .m4a)</small></span>
          </button>
          <button type="button" className={mode === "image" ? "active" : ""} aria-pressed={mode === "image"} onClick={() => changeMode("image")}>
            <ImageIcon width={22} height={22}/>
            <span><strong>Upload Image</strong><small>(.jpg, .png, .jpeg)</small></span>
          </button>
        </div>

        <label
          className={`builder-dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input type="file" accept={mode === "audio" ? ".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" : ".jpg,.jpeg,.png,image/jpeg,image/png"} onChange={onFileChange}/>
          <UploadIcon width={34} height={34}/>
          <strong>Drag &amp; drop your file here</strong>
          <span>or</span>
          <span className="builder-browse-button">Browse Files</span>
          {file && <span className="builder-selected-file"><strong>{file.name}</strong> · {Math.ceil(file.size / 1024)} KB</span>}
        </label>
        {error && <p className="builder-upload-message" role="alert">{error}</p>}
        {file && <p className="builder-upload-message" role="status">File selected locally. Student file processing is not available yet.</p>}
      </section>
    </div>
  );
}
