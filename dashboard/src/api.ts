import type {
  AcademicClass,
  ActivityLogItem,
  AppConfig,
  AppNotification,
  AskResponse,
  AuthResponse,
  AuthUser,
  ChapterInfo,
  DemoLecture,
  DemoLine,
  GapsResponse,
  LessonCompletion,
  LessonDetail,
  LessonSummary,
  NcertNoteDetail,
  NotesResponse,
  PracticeWorkspaceData,
  QuizAnswerResponse,
  QuizStartResponse,
  RemediationAnswerResult,
  RemediationPack,
  StoredLectureNotesResponse,
  StudentOverview,
  StudentProgress,
  StudentTranscribeResponse,
  SubjectInfo,
  SubjectTree,
  TeacherClassOverview,
  TeacherGapsAnalytics,
  TeacherImprovementTracking,
  TeacherOverview,
  TeacherStudentDetail,
  TeacherStudentsResponse,
  TimetableSlot,
  TranscribeResponse,
} from "./types";

const TOKEN_KEY = "ila.token";
const AUTH_VERSION_KEY = "ila.auth-version";
const AUTH_VERSION = "2";

export function getStoredToken(): string | null {
  try {
    if (window.localStorage.getItem(AUTH_VERSION_KEY) !== AUTH_VERSION) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.setItem(AUTH_VERSION_KEY, AUTH_VERSION);
    }
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    let detail = response.statusText || `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string; message?: string };
      detail = body.detail ?? body.message ?? detail;
    } catch {
      // Keep the status text when the body is not JSON.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

export function getDemo(classLevel: number, subject: string): Promise<DemoLecture> {
  const params = new URLSearchParams({
    class_level: String(classLevel),
    subject,
  });
  return request<DemoLecture>(`/api/demo?${params.toString()}`);
}

export interface NotesRequest {
  lines: DemoLine[];
  title: string;
  class_level: number;
  subject: string;
  profile: string;
  use_llm: boolean;
  use_syllabus?: boolean;
}

export function createNotes(payload: NotesRequest): Promise<NotesResponse> {
  return request<NotesResponse>("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface TranscribeOptions {
  classLevel: number;
  subject: string;
  profile: string;
  useLlm: boolean;
}

export function transcribeFile(
  file: File,
  options: TranscribeOptions,
): Promise<TranscribeResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("class_level", String(options.classLevel));
  body.append("subject", options.subject);
  body.append("profile", options.profile);
  body.append("use_llm", String(options.useLlm));
  return request<TranscribeResponse>("/api/transcribe", {
    method: "POST",
    body,
  });
}

export interface StreamTranscriptCallbacks {
  onStatus?: (event: { stage?: string; [key: string]: any }) => void;
  onCaption?: (event: {
    kind: "partial" | "final";
    id?: number;
    text: string;
    start?: number;
    end?: number;
  }) => void;
}

async function readNdjsonStream<T>(
  path: string,
  body: FormData,
  callbacks: StreamTranscriptCallbacks = {},
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(path, {
    method: "POST",
    headers,
    body,
    credentials: "include",
  });
  if (!response.ok) {
    let detail = response.statusText || `Request failed (${response.status})`;
    try {
      const errBody = (await response.json()) as { detail?: string; message?: string };
      detail = errBody.detail ?? errBody.message ?? detail;
    } catch {
      // Ignore parse error
    }
    throw new Error(detail);
  }
  if (!response.body) {
    throw new Error("Streaming response is not supported by this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: T | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const msg = JSON.parse(line);
        if (msg.type === "status") {
          callbacks.onStatus?.(msg);
        } else if (msg.type === "caption") {
          callbacks.onCaption?.(msg);
        } else if (msg.type === "error") {
          throw new Error(msg.detail || msg.message || "Transcription failed");
        } else if (msg.type === "done") {
          donePayload = msg as T;
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
  if (!donePayload) {
    throw new Error("Stream ended before completion.");
  }
  return donePayload;
}

export function transcribeFileStream(
  file: File,
  options: Pick<TranscribeOptions, "classLevel" | "subject">,
  callbacks: StreamTranscriptCallbacks = {},
): Promise<TranscribeResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("class_level", String(options.classLevel));
  body.append("subject", options.subject);
  return readNdjsonStream<TranscribeResponse>("/api/transcribe/stream", body, callbacks);
}

export interface StudentTranscribeOptions {
  subject?: string;
  profile?: string;
  useLlm?: boolean;
  title?: string;
  lines?: DemoLine[];
}

export function studentTranscribeFile(
  file: File,
  options: StudentTranscribeOptions = {},
): Promise<StudentTranscribeResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("subject", options.subject ?? "auto");
  body.append("profile", options.profile ?? "auto");
  body.append("use_llm", String(options.useLlm ?? true));
  if (options.title) {
    body.append("title", options.title);
  }
  if (options.lines && options.lines.length > 0) {
    body.append("lines_json", JSON.stringify(options.lines));
  }
  return request<StudentTranscribeResponse>("/api/student/transcribe", {
    method: "POST",
    body,
  });
}

export function studentTranscribeFileStream(
  file: File,
  options: StudentTranscribeOptions = {},
  callbacks: StreamTranscriptCallbacks = {},
): Promise<StudentTranscribeResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("subject", options.subject ?? "auto");
  body.append("profile", options.profile ?? "auto");
  body.append("use_llm", String(options.useLlm ?? true));
  if (options.title) {
    body.append("title", options.title);
  }
  if (options.lines && options.lines.length > 0) {
    body.append("lines_json", JSON.stringify(options.lines));
  }
  return readNdjsonStream<StudentTranscribeResponse>("/api/student/transcribe/stream", body, callbacks);
}

export interface NcertNoteItem {
  unit: number;
  title: string;
  chapter: number;
  filename: string;
  words: number;
  pages: number;
}

export function getNcertNotesList(): Promise<NcertNoteItem[]> {
  return request<NcertNoteItem[]>("/api/ncert-notes");
}

export function getNcertUnitNote(unit: number): Promise<NcertNoteDetail> {
  return request<NcertNoteDetail>(`/api/ncert-notes/${unit}`);
}

// ------------------------------------------------------------------- Q&A
export interface AskOptions {
  question: string;
  lines?: DemoLine[];
  classLevel: number;
  subject: string;
  chapter?: number | null;
  topK?: number;
  useLlm?: boolean;
  profile?: string;
}

export function askQuestion(options: AskOptions): Promise<AskResponse> {
  return request<AskResponse>("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: options.question,
      lines: options.lines ?? [],
      class_level: options.classLevel,
      subject: options.subject,
      chapter: options.chapter ?? null,
      top_k: options.topK ?? 5,
      use_llm: options.useLlm ?? true,
      profile: options.profile ?? "potato",
    }),
  });
}

// ---------------------------------------------------------------- quizzes
export interface StartQuizOptions {
  lessonId?: string;
  chapterNumber?: number;
  studentId: string;
  classLevel: number;
  subject: string;
  topic?: string | null;
  length?: number;
  difficulty?: number | null;
  lines?: DemoLine[];
}

export function startQuiz(options: StartQuizOptions): Promise<QuizStartResponse> {
  return request<QuizStartResponse>("/api/quiz/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lesson_id: options.lessonId,
      chapter_number: options.chapterNumber,
      student_id: options.studentId,
      class_level: options.classLevel,
      subject: options.subject,
      topic: options.topic ?? null,
      length: options.length ?? 5,
      difficulty: options.difficulty ?? null,
      lines: options.lines ?? [],
    }),
  });
}

export interface AnswerQuizOptions {
  quizId: string;
  questionId: string;
  answer?: string;
  answerIndex?: number | null;
  responseMs?: number | null;
}

export function answerQuiz(options: AnswerQuizOptions): Promise<QuizAnswerResponse> {
  return request<QuizAnswerResponse>("/api/quiz/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quiz_id: options.quizId,
      question_id: options.questionId,
      answer: options.answer ?? "",
      answer_index: options.answerIndex ?? null,
      response_ms: options.responseMs ?? null,
    }),
  });
}

export function getGaps(studentId: string, limit = 3): Promise<GapsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<GapsResponse>(
    `/api/students/${encodeURIComponent(studentId)}/gaps?${params.toString()}`,
  );
}

// ----------------------------------------------------------- Auto-Remediation
export interface GenerateRemediationOptions {
  studentId: string;
  topic?: string | null;
  classLevel?: number;
  subject?: string;
  count?: number;
  lines?: DemoLine[];
}

export function generateRemediation(options: GenerateRemediationOptions): Promise<RemediationPack> {
  return request<RemediationPack>("/api/remediation/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: options.studentId,
      topic: options.topic ?? null,
      class_level: options.classLevel,
      subject: options.subject,
      count: options.count ?? 3,
      lines: options.lines ?? [],
    }),
  });
}

export interface SubmitRemediationOptions {
  packId: string;
  studentId: string;
  itemId: string;
  answer: string;
  selectedIndex?: number | null;
  responseMs?: number;
}

export function submitRemediation(options: SubmitRemediationOptions): Promise<RemediationAnswerResult> {
  return request<RemediationAnswerResult>("/api/remediation/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pack_id: options.packId,
      student_id: options.studentId,
      item_id: options.itemId,
      answer: options.answer,
      selected_index: options.selectedIndex ?? null,
      response_ms: options.responseMs ?? 4000,
    }),
  });
}

// ------------------------------------------------------------------ Authentication
export interface RegisterStudentPayload {
  full_name?: string;
  student_identifier: string;
  password: string;
  class_level?: number;
  section?: string;
}

export async function registerStudent(payload: RegisterStudentPayload): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export interface RegisterTeacherPayload {
  full_name?: string;
  teacher_id: string;
  password: string;
  confirm_password?: string;
  class_level?: number;
}

export async function registerTeacher(payload: RegisterTeacherPayload): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/api/auth/teacher/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export interface ForgotPasswordPayload {
  full_name?: string;
  identifier: string;
  role_hint: "student" | "teacher" | "admin";
  new_password: string;
  confirm_password: string;
}

export function forgotPassword(payload: ForgotPasswordPayload): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface LoginPayload {
  full_name?: string;
  identifier: string;
  password: string;
  remember_me?: boolean;
  role_hint: "student" | "teacher" | "admin";
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export async function logout(): Promise<{ status: string }> {
  try {
    return await request<{ status: string }>("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    setStoredToken(null);
  }
}

export function getMe(): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>("/api/auth/me");
}

export interface BootstrapTeacherPayload {
  full_name: string;
  teacher_id: string;
  password: string;
  class_level?: number;
}

export async function bootstrapTeacher(payload: BootstrapTeacherPayload): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/api/auth/bootstrap-teacher", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export function createTeacher(payload: BootstrapTeacherPayload): Promise<{ status: string; user: AuthUser }> {
  return request<{ status: string; user: AuthUser }>("/api/auth/teacher/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ------------------------------------------------------------- Student Workspace
export function getStudentOverview(): Promise<StudentOverview> {
  return request<StudentOverview>("/api/student/overview");
}

export function getStudentProgress(): Promise<StudentProgress> {
  return request<StudentProgress>("/api/student/progress");
}

// ------------------------------------------------------------- Teacher Workspace
export function getTeacherOverview(): Promise<TeacherOverview> {
  return request<TeacherOverview>("/api/teacher/overview");
}

export function getTeacherStudents(
  search?: string,
  classLevel?: number,
): Promise<TeacherStudentsResponse> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (classLevel) params.set("class_level", String(classLevel));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<TeacherStudentsResponse>(`/api/teacher/students${query}`);
}

export function getTeacherStudentDetail(studentId: string): Promise<TeacherStudentDetail> {
  return request<TeacherStudentDetail>(`/api/teacher/students/${encodeURIComponent(studentId)}`);
}

export function getTeacherGaps(): Promise<TeacherGapsAnalytics> {
  return request<TeacherGapsAnalytics>("/api/teacher/gaps");
}

export function getTeacherImprovement(): Promise<TeacherImprovementTracking> {
  return request<TeacherImprovementTracking>("/api/teacher/improvement");
}

export function getStoredLectureNotes(
  chapterNumber: number,
  classLevel: number = 10,
  subject: string = "maths",
): Promise<StoredLectureNotesResponse> {
  const params = new URLSearchParams({
    class_level: String(classLevel),
    subject,
  });
  return request<StoredLectureNotesResponse>(`/api/lecture-notes/${chapterNumber}?${params.toString()}`);
}

// ------------------------------------------------------------- Academic Hierarchy
export function getClasses(): Promise<AcademicClass[]> {
  return request<AcademicClass[]>("/api/classes");
}

export function getClassSubjects(classLevel: number): Promise<SubjectInfo[]> {
  return request<SubjectInfo[]>(`/api/classes/${classLevel}/subjects`);
}

export function getClassChapters(classLevel: number, subject: string): Promise<ChapterInfo[]> {
  return request<ChapterInfo[]>(`/api/classes/${classLevel}/subjects/${encodeURIComponent(subject)}/chapters`);
}

export function getClassTimetable(classLevel: number, section: string = "A"): Promise<TimetableSlot[]> {
  return request<TimetableSlot[]>(`/api/classes/${classLevel}/timetable?section=${encodeURIComponent(section)}`);
}

// ------------------------------------------------------------- Student Portal APIs
export function getStudentSubjectsTree(): Promise<SubjectTree[]> {
  return request<SubjectTree[]>("/api/student/subjects");
}

export function getStudentLessonDetail(lessonId: string): Promise<{ lesson: LessonDetail; completion: LessonCompletion }> {
  return request<{ lesson: LessonDetail; completion: LessonCompletion }>(`/api/student/lessons/${encodeURIComponent(lessonId)}`);
}

export function recordLessonActivity(lessonId: string, eventType: string, metadata?: any): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/student/lessons/${encodeURIComponent(lessonId)}/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, metadata }),
  });
}

export function markLessonComplete(lessonId: string, completed: boolean = true): Promise<LessonCompletion> {
  return request<LessonCompletion>(`/api/student/lessons/${encodeURIComponent(lessonId)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
}

export function getStudentNotifications(): Promise<AppNotification[]> {
  return request<AppNotification[]>("/api/student/notifications");
}

export function markNotificationRead(notificationId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/student/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
  });
}

export function getStudentPractice(): Promise<PracticeWorkspaceData> {
  return request<PracticeWorkspaceData>("/api/student/practice");
}

// ------------------------------------------------------------- Teacher Portal APIs
export function getTeacherClasses(): Promise<TeacherClassOverview[]> {
  return request<TeacherClassOverview[]>("/api/teacher/classes");
}

export interface TeacherLessonsFilter {
  classLevel?: number;
  section?: string;
  subject?: string;
  status?: string;
  search?: string;
}

export function getTeacherLessons(filters?: TeacherLessonsFilter): Promise<LessonSummary[]> {
  const params = new URLSearchParams();
  if (filters?.classLevel !== undefined) params.set("class_level", String(filters.classLevel));
  if (filters?.section) params.set("section", filters.section);
  if (filters?.subject) params.set("subject", filters.subject);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const q = params.toString() ? `?${params.toString()}` : "";
  return request<LessonSummary[]>(`/api/teacher/lessons${q}`);
}

export function getTeacherLesson(lessonId: string): Promise<LessonDetail> {
  return request<LessonDetail>(`/api/teacher/lessons/${encodeURIComponent(lessonId)}`);
}

export function createTeacherLesson(payload: Partial<LessonDetail>): Promise<{ lesson_id: string; status: string; message: string }> {
  return request<{ lesson_id: string; status: string; message: string }>("/api/teacher/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateTeacherLesson(lessonId: string, payload: Partial<LessonDetail>): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>(`/api/teacher/lessons/${encodeURIComponent(lessonId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function publishTeacherLesson(lessonId: string): Promise<{ status: string; lesson: LessonDetail; message: string }> {
  return request<{ status: string; lesson: LessonDetail; message: string }>(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/publish`, {
    method: "POST",
  });
}

export function archiveTeacherLesson(lessonId: string): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/archive`, {
    method: "POST",
  });
}

export function regenerateTeacherLessonNotes(lessonId: string): Promise<{ status: string; notes_markdown: string; notes_json: any; message: string }> {
  return request<{ status: string; notes_markdown: string; notes_json: any; message: string }>(`/api/teacher/lessons/${encodeURIComponent(lessonId)}/regenerate-notes`, {
    method: "POST",
  });
}

export interface TeacherActivityFilter {
  classLevel?: number;
  section?: string;
  studentId?: string;
  limit?: number;
}

export function getTeacherActivity(filters?: TeacherActivityFilter): Promise<ActivityLogItem[]> {
  const params = new URLSearchParams();
  if (filters?.classLevel !== undefined) params.set("class_level", String(filters.classLevel));
  if (filters?.section) params.set("section", filters.section);
  if (filters?.studentId) params.set("student_id", filters.studentId);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const q = params.toString() ? `?${params.toString()}` : "";
  return request<ActivityLogItem[]>(`/api/teacher/activity${q}`);
}

