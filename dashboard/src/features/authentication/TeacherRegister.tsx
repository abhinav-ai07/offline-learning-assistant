import { useState } from "react";
import { registerTeacher } from "../../api";
import { messageOf } from "../../format";
import type { AuthUser } from "../../types";
import {
  GraduationCapIcon,
  ShieldIcon,
  WarningIcon,
  EyeIcon,
  EyeOffIcon,
} from "../../components/icons";

interface TeacherRegisterProps {
  onSuccess: (user: AuthUser, token?: string) => void;
  onNavigateLogin: () => void;
  onNavigateStudentLogin: () => void;
}

export function TeacherRegister({
  onSuccess,
  onNavigateLogin,
  onNavigateStudentLogin,
}: TeacherRegisterProps) {
  const [teacherId, setTeacherId] = useState("");
  const [fullName, setFullName] = useState("");
  const [classLevel, setClassLevel] = useState<number>(10);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = teacherId.trim();
    if (!cleanId) {
      setError("Please enter your Teacher ID.");
      return;
    }
    const cleanName = fullName.trim();
    if (!cleanName) {
      setError("Please enter your Full Name.");
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
      const resp = await registerTeacher({
        teacher_id: cleanId,
        full_name: cleanName,
        class_level: classLevel,
        password,
        confirm_password: confirmPassword || password,
      });

      onSuccess(resp.user, resp.token);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-portal-card teacher-auth-card">
      <div className="auth-card-header">
        <div className="auth-badge teacher-badge">
          <ShieldIcon width={16} height={16} />
          <span>Faculty Registration</span>
        </div>
        <h2>Create Faculty Account</h2>
        <p>Register as a teacher to record lectures, generate study notes, and track student mastery.</p>
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
          <label htmlFor="reg-teacher-id">Teacher ID *</label>
          <input
            id="reg-teacher-id"
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
          <label htmlFor="reg-teacher-name">Full Name *</label>
          <input
            id="reg-teacher-name"
            type="text"
            className="form-input"
            placeholder="e.g. Dr. C.V. Raman / Prof. Anita Sharma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
            required
            autoComplete="name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-teacher-class">Primary Teaching Class</label>
          <select
            id="reg-teacher-class"
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
          <label htmlFor="reg-teacher-password">Password *</label>
          <div className="password-input-wrapper">
            <input
              id="reg-teacher-password"
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
          <label htmlFor="reg-teacher-confirm">Confirm Password</label>
          <input
            id="reg-teacher-confirm"
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
          {loading ? "Creating faculty account..." : "Complete Teacher Registration"}
        </button>
      </form>

      <div className="auth-card-footer">
        <p>
          Already registered?{" "}
          <button type="button" className="text-link bold-link" onClick={onNavigateLogin}>
            Sign in
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
    </div>
  );
}
