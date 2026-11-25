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

interface StudentLoginProps {
  onSuccess: (user: AuthUser, token?: string) => void;
  onNavigateRegister: () => void;
  onNavigateTeacherLogin: () => void;
}

export function StudentLogin({
  onSuccess,
  onNavigateRegister,
  onNavigateTeacherLogin,
}: StudentLoginProps) {
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsn = usn.trim();
    if (!cleanUsn) {
      setError("Please enter your Student USN or Roll Number.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const resp = await login({
        identifier: cleanUsn,
        password,
        remember_me: true,
        role_hint: "student",
      });

      if (resp.user.role === "teacher" || resp.user.role === "admin") {
        setError("This account is registered as Faculty/Teacher. Please use the Teacher Login portal.");
        return;
      }

      onSuccess(resp.user, resp.token);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-portal-card student-auth-card">
      <div className="auth-card-header">
        <div className="auth-badge student-badge">
          <GraduationCapIcon width={16} height={16} />
          <span>Student Portal</span>
        </div>
        <h2>Welcome to ILA</h2>
        <p>Sign in with your USN to access classroom lectures, smart notes, and practice quizzes.</p>
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

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="form-group">
          <label htmlFor="student-usn">Student USN / Roll Number *</label>
          <input
            id="student-usn"
            type="text"
            className="form-input"
            placeholder="e.g. 1MS21CS001 or 10A24"
            value={usn}
            onChange={(e) => setUsn(e.target.value)}
            disabled={loading}
            required
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <div className="label-with-link">
            <label htmlFor="student-password">Password *</label>
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
              id="student-password"
              type={showPassword ? "text" : "password"}
              className="form-input"
              placeholder="Enter your password"
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
          {loading ? "Signing in..." : "Sign in with USN"}
        </button>
      </form>

      <div className="auth-card-footer">
        <p>
          Don't have an account yet?{" "}
          <button type="button" className="text-link bold-link" onClick={onNavigateRegister}>
            Register with USN
          </button>
        </p>

        <div className="portal-switch-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn-outline btn-block btn-switch-portal"
          onClick={onNavigateTeacherLogin}
        >
          <ShieldIcon width={16} height={16} />
          Switch to Teacher / Faculty Login
        </button>
      </div>

      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        roleHint="student"
      />
    </div>
  );
}
