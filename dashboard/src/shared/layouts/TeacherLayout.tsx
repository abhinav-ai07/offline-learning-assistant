import {PortalShell} from "../components/AcademicUI";
import { AccountPassword } from "../../School";
import React, { useState } from "react";
import type { DoubtNotice } from "../../features/useDoubtNotifications";
import type { AuthUser } from "../../types";
import {
  BarChartIcon,
  BellIcon,
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
  | "classes"
  | "studio"
  | "doubts"
  | "library"
  | "activity"
  | "insights" | "settings";

interface TeacherLayoutProps {
  user: AuthUser;
  notifications: DoubtNotice[];
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
  user, notifications, onOpenDoubt,
  currentSection,
  onNavigate,
  breadcrumbs,
  onLogout,
  theme,
  onToggleTheme,
  children,
}: TeacherLayoutProps) {
  const [bellOpen, setBellOpen] = useState(false);
  const unread = notifications.filter(n => !n.is_read).length;
  const activeSection = currentSection === "doubts" || currentSection === "studio" || currentSection === "library" || currentSection === "classes"
    ? currentSection
    : currentSection === "settings" ? "overview" : currentSection === "overview" ? "overview" : "classes";
  return <PortalShell portal="Teacher" name={user.full_name} active={activeSection} navigate={onNavigate}
    items={[[ "overview","Overview"],["classes","My Classes"],["studio","Lesson Studio"],["library","Published Lessons"],["doubts","Doubts & FAQs"]]}
    renderNavItem={(key,label)=><><span className="teacher-nav-icon">{key==="overview"?<BarChartIcon/>:key==="classes"?<UsersIcon/>:key==="studio"?<PlayIcon/>:<LayersIcon/>}</span><span>{label}</span>{key === "doubts" && unread > 0 && <span className="doubt-unread" aria-label={unread + " unread doubts"}>{unread}</span>}</>}
    tools={<>
      <div className="notification-dropdown-wrapper" onKeyDown={e => { if (e.key === "Escape") setBellOpen(false); }}>
        <button className="header-icon-btn" aria-label={`Notifications, ${unread} unread doubts`} aria-expanded={bellOpen}
          onClick={() => setBellOpen(v => !v)}><BellIcon/>{unread > 0 && <span className="notification-badge">{unread}</span>}</button>
        {bellOpen && <section className="notification-panel" aria-label="Teacher notifications">
          <div className="notification-panel-header"><strong>Notifications</strong><button aria-label="Close notifications" onClick={() => setBellOpen(false)}>×</button></div>
          <div className="notification-list">{!notifications.length && <p className="notification-empty">No doubt notifications yet.</p>}
            {notifications.map(n => <button key={n.id} className={`notification-item ${n.is_read ? "" : "unread"}`}
              onClick={() => {setBellOpen(false); onOpenDoubt(n.id);}}>
              <span className="notification-item-content"><strong className="notification-title">New doubt from {n.student_name}</strong>
                <span className="notification-message">{n.message}</span><small>{n.created_at}</small></span>
            </button>)}</div>
          <button className="btn btn-outline" onClick={() => {setBellOpen(false); onNavigate("activity");}}>Student activity</button>
        </section>}
      </div>
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
