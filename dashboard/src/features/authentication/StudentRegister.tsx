import { useState } from "react";
import { registerStudent } from "../../api";
import { messageOf } from "../../format";
import type { AuthUser } from "../../types";
import {
  GraduationCapIcon,
  ShieldIcon,
  WarningIcon,
  EyeIcon,
  EyeOffIcon,
} from "../../components/icons";

interface StudentRegisterProps {
  onSuccess: (user: AuthUser, token?: string) => void;
  onNavigateLogin: () => void;
}

export function StudentRegister({ onSuccess, onNavigateLogin }: StudentRegisterProps) {
  const [usn, setUsn] = useState("");
  const [fullName, setFullName] = useState("");
  const [classLevel, setClassLevel] = useState<number>(10);
  const [section, setSection] = useState<string>("A");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsn = usn.trim();
    if (!cleanUsn) {
      setError("Please enter your Student USN or Roll Number.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const resp = await registerStudent({
        student_identifier: cleanUsn,
        full_name: fullName.trim() || `Student ${cleanUsn}`,
        class_level: classLevel,
        section,
        password,
      });

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
          <span>Student Registration</span>
        </div>
        <h2>Create Student Account</h2>
        <p>Register with your USN to access classroom lessons, structured notes, and revision quizzes.</p>
      </div>

      <div className="auth-tabs-header">
        <button type="button" className="auth-tab-btn" onClick={onNavigateLogin}>
          Sign In
        </button>
        <button type="button" className="auth-tab-btn active" aria-selected="true">
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
          <label htmlFor="reg-usn">Student USN / Roll Number *</label>
          <input
            id="reg-usn"
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
          <label htmlFor="reg-fullname">Full Name (Optional)</label>
          <input
            id="reg-fullname"
            type="text"
            className="form-input"
            placeholder="e.g. Rohan Verma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
            autoComplete="name"
          />
        </div>

        <div className="form-row-two-col">
          <div className="form-group">
            <label htmlFor="reg-class">Class Level</label>
            <select
              id="reg-class"
              className="form-select"
              value={classLevel}
              onChange={(e) => setClassLevel(Number(e.target.value))}
              disabled={loading}
            >
              <option value={8}>Class 8</option>
              <option value={9}>Class 9</option>
              <option value={10}>Class 10</option>
              <option value={11}>Class 11</option>
              <option value={12}>Class 12</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="reg-section">Section</label>
            <select
              id="reg-section"
              className="form-select"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              disabled={loading}
            >
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="D">Section D</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="reg-password">Password *</label>
          <div className="password-input-wrapper">
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              className="form-input"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete="new-password"
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

        <div className="form-group">
          <label htmlFor="reg-confirm-password">Confirm Password</label>
          <input
            id="reg-confirm-password"
            type={showPassword ? "text" : "password"}
            className="form-input"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
          {loading ? "Creating student account..." : "Register & Enter Classroom"}
        </button>
      </form>

      <div className="auth-card-footer">
        <p>
          Already registered with your USN?{" "}
          <button type="button" className="text-link bold-link" onClick={onNavigateLogin}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
