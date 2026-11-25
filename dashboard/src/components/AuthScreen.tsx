import { useState } from "react";
import { bootstrapTeacher, login, registerStudent } from "../api";
import { messageOf } from "../format";
import type { AuthUser } from "../types";
import {
  AwardIcon,
  BookIcon,
  CheckCircleIcon,
  CpuIcon,
  EyeIcon,
  EyeOffIcon,
  GraduationCapIcon,
  MicIcon,
  ShieldIcon,
  SparkIcon,
  WarningIcon,
} from "./icons";

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUser, token?: string) => void;
}

type TabType = "student" | "teacher";
type ModeType = "login" | "register" | "bootstrap";

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>("student");
  const [mode, setMode] = useState<ModeType>("login");

  // Form states
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setMode("login");
    setError(null);
    setSuccessMsg(null);
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === "register") {
      if (!fullName.trim()) {
        setError("Please enter your full name.");
        return;
      }
      if (!studentId.trim()) {
        setError("Please enter your roll number.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      setLoading(true);
      try {
        const resp = await registerStudent({
          full_name: fullName.trim(),
          student_identifier: studentId.trim(),
          password,
        });
        onAuthSuccess(resp.user, resp.token);
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    } else {
      // Student Login
      if (!fullName.trim() || !studentId.trim() || !password) {
        setError("Please enter your name, roll number, and password.");
        return;
      }
      setLoading(true);
      try {
        const resp = await login({
          full_name: fullName.trim(),
          identifier: studentId.trim(),
          password,
          role_hint: "student",
        });
        onAuthSuccess(resp.user, resp.token);
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === "bootstrap") {
      if (!fullName.trim() || !teacherId.trim() || !password) {
        setError("Please complete all required fields.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      setLoading(true);
      try {
        const resp = await bootstrapTeacher({
          full_name: fullName.trim(),
          teacher_id: teacherId.trim(),
          password,
        });
        onAuthSuccess(resp.user, resp.token);
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    } else {
      // Teacher Login
      if (!fullName.trim() || !teacherId.trim() || !password) {
        setError("Please enter your name, teacher ID, and password.");
        return;
      }
      setLoading(true);
      try {
        const resp = await login({
          full_name: fullName.trim(),
          identifier: teacherId.trim(),
          password,
          role_hint: "teacher",
        });
        if (resp.user.role !== "teacher" && resp.user.role !== "admin") {
          setError("Access denied: this account does not have teacher privileges.");
          return;
        }
        onAuthSuccess(resp.user, resp.token);
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-layout">
      {/* Left Brand Showcase Column */}
      <div className="auth-hero">
        <div className="auth-hero-backdrop" />
        <div className="auth-hero-content">
          <div className="auth-brand-badge">
            <span className="auth-badge-dot" />
            <span>100% Offline · Local AI</span>
          </div>

          <div className="auth-hero-title-group">
            <div className="auth-logo-icon">
              <CpuIcon style={{ width: 28, height: 28 }} />
            </div>
            <div>
              <h1 className="auth-app-title">ILA</h1>
              <p className="auth-app-subtitle">Intelligent Learning Environment</p>
            </div>
          </div>

          <h2 className="auth-hero-tagline">
            Empowering classroom education with offline intelligence.
          </h2>
          <p className="auth-hero-desc">
            A production offline-first assistant for Indian secondary education.
            Transcribe lectures, navigate NCERT curriculum, detect diagnostic gaps, and practice adaptively without internet access.
          </p>

          <div className="auth-features-list">
            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <MicIcon />
              </div>
              <div className="auth-feature-text">
                <strong>Real-Time Lecture Transcriptions</strong>
                <span>faster-whisper on CPU/GPU with streaming VAD and local audio ingestion</span>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <BookIcon />
              </div>
              <div className="auth-feature-text">
                <strong>NCERT Grounded Syllabus</strong>
                <span>Hybrid BM25 + dense neural embedding retriever with direct textbook citations</span>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <SparkIcon />
              </div>
              <div className="auth-feature-text">
                <strong>Adaptive Assessment &amp; Diagnostics</strong>
                <span>Decision tree ML gap classifier with automated remediation flashcard drills</span>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <ShieldIcon />
              </div>
              <div className="auth-feature-text">
                <strong>Zero-Cloud Privacy &amp; Persistence</strong>
                <span>Offline SQLite storage, bcrypt secure authentication, and institutional privacy</span>
              </div>
            </div>
          </div>

          <div className="auth-hero-footer">
            <span>SDG 4: Quality Education</span>
            <span>·</span>
            <span>Team 9</span>
            <span>·</span>
            <span>Local SQLite Engine</span>
          </div>
        </div>
      </div>

      {/* Right Form Card Column */}
      <div className="auth-form-container">
        <div className="auth-card">
          {/* Role Navigation Tabs */}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "student"}
              className={`auth-tab ${activeTab === "student" ? "active" : ""}`}
              onClick={() => switchTab("student")}
            >
              <GraduationCapIcon style={{ width: 18, height: 18 }} />
              <span>Student Portal</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "teacher"}
              className={`auth-tab ${activeTab === "teacher" ? "active" : ""}`}
              onClick={() => switchTab("teacher")}
            >
              <AwardIcon style={{ width: 18, height: 18 }} />
              <span>Teacher Portal</span>
            </button>
          </div>

          {/* Form Header */}
          <div className="auth-card-header">
            {activeTab === "student" ? (
              <>
                <h2>{mode === "register" ? "Create Student Account" : "Student Sign In"}</h2>
                <p>
                  {mode === "register"
                    ? "Register to track your lectures, notes, quiz mastery, and learning gaps."
                    : "Welcome back! Enter your student credentials to access your workspace."}
                </p>
              </>
            ) : (
              <>
                <h2>{mode === "bootstrap" ? "Initialize Teacher Station" : "Teacher Sign In"}</h2>
                <p>
                  {mode === "bootstrap"
                    ? "Bootstrap the primary instructor profile on this offline terminal."
                    : "Access classroom diagnostic heatmaps, student rosters, and curriculum mastery."}
                </p>
              </>
            )}
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="inline-warning error" style={{ marginBottom: "16px" }}>
              <WarningIcon />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="inline-warning success" style={{ marginBottom: "16px" }}>
              <CheckCircleIcon />
              <span>{successMsg}</span>
            </div>
          )}

          {/* -------------------- STUDENT FORM -------------------- */}
          {activeTab === "student" && (
            <form onSubmit={handleStudentSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label" htmlFor="studentName">
                  Student Name <span className="req">*</span>
                </label>
                <input
                  id="studentName"
                  type="text"
                  className="form-input"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="studentId">
                  Roll Number <span className="req">*</span>
                </label>
                <input
                  id="studentId"
                  type="text"
                  className="form-input"
                  placeholder="Enter your roll number"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="studentPassword">
                  Password <span className="req">*</span>
                </label>
                <div className="password-input-wrap">
                  <input
                    id="studentPassword"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    className="btn-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner small" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <span>{mode === "register" ? "Create Account & Sign In" : "Sign In to Student Workspace"}</span>
                )}
              </button>

              <div className="auth-switch-mode">
                {mode === "register" ? (
                  <span>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setMode("login");
                        setError(null);
                      }}
                    >
                      Sign In
                    </button>
                  </span>
                ) : (
                  <span>
                    New student?{" "}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setMode("register");
                        setError(null);
                      }}
                    >
                      Register here
                    </button>
                  </span>
                )}
              </div>
            </form>
          )}

          {/* -------------------- TEACHER FORM -------------------- */}
          {activeTab === "teacher" && (
            <form onSubmit={handleTeacherSubmit} className="auth-form">
              <div className="auth-info-banner">
                <ShieldIcon style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>
                  {mode === "bootstrap"
                    ? "Bootstrap mode is enabled for initial offline workstation setup."
                    : "Teacher credentials are administrator-provisioned via the CLI (ila create-teacher)."}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="teacherFullName">
                  Teacher Name <span className="req">*</span>
                </label>
                <input
                  id="teacherFullName"
                  type="text"
                  className="form-input"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="teacherId">
                  Teacher ID <span className="req">*</span>
                </label>
                <input
                  id="teacherId"
                  type="text"
                  className="form-input"
                  placeholder="Enter your teacher ID"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="teacherPassword">
                  Instructor Password <span className="req">*</span>
                </label>
                <div className="password-input-wrap">
                  <input
                    id="teacherPassword"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    placeholder="Enter instructor password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    className="btn-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner small" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <span>
                    {mode === "bootstrap"
                      ? "Bootstrap Initial Teacher Account"
                      : "Sign In to Teacher Dashboard"}
                  </span>
                )}
              </button>

              <div className="auth-switch-mode">
                {mode === "bootstrap" ? (
                  <span>
                    Already provisioned?{" "}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setMode("login");
                        setError(null);
                      }}
                    >
                      Return to Sign In
                    </button>
                  </span>
                ) : (
                  <span>
                    First time setup?{" "}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setMode("bootstrap");
                        setError(null);
                      }}
                    >
                      Initialize Teacher Station
                    </button>
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
