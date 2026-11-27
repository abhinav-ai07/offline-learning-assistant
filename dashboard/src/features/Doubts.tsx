import { useEffect, useRef, useState } from "react";
import { getStudentSubjectsTree, request } from "../api";
import { messageOf } from "../format";
import { subscribeRealtime } from "../realtime";
import { Dialog } from "../shared/components/AcademicUI";
import { EyeIcon, FileTextIcon, GraduationCapIcon, MessageSquareIcon } from "../components/icons";
import type { DoubtNotice } from "./useDoubtNotifications";
import type { FAQ, SubjectTree } from "../types";

interface Scope { class_level: number; section: string; chapter: string; subject: string; question: string }
interface Doubt extends Scope { id: string; student_name: string; teacher_name: string; reply: string | null; status: string; created_at: string }
interface Teacher { id: string; subject: string; full_name: string }
const actions = { edit: "Edit FAQ", unpublish: "Unpublish FAQ" };
type Action = keyof typeof actions;

function post(path: string, data: object) {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

function useDoubts(role: "student" | "teacher") {
  const [rows, setRows] = useState<Doubt[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion(v => v + 1);
  useEffect(() => {
    let live = true;
    Promise.all([request<Doubt[]>('/api/' + role + '/doubts'), role === "teacher" ? request<FAQ[]>("/api/teacher/faqs") : Promise.resolve([])])
      .then(([d, f]) => { if (live) { setRows(d); setFaqs(f); setError(""); } })
      .catch(e => { if (live) setError(messageOf(e)); });
    const unsub = subscribeRealtime(["doubt_updated"], refresh);
    return () => { live = false; unsub(); };
  }, [role, version]);
  return { rows, faqs, error, refresh };
}

export function StudentDoubts() {
  const history = useDoubts("student");
  const [tree, setTree] = useState<SubjectTree[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([getStudentSubjectsTree(), request<Teacher[]>("/api/student/doubt-teachers")])
      .then(([s,t]) => { setTree(s); setTeachers(t); }).catch(e => setError(messageOf(e)));
  }, []);
  const choices = tree.filter(s => teachers.some(t => t.subject === s.subject_code));
  const active = choices.find(s => s.subject_code === subject) || choices[0];
  return <>
    <section className="student-teacher-card">
      <header className="student-doubt-card-heading">
        <span className="student-doubt-card-icon"><GraduationCapIcon width={24} height={24} /></span>
        <div><h2>Ask Your Teacher</h2><p>Have a class-specific doubt? Send it to your assigned teacher.</p></div>
      </header>
      <form className="doubt-form" onSubmit={async e => {
      e.preventDefault(); if (!active || busy) return;
      const form = e.currentTarget, data = new FormData(form);
      setBusy(true); setError("");
      try { await post("/api/student/doubts", { subject: active.subject_code, teacher_id: data.get("teacher"), chapter_number: Number(data.get("chapter")), question: data.get("question") });
        form.reset(); setSubject(""); history.refresh();
      } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
      }}>
        <label>Subject<select required value={active?.subject_code || ""} onChange={e => setSubject(e.target.value)}>{choices.map(s => <option key={s.subject_code} value={s.subject_code}>{s.subject_name}</option>)}</select></label>
        <label>Chapter<select name="chapter" required key={active?.subject_code}>{active?.chapters.map(c => <option key={c.chapter_number} value={c.chapter_number}>{c.title}</option>)}</select></label>
        <label>Teacher<select name="teacher" required>{teachers.filter(t => t.subject === active?.subject_code).map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
        <label>Question<textarea required name="question" maxLength={8000} placeholder="Type your doubt for your teacher..." /></label>
        {error && <p role="alert" className="student-doubt-error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !active}><MessageSquareIcon width={16} height={16} />Submit Doubt</button>
      </form>
    </section>
    <section className="student-doubt-history">
      <header className="student-doubt-history-heading">
        <FileTextIcon width={25} height={25} />
        <div><h2>My Doubt History</h2><p>Track your questions, teacher replies, and status in one place.</p></div>
      </header>
      {(history.error || error) && <p role="alert" className="student-doubt-error">{history.error || error}</p>}
      {!history.rows.length ? <p className="student-doubt-empty">No doubts submitted yet.</p> : (
        <div className="student-doubt-table-scroll">
          <table className="student-doubt-table">
            <thead><tr><th>#</th><th>Question</th><th>Subject</th><th>Chapter</th><th>Teacher</th><th>Status</th><th>Last Update</th><th>Actions</th></tr></thead>
            <tbody>{history.rows.map((d, index) => {
              const answered = /answered|replied/i.test(d.status);
              return <tr key={d.id}>
                <td>{index + 1}</td>
                <td className="student-doubt-question">{d.question}</td>
                <td><span className="student-doubt-subject">{d.subject}</span></td>
                <td>{d.chapter}</td>
                <td>{d.teacher_name}</td>
                <td><span className={`student-doubt-status ${answered ? "is-answered" : "is-pending"}`}>{d.status}</span></td>
                <td><time>{new Date(d.created_at).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</time></td>
                <td><details className="student-doubt-details">
                  <summary className="btn btn-outline btn-sm"><EyeIcon width={15} height={15} />View</summary>
                  <div className="student-doubt-detail-content">
                    <strong>{d.question}</strong>
                    <p>{d.subject} · {d.chapter} · {d.teacher_name}</p>
                    {d.reply ? <p><strong>Teacher reply:</strong> {d.reply}</p> : <p>No teacher reply yet.</p>}
                  </div>
                </details></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  </>;
}

interface InboxView {
  target?: string;
  notifications: DoubtNotice[];
  onView: (id: string) => Promise<void>;
}

function DoubtCard({d, unread, target, onView, refresh}: {
  d: Doubt; unread: boolean; target: boolean; onView: InboxView["onView"]; refresh: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const [answer, setAnswer] = useState("");
  const [saved, setSaved] = useState<{reply: string; status: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const reply = d.reply ?? saved?.reply;
  const status = d.reply ? d.status : saved?.status ?? d.status;

  useEffect(() => {
    if (target) {
      card.current?.focus({preventScroll: true});
      card.current?.scrollIntoView({block: "center"});
    }
  }, [target]);
  useEffect(() => {
    if (!unread || !card.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && document.visibilityState === "visible") {
        observer.disconnect();
        onView(d.id).catch(e => setIssue(messageOf(e)));
      }
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [unread, d.id, onView]);

  async function send(action: "reply" | "both") {
    const text = answer.trim();
    if (!text || busy || reply) return;
    setBusy(true); setIssue("");
    try {
      await post("/api/teacher/doubts/" + d.id + "/response", {action, reply: text});
      setSaved({reply: text, status: action === "both" || d.status === "Published" ? "Replied & Published" : "Replied"});
      refresh();
    } catch (e) { setIssue(messageOf(e)); refresh(); }
    finally { setBusy(false); }
  }
  return <article ref={card} tabIndex={-1} className="doubt-card teacher-doubt-card">
    <header><strong>{d.student_name}</strong><span className="chip-badge">{status}</span></header>
    <p>Class {d.class_level}{d.section} · {d.subject} · {d.chapter} · <time>{d.created_at}</time></p>
    <h3>{d.question}</h3>
    <label>{reply ? "Your answer" : "Write your answer"}
      <textarea disabled={!!reply || busy} readOnly={!!reply} value={reply ?? answer}
        maxLength={16000} onChange={e => setAnswer(e.target.value)} />
    </label>
    {!reply && <div><button className="btn btn-outline" disabled={!answer.trim() || busy} onClick={() => send("reply")}>Send Private Reply</button>
      <button className="btn btn-primary" disabled={!answer.trim() || busy || d.status === "Published"} onClick={() => send("both")}>Reply + Publish FAQ</button></div>}
    {issue && <p role="alert">{issue}</p>}
  </article>;
}

export function TeacherDoubts({target, notifications, onView}: InboxView) {
  const {rows, faqs, error, refresh} = useDoubts("teacher");
  const [tab, setTab] = useState("Student Doubts");
  const [editor, setEditor] = useState<{action: Action; id: string; question: string; answer?: string; reply?: string | null} | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  function start(action: Action, id: string, question: string, answer = "", reply = "") {
    setIssue(""); setEditor({action,id,question,answer,reply});
  }
  return <section className="subject-detail-workspace"><h1>Doubts &amp; FAQs</h1>
    <nav className="inline-tabs">{["Student Doubts","Published FAQs"].map(t => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {error && <p role="alert">{error}</p>}
    {tab === "Student Doubts" ? <>
      {rows.map(d => <DoubtCard key={d.id} d={d} target={target === d.id}
        unread={notifications.some(n => n.id === d.id && !n.is_read)} onView={onView} refresh={refresh} />)}
      {!rows.length && <p>No student doubts yet.</p>}
    </> : <>{!faqs.length && <p>No published FAQs yet.</p>}{faqs.map(f => <article className="empty-state-card doubt-card" key={f.doubt_id}><h3>{f.question}</h3><p>{f.answer}</p><p>Class {f.class_level}{f.section} · {f.subject} · {f.chapter}</p>
      {(["edit","unpublish"] as const).map(a => <button className="btn btn-outline btn-sm" key={a} onClick={() => start(a,f.doubt_id,f.question,f.answer)}>{actions[a]}</button>)}</article>)}</>}
    {editor && <Dialog title={actions[editor.action]} close={() => {if (!busy) setEditor(null);}}><form className="doubt-form" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      const data = new FormData(e.currentTarget);
      setBusy(true); setIssue("");
      try { await post('/api/teacher/doubts/' + editor.id + '/response', {action:editor.action,reply:data.get("reply") || "",question:data.get("question") || "",answer:data.get("answer") || ""}); setEditor(null); refresh(); }
      catch (err) { setIssue(messageOf(err)); } finally { setBusy(false); }
    }}><h2>{actions[editor.action]}</h2>
      {editor.action === "edit" && <><label>Public question<textarea required name="question" defaultValue={editor.question} maxLength={8000}/></label><label>Public answer<textarea required name="answer" defaultValue={editor.answer} maxLength={16000}/></label></>}
      {editor.action === "unpublish" && <p>{editor.question}</p>}
      {issue && <p role="alert">{issue}</p>}
      <button className="btn btn-primary" disabled={busy}>{actions[editor.action]}</button><button type="button" className="btn btn-outline" disabled={busy} onClick={() => setEditor(null)}>Cancel</button>
    </form></Dialog>}
  </section>;
}
