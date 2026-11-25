import {PortalShell} from "../components/AcademicUI";
import { AccountPassword } from "../../School";
import React from "react";
import type { AuthUser } from "../../types";
import {
  AwardIcon,
  BarChartIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CpuIcon,
  FileTextIcon,
  FolderIcon,
  GraduationCapIcon,
  LogOutIcon,
  MicIcon,
  MoonIcon,
  PlayIcon,
  ShieldIcon,
  SunIcon,
  TrendingUpIcon,
  UsersIcon,
} from "../../components/icons";
import { Breadcrumbs, type BreadcrumbItem } from "../components/Breadcrumbs";

export type TeacherNavSection =
  | "overview"
  | "classes"
  | "studio"
  | "library"
  | "activity"
  | "insights" | "settings";

interface TeacherLayoutProps {
  user: AuthUser;
  currentSection: TeacherNavSection;
  onNavigate: (section: TeacherNavSection) => void;
  breadcrumbs: BreadcrumbItem[];
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export function TeacherLayout({
  user,
  currentSection,
  onNavigate,
  breadcrumbs,
  onLogout,
  theme,
  onToggleTheme,
  children,
}: TeacherLayoutProps) {
  return <PortalShell portal="Teacher" name={user.full_name} active={currentSection==="activity"?"insights":currentSection} navigate={onNavigate}
    items={[[ "overview","Overview"],["classes","My Students"],["studio","Lesson Studio"],["library","Published Lessons"],["insights","Analytics"],["settings","Settings"]]}
    tools={<button className="header-icon-btn" aria-label="Toggle theme" onClick={onToggleTheme}>{theme==="dark"?<SunIcon/>:<MoonIcon/>}</button>}
    footer={<button onClick={onLogout}>Sign out</button>}>
    <Breadcrumbs items={breadcrumbs}/>
    {(currentSection==="activity"||currentSection==="insights") && <nav className="inline-tabs"><button onClick={()=>onNavigate("insights")}>Performance</button><button onClick={()=>onNavigate("activity")}>Student activity</button></nav>}
    {currentSection==="settings"?<section><h1>Settings</h1><p>Manage your school account and appearance.</p><AccountPassword logout={onLogout}/></section>:children}
    </PortalShell>;
}
