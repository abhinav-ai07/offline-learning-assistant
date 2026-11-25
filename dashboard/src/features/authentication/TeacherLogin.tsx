import { useState } from "react";
import { login } from "../../api";
import { messageOf } from "../../format";
import type { AuthUser } from "../../types";
import {
  GraduationCapIcon,
  ShieldIcon,
  WarningIcon,
  EyeIcon,
  EyeOffIcon,
} from "../../components/icons";
import { ForgotPasswordModal } from "./ForgotPasswordModal";

interface TeacherLoginProps {
  onSuccess: (user: AuthUser, token?: string) => void;
  onNavigateRegister: () => void;
  onNavigateStudentLogin: () => void;
}

export function TeacherLogin({
  onSuccess,
  onNavigateRegister,
  onNavigateStudentLogin,
}: TeacherLoginProps) {
  const [teacherId, setTeacherId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = teacherId.trim();
    if (!cleanId) {
      setError("Please enter your Teacher ID.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const resp = await login({
        identifier: cleanId,
        password,
        remember_me: true,
        role_hint: "teacher",
      });

      if (resp.user.role !== "teacher" && resp.user.role !== "admin") {
        setError("This account is registered as a Student. Please use the Student Portal login.");
        return;
      }

      onSuccess(resp.user, resp.token);
    } catch (err: any) {
      const msg = messageOf(err);
      if (msg.includes("Invalid Teacher ID or password") || msg.includes("not found")) {
        setError("Invalid Teacher ID or password. If you don't have an account yet, click 'Create Account' above.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-portal-card teacher-auth-card">
      <div className="auth-card-header">
        <div className="auth-badge teacher-badge">
          <ShieldIcon width={16} height={16} />
          <span>Teacher &amp; Faculty Portal</span>
        </div>
        <h2>Faculty Sign In</h2>
        <p>Authorized workspace for lecture recording, speech transcription, and classroom management.</p>
      </div>

      <div className="auth-tabs-header">
        <button type="button" className="auth-tab-btn active" aria-selected="true">
          Sign In
        </button>
        <button type="button" className="auth-tab-btn" onClick={onNavigateRegister}>
          Create Account
        </button>
      </div>

      {error && (
        <div className="form-error-alert" role="alert">
          <WarningIcon width={16} height={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="auth-form" noValidate>
        <div className="form-group">
          <label htmlFor="teacher-id">Teacher ID *</label>
          <input
            id="teacher-id"
            type="text"
            className="form-input"
            placeholder="e.g. TCH101 or FAC01"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            disabled={loading}
            required
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <div className="label-with-link">
            <label htmlFor="teacher-password">Password *</label>
            <button
              type="button"
              className="text-link"
              onClick={() => setShowForgotModal(true)}
            >
              Forgot password?
            </button>
          </div>
          <div className="password-input-wrapper">
            <input
              id="teacher-password"
              type={showPassword ? "text" : "password"}
              className="form-input"
              placeholder="Enter faculty password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? "Authenticating..." : "Sign in to Faculty Studio"}
        </button>
      </form>

      <div className="auth-card-footer">
        <p className="subtext">
          New faculty member?{" "}
          <button
            type="button"
            className="text-link bold-link"
            onClick={onNavigateRegister}
          >
            Create Teacher Account
          </button>
        </p>

        <div className="portal-switch-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn-outline btn-block btn-switch-portal"
          onClick={onNavigateStudentLogin}
        >
          <GraduationCapIcon width={16} height={16} />
          Switch to Student Login
        </button>
      </div>

      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        roleHint="teacher"
      />
    </div>
  );
}
