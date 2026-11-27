import { useEffect, useRef, useState } from "react";
import { getClassSubjects, askQuestion, getClassChapters } from "../../../api";
import { messageOf } from "../../../format";
import type { AskResponse, AuthUser, ChapterInfo, DemoLine, LessonDetail } from "../../../types";
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
  timestamp: string;
}

export function AskIlaView({ user, initialLesson }: AskIlaViewProps) {
  const [subjects,setSubjects] = useState<{code:string;name:string}[]>([]);
  useEffect(()=>{getClassSubjects(user.class_level).then(setSubjects).catch(e=>setError(messageOf(e)));},[user.class_level]);
  const [subject, setSubject] = useState(initialLesson?.subject || "science");
  const [chapter, setChapter] = useState<number | null>(initialLesson?.chapter_number || 1);
  const [chaptersList, setChaptersList] = useState<ChapterInfo[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const studentName = user.full_name.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");

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
        text: `Hello ${studentName.split(" ")[0]}! I am your Offline Intelligent Lecture Assistant (ILA). Ask me any questions grounded in your NCERT curriculum and classroom lectures.`,
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
        if (chaps.length > 0 && !chapter) {
          setChapter(chaps[0].chapter_number);
        }
      })
      .catch(() => {});
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
        sources: resp.source ? [resp.source] : [],
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
      <header className="ask-page-header">
        <div className="ask-page-heading">
          <h2>Doubt &amp; Question Center</h2>
          <p className="header-subtitle">
            Get instant, reliable answers from ILA for your subject and chapter. Ask doubts, clarify concepts, or ask any academic question.
          </p>
        </div>
        <svg className="ask-ila-illustration" viewBox="0 0 430 150" aria-hidden="true">
          <path d="M0 112c54-39 99-26 145-4 42 21 91 12 133-15 47-31 93-31 152-1v58H0z" fill="#e1f3e7" />
          <path d="M55 120c47-23 84-17 127 1 43 18 92 5 137-21 34-19 68-17 111 2v48H55z" fill="#c8e8d5" />
          <rect x="260" y="46" width="91" height="59" rx="8" fill="#fff" stroke="#07835d" strokeWidth="5" />
          <path d="M278 66h53m-53 14h42m-42 14h49" stroke="#60ad83" strokeWidth="5" strokeLinecap="round" />
          <path d="M307 42V23a5 5 0 0 1 5-5h53a5 5 0 0 1 5 5v38" fill="#fff" stroke="#07835d" strokeWidth="5" />
          <path d="M317 33h39m-39 12h28" stroke="#60ad83" strokeWidth="4" strokeLinecap="round" />
          <rect x="332" y="76" width="64" height="49" rx="8" fill="#fff" stroke="#07835d" strokeWidth="5" />
          <circle cx="349" cy="90" r="4" fill="#69b38a" />
          <path d="m340 116 15-14 11 10 10-12 12 16" fill="none" stroke="#60ad83" strokeWidth="4" />
          <rect x="176" y="96" width="65" height="15" rx="4" fill="#07835d" />
          <rect x="168" y="81" width="75" height="16" rx="4" fill="#fff" stroke="#78bd94" strokeWidth="3" />
          <rect x="182" y="66" width="61" height="15" rx="4" fill="#73bd91" />
        </svg>
      </header>

      {attachedLesson ? (
        <div className="attached-context-badge">
          <BookIcon width={14} height={14} />
          <span>Context: <strong>{attachedLesson.title}</strong></span>
          <button type="button" className="btn-link-subtle" onClick={() => setAttachedLesson(null)}>Clear Lesson</button>
        </div>
      ) : (
        <div className="ask-context-selectors">
          <label>
            Subject
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Chapter
            <select value={chapter || ""} onChange={(e) => setChapter(Number(e.target.value))}>
              <option value="">General NCERT Curriculum</option>
              {chaptersList.map((ch) => (
                <option key={ch.chapter_number} value={ch.chapter_number}>
                  {ch.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

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
                  {msg.sender === "student" ? studentName : "ILA Assistant"}
                </span>
                <span className="chat-timestamp">{msg.timestamp}</span>
              </div>

              <div className="chat-bubble-text">{msg.text}</div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="chat-sources-accordion">
                  <span className="sources-label">Verified NCERT &amp; Lecture Sources:</span>
                  <ul className="sources-list">
                    {msg.sources.slice(0, 3).map((src: any, idx: number) => (
                      <li key={idx} className="source-item">
                        <strong>[{src.source || "NCERT Text"}]:</strong>{" "}
                        <span>{src.text?.slice(0, 140)}...</span>
                      </li>
                    ))}
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
          onClick={() => handleQuickQuestion("Explain the main concept in this chapter in simple terms.")}
        >
          Explain the concept
        </button>
        <button
          type="button"
          className="quick-prompt-chip"
          onClick={() => handleQuickQuestion("Solve a numerical problem from this chapter step by step.")}
        >
          Solve a numerical
        </button>
        <button
          type="button"
          className="quick-prompt-chip"
          onClick={() => handleQuickQuestion("Give a clear example that applies a concept from this chapter.")}
        >
          Give an example
        </button>
        <button
          type="button"
          className="quick-prompt-chip"
          onClick={() => handleQuickQuestion("What are common mistakes students make in this topic?")}
        >
          Common mistakes
        </button>
      </div>

      {/* Question Input Form */}
      <form onSubmit={handleSend} className="ask-input-form">
        <input
          type="text"
          className="chat-input"
          placeholder="Type your doubt or question here..."
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          Ask Question
        </button>
      </form>
    </div>
  );
}
