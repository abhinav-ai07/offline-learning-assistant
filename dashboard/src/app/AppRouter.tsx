import { useDoubtNotifications } from "../features/useDoubtNotifications";
import { StudentDoubts, TeacherDoubts } from "../features/Doubts";

import { Administration, PortalLogin } from "../School";
import { useCallback, useEffect, useState } from "react";
import { getMe, getStudentNotifications, logout } from "../api";
import { useRealtimeConnection } from "../realtime";
import type { AppNotification, AuthUser, LessonDetail } from "../types";
import type { BreadcrumbItem } from "../shared/components/Breadcrumbs";
import { StudentLayout, type StudentNavSection } from "../shared/layouts/StudentLayout";
import { TeacherLayout, type TeacherNavSection } from "../shared/layouts/TeacherLayout";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { StudentOverview } from "../features/student/overview/StudentOverview";
import { MySubjects } from "../features/student/subjects/MySubjects";
import { StudentLessonView } from "../features/student/lessons/StudentLessonView";
import { StudentTranscriptView } from "../features/student/transcript/StudentTranscriptView";
import { AskIlaView } from "../features/student/ask-ila/AskIlaView";
import { PracticeQuizzesView } from "../features/student/practice/PracticeQuizzesView";
import { StudentStudyBuilder } from "../features/student/study-builder/StudentStudyBuilder";
import { StudentProgressView } from "../components/StudentProgressView";
import { TeacherOverview } from "../features/teacher/overview/TeacherOverview";
import { MyClasses } from "../features/teacher/classes/MyClasses";
import { LessonStudio } from "../features/teacher/lesson-studio/LessonStudio";
import { LessonLibrary } from "../features/teacher/lesson-library/LessonLibrary";
import { StudentActivity } from "../features/teacher/student-activity/StudentActivity";
import { PerformanceInsights } from "../features/teacher/performance/PerformanceInsights";

export function AppRouter() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("ila_theme") as "dark" | "light") || "light";
  });

  // Current path state
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || "/");

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Student specific navigation states
  const [studentSection, setStudentSection] = useState<StudentNavSection>("overview");
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [quizLesson, setQuizLesson] = useState<LessonDetail | null>(null);
  const [askContextLesson, setAskContextLesson] = useState<LessonDetail | null>(null);

  // Teacher specific navigation states
  const [editLesson, setEditLesson] = useState<string>();
  const [teacherSection, setTeacherSection] = useState<TeacherNavSection>("overview");

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ila_theme", theme);
  }, [theme]);

  useRealtimeConnection(Boolean(user));

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Browser history synchronization
  const doubtInbox = useDoubtNotifications(user?.role === "teacher" ? user.id : undefined);
  const [openRequest, setOpenRequest] = useState(0);
  const navigateTo = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || "/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Fetch current authenticated user on mount
  useEffect(() => {
    let isMounted = true;
    getMe()
      .then((res) => {
        if (!isMounted) return;
        setUser(res.user);

        // Direct to appropriate portal based on role
        if (res.user.role === "admin") {
          navigateTo("/admin/overview");
        } else if (res.user.role === "teacher") {
          if (!window.location.pathname.startsWith("/teacher")) {
            navigateTo("/teacher/overview");
          }
        } else {
          if (!window.location.pathname.startsWith("/student")) {
            navigateTo("/student/overview");
          }
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setUser(null);
      })
      .finally(() => {
        if (isMounted) setAuthChecking(false);
      });

    return () => {
      isMounted = false;
    };
  }, [navigateTo]);

  // Sync current section with path
  useEffect(() => {
    if (!user) return;

    if (user.role === "student") {
      if (currentPath.includes("/student/subjects")) {
        setStudentSection("subjects");
      } else if (currentPath.includes("/student/builder")) {
        setStudentSection("builder");
      } else if (currentPath.includes("/student/transcribe")) {
        setStudentSection("transcribe");
      } else if (currentPath.includes("/student/ask")) {
        setStudentSection("ask");
      } else if (currentPath.includes("/student/practice")) {
        setStudentSection("practice");
      } else if (currentPath.includes("/student/progress")) {
        setStudentSection("progress");
      } else {
        setStudentSection("overview");
      }
    } else {
      if (currentPath.includes("/teacher/classes")) setTeacherSection("classes");
      else if (currentPath.includes("/teacher/studio")) setTeacherSection("studio");
      else if (currentPath.includes("/teacher/doubts")) setTeacherSection("doubts");
      else if (currentPath.includes("/teacher/library")) setTeacherSection("library");
      else if (currentPath.includes("/teacher/activity")) setTeacherSection("activity");
      else if (currentPath.includes("/teacher/settings")) setTeacherSection("settings");
      else if (currentPath.includes("/teacher/insights")) setTeacherSection("insights");
      else setTeacherSection("overview");
    }
  }, [currentPath, user]);

  // Load student notifications
  const refreshNotifications = useCallback(() => {
    if (user && user.role === "student") {
      getStudentNotifications()
        .then((data) => setNotifications(data))
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    refreshNotifications();

    if (user?.role !== "student") return;

    const timer = window.setInterval(refreshNotifications, 15000);
    window.addEventListener("focus", refreshNotifications);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshNotifications);
    };
  }, [refreshNotifications, user]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setActiveLessonId(null);
      setAskContextLesson(null);
      navigateTo("/" + (user?.role || "student") + "/login");
    }
  };

  const handleAuthSuccess = (authUser: AuthUser) => {
    setUser(authUser);

    if (authUser.role === "admin") {
      navigateTo("/admin/overview");
    } else if (authUser.role === "teacher") {
      setTeacherSection("overview");
      navigateTo("/teacher/overview");
    } else {
      setStudentSection("overview");
      navigateTo("/student/overview");
    }
  };

  if (authChecking) {
    return (
      <div className="portal-splash-screen">
        <div className="spinner spinner-large" />
        <h3 style={{ marginTop: 16 }}>
          Loading Offline Intelligent Lecture Assistant...
        </h3>
      </div>
    );
  }

  // ===================== UNAUTHENTICATED ROUTES =====================
  if (!user) {
    const role = currentPath.startsWith("/admin")
      ? "admin"
      : currentPath.startsWith("/teacher")
        ? "teacher"
        : "student";

    return <PortalLogin key={role} role={role} success={handleAuthSuccess} />;
  }

  if (user.role === "admin") {
    return <Administration name={user.full_name} logout={handleLogout} />;
  }

  // ===================== STUDENT PORTAL =====================
  if (user.role === "student") {
    // Breadcrumbs construction
    const breadcrumbItems: BreadcrumbItem[] = [
      { label: "Home", onClick: () => navigateTo("/student/overview") },
    ];

    if (studentSection === "overview") {
      breadcrumbItems.push({ label: "Overview", active: true });
    } else if (studentSection === "subjects") {
      breadcrumbItems.push({
        label: "My Subjects",
        onClick: () => {
          setActiveLessonId(null);
          navigateTo("/student/subjects");
        },
      });

      if (activeLessonId) {
        breadcrumbItems.push({ label: "Classroom Lesson", active: true });
      }
    } else if (studentSection === "builder") {
      breadcrumbItems.push({ label: "Smart Study Builder", active: true });
    } else if (studentSection === "transcribe") {
      breadcrumbItems.push({ label: "Audio Transcripts", active: true });
    } else if (studentSection === "ask") {
      breadcrumbItems.push({ label: "Doubt & Question Center", active: true });
    } else if (studentSection === "practice") {
      breadcrumbItems.push({ label: "Practice & Assessment", active: true });
    } else if (studentSection === "progress") {
      breadcrumbItems.push({ label: "My Progress", active: true });
    }

    return (
      <ErrorBoundary fallbackTitle="Student Portal encountered an error">
        <StudentLayout
          user={user}
          currentSection={studentSection}
          onNavigate={(sec) => {
            setActiveLessonId(null);
            setQuizLesson(null);
            setStudentSection(sec);
            navigateTo(`/student/${sec}`);
          }}
          breadcrumbs={breadcrumbItems}
          onOpenLesson={(id) => {
            setActiveLessonId(id);
            setStudentSection("subjects");
            navigateTo("/student/subjects");
          }}
          notifications={notifications}
          onRefreshNotifications={refreshNotifications}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        >
          {studentSection === "overview" && (
            <StudentOverview
              user={user}
              onOpenLesson={(lessonId) => {
                setActiveLessonId(lessonId);
                setStudentSection("subjects");
                navigateTo("/student/subjects");
              }}
              onNavigateSubjects={() => {
                setActiveLessonId(null);
                setStudentSection("subjects");
                navigateTo("/student/subjects");
              }}
              onNavigateTranscribe={() => {
                setStudentSection("transcribe");
                navigateTo("/student/transcribe");
              }}
              onNavigatePractice={() => {
                setStudentSection("practice");
                navigateTo("/student/practice");
              }}
              onNavigateProgress={() => {
                setStudentSection("progress");
                navigateTo("/student/progress");
              }}
            />
          )}

          {studentSection === "subjects" && (
            activeLessonId ? (
              <StudentLessonView
                studentKey={user.id}
                lessonId={activeLessonId}
                onBack={() => setActiveLessonId(null)}
                onAskAboutLesson={(lesson) => {
                  setAskContextLesson(lesson);
                  setStudentSection("ask");
                  navigateTo("/student/ask");
                }}
                onStartQuiz={(lesson) => {
                  setQuizLesson(lesson);
                  setStudentSection("practice");
                  navigateTo("/student/practice");
                }}
              />
            ) : (
              <MySubjects
                user={user}
                onSelectLesson={(lessonId) => setActiveLessonId(lessonId)}
              />
            )
          )}

          {studentSection === "transcribe" && (
            <StudentTranscriptView
              user={user}
              onOpenLesson={(lessonId) => {
                setActiveLessonId(lessonId);
                setStudentSection("subjects");
                navigateTo("/student/subjects");
              }}
              onNavigateSubjects={() => {
                setActiveLessonId(null);
                setStudentSection("subjects");
                navigateTo("/student/subjects");
              }}
            />
          )}

          {studentSection === "ask" && (
            <div className="student-doubt-center">
              <AskIlaView user={user} initialLesson={askContextLesson} />
              <StudentDoubts />
            </div>
          )}

          {studentSection === "builder" && (
            <StudentStudyBuilder user={user} />
          )}

          {studentSection === "practice" && (
            <PracticeQuizzesView lesson={quizLesson} user={user} />
          )}

          {studentSection === "progress" && (
            <StudentProgressView
              onPracticeTopic={() => {
                setStudentSection("practice");
                navigateTo("/student/practice");
              }}
            />
          )}
        </StudentLayout>
      </ErrorBoundary>
    );
  }

  // ===================== TEACHER PORTAL =====================
  const teacherBreadcrumbItems: BreadcrumbItem[] = [
    { label: "Faculty", onClick: () => navigateTo("/teacher/overview") },
  ];

  if (teacherSection === "overview") {
    teacherBreadcrumbItems.push({ label: "Overview", active: true });
  } else if (teacherSection === "classes") {
    teacherBreadcrumbItems.push({ label: "My Classes", active: true });
  } else if (teacherSection === "studio") {
    teacherBreadcrumbItems.push({ label: "Lesson Studio", active: true });
  } else if (teacherSection === "doubts") {
    teacherBreadcrumbItems.push({ label: "Doubts & FAQs", active: true });
  } else if (teacherSection === "library") {
    teacherBreadcrumbItems.push({ label: "Lesson Library", active: true });
  } else if (teacherSection === "activity") {
    teacherBreadcrumbItems.push({ label: "Student Activity", active: true });
  } else if (teacherSection === "insights") {
    teacherBreadcrumbItems.push({ label: "Performance & Insights", active: true });
  } else if (teacherSection === "settings") {
    teacherBreadcrumbItems.push({ label: "Settings", active: true });
  }

  return (
    <ErrorBoundary fallbackTitle="Teacher Portal encountered an error">
      <TeacherLayout
        user={user}
        notifications={doubtInbox.items}
        onOpenDoubt={id => { navigateTo("/teacher/doubts/" + id); setOpenRequest(v => v + 1); }}
        currentSection={teacherSection}
        onNavigate={(sec) => {
          setEditLesson(undefined);
          setTeacherSection(sec);
          navigateTo(`/teacher/${sec}`);
        }}
        breadcrumbs={teacherBreadcrumbItems}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        {teacherSection === "overview" && (
          <TeacherOverview
            user={user}
            onNavigateStudio={() => {
              setTeacherSection("studio");
              navigateTo("/teacher/studio");
            }}
            onNavigateClasses={() => {
              setTeacherSection("classes");
              navigateTo("/teacher/classes");
            }}
            onNavigateLibrary={() => {
              setTeacherSection("library");
              navigateTo("/teacher/library");
            }}
            onNavigateActivity={() => {
              setTeacherSection("activity");
              navigateTo("/teacher/activity");
            }}
            onNavigateInsights={() => {
              setTeacherSection("insights");
              navigateTo("/teacher/insights");
            }}
          />
        )}

        {teacherSection === "doubts" && <TeacherDoubts key={currentPath + openRequest} target={currentPath.split("/")[3]} notifications={doubtInbox.items} onView={doubtInbox.markRead} />}
        {teacherSection === "classes" && (
          <MyClasses
            user={user}
            onNavigateInsights={() => {
              setTeacherSection("insights");
              navigateTo("/teacher/insights");
            }}
            onOpenLesson={(id) => {
              setEditLesson(id);
              setTeacherSection("studio");
              navigateTo("/teacher/studio");
            }}
          />
        )}

        {teacherSection === "studio" && (
          <LessonStudio
            lessonId={editLesson}
            user={user}
            onLessonPublished={() => {
              setTeacherSection("library");
              navigateTo("/teacher/library");
            }}
            onNavigateLibrary={() => {
              setTeacherSection("library");
              navigateTo("/teacher/library");
            }}
          />
        )}

        {teacherSection === "library" && (
          <LessonLibrary
            user={user}
            onOpenLesson={(id) => {
              setEditLesson(id);
              setTeacherSection("studio");
              navigateTo("/teacher/studio");
            }}
            onEditInStudio={(id) => {
              setEditLesson(id);
              setTeacherSection("studio");
              navigateTo("/teacher/studio");
            }}
          />
        )}

        {teacherSection === "activity" && (
          <StudentActivity user={user} />
        )}

        {teacherSection === "insights" && (
          <PerformanceInsights user={user} />
        )}
      </TeacherLayout>
    </ErrorBoundary>
  );
}
