import {PortalShell} from "../components/AcademicUI";
import { AccountPassword } from "../../School";
import React, { useState } from "react";
import type { AppNotification, AuthUser } from "../../types";
import {
  AwardIcon,
  BarChartIcon,
  BellIcon,
  BookIcon,
  CheckCircleIcon,
  GraduationCapIcon,
  HelpCircleIcon,
  LogOutIcon,
  MessageSquareIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from "../../components/icons";
import { Breadcrumbs, type BreadcrumbItem } from "../components/Breadcrumbs";
import { markNotificationRead } from "../../api";

export type StudentNavSection = "overview" | "subjects" | "ask" | "practice" | "progress";

interface StudentLayoutProps {
  user: AuthUser;
  currentSection: StudentNavSection;
  onNavigate: (section: StudentNavSection) => void;
  breadcrumbs: BreadcrumbItem[];
  notifications: AppNotification[];
  onOpenLesson:(id:string)=>void;
  onRefreshNotifications: () => void;
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export function StudentLayout({
  user,
  currentSection,
  onNavigate,
  breadcrumbs,
  notifications,
  onRefreshNotifications,onOpenLesson,
  onLogout,
  theme,
  onToggleTheme,
  children,
}: StudentLayoutProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.id);
        onRefreshNotifications();
      } catch {
        // Continue navigation
      }
    }
    if (notif.link?.includes("subjects") || notif.link?.includes("lesson")) {
      const id = new URL(notif.link, window.location.origin).searchParams.get("lesson");
      if(id) onOpenLesson(id);else onNavigate("subjects");
    } else if (notif.link?.includes("quiz")) {
      onNavigate("practice");
    }
    setShowNotifications(false);
  };

  return <PortalShell portal="Student" name={user.full_name} active={currentSection} navigate={onNavigate}
    items={[[ "overview","Overview"],["subjects","My Subjects"],["ask","Ask ILA"],["practice","Adaptive Quizzes"],["progress","My Progress"]]}
    footer={<><AccountPassword logout={onLogout}/><button onClick={onLogout}>Sign out</button></>}
    tools={<>            <div className="notification-dropdown-wrapper">
              <button
                type="button"
                className={`header-icon-btn ${unreadCount > 0 ? "has-unread" : ""}`}
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="View notifications"
                title="Notifications"
              >
                <BellIcon width={18} height={18} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>

              {showNotifications && (
                <div className="notification-panel">
                  <div className="notification-panel-header">
                    <h4>Classroom Notifications</h4>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setShowNotifications(false)}
                      aria-label="Close notifications"
                    >
                      <XIcon width={14} height={14} />
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="notification-empty">No notifications yet.</div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`notification-item ${!notif.is_read ? "unread" : ""}`}
                          onClick={() => handleNotificationClick(notif)}
                        >
                          <div className="notification-item-icon">
                            <BookIcon width={14} height={14} />
                          </div>
                          <div className="notification-item-content">
                            <span className="notification-title">{notif.title}</span>
                            <span className="notification-message">{notif.message}</span>
                            <span className="notification-date">
                              {new Date(notif.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              className="header-icon-btn"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
            </button>

            {/* User Chip */}
</>}><Breadcrumbs items={breadcrumbs}/>{children}</PortalShell>;
}
