import { NotificationMenu } from "../components/NotificationMenu";
import {PortalShell} from "../components/AcademicUI";
import { AccountPassword } from "../../School";
import React, { useEffect, useState } from "react";
import type { AppNotification, AuthUser } from "../../types";
import { subscribeRealtime } from "../../realtime";
import {
  BarChartIcon,
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
} from "../../components/icons";
import { Breadcrumbs, type BreadcrumbItem } from "../components/Breadcrumbs";
import { markNotificationRead } from "../../api";

export type StudentNavSection = "overview" | "subjects" | "builder" | "transcribe" | "ask" | "practice" | "progress";

interface StudentLayoutProps {
  user: AuthUser;
  currentSection: StudentNavSection;
  onNavigate: (section: StudentNavSection) => void;
  breadcrumbs: BreadcrumbItem[];
  notifications: AppNotification[];
  onNotificationsCleared: (id?: string) => void;
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
  onRefreshNotifications,onOpenLesson,onNotificationsCleared,
  onLogout,
  theme,
  onToggleTheme,
  children,
}: StudentLayoutProps) {
  const [searchText, setSearchText] = useState("");

  const displayName = user.full_name.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");

  useEffect(() => {
    return subscribeRealtime(
      ["lesson_published", "lesson_updated", "lesson_archived", "doubt_updated"],
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
    } else if (notif.link === "/student/ask") {
      onNavigate("ask");
    } else if (notif.link?.includes("quiz")) {
      onNavigate("practice");
    }
  };

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
            <NotificationMenu items={notifications} onCleared={onNotificationsCleared}
              onOpen={id => {const notice = notifications.find(n => n.id === id); if (notice) void handleNotificationClick(notice);}}/>

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
