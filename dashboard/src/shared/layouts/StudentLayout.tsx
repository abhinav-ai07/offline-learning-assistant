import {PortalShell} from "../components/AcademicUI";
import { AccountPassword } from "../../School";
import React, { useEffect, useState } from "react";
import type { AppNotification, AuthUser } from "../../types";
import { subscribeRealtime } from "../../realtime";
import {
  BarChartIcon,
  BellIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CpuIcon,
  GraduationCapIcon,
  HelpCircleIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from "../../components/icons";
import { Breadcrumbs, type BreadcrumbItem } from "../components/Breadcrumbs";
import { markNotificationRead } from "../../api";

<<<<<<< HEAD
export type StudentNavSection = "overview" | "subjects" | "builder" | "ask" | "practice" | "progress";
=======
export type StudentNavSection = "overview" | "subjects" | "transcribe" | "ask" | "practice" | "progress";
>>>>>>> origin/main

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
  const [searchText, setSearchText] = useState("");

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayName = user.full_name.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");

  useEffect(() => {
    return subscribeRealtime(
      ["lesson_published", "lesson_updated", "lesson_archived"],
      () => onRefreshNotifications(),
    );
  }, [onRefreshNotifications]);

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

<<<<<<< HEAD
  return <PortalShell portal="Student" name={user.full_name} portalIcon={<GraduationCapIcon width={22} height={22}/>} active={currentSection} navigate={onNavigate}
    items={[[ "overview","Overview"],["subjects","My Subjects"],["builder","Smart Study Builder"],["ask","Doubt & Question Center"],["practice","Practice & Assessment"],["progress","My Progress"]]}
    renderNavItem={(key,label)=><><span className="student-nav-icon">{key==="overview"?<GraduationCapIcon/>:key==="subjects"?<BookIcon/>:key==="builder"?<CpuIcon/>:key==="ask"?<HelpCircleIcon/>:key==="practice"?<CheckCircleIcon/>:<BarChartIcon/>}</span><span>{label}</span></>}
    footer={<><AccountPassword logout={onLogout}/><button type="button" onClick={onLogout}><LogOutIcon width={16} height={16}/>Sign out</button></>}
    tools={<>
            {currentSection === "overview" && (
              <label className="student-header-search">
                <SearchIcon width={17} height={17}/>
                <input
                  type="search"
                  aria-label="Search subjects, lectures, or notes"
                  placeholder="Search subjects, lectures, or notes..."
                  value={searchText}
                  onChange={(event) => {
                    setSearchText(event.target.value);
                    window.dispatchEvent(new CustomEvent("ila:student-search", { detail: event.target.value }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearchText("");
                  }}
                />
                <kbd>Ctrl K</kbd>
              </label>
            )}
            <div className="notification-dropdown-wrapper">
=======
  return <PortalShell portal="Student" name={user.full_name} active={currentSection} navigate={onNavigate}
    items={[[ "overview","Overview"],["subjects","My Subjects"],["transcribe","Audio Transcripts"],["ask","Ask ILA"],["practice","Adaptive Quizzes"],["progress","My Progress"]]}
    footer={<><AccountPassword logout={onLogout}/><button onClick={onLogout}>Sign out</button></>}
    tools={<>            <div className="notification-dropdown-wrapper">
>>>>>>> origin/main
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

            <span className="student-user-chip"><UserIcon width={18} height={18}/><span>{displayName.split(" ")[0]}</span><ChevronDownIcon width={14} height={14}/></span>
</>}><Breadcrumbs items={breadcrumbs}/>{children}</PortalShell>;
}
