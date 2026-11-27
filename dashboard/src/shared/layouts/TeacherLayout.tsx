import { NotificationMenu } from "../components/NotificationMenu";
import {PortalShell} from "../components/AcademicUI";
import { AccountPassword } from "../../School";
import React from "react";
import type { DoubtNotice } from "../../features/useDoubtNotifications";
import type { AuthUser } from "../../types";
import {
  BarChartIcon,
  ChevronDownIcon,
  LayersIcon,
  LogOutIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
  UsersIcon,
} from "../../components/icons";
import { Breadcrumbs, type BreadcrumbItem } from "../components/Breadcrumbs";

export type TeacherNavSection =
  | "overview"
  | "calendar"
  | "classes"
  | "studio"
  | "doubts"
  | "library"
  | "activity"
  | "insights" | "settings";

interface TeacherLayoutProps {
  user: AuthUser;
  notifications: DoubtNotice[];
  onNotificationsCleared: (id?: string) => void;
  onOpenDoubt: (id: string) => void;
  currentSection: TeacherNavSection;
  onNavigate: (section: TeacherNavSection) => void;
  breadcrumbs: BreadcrumbItem[];
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export function TeacherLayout({
  user, notifications, onOpenDoubt, onNotificationsCleared,
  currentSection,
  onNavigate,
  breadcrumbs,
  onLogout,
  theme,
  onToggleTheme,
  children,
}: TeacherLayoutProps) {
  const unread = notifications.filter(n => !n.is_read).length;
  const activeSection = currentSection === "doubts" || currentSection === "studio" || currentSection === "library" || currentSection === "classes"
    ? currentSection
    : currentSection === "settings" || currentSection === "calendar" ? "overview" : currentSection === "overview" ? "overview" : "classes";
  return <PortalShell portal="Teacher" name={user.full_name} active={activeSection} navigate={onNavigate}
    items={[[ "overview","Overview"],["classes","My Classes"],["studio","Lesson Studio"],["library","Published Lessons"],["doubts","Doubts & FAQs"]]}
    renderNavItem={(key,label)=><><span className="teacher-nav-icon">{key==="overview"?<BarChartIcon/>:key==="classes"?<UsersIcon/>:key==="studio"?<PlayIcon/>:<LayersIcon/>}</span><span>{label}</span>{key === "doubts" && unread > 0 && <span className="doubt-unread" aria-label={unread + " unread doubts"}>{unread}</span>}</>}
    tools={<>
      <NotificationMenu items={notifications.map(n => ({...n, title: "New doubt from " + n.student_name}))}
        onOpen={onOpenDoubt} onCleared={onNotificationsCleared}
        footer={close => <button className="notice-clear-all" onClick={() => {close(); onNavigate("activity");}}>Student activity</button>}/>
      <button className="header-icon-btn" aria-label="Toggle theme" onClick={onToggleTheme}>{theme==="dark"?<SunIcon/>:<MoonIcon/>}</button>
      <button type="button" className="teacher-profile-button" onClick={()=>onNavigate("settings")} aria-label={`Account settings for ${user.full_name}`}>
        <span className="teacher-avatar">{user.full_name?.trim().charAt(0).toUpperCase() || "T"}</span>
        <span className="teacher-profile-name">{user.full_name}</span>
        <ChevronDownIcon width={14} height={14}/>
      </button>
    </>}
    footer={<button onClick={onLogout}><LogOutIcon width={16} height={16} />Sign out</button>}>
    <div className="teacher-workspace">
      <Breadcrumbs items={breadcrumbs}/>
      {(currentSection==="activity"||currentSection==="insights") && <nav className="inline-tabs" aria-label="Teacher analytics"><button aria-current={currentSection==="insights"?"page":undefined} onClick={()=>onNavigate("insights")}>Performance</button><button aria-current={currentSection==="activity"?"page":undefined} onClick={()=>onNavigate("activity")}>Student activity</button></nav>}
      {currentSection==="settings"?<section className="teacher-settings"><h1>Settings</h1><p>Manage your school account and appearance.</p><AccountPassword logout={onLogout}/></section>:children}
    </div>
    </PortalShell>;
}
