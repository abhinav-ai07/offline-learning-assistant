export interface AsrInfo {
  engine: string;
  model: string;
  device: string;
  compute_type: string;
}

export interface ChapterSummary {
  number: number;
  title: string;
}

export interface CourseCatalogue {
  class_level: number;
  subject: string;
  label: string;
  chapters: ChapterSummary[];
}

export interface DemoSummary {
  id: string;
  title: string;
  class_level: number;
  subject: string;
  chapter: string;
}

export interface AppConfig {
  version: string;
  schema: number;
  offline: boolean;
  asr: {
    model: string;
    language: string | null;
    device: string;
    compute_type: string;
    model_dir: string;
    local_files_only: boolean;
  };
  notes: {
    enabled: boolean;
    profile: string;
    profile_requested: string;
    available: boolean;
    model: string;
    path: string;
    size_mb: number;
    download_gb: number;
    ram_gb: number;
    note: string;
    budget_s: number;
    threads: number;
    selectable: string[];
  };
  hardware: {
    summary: string;
    ram_gb: number;
    logical_cores: number;
    physical_cores: number;
    platform: string;
    suggested_profile: string;
    reason: string;
  };
  curriculum: {
    class_levels: number[];
    subjects: string[];
    subject_labels: Record<string, string>;
    default_class_level: number;
    default_subject: string;
    auto_match: boolean;
    courses: CourseCatalogue[];
    demos: DemoSummary[];
  };
  retrieval: {
    engine: string;
    fusion: string;
    embedding_dim: number;
    offline: boolean;
    answers: string;
  };
  quiz: {
    engine: string;
    mastery: string;
    kinds: string[];
    adaptive: boolean;
  };
  storage: {
    engine: string;
    path: string;
  };
  server: {
    host: string;
    port: number;
    dashboard_built: boolean;
  };
}

export interface DemoLine {
  text: string;
  start: number;
  end: number;
}

export interface DemoLecture {
  id: string;
  title: string;
  class_level: number;
  subject: string;
  chapter: string;
  lines: DemoLine[];
  exact: boolean;
}

export interface NotePoint {
  text: string;
  start: number | null;
  source: "llm" | "extractive" | string;
}

export interface NoteDefinition {
  term: string;
  text: string;
  start: number | null;
}

export interface ChapterMatch {
  number: number;
  title: string;
  score: number;
  matched_terms: string[];
}

export interface SyllabusContext {
  class_level: number;
  subject: string;
  subject_label: string;
  course: string;
  matches: ChapterMatch[];
}

export interface NotesResult {
  title: string;
  summary: string;
  points: NotePoint[];
  definitions: NoteDefinition[];
  keywords: string[];
  used_llm: boolean;
  profile: string;
  model: string | null;
  dropped: number;
  latency_s: number;
  fallback_reason: string | null;
  sentences: number;
  curriculum: SyllabusContext | null;
}

export interface NotesResponse {
  notes: NotesResult;
  markdown: string;
  mapped_topic?: string;
  chapter_number?: number;
  correlation_score?: number;
  matched_terms?: string[];
  session_id?: string;
}

export interface StoredLectureNotesResponse {
  found: boolean;
  session_id?: string;
  title?: string;
  topic?: string;
  chapter_number?: number;
  markdown?: string | null;
  notes?: NotesResult | null;
  created_at?: string;
}

export interface TranscribeResponse {
  audio_path?: string;
  lines: DemoLine[];
  transcript: string;
  duration_s: number;
  asr: AsrInfo;
  notes: NotesResult | null;
  markdown: string | null;
  notes_error: string | null;
}

export interface StudentTranscribeResponse extends TranscribeResponse {
  lesson_id: string;
  title: string;
  subject: string;
  subject_label: string;
  chapter_number: number;
  chapter_title: string;
  correlation_score: number;
  matched_terms: string[];
}

export interface CaptionLine {
  id: number;
  text: string;
  start: number;
  end: number;
  latencyMs?: number | null;
}

export type CaptionPhase =
  | "idle"
  | "connecting"
  | "loading"
  | "live"
  | "done"
  | "error";

export interface NcertPage {
  page_number: number;
  section_id: string;
  title: string;
  content: string;
  words: number;
}

export interface NcertNoteDetail {
  unit: number;
  title: string;
  markdown: string;
  notes: NotesResult;
  total_pages: number;
  pages: NcertPage[];
}

// ------------------------------------------------------------------ Q&A
export interface Citation {
  id: string;
  source: string;
  title: string;
  chapter_number: number | null;
  chapter_title: string | null;
  start: number | null;
  end: number | null;
  score: number;
  snippet: string;
}

export interface AnswerTopic {
  chapter_number: number;
  chapter_title: string | null;
  score: number;
}

export interface AnswerSource {
  kind: "demo" | "transcript" | "session" | string;
  title: string;
  session_id?: string | null;
  demo_id?: string;
  exact?: boolean;
  lines?: number;
  course?: string | null;
  text?: string;
}

export interface AskResponse {
  question: string;
  answer: string;
  answerable: boolean;
  confidence: number;
  citations: Citation[];
  topics: AnswerTopic[];
  engine: string;
  latency_s: number;
  source: AnswerSource;
  course: string | null;
  chapter_matches: ChapterMatch[];
}

// --------------------------------------------------------------- quizzes
export interface QuizQuestion {
  id: string;
  kind: "mcq" | "short";
  prompt: string;
  options: string[];
  difficulty: number;
  topic: string;
  chapter_number: number | null;
  chapter_title: string | null;
  source: string;
  start: number | null;
  end: number | null;
}

export interface MasteryRow {
  topic: string;
  mastery: number;
  attempts: number;
  correct: number;
}

export interface QuizProgress {
  answered: number;
  total: number;
  correct: number;
  score: number;
}

export interface QuizStartResponse {
  quiz_id: string;
  student_id: string;
  class_level: number;
  subject: string;
  topic: string | null;
  total: number;
  question: QuizQuestion;
  progress: QuizProgress;
  mastery: MasteryRow[];
  source: AnswerSource;
  topics: string[];
}

export interface Gap {
  topic: string;
  mastery: number;
  attempts: number;
  correct: number;
  recommended_difficulty: number;
  tier?: "critical_gap" | "needs_review" | "proficient";
  tier_label?: string;
  gap_probability?: number;
  model_name?: string;
  diagnostic_reasons?: string[];
  avg_response_ms?: number;
}

export interface GapsResponse {
  student_id: string;
  gaps: Gap[];
  attempts: number;
  overall: number;
}

export interface QuizAnswerResponse {
  quiz_id: string;
  question_id: string;
  correct: boolean;
  expected: string;
  response: string;
  feedback: string;
  explanation: string;
  evaluation_reason?: string;
  evaluator?: string;
  topic: string;
  difficulty: number;
  mastery: MasteryRow & { student_id: string; updated_at: string };
  progress: QuizProgress;
  next_question: QuizQuestion | null;
  completed: boolean;
  target_difficulty: number;
  gaps: GapsResponse;
}

// ----------------------------------------------------------- Auto-Remediation
export type RemediationKind = "cloze" | "true_false" | "short_answer" | "mcq";

export interface KnowledgeGapDiagnosis {
  topic: string;
  mastery: number;
  accuracy: number;
  attempts: number;
  correct: number;
  avg_response_ms: number;
  avg_response_s: number;
  tier: "critical_gap" | "needs_review" | "proficient";
  tier_label: string;
  gap_probability: number;
  recommended_difficulty: number;
  remediation_priority: number;
  model_name: string;
  diagnostic_reasons: string[];
}

export interface RemediationItem {
  id: string;
  kind: RemediationKind;
  prompt: string;
  options: string[];
  topic: string;
  difficulty: number;
  primer: string;
  source: string;
}

export interface RemediationPack {
  pack_id: string;
  student_id: string;
  topic: string;
  primer: string;
  total_items: number;
  items: RemediationItem[];
  diagnosis: KnowledgeGapDiagnosis | null;
  source: string;
}

export interface RemediationAnswerResult {
  correct: boolean;
  expected: string;
  submitted?: string;
  feedback: string;
  explanation: string;
  evaluation_reason?: string;
  evaluator?: string;
  topic: string;
  difficulty: number;
  prev_mastery: number;
  updated_mastery: number;
  post_diagnosis: KnowledgeGapDiagnosis;
}

// ---------------------------------------------------------- Teacher Dashboard
export interface TeacherTopic {
  topic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  avg_response_ms: number;
  subject?: string;
  subject_label?: string;
}

export interface TeacherRecentSession {
  id: string;
  created_at: string;
  title: string;
  class_level: number;
  subject: string;
  duration_s: number | null;
}

export interface TeacherStudentAttention {
  full_name: string;
  student_identifier: string;
  class_level: number;
  section: string;
  score: number;
  weak_topic: string;
}

export interface TeacherActivityEvent {
  id: string;
  student_id: string;
  student_name: string;
  lesson_id: string;
  lesson_title: string;
  event_type: string;
  subject: string;
  class_level: number;
  section: string;
  created_at: string;
}

export interface TeacherAssignedClass {
  class_level: number;
  section: string;
  subject: string;
}

export interface TeacherOverview {
  total_sessions: number;
  total_attempts: number;
  total_students: number;
  overall_accuracy: number;
  avg_response_ms: number;
  class_mastery_avg: number;
  class_accuracy: number;
  /** Count of students below 60% mastery */
  students_needing_attention: number;
  /** Detailed list of students below 60% mastery — use this for .map() */
  students_needing_attention_list: TeacherStudentAttention[];
  assigned_classes: TeacherAssignedClass[];
  total_published_lessons: number;
  lessons_awaiting_review: number;
  draft_lessons: number;
  remediation_stats: {
    total: number;
    completed: number;
  };
  topics: TeacherTopic[];
  recent_sessions?: TeacherRecentSession[];
  /** Lesson activity log events */
  recent_activity: TeacherActivityEvent[];
}

export interface TeacherStudentDetail {
  lesson_history?: { id: number; lesson_title: string; event_type: string; created_at: string }[];
  student_id: string;
  student?: {
    id: string;
    full_name: string;
    email: string | null;
    class_level: number;
    student_identifier: string;
    created_at: string;
  };
  overall_mastery?: number;
  overall_accuracy?: number;
  total_attempts?: number;
  avg_response_ms?: number;
  topic_analysis?: {
    topic: string;
    attempts: number;
    correct: number;
    score: number;
    updated_at: string;
    subject: string;
    subject_label: string;
    gap_classification: string;
  }[];
  strong_topics?: any[];
  weak_topics?: any[];
  gaps: (Gap & {
    tier?: string;
    tier_label?: string;
    gap_probability?: number;
    model_name?: string;
    diagnostic_reasons?: string[];
  })[];
  overall: number;
  attempts: number;
  classifier_model: string;
  mastery: MasteryRow[];
  recent_attempts: {
    id: string | number;
    topic: string;
    prompt?: string;
    expected?: string;
    response?: string;
    correct: boolean;
    difficulty?: number;
    response_ms: number;
    created_at: string;
  }[];
  remediation_packs?: {
    pack_id: string;
    topic: string;
    completed: boolean;
    score: number;
    created_at: string;
  }[];
}

// ------------------------------------------------------------------ auth types
export interface AuthUser {
  id: string;
  full_name: string;
  email: string | null;
  role: "student" | "teacher" | "admin";
  class_level: number;
  section?: string;
  student_identifier: string;
  created_at: string;
}

export interface AcademicClass {
  id: string;
  class_level: number;
  name: string;
  academic_year: string;
  sections: string[];
  subjects: SubjectInfo[];
}

export interface SubjectInfo {
  id: string;
  class_level: number;
  code: string;
  name: string;
  icon?: string;
}

export interface ChapterInfo {
  id?: string;
  class_level?: number;
  subject?: string;
  chapter_number: number;
  title: string;
  description?: string;
}

export interface TimetableSlot {
  id: string;
  class_level: number;
  section: string;
  day_of_week: string;
  period: number;
  subject: string;
  teacher_name?: string;
  time_slot: string;
}

export type LessonStatus = "draft" | "processing" | "ready_for_review" | "published" | "archived" | "student_private";

export interface KeyConcept {
  title: string;
  definition: string;
}

export interface KeyExample {
  title?: string;
  reaction?: string;
  type?: string;
  notes?: string;
}

export interface LessonSummary {
  id: string;
  title: string;
  class_level: number;
  section: string;
  subject: string;
  chapter_number: number;
  chapter_title: string;
  teacher_id: string;
  teacher_name?: string;
  teaching_date: string;
  status: LessonStatus;
  is_student_generated?: boolean;
  published_at?: string | null;
  duration_s?: number;
  has_transcript?: boolean;
  has_notes?: boolean;
  completed?: boolean;
  transcript_viewed?: boolean;
  notes_viewed?: boolean;
  quiz_completed?: boolean;
  quiz_score?: number | null;
}

export interface LessonCompletion {
  student_id: string;
  lesson_id: string;
  completed: boolean;
  transcript_viewed: boolean;
  notes_viewed: boolean;
  quiz_completed: boolean;
  quiz_score: number | null;
}

export interface LessonDetail extends LessonSummary {
  transcript: string;
  notes_markdown: string;
  notes_json?: any;
  key_concepts: KeyConcept[];
  examples: KeyExample[];
  audio_filename?: string | null;
  audio_path?: string | null;
  completion?: LessonCompletion;
}

export interface ChapterTreeItem {
  chapter_number: number;
  title: string;
  description: string;
  lessons_count: number;
  completed_count: number;
  lessons: LessonSummary[];
}

export interface SubjectTree {
  subject_code: string;
  subject_name: string;
  icon: string;
  total_lessons: number;
  completed_lessons: number;
  progress_pct: number;
  chapters: ChapterTreeItem[];
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "lesson_published" | "quiz_assigned" | "reminder" | "system";
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLogItem {
  id: number;
  student_id: string;
  student_name: string;
  lesson_id: string;
  lesson_title: string;
  subject: string;
  class_level: number;
  section: string;
  event_type: string;
  metadata?: any;
  created_at: string;
}

export interface PracticeWorkspaceData {
  total_quizzes: number;
  completed_quizzes: number;
  average_score: number;
  recent_sessions: any[];
  recent_attempts: any[];
  incorrect_attempts: any[];
  suggested_revision: any[];
}

export interface TeacherClassOverview {
  class_level: number;
  section: string;
  subject: string;
  subject_label: string;
  students_count: number;
  students: TeacherClassStudent[];
  chapters: ChapterInfo[];
  timetable: TimetableSlot[];
  lessons: LessonSummary[];
}

export interface TeacherClassStudent {
  id: string;
  full_name: string;
  student_identifier: string | null;
  class_level: number;
  section: string;
  avg_mastery: number;
  attempts_count: number;
  accuracy: number | null;
  accessed: number;
  last_activity: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ----------------------------------------------------------- student workspace
export interface StudentOverview {
  student_id: string;
  full_name?: string;
  email?: string;
  class_level?: number;
  total_lectures: number;
  quiz_attempts: number;
  overall_accuracy: number;
  overall_mastery: number;
  avg_response_ms: number;
  topics_requiring_revision: {
    topic: string;
    score: number;
    attempts: number;
    correct: number;
  }[];
  recent_activity: {
    topic: string;
    prompt: string;
    correct: boolean;
    response_ms: number;
    created_at: string;
  }[];
  recommended_next: string;
}

export interface StudentProgress {
  student_id: string;
  full_name?: string;
  class_level?: number;
  overall_accuracy: number;
  total_attempts: number;
  avg_response_ms: number;
  topic_mastery: {
    topic: string;
    score: number;
    attempts: number;
    correct: number;
    updated_at: string;
    subject: string;
    subject_label: string;
    status: "critical_gap" | "needs_review" | "proficient";
  }[];
  strong_topics: any[];
  weak_topics: any[];
  recent_trend: {
    attempt_id: number;
    topic: string;
    correct: boolean;
    response_ms: number;
    created_at: string;
  }[];
  remediation_history: {
    pack_id: string;
    topic: string;
    completed: boolean;
    score: number;
    created_at: string;
  }[];
}

// ----------------------------------------------------------- teacher workspace
export interface TeacherStudentItem {
  id: string;
  full_name: string;
  email: string | null;
  class_level: number;
  student_identifier: string;
  created_at: string;
  is_active: boolean;
  total_attempts: number;
  overall_accuracy: number;
  average_mastery: number;
  gap_status: "new_student" | "critical_gap" | "needs_review" | "proficient";
  last_active: string;
}

export interface TeacherStudentsResponse {
  students: string[];
  directory: TeacherStudentItem[];
}

export interface TeacherGapsAnalytics {
  total_records: number;
  critical_gaps: {
    topic: string;
    student_id: string;
    student_name: string;
    class_level: number;
    score: number;
    attempts: number;
    correct: number;
    subject: string;
    subject_label: string;
    classification: string;
  }[];
  needs_review: {
    topic: string;
    student_id: string;
    student_name: string;
    class_level: number;
    score: number;
    attempts: number;
    correct: number;
    subject: string;
    subject_label: string;
    classification: string;
  }[];
  proficient: {
    topic: string;
    student_id: string;
    student_name: string;
    class_level: number;
    score: number;
    attempts: number;
    correct: number;
    subject: string;
    subject_label: string;
    classification: string;
  }[];
}

export interface TeacherImprovementTracking {
  progression: {
    date: string;
    attempts: number;
    accuracy: number;
    avg_response_ms: number;
  }[];
  topic_masteries: {
    topic: string;
    count: number;
    avg_score: number;
  }[];
}
