import { useEffect, useRef, useState } from "react";
import { getClassSubjects, askQuestion, getClassChapters } from "../../../api";
import { messageOf } from "../../../format";
import type { AskResponse, AuthUser, ChapterInfo, DemoLine, LessonDetail } from "../../../types";
import { MathMarkdown } from "../../../shared/components/MathMarkdown";
import {
  BookIcon,
  CheckCircleIcon,
  CpuIcon,
  MessageSquareIcon,
  SparkIcon,
  WarningIcon,
} from "../../../components/icons";

interface AskIlaViewProps {
  user: AuthUser;
  initialLesson?: LessonDetail | null;
}

interface ChatMessage {
  id: string;
  sender: "student" | "ila";
  text: string;
  sources?: any[];
  engine?: string;
  timestamp: string;
}

export function AskIlaView({ user, initialLesson }: AskIlaViewProps) {
  const [subjects,setSubjects] = useState<{code:string;name:string}[]>([]);
  useEffect(()=>{getClassSubjects(user.class_level).then(setSubjects).catch(e=>setError(messageOf(e)));},[user.class_level]);
  const [subject, setSubject] = useState(initialLesson?.subject || "science");
  const [chapter, setChapter] = useState<number | null>(initialLesson?.chapter_number ?? null);
  const [chaptersList, setChaptersList] = useState<ChapterInfo[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attached lesson context if coming from a specific classroom lesson
  const [attachedLesson, setAttachedLesson] = useState<LessonDetail | null>(initialLesson || null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialLesson) {
      return [
        {
          id: "intro-attached",
          sender: "ila",
          text: `Hello! I have loaded the classroom lecture **"${initialLesson.title}"** (Class ${initialLesson.class_level}${initialLesson.section} ${initialLesson.subject.toUpperCase()}). Ask me any questions or doubts about what was explained in this class.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ];
    }
    return [
      {
        id: "intro-default",
        sender: "ila",
        text: `Hello ${user.full_name.split(" ")[0]}! I am your Offline Intelligent Lecture Assistant (ILA). Ask me any questions grounded in your NCERT curriculum and classroom lectures.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    getClassChapters(user.class_level, subject)
      .then((chaps) => {
        setChaptersList(chaps);
      })
      .catch(() => setChaptersList([]));
  }, [subject, user.class_level]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "student",
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setError(null);
    setLoading(true);

    try {
      // Build lines from attached lesson transcript if available
      let linesPayload: DemoLine[] | undefined;
      if (attachedLesson?.transcript) {
        const sentences = (attachedLesson.transcript + "\n" + attachedLesson.notes_markdown).split(/(?<=[.?!])\s+/);
        linesPayload = sentences.map((s, idx) => ({
          text: s,
          start: idx * 4,
          end: (idx + 1) * 4,
        }));
      }

      const resp: AskResponse = await askQuestion({
        question: q,
        classLevel: user.class_level,
        subject,
        chapter: attachedLesson ? attachedLesson.chapter_number : chapter,
        lines: linesPayload,
        useLlm: true,
      });

      const ilaMsg: ChatMessage = {
        id: `reply-${Date.now()}`,
        sender: "ila",
        text: resp.answer,
        sources: resp.citations && resp.citations.length > 0 ? resp.citations : [],
        engine: resp.engine,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, ilaMsg]);
    } catch (err) {
      setError(messageOf(err));
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "ila",
        text: "I was unable to retrieve an answer right now. Please check if the local model is loaded and try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (promptText: string) => {
    setQuestion(promptText);
  };

  return (
    <div className="ask-ila-workspace">
      {/* Header bar */}
      <div className="ask-header-bar">
        <div>
          <h2>Ask ILA — Doubt Solving Workspace</h2>
          <p className="header-subtitle">
            Local grounded Q&amp;A: all answers cite classroom lecture transcripts and verified NCERT textbooks.
          </p>
        </div>

        {attachedLesson ? (
          <div className="attached-context-badge">
            <BookIcon width={14} height={14} />
            <span>Context: <strong>{attachedLesson.title}</strong></span>
            <button
              type="button"
              className="btn-link-subtle"
              onClick={() => setAttachedLesson(null)}
            >
              Clear Lesson
            </button>
          </div>
        ) : (
          <div className="context-selector-row">
            <select
              className="form-select form-select-sm"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setChapter(null);
              }}
            >
              {subjects.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}
            </select>

            <select
              className="form-select form-select-sm"
              value={chapter ?? ""}
              onChange={(e) => setChapter(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">General Subject &amp; NCERT Curriculum</option>
              {chaptersList.map((ch) => (
                <option key={ch.chapter_number} value={ch.chapter_number}>
                  Ch {ch.chapter_number}: {ch.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Chat Messages Log */}
      <div className="chat-messages-scroll-area">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble-row ${msg.sender === "student" ? "student-row" : "ila-row"}`}
          >
            <div className={`chat-avatar ${msg.sender === "student" ? "student-avatar" : "ila-avatar"}`}>
              {msg.sender === "student" ? user.full_name.charAt(0).toUpperCase() : <SparkIcon width={16} height={16} />}
            </div>

            <div className="chat-bubble-content">
              <div className="chat-bubble-header">
                <span className="chat-sender-name">
                  {msg.sender === "student" ? user.full_name : "ILA Assistant"}
                </span>
                <span className="chat-timestamp">{msg.timestamp}</span>
              </div>

              <div className="chat-bubble-text">
                {msg.sender === "ila" ? <MathMarkdown>{msg.text}</MathMarkdown> : msg.text}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="chat-sources-accordion">
                  <span className="sources-label">
                    {msg.engine === "llm+syllabus"
                      ? "Curriculum & Subject Context:"
                      : "Verified NCERT & Lecture Sources:"}
                  </span>
                  <ul className="sources-list">
                    {msg.sources.slice(0, 3).map((src: any, idx: number) => {
                      const snippet = src.snippet || src.text || "";
                      const label = src.title || src.source || "Syllabus";
                      return (
                        <li key={idx} className="source-item">
                          <strong>[{label}]:</strong>{" "}
                          <span>{snippet.slice(0, 160)}{snippet.length > 160 ? "..." : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble-row ila-row">
            <div className="chat-avatar ila-avatar">
              <SparkIcon width={16} height={16} />
            </div>
            <div className="chat-bubble-content">
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="loading-caption">Searching curriculum passages and formulating answer...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Suggested Quick Questions */}
      <div className="quick-prompts-bar">
        <span className="prompts-label">Suggestions:</span>
        <button
          type="button"
          className="quick-prompt-chip"
          onClick={() => handleQuickQuestion("What are the key definitions and formulas in this chapter?")}
        >
          Key definitions &amp; formulas
        </button>
        <button
          type="button"
          className="quick-prompt-chip"
          onClick={() => handleQuickQuestion("Explain with an example how this concept is applied in NCERT questions.")}
        >
          Explain with an example
        </button>
        <button
          type="button"
          className="quick-prompt-chip"
          onClick={() => handleQuickQuestion("What are common mistakes students make in this topic?")}
        >
          Common mistakes to avoid
        </button>
      </div>

      {/* Question Input Form */}
      <form onSubmit={handleSend} className="ask-input-form">
        <input
          type="text"
          className="chat-input"
          placeholder="Type your academic question or doubt here..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          className="btn btn-primary btn-send"
          disabled={loading || !question.trim()}
        >
          Ask Question
        </button>
      </form>
    </div>
  );
}
