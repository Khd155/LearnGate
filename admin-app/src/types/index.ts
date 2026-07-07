export type Role = 'admin' | 'director' | 'dev';

export interface Session {
  role: Role;
  code: string;
  name: string;
  school: string;
  token: string;
  expiry: number;
}

export interface Student {
  id: string;
  code: string;
  name: string;
  school: string;
  phone: string;
  created_at: string;
}

export type TestStatus = 'not_started' | 'started' | 'finished';

export interface PlanGap {
  skillName: string;
  skillId: string;
  category: 'verbal' | 'quantitative';
  pct: number;
}

export interface Plan {
  id: string;
  student_id: string;
  status: string;
  admin_note?: string;
  created_at: string;
  approved_at?: string | null;
  gaps?: PlanGap[] | string | null;
  [key: string]: unknown;
}

export interface TestResultAnswer {
  q: string;
  a: string;
  corr: boolean;
}

export interface TestResult {
  id: string;
  student_id: string;
  school: string;
  score: number;
  correct: number;
  total: number;
  answers?: TestResultAnswer[];
  created_at: string;
  [key: string]: unknown;
}

export interface UnreadCount {
  student_id: string;
  student_name: string;
  school: string;
  cnt: number;
}

export interface MessageThread {
  student_id: string;
  student_name: string;
  school: string;
  last_at: string;
  unread: number;
  last_msg: string;
}

export interface Message {
  id: string;
  student_id: string;
  student_name: string;
  school: string;
  sender_type: 'admin' | 'student';
  body: string;
  is_read: number;
  recipient_admin_id: string;
  created_at: string;
}

export interface Broadcast {
  id: string;
  school: string;
  admin_id: string;
  admin_name: string;
  message: string;
  created_at: string;
  targetCount?: number;
}

export interface ApiErrorShape {
  error: string;
}
