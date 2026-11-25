import { useState } from "react";
import { forgotPassword } from "../../api";
import { messageOf } from "../../format";
import { CheckCircleIcon, WarningIcon, XIcon } from "../../components/icons";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  roleHint?: "student" | "teacher";
}

export function ForgotPasswordModal({ isOpen, onClose, roleHint = "student" }: ForgotPasswordModalProps) {
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!identifier.trim()) {
      setError(roleHint === "student" ? "Please enter your Student USN / Roll number." : "Please enter your Teacher ID.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const resp = await forgotPassword({
        full_name: fullName.trim() || identifier.trim(),
        identifier: identifier.trim(),
        role_hint: roleHint,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(resp.message);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Reset Password</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="modal-desc">
            Reset your password using your name and {roleHint === "student" ? "roll number" : "teacher ID"}.
          </p>

          {error && (
            <div className="form-error-alert">
              <WarningIcon width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="form-success-alert">
              <CheckCircleIcon width={16} height={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="fp-id">{roleHint === "student" ? "Student USN / Roll Number *" : "Teacher ID *"}</label>
            <input
              id="fp-id"
              type="text"
              className="form-input"
              placeholder={roleHint === "student" ? "e.g. 1MS21CS001" : "e.g. TCH101"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="fp-name">Full Name (Optional)</label>
            <input
              id="fp-name"
              type="text"
              className="form-input"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="fp-newpassword">New Password (min 6 characters)</label>
            <input
              id="fp-newpassword"
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="fp-confirmpassword">Confirm New Password</label>
            <input
              id="fp-confirmpassword"
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Updating..." : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
