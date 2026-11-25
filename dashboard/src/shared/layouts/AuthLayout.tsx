import React from "react";
import { BookIcon, CpuIcon, MoonIcon, SunIcon } from "../../components/icons";

interface AuthLayoutProps {
  children: React.ReactNode;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function AuthLayout({ children, theme, onToggleTheme }: AuthLayoutProps) {
  return (
    <div className="auth-page-wrapper">
      <header className="auth-top-bar">
        <div className="auth-brand">
          <div className="auth-brand-logo">
            <BookIcon width={22} height={22} />
          </div>
          <div className="auth-brand-text">
            <span className="brand-title">ILA</span>
            <span className="brand-subtitle">Offline Intelligent Lecture Assistant</span>
          </div>
        </div>

        <div className="auth-top-actions">
          <span className="offline-pill">
            <CpuIcon width={13} height={13} />
            <span>Offline-First · Local AI</span>
          </span>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
          </button>
        </div>
      </header>

      <main className="auth-main-container">
        <div className="auth-content-box">
          {children}
        </div>
      </main>

      <footer className="auth-footer">
        <p>Offline Intelligent Lecture Assistant · Classes 9–12 NCERT Curriculum</p>
        <p className="footer-sub">Private &amp; Local Persistence · Runs locally on device without cloud dependencies</p>
      </footer>
    </div>
  );
}
