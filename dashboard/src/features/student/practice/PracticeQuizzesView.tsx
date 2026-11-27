import { useEffect, useState } from "react";
import { getClassSubjects, answerQuiz, getStudentPractice, startQuiz } from "../../../api";
import { messageOf } from "../../../format";
import type { AuthUser, LessonDetail, PracticeWorkspaceData, QuizQuestion, QuizStartResponse } from "../../../types";
import {
  AwardIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  HelpCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  WarningIcon,
  XIcon,
} from "../../../components/icons";

interface PracticeQuizzesViewProps {
  user: AuthUser;
  lesson?: LessonDetail|null;
}

type PracticeTab = "quizzes" | "history" | "review" | "revision";

export function PracticeQuizzesView({ user,lesson }: PracticeQuizzesViewProps) {
  const [subjects,setSubjects] = useState<{code:string;name:string}[]>([]);
  useEffect(()=>{getClassSubjects(user.class_level).then(setSubjects).catch(e=>setError(messageOf(e)));},[user.class_level]);
  const [activeTab, setActiveTab] = useState<PracticeTab>("quizzes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practiceData, setPracticeData] = useState<PracticeWorkspaceData | null>(null);

  // Active quiz session states
  const [activeQuiz, setActiveQuiz] = useState<QuizStartResponse | null>(null);
  // Questions collected question-by-question (API returns one at a time)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [shortAnswer,setShortAnswer]=useState("");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [quizStartTime, setQuizStartTime] = useState<number>(0);

  // Custom launcher state
  const [launchSubject, setLaunchSubject] = useState(lesson?.subject || "science");
  const [chapter,setChapter] = useState<number>();
  const [launchTopic, setLaunchTopic] = useState("");
  const [launchDifficulty, setLaunchDifficulty] = useState<number>(1);
  const [launchLength, setLaunchLength] = useState<number>(5);

  const fetchPracticeData = () => {
    setLoading(true);
    getStudentPractice()
      .then((data) => {
        setPracticeData(data);
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
    fetchPracticeData();
  }, []);

  const handleStartQuiz = async (topic?: string, diff?: number) => {
    setError(null);
    setLoading(true);
    try {
      const resp = await startQuiz({
        lessonId:lesson?.id,
        chapterNumber:chapter || undefined,
        studentId: user.student_identifier || user.id,
        classLevel: user.class_level,
        subject: launchSubject,
        topic: topic || launchTopic || undefined,
        difficulty: diff || launchDifficulty,
        length: launchLength,
      });

      setActiveQuiz(resp);
      setQuizQuestions([resp.question]);
      setCurrentQuestionIndex(0);
      setSelectedOption(null);setShortAnswer("");
      setFeedback(null);
      setQuizStartTime(Date.now());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!activeQuiz || (selectedOption === null && !shortAnswer.trim()) || submittingAnswer) return;
    const currentQ: QuizQuestion = quizQuestions[currentQuestionIndex];
    const responseMs = Date.now() - quizStartTime;

    setSubmittingAnswer(true);
    try {
      const resp = await answerQuiz({
        quizId: activeQuiz.quiz_id,
        questionId: currentQ.id,
        answer: selectedOption === null ? shortAnswer : currentQ.options[selectedOption],
        answerIndex: selectedOption,
        responseMs,
      });
      if (resp.next_question) setQuizQuestions(old=>[...old,resp.next_question!]);
      setFeedback(resp);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleNextQuestion = () => {
    if (!activeQuiz) return;
    if (feedback?.next_question) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);setShortAnswer("");
      setFeedback(null);
      setQuizStartTime(Date.now());
    } else {
      // Quiz completed!
      setActiveQuiz(null);
      fetchPracticeData();
      setActiveTab("history");
    }
  };

  if (activeQuiz) {
    const currentQ: QuizQuestion = quizQuestions[currentQuestionIndex] ?? activeQuiz.question;
    const isLast = currentQuestionIndex === activeQuiz.total - 1;

    return (
      <div className="active-quiz-container">
        <div className="quiz-header-card">
          <div className="quiz-progress-bar-wrap">
            <span className="quiz-progress-label">
              Question {currentQuestionIndex + 1} of {activeQuiz.total}
            </span>
            <div className="progress-bar-mini">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${((currentQuestionIndex + (feedback ? 1 : 0)) / activeQuiz.total) * 100}%`,
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              if (window.confirm("Are you sure you want to exit this quiz session?")) {
                setActiveQuiz(null);
                fetchPracticeData();
              }
            }}
          >
            Exit Quiz
          </button>
        </div>

        <div className="quiz-card-body">
          <div className="question-topic-pill">
            <span>{currentQ.topic}</span>
            <span>·</span>
            <span>Difficulty {currentQ.difficulty}/3</span>
          </div>

          <h3 className="question-prompt-text">{currentQ.prompt}</h3>

          <div className="options-list">
            {currentQ.options && currentQ.options.length > 0 ? (
              currentQ.options.map((opt, idx) => {
                const isSelected = selectedOption === idx;
                let optClass = "option-btn";
                if (isSelected) optClass += " selected";
                if (feedback) {
                  if (feedback.correct && isSelected) optClass += " correct";
                  else if (!feedback.correct && isSelected) optClass += " incorrect";
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    className={optClass}
                    onClick={() => {
                      if (!feedback) setSelectedOption(idx);
                    }}
                    disabled={Boolean(feedback) || submittingAnswer}
                  >
                    <span className="option-index">{String.fromCharCode(65 + idx)}</span>
                    <span className="option-text">{opt}</span>
                  </button>
                );
              })
            ) : (
              <label>Your answer<input value={shortAnswer} disabled={!!feedback} onChange={e=>setShortAnswer(e.target.value)}/></label>
            )}
          </div>

          {feedback && (
            <div className={`quiz-feedback-box ${feedback.correct ? "correct" : "incorrect"}`}>
              <div className="feedback-headline">
                {feedback.correct ? (
                  <>
                    <CheckCircleIcon width={18} height={18} />
                    <span>Correct! Excellent recall.</span>
                  </>
                ) : (
                  <>
                    <XIcon width={18} height={18} />
                    <span>Incorrect. Review the correct concept below:</span>
                  </>
                )}
              </div>
              <p className="feedback-explanation">
                <strong>Expected:</strong> {feedback.expected}
              </p>
              {feedback.explanation && (
                <p className="feedback-details">{feedback.explanation}</p>
              )}
            </div>
          )}

          <div className="quiz-action-bar">
            {!feedback ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitAnswer}
                disabled={(selectedOption === null && !shortAnswer.trim()) || submittingAnswer}
              >
                {submittingAnswer ? "Evaluating..." : "Submit Answer"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNextQuestion}
              >
                {isLast ? "Finish Quiz & View Results" : "Next Question"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-workspace-container">
      {/* Workspace Header */}
      <div className="practice-header-strip">
        <div>
          <h2>Practice &amp; Assessment Workspace</h2>
          <p className="header-subtitle">
            Classroom quizzes, chapter assessments, incorrect answer reviews, and targeted revision.
          </p>
        </div>

        {practiceData && (
          <div className="practice-quick-stats">
            <div className="stat-item">
              <span className="stat-num">{practiceData.total_quizzes}</span>
              <span className="stat-label">Quizzes Taken</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{Math.round(practiceData.average_score * 100)}%</span>
              <span className="stat-label">Avg Score</span>
            </div>
          </div>
        )}
      </div>

      {/* 4 Tabs Navigation */}
      <div className="practice-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "quizzes"}
          className={`tab-btn ${activeTab === "quizzes" ? "active" : ""}`}
          onClick={() => setActiveTab("quizzes")}
        >
          Adaptive Quizzes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Past Attempts ({practiceData?.recent_sessions.length || 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "review"}
          className={`tab-btn ${activeTab === "review" ? "active" : ""}`}
          onClick={() => setActiveTab("review")}
        >
          Incorrect Answer Review ({practiceData?.incorrect_attempts.length || 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "revision"}
          className={`tab-btn ${activeTab === "revision" ? "active" : ""}`}
          onClick={() => setActiveTab("revision")}
        >
          Suggested Revision ({practiceData?.suggested_revision.length || 0})
        </button>
      </div>

      {/* TAB 1: ADAPTIVE QUIZZES */}
      {activeTab === "quizzes" && (
        <div className="practice-tab-content">
          <div className="launch-quiz-card">
            <h3>Start an Adaptive Quiz</h3>
            <p className="tab-desc">
              Generate a 5-question adaptive quiz covering NCERT curriculum and classroom lecture topics.
            </p>

            <div className="launch-controls-grid">
              <div className="form-group">
                <label>Subject</label>
                <select
                  className="form-select"
                  disabled={!!lesson}
                  value={launchSubject}
                  onChange={(e) => setLaunchSubject(e.target.value)}
                >
                  {subjects.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}
                </select>{lesson&&<p>{lesson.title}</p>}
              </div>
              <div className="form-group">
                <label>Number of Questions</label>
                <select
                  className="form-select"
                  value={launchLength}
                  onChange={(e) => setLaunchLength(Number(e.target.value))}
                >
                  <option value={3}>3 Questions (Quick check)</option>
                  <option value={5}>5 Questions (Standard)</option>
                  <option value={10}>10 Questions (Comprehensive)</option>
                </select>
              </div>
            </div>

            <details className="quiz-advanced-options">
              <summary>Optional topic and difficulty</summary>
              <div className="launch-controls-grid">
                {!lesson&&<div className="form-group">
                  <label>Chapter number (optional)<input type="number" min="1" value={chapter||""} onChange={e=>setChapter(Number(e.target.value)||undefined)}/></label>
                </div>}
                <div className="form-group">
                  <label>Topic / Concept (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Chemical Reactions, Acids, Real Numbers"
                    value={launchTopic}
                    onChange={(e) => setLaunchTopic(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Difficulty</label>
                  <select
                    className="form-select"
                    value={launchDifficulty}
                    onChange={(e) => setLaunchDifficulty(Number(e.target.value))}
                  >
                    <option value={1}>Level 1: Recall &amp; Definitions</option>
                    <option value={2}>Level 2: Conceptual &amp; Equations</option>
                    <option value={3}>Level 3: Application &amp; Analysis</option>
                  </select>
                </div>
              </div>
            </details>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleStartQuiz()}
              disabled={loading}
              style={{ marginTop: 16 }}
            >
              <AwardIcon width={16} height={16} />
              Launch Adaptive Practice
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: PAST ATTEMPTS */}
      {activeTab === "history" && (
        <div className="practice-tab-content">
          <div className="history-table-card">
            <h3>Quiz History &amp; Score Progression</h3>
            {practiceData?.recent_sessions.length === 0 ? (
              <div className="empty-state-card">
                <AwardIcon width={32} height={32} />
                <h4>No quiz attempts recorded yet</h4>
                <p>Complete a quiz to see your scores and accuracy history recorded here.</p>
              </div>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Subject</th>
                    <th>Topic</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {practiceData?.recent_sessions.map((s: any) => (
                    <tr key={s.id}>
                      <td>{new Date(s.created_at).toLocaleString()}</td>
                      <td>{s.subject?.toUpperCase() || "SCIENCE"}</td>
                      <td>{s.topic || "General Curriculum"}</td>
                      <td>
                        <span className="score-pill">
                          {Math.round(s.score * 100)}%
                        </span>
                      </td>
                      <td>
                        {s.completed ? (
                          <span className="badge badge-success">Completed</span>
                        ) : (
                          <span className="badge badge-warning">Partial</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INCORRECT ANSWER REVIEW */}
      {activeTab === "review" && (
        <div className="practice-tab-content">
          <div className="incorrect-answers-card">
            <h3>Incorrect-Answer Review</h3>
            <p className="tab-desc">
              Review questions answered incorrectly in previous assessments to rectify misconceptions.
            </p>

            {practiceData?.incorrect_attempts.length === 0 ? (
              <div className="all-good-box">
                <CheckCircleIcon width={32} height={32} />
                <h4>No incorrect answers pending review!</h4>
                <p>Keep taking practice quizzes to maintain mastery.</p>
              </div>
            ) : (
              <div className="incorrect-cards-list">
                {practiceData?.incorrect_attempts.map((att: any, idx: number) => (
                  <div key={idx} className="incorrect-item-card">
                    <div className="item-topic-badge">
                      <span>{att.topic}</span>
                      <span>·</span>
                      <span>{new Date(att.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 className="item-prompt">{att.prompt}</h4>
                    <div className="item-answer-comparison">
                      <div className="student-response">
                        <span className="comparison-label">Your Response:</span>
                        <span className="wrong-text">{att.response || "No response provided"}</span>
                      </div>
                      <div className="expected-response">
                        <span className="comparison-label">Correct Expected Answer:</span>
                        <span className="correct-text">{att.expected}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SUGGESTED REVISION */}
      {activeTab === "revision" && (
        <div className="practice-tab-content">
          <div className="revision-card">
            <h3>Personalized Revision Plan</h3>
            <p className="tab-desc">
              Topics with mastery scores below 65% identified by the Exponential Moving Average (EMA) mastery model:
            </p>

            {practiceData?.suggested_revision.length === 0 ? (
              <div className="all-good-box">
                <CheckCircleIcon width={32} height={32} />
                <h4>All topics meet proficiency criteria!</h4>
                <p>You have demonstrated strong performance across all recorded syllabus topics.</p>
              </div>
            ) : (
              <div className="revision-topics-grid">
                {practiceData?.suggested_revision.map((item: any, idx: number) => (
                  <div key={idx} className="revision-topic-card">
                    <div className="rev-header">
                      <h4>{item.topic}</h4>
                      <span className={`rev-score ${item.score < 0.5 ? "is-low" : ""}`}>
                        {Math.round(item.score * 100)}% Mastery
                      </span>
                    </div>
                    <div className="topic-progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.round(item.score * 100)}%`,
                          backgroundColor: item.score < 0.5 ? "var(--danger)" : "var(--warning)",
                        }}
                      />
                    </div>
                    <div className="rev-meta">
                      <span>{item.correct} correct of {item.attempts} attempts</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-block"
                      onClick={() => handleStartQuiz(item.topic, 1)}
                    >
                      Practice This Topic
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
