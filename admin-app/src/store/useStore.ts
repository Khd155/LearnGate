import { create } from 'zustand';
import type {
  Session,
  Student,
  Plan,
  TestResult,
  UnreadCount,
  MessageThread,
  Message,
  Broadcast,
  AdminStats,
} from '../types';
import { api, readSession } from '../lib/api';
import type { DerivedStatus } from '../lib/status';

export type TabKey = 'dashboard' | 'students' | 'testcenter' | 'conversations' | 'broadcast' | 'admin';

export interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

interface StoreState {
  // session
  session: Session | null;
  initSession: () => void;

  // theme
  dark: boolean;
  toggleDark: () => void;

  // tabs
  tab: TabKey;
  setTab: (tab: TabKey) => void;

  // bulk broadcast prefill (students selected for "broadcast to selected")
  broadcastPrefillIds: string[] | null;
  setBroadcastPrefillIds: (ids: string[] | null) => void;

  // conversations: which student to jump to
  conversationFocusStudentId: string | null;
  setConversationFocusStudentId: (id: string | null) => void;

  // core data
  students: Student[];
  plans: Plan[];
  testResults: TestResult[];
  loadingCore: boolean;
  coreError: string | null;
  loadCore: () => Promise<void>;

  addStudent: (s: Student) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  removeStudents: (ids: string[]) => void;

  statusOf: (studentId: string) => DerivedStatus;
  latestScoreOf: (studentId: string) => number | null;

  // dashboard stats
  stats: AdminStats | null;
  statsLoading: boolean;
  loadStats: () => Promise<void>;

  // messages
  unreadCounts: UnreadCount[];
  loadUnreadCounts: () => Promise<void>;
  threads: MessageThread[];
  threadsLoading: boolean;
  loadThreads: () => Promise<void>;
  activeThreadStudentId: string | null;
  setActiveThreadStudentId: (id: string | null) => void;
  messagesByStudent: Record<string, Message[]>;
  messagesLoading: boolean;
  loadMessages: (studentId: string) => Promise<void>;
  sendMessage: (studentId: string, body: string) => Promise<void>;

  // broadcasts
  broadcasts: Broadcast[];
  broadcastsLoading: boolean;
  loadBroadcasts: () => Promise<void>;
  sendBroadcast: (message: string, studentIds?: string[]) => Promise<void>;
  deleteBroadcast: (id: string) => Promise<void>;

  // toasts
  toasts: Toast[];
  pushToast: (type: Toast['type'], message: string) => void;
  dismissToast: (id: string) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  session: null,
  initSession: () => {
    const s = readSession();
    set({ session: s });
  },

  dark: localStorage.getItem('lg_admin_dark') === '1',
  toggleDark: () => {
    const next = !get().dark;
    localStorage.setItem('lg_admin_dark', next ? '1' : '0');
    set({ dark: next });
  },

  tab: 'dashboard',
  setTab: (tab) => set({ tab }),

  broadcastPrefillIds: null,
  setBroadcastPrefillIds: (ids) => set({ broadcastPrefillIds: ids }),

  conversationFocusStudentId: null,
  setConversationFocusStudentId: (id) => set({ conversationFocusStudentId: id }),

  students: [],
  plans: [],
  testResults: [],
  loadingCore: true,
  coreError: null,
  loadCore: async () => {
    set({ loadingCore: true, coreError: null });
    try {
      const session = get().session;
      const schoolQuery =
        session && session.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
      const [studentsRes, plansRes, testResultsRes] = await Promise.all([
        api.get<{ students: Student[] }>(`/students${schoolQuery}`),
        api.get<{ plans: Plan[] }>(`/plans${schoolQuery}`),
        api.get<{ results: TestResult[] }>(`/test-results${schoolQuery}`),
      ]);
      set({
        students: studentsRes.students || [],
        plans: plansRes.plans || [],
        testResults: testResultsRes.results || [],
        loadingCore: false,
      });
    } catch (e) {
      set({ loadingCore: false, coreError: e instanceof Error ? e.message : 'فشل تحميل البيانات' });
    }
  },

  addStudent: (s) => set((state) => ({ students: [...state.students, s] })),
  updateStudent: (id, patch) =>
    set((state) => ({
      students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),
  removeStudent: (id) =>
    set((state) => ({ students: state.students.filter((s) => s.id !== id) })),
  removeStudents: (ids) =>
    set((state) => ({ students: state.students.filter((s) => !ids.includes(s.id)) })),

  statusOf: (studentId) => {
    const { testResults, plans } = get();
    const hasFinished = testResults.some(
      (t) => t.student_id === studentId && typeof t.score === 'number' && t.total > 0,
    );
    if (hasFinished) return 'finished';
    const hasPlan = plans.some((p) => p.student_id === studentId);
    if (hasPlan) return 'started';
    return 'not_started';
  },

  stats: null,
  statsLoading: false,
  loadStats: async () => {
    set({ statsLoading: true });
    try {
      const session = get().session;
      const schoolQuery =
        session && session.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
      const res = await api.get<AdminStats>(`/stats${schoolQuery}`);
      set({ stats: res, statsLoading: false });
    } catch {
      set({ statsLoading: false });
    }
  },

  latestScoreOf: (studentId) => {
    const { testResults } = get();
    const rows = testResults
      .filter((t) => t.student_id === studentId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (!rows.length) return null;
    const r = rows[0];
    if (typeof r.score === 'number') return r.score;
    if (r.total) return Math.round((r.correct / r.total) * 100);
    return null;
  },

  unreadCounts: [],
  loadUnreadCounts: async () => {
    try {
      const session = get().session;
      const q = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
      const res = await api.get<{ counts: UnreadCount[] }>(`/messages/unread${q}`);
      set({ unreadCounts: res.counts || [] });
    } catch {
      /* non-fatal */
    }
  },

  threads: [],
  threadsLoading: false,
  loadThreads: async () => {
    set({ threadsLoading: true });
    try {
      const res = await api.get<{ threads: MessageThread[] }>('/messages/threads');
      set({ threads: res.threads || [], threadsLoading: false });
    } catch (e) {
      set({ threadsLoading: false });
      get().pushToast('error', e instanceof Error ? e.message : 'فشل تحميل المحادثات');
    }
  },

  activeThreadStudentId: null,
  setActiveThreadStudentId: (id) => set({ activeThreadStudentId: id }),

  messagesByStudent: {},
  messagesLoading: false,
  loadMessages: async (studentId) => {
    set({ messagesLoading: true });
    try {
      const res = await api.get<{ messages: Message[] }>(`/messages?studentId=${encodeURIComponent(studentId)}`);
      set((state) => ({
        messagesByStudent: { ...state.messagesByStudent, [studentId]: res.messages || [] },
        messagesLoading: false,
      }));
      await api.patch('/messages/read', { studentId, readerType: 'admin' });
      set((state) => ({
        threads: state.threads.map((t) => (t.student_id === studentId ? { ...t, unread: 0 } : t)),
        unreadCounts: state.unreadCounts.filter((c) => c.student_id !== studentId),
      }));
    } catch (e) {
      set({ messagesLoading: false });
      get().pushToast('error', e instanceof Error ? e.message : 'فشل تحميل الرسائل');
    }
  },

  sendMessage: async (studentId, body) => {
    const session = get().session;
    const student = get().students.find((s) => s.id === studentId);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      student_id: studentId,
      student_name: student?.name || '',
      school: session?.school || '',
      sender_type: 'admin',
      body,
      is_read: 0,
      recipient_admin_id: '',
      created_at: new Date().toISOString(),
    };
    set((state) => ({
      messagesByStudent: {
        ...state.messagesByStudent,
        [studentId]: [...(state.messagesByStudent[studentId] || []), optimistic],
      },
    }));
    try {
      const res = await api.post<{ message: Message }>('/messages', {
        body,
        studentId,
        school: session?.school || '',
        recipientAdminId: session?.code || '',
      });
      set((state) => ({
        messagesByStudent: {
          ...state.messagesByStudent,
          [studentId]: (state.messagesByStudent[studentId] || []).map((m) =>
            m.id === tempId ? res.message : m,
          ),
        },
        threads: state.threads.some((t) => t.student_id === studentId)
          ? state.threads.map((t) =>
              t.student_id === studentId
                ? { ...t, last_at: res.message.created_at, last_msg: res.message.body }
                : t,
            )
          : [
              {
                student_id: studentId,
                student_name: student?.name || '',
                school: session?.school || '',
                last_at: res.message.created_at,
                unread: 0,
                last_msg: res.message.body,
              },
              ...state.threads,
            ],
      }));
    } catch (e) {
      set((state) => ({
        messagesByStudent: {
          ...state.messagesByStudent,
          [studentId]: (state.messagesByStudent[studentId] || []).filter((m) => m.id !== tempId),
        },
      }));
      get().pushToast('error', e instanceof Error ? e.message : 'فشل إرسال الرسالة');
      throw e;
    }
  },

  broadcasts: [],
  broadcastsLoading: false,
  loadBroadcasts: async () => {
    set({ broadcastsLoading: true });
    try {
      const res = await api.get<{ broadcasts: Broadcast[] }>('/broadcasts/active');
      set({ broadcasts: res.broadcasts || [], broadcastsLoading: false });
    } catch (e) {
      set({ broadcastsLoading: false });
      get().pushToast('error', e instanceof Error ? e.message : 'فشل تحميل الرسائل الجماعية');
    }
  },

  sendBroadcast: async (message, studentIds) => {
    const res = await api.post<{ broadcast: Broadcast }>('/broadcasts', {
      message,
      studentIds: studentIds && studentIds.length ? studentIds : undefined,
    });
    set((state) => ({ broadcasts: [res.broadcast, ...state.broadcasts] }));
  },

  deleteBroadcast: async (id) => {
    await api.delete(`/broadcasts/${id}`);
    set((state) => ({ broadcasts: state.broadcasts.filter((b) => b.id !== id) }));
  },

  toasts: [],
  pushToast: (type, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
