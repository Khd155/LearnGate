'use strict';

// ── Theme (dark/light) ─────────────────────────────────────────────────────
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'dark' || mode === 'light') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    const isDark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    btn.textContent = isDark ? '☀️' : '🌙';
  }
}
(function initTheme() {
  const saved = localStorage.getItem('theme');
  applyTheme(saved);
})();

// ── Canonical skill order (verbal then quantitative, fixed) ───────────────
const SKILL_ORDER = ['v4','v5','v1','v2','v3','q1','q2','q3','q4','q5'];
function sortBySkillOrder(gaps) {
  return [...gaps].sort((a, b) => {
    const ai = SKILL_ORDER.indexOf(a.skillId);
    const bi = SKILL_ORDER.indexOf(b.skillId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// ── Lazy-load xlsx — only when Excel import/export is used ────────────────
async function _loadXlsx() {
  if (window.XLSX) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Activity Log ──────────────────────────────────────────────────────────
const ActivityLog = {
  _entries: [],
  _log(type, msg) {
    const now = new Date();
    const ts  = now.toLocaleTimeString('ar-SA', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3,'0');
    this._entries.unshift({ ts, type, msg });
    if (this._entries.length > 1000) this._entries.pop();
  },
  info(msg)    { this._log('info',    msg); },
  success(msg) { this._log('success', msg); },
  warn(msg)    { this._log('warn',    msg); },
  error(msg)   { this._log('error',   msg); },
  entries()    { return this._entries; },
  clear()      { this._entries = []; },
};

function serverLog(level, category, message, extra = {}) {
  const payload = { level, category, message, ...extra };
  fetch('/api/dev/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(_authToken ? { Authorization: 'Bearer ' + _authToken } : {}) },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ── Data layer (via /api/* backend) ───────────────────────────────────────
const Cache = { students: [], plans: [], loaded: false };
window.QUESTION_BANK = (typeof QUESTIONS !== 'undefined' ? QUESTIONS.slice() : []);

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// JWT token — set on login, restored from session storage on page load
let _authToken = null;

// Base API call helper
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (_authToken) headers['Authorization'] = 'Bearer ' + _authToken;
  const method = (opts.method || 'GET').toUpperCase();
  ActivityLog.info(`← ${method} /api${path}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 15000);
  let res;
  try {
    res = await fetch('/api' + path, { headers, signal: controller.signal, ...opts });
    clearTimeout(timer);
  } catch (netErr) {
    clearTimeout(timer);
    const isTimeout = netErr.name === 'AbortError';
    ActivityLog.error(`✗ ${method} /api${path} — ${isTimeout ? 'انتهت مهلة الاتصال' : 'خطأ شبكة: ' + netErr.message}`);
    throw new Error(isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR: ' + (netErr.message || 'failed to fetch'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    ActivityLog.error(`✗ ${method} /api${path} — ${res.status} ${data.error || res.statusText}`);
    const e = new Error(data.error || res.statusText || 'HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  ActivityLog.success(`✓ ${method} /api${path} — ${res.status}`);
  return data;
}

const _mapStudent = r => ({ id: r.id, code: r.code, name: r.name, school: r.school || '', phone: r.phone || '', createdAt: r.created_at });
const _mapPlan    = r => {
  let note = r.admin_note || '';
  let retakeOverride = false;
  if (note.startsWith('OVERRIDE:')) { retakeOverride = true; note = note.slice(9); }
  return {
    id: r.id, studentId: r.student_id, studentName: r.student_name,
    status: r.status, gaps: r.gaps || [], adminNote: note,
    retakeOverride,
    createdAt: r.created_at, approvedAt: r.approved_at,
  };
};

const DB = {
  students: () => Cache.students,
  plans:    () => Cache.plans,

  async loadAll() {
    const school = State.school ? '?school=' + encodeURIComponent(State.school) : '';
    const [s, p] = await Promise.all([
      apiFetch('/students' + school),
      apiFetch('/plans'    + school),
      DB.loadQuestions(),
    ]);
    Cache.students = (s.students || []).map(_mapStudent);
    Cache.plans    = (p.plans    || []).map(_mapPlan);
    Cache.loaded   = true;
  },

  async loadStudentData() {
    if (!State.student) return;
    const { plans } = await apiFetch(`/plans/history?studentId=${encodeURIComponent(State.student.id)}`);
    Cache.plans = (plans || []).map(_mapPlan);
  },

  async loadQuestions() {
    const { questions } = await apiFetch('/questions').catch(() => ({ questions: [] }));
    if (questions && questions.length) {
      window.QUESTION_BANK = questions.map(r => ({
        id: r.qnum, type: r.type, skillId: r.skill_id,
        text: r.text, opts: [r.opt1, r.opt2, r.opt3, r.opt4], ans: r.ans,
      }));
    } else if (typeof QUESTIONS !== 'undefined') {
      window.QUESTION_BANK = QUESTIONS.slice();
    }
  },

  async addStudent({ name, code, phone }) {
    const { student } = await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify({ name, code, phone: phone || '', school: State.school || '' }),
    });
    const s = _mapStudent(student);
    Cache.students.push(s);
    return s;
  },

  async updateStudentPhone(id, phone) {
    await apiFetch(`/students/${id}`, { method: 'PATCH', body: JSON.stringify({ phone: phone || '' }) });
    const s = Cache.students.find(s => s.id === id);
    if (s) s.phone = phone || '';
  },

  async bulkAddStudents(rows) {
    const res = await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify(rows),
    });
    // Reload full list after bulk insert (filtered by school)
    const school = State.school ? '?school=' + encodeURIComponent(State.school) : '';
    const { students } = await apiFetch('/students' + school);
    Cache.students = (students || []).map(_mapStudent);
    return { added: res.added, skipped: res.skipped };
  },

  async deleteStudent(id) {
    await apiFetch(`/students/${id}`, { method: 'DELETE' });
    Cache.students = Cache.students.filter(s => s.id !== id);
    Cache.plans    = Cache.plans.filter(p => p.studentId !== id);
  },

  async deleteNoSchoolStudents() {
    await apiFetch('/dev/students?noschool=1', { method: 'DELETE' });
    Cache.students = Cache.students.filter(s => s.school);
    Cache.plans    = Cache.plans.filter(p => {
      const st = Cache.students.find(s => s.id === p.studentId);
      return st ? !!st.school : false;
    });
  },

  async addAttempt(plan) {
    const { plan: p } = await apiFetch('/plans', {
      method: 'POST',
      body: JSON.stringify({ ...plan, school: State.school || '' }),
    });
    const mapped = _mapPlan(p);
    Cache.plans.unshift(mapped); // just add, don't remove old
    return mapped;
  },

  studentPlans(studentId) {
    return Cache.plans
      .filter(p => p.studentId === studentId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async approvePlan(planId, adminNote) {
    const { plan: p } = await apiFetch(`/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify({ adminNote }),
    });
    const mapped = _mapPlan(p);
    const idx = Cache.plans.findIndex(pl => pl.id === planId);
    if (idx >= 0) Cache.plans[idx] = mapped;
    return mapped;
  },

  async replaceQuestions(rows) {
    await apiFetch('/questions', {
      method: 'POST',
      body: JSON.stringify({ action: 'replace', questions: rows }),
    });
    await DB.loadQuestions();
  },

  async appendQuestions(rows) {
    const { added, skipped } = await apiFetch('/questions', {
      method: 'POST',
      body: JSON.stringify({ action: 'append', questions: rows }),
    });
    await DB.loadQuestions();
    return { added, skipped };
  },
};

// ── Skill → lesson page mapping ───────────────────────────────────────────
const SKILL_LESSONS = {
  v1: 'lessons/comprehension/',
  v2: 'lessons/contextual/',
  v3: 'lessons/inference/',
  v4: 'lessons/analogy/',
  v5: 'lessons/completion/',
  q5: 'lessons/statistics/',
  q1: 'lessons/arithmetic/',
  q2: 'lessons/algebra/',
  q3: 'lessons/geometry/',
  q4: 'lessons/comparison/',
};

// ── Idle auto-logout (30 min) ─────────────────────────────────────────────
const IDLE_MS = 30 * 60 * 1000;
let _idleTimer = null;

function _resetIdle() {
  if (!State.role) return;
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (State.role) {
      App.logout();
      showToast('تم تسجيل خروجك تلقائياً بعد 30 دقيقة من عدم التفاعل');
    }
  }, IDLE_MS);
}

function startIdleWatch() {
  ['click','keydown','touchstart','scroll','mousemove'].forEach(ev =>
    document.addEventListener(ev, _resetIdle, { passive: true })
  );
  _resetIdle();
}

function stopIdleWatch() {
  clearTimeout(_idleTimer);
  _idleTimer = null;
}

// ── App State ─────────────────────────────────────────────────────────────
const State = {
  role: null,
  school: null,
  student: null,
  admin: null,          // logged-in admin object
  chatAdminId: null,    // selected supervisor for chat
  chatAdminName: null,
  selfDiag: {},
  testAnswers: {},
  currentQ: 0,
  tab: 'students',
  currentPlan: null,
  detailStudentId: null, // student currently open in detail modal
};

// ── Screen router ─────────────────────────────────────────────────────────
const _SCREEN_PATHS = {
  'screen-student-home':  '/',
  'screen-admin':         '/admin',
  'screen-history':       '/history',
  'screen-chat':          '/chat',
  'screen-intro':         '/capabilities',
  'screen-cooldown':      '/capabilities/cooldown',
  'screen-selfdiag':      '/capabilities/self-assessment',
  'screen-pretest-intro': '/capabilities/diagnostic-intro',
  'screen-pretest':       '/capabilities/diagnostic',
  'screen-processing':    '/capabilities/processing',
  'screen-level-analysis':'/capabilities/results',
  'screen-landing':       '/login',
  'screen-school':        '/login',
  'screen-identity':      '/login',
  'screen-student-login': '/login',
  'screen-admin-login':   '/login',
};

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
  const path = _SCREEN_PATHS[id];
  if (path) history.replaceState(null, '', path);
  else if (location.pathname !== '/') history.replaceState(null, '', '/');
}

// ── Cooldown helpers ─────────────────────────────────────────────────────
function cooldownDays(gaps) {
  let total = 0;
  for (const g of gaps) {
    total += g.pct <= 30 ? 3 : g.pct <= 49 ? 2 : g.pct <= 70 ? 1 : 0;
  }
  return total;
}

function cooldownUntil(plan) {
  const d = new Date(plan.createdAt);
  d.setDate(d.getDate() + cooldownDays(plan.gaps));
  return d;
}

function daysRemaining(plan) {
  if (plan.retakeOverride) return 0;
  const diff = cooldownUntil(plan) - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

// Actual remaining without override — used by admin panel display
function actualDaysRemaining(plan) {
  const diff = cooldownUntil(plan) - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

// ── App object ────────────────────────────────────────────────────────────
const App = {

  // ── School Selection ────────────────────────────────────────────────────
  selectSchool(name) {
    State.school = name;
    App._updateSchoolDisplay(name);
    show('screen-identity');
  },

  showOtherSchools() {
    // Skip manual school entry — go directly to role selection.
    // School will be detected automatically from the student/admin code at login.
    State.school = '';
    App._updateSchoolDisplay('');
    show('screen-identity');
  },

  _updateSchoolDisplay(name) {
    const idEl = document.getElementById('id-school-name');
    if (idEl) idEl.textContent = name || 'سيتم تحديد مدرستك تلقائياً';
    ['sh-school-sub', 'ad-school-sub'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = name;
    });
  },

  // ── Identity ─────────────────────────────────────────────────────────────
  selectRole(role) {
    State.role = role;
    if (role === 'student') show('screen-student-login');
    else                    show('screen-admin-login');
  },

  // ── Student Login ────────────────────────────────────────────────────────
  async studentLogin() {
    const code = document.getElementById('sl-code').value.trim();
    const errEl = document.getElementById('sl-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(errEl, 'الرجاء إدخال رقم السجل المدني (١٠ أرقام).'); return;
    }
    const _btn = document.getElementById('sl-submit-btn');
    const _restoreBtn = () => { if (_btn) { _btn.disabled = false; _btn.innerHTML = 'دخول ←'; } };
    if (_btn) { _btn.disabled = true; _btn.innerHTML = '<span class="btn-spinner"></span> جارٍ التحقق…'; }
    // Safety net: if something hangs without ever resolving/rejecting below, don't leave the button stuck forever.
    setTimeout(_restoreBtn, 8000);
    let token, student;
    try {
      const data = await apiFetch('/auth/student-login', {
        method: 'POST',
        body: JSON.stringify({ code, school: State.school || '' }),
        timeout: 5000,
      });
      token = data.token;
      student = { id: data.student.id, code, name: data.student.name, school: data.student.school || '' };
    } catch (e) {
      const msg = e?.message || '';
      const status = e?.status;
      if (status === 404 || msg.includes('غير مسجّل')) {
        _restoreBtn(); showAlert(errEl, 'السجل المدني غير مسجّل — راجع المشرف لإضافتك في النظام.'); return;
      }
      if (status === 429 || msg.includes('Too many') || msg.includes('429')) {
        _restoreBtn(); showAlert(errEl, 'محاولات كثيرة — انتظر دقيقة وأعد المحاولة.'); return;
      }
      if (status === 400 || msg.includes('غير صالح')) {
        _restoreBtn(); showAlert(errEl, 'رقم السجل المدني يجب أن يكون ١٠ أرقام إنجليزية.'); return;
      }
      if (status === 401 || msg.includes('غير صحيحة')) {
        _restoreBtn(); showAlert(errEl, 'بيانات الدخول غير صحيحة — تحقق من رقم السجل المدني.'); return;
      }
      if (msg.includes('TIMEOUT')) {
        _restoreBtn(); showAlert(errEl, 'انتهت مهلة الاتصال — تحقق من الإنترنت وأعد المحاولة.'); return;
      }
      if (!navigator.onLine || msg.includes('NETWORK_ERROR')) {
        _restoreBtn(); showAlert(errEl, 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة وأعد المحاولة.'); return;
      }
      _restoreBtn(); showAlert(errEl, 'تعذّر الاتصال بالخادم — حاول مرة أخرى. (رمز: ' + (e?.status || '؟') + ')'); return;
    }
    try {
      ActivityLog.success(`🎓 تسجيل دخول طالب: ${student.name} (${code}) — ${student.school || '—'}`);
      serverLog('success', 'login', `تسجيل دخول طالب: ${student.name}`, { user_name: student.name, user_role: 'student', school: student.school || '' });
      _authToken = token;
      State.student = student;
      State.role = 'student';
      if (student.school) { State.school = student.school; App._updateSchoolDisplay(student.school); }
      const _sess = { role: 'student', id: student.id, code, name: student.name, school: student.school, token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
      try { sessionStorage.setItem('lg_session', JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem('lg_xsession', JSON.stringify(_sess)); } catch(_) {}
      const remember = document.getElementById('sl-remember');
      if (remember && remember.checked) {
        try { localStorage.setItem('lg_remember', JSON.stringify({ role: 'student', code, name: student.name, school: student.school || '', expiry: Date.now() + 2 * 24 * 60 * 60 * 1000 })); } catch(_) {}
      } else {
        try { localStorage.removeItem('lg_remember'); } catch(_) {}
      }
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(student.name);
      const _minWait = new Promise(r => setTimeout(r, 700));
      try { await Promise.all([DB.loadStudentData(), _minWait]); } catch (_) { await _minWait; }
      App.renderStudentHome();
      show('screen-student-home');
      document.documentElement.style.visibility = '';
      routeHash();
    } catch(e) {
      _restoreBtn();
      document.documentElement.style.visibility = '';
      showAlert(errEl, 'حدث خطأ غير متوقع أثناء تحميل الصفحة — حاول مرة أخرى.');
    }
  },

  // ── Admin Login ──────────────────────────────────────────────────────────
  async adminLogin() {
    const code  = document.getElementById('al-code').value.trim();
    const errEl = document.getElementById('al-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(errEl, 'الرجاء إدخال رقم السجل المدني (١٠ أرقام).'); return;
    }
    const _btn = document.getElementById('al-submit-btn');
    const _restoreBtn = () => { if (_btn) { _btn.disabled = false; _btn.innerHTML = 'دخول ←'; } };
    if (_btn) { _btn.disabled = true; _btn.innerHTML = '<span class="btn-spinner"></span> جارٍ التحقق…'; }
    // Safety net: if something hangs without ever resolving/rejecting below, don't leave the button stuck forever.
    setTimeout(_restoreBtn, 8000);
    let token, admin;
    try {
      const data = await apiFetch('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ code, school: State.school || '' }),
        timeout: 5000,
      });
      token = data.token;
      admin = data.admin;
    } catch (e) {
      const msg = e?.message || '';
      const status = e?.status;
      if (status === 404 || msg.includes('غير مسجّل')) {
        _restoreBtn(); showAlert(errEl, 'السجل المدني غير مسجّل ضمن المشرفين.'); return;
      }
      if (status === 429 || msg.includes('Too many') || msg.includes('429')) {
        _restoreBtn(); showAlert(errEl, 'محاولات كثيرة — انتظر دقيقة وأعد المحاولة.'); return;
      }
      if (status === 403 || msg.includes('غير مصرح')) {
        _restoreBtn(); showAlert(errEl, 'هذا الرمز غير مصرح له بالدخول على هذه المدرسة.'); return;
      }
      if (status === 400 || msg.includes('غير صالح')) {
        _restoreBtn(); showAlert(errEl, 'رقم السجل المدني يجب أن يكون ١٠ أرقام إنجليزية.'); return;
      }
      if (status === 401 || msg.includes('غير صحيحة')) {
        _restoreBtn(); showAlert(errEl, 'بيانات الدخول غير صحيحة — تحقق من رقم السجل المدني.'); return;
      }
      if (msg.includes('TIMEOUT')) {
        _restoreBtn(); showAlert(errEl, 'انتهت مهلة الاتصال — تحقق من الإنترنت وأعد المحاولة.'); return;
      }
      if (!navigator.onLine || msg.includes('NETWORK_ERROR')) {
        _restoreBtn(); showAlert(errEl, 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة وأعد المحاولة.'); return;
      }
      _restoreBtn(); showAlert(errEl, 'تعذّر الاتصال بالخادم — حاول مرة أخرى. (رمز: ' + (e?.status || '؟') + ')'); return;
    }
    try {
      ActivityLog.success(`👨‍💼 تسجيل دخول مشرف: ${admin.name || code} (${code}) — ${admin.school || '—'} — دور: ${admin.role || 'admin'}`);
      serverLog('success', 'login', `تسجيل دخول مشرف: ${admin.name || code}`, { user_name: admin.name || '', user_role: admin.role || 'admin', school: admin.school || '' });
      _authToken = token;
      State.role  = admin.role === 'director' ? 'director' : 'admin';
      State.admin = { ...admin, code };
      if (admin.school && admin.school !== '*') { State.school = admin.school; App._updateSchoolDisplay(admin.school); }
      const adminName = admin.name || '';
      try { await DB.loadAll(); }
      catch (e) {
        _authToken = null;
        _restoreBtn();
        if (!navigator.onLine) { showAlert(errEl, 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة.'); return; }
        if (e?.status === 401) { showAlert(errEl, 'الصلاحيات غير كافية — راجع مدير النظام لضبط دورك في قاعدة البيانات.'); return; }
        showAlert(errEl, 'تم الدخول لكن تعذّر تحميل البيانات — حاول مرة أخرى. (رمز: ' + (e?.status || '؟') + ')'); return;
      }
      const _sess = { role: State.role, code, name: adminName, school: admin.school || '', token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
      try { sessionStorage.setItem('lg_session', JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem('lg_xsession', JSON.stringify(_sess)); } catch(_) {}
      const alRemember = document.getElementById('al-remember');
      if (alRemember && alRemember.checked) {
        try { localStorage.setItem('lg_remember', JSON.stringify({ role: 'admin', code, name: adminName, school: admin.school || '', expiry: Date.now() + 2 * 24 * 60 * 60 * 1000 })); } catch(_) {}
      } else {
        try { localStorage.removeItem('lg_remember'); } catch(_) {}
      }
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(adminName);
      document.querySelectorAll('.director-tab').forEach(el => {
        el.style.display = State.role === 'director' ? '' : 'none';
      });
      // New admin dashboard (React) lives at /admin/ — redirect there now that the
      // session is persisted to localStorage.lg_xsession. The old in-SPA admin
      // screen is no longer shown after a successful admin login.
      window.location.href = '/admin/';
    } catch(e) {
      _restoreBtn();
      document.documentElement.style.visibility = '';
      showAlert(errEl, 'حدث خطأ غير متوقع أثناء تحميل اللوحة — حاول مرة أخرى.');
    }
  },

  // ── Populate all .tb-uname chips with user name ───────────────────────────
  _setTopbarUser(name) {
    document.querySelectorAll('.tb-uname').forEach(chip => {
      const textEl = chip.querySelector('.tb-uname-text');
      if (textEl) textEl.textContent = name || '';
      chip.style.display = name ? 'inline-flex' : 'none';
    });
  },

  // ── Inject logo + name into all ghost topbar slots ───────────────────────
  _fillTopbarGhosts() {
    const name = State.student?.name || State.admin?.name || '';
    const chip = name
      ? `<span class="tb-chip"><span class="tb-dot"></span>${escapeHtml(name)}</span>`
      : '';
    const logo = `<a href="https://moe.gov.sa" target="_blank" class="topbar-logo" style="margin:0;flex-shrink:0;" aria-label="وزارة التعليم"></a>`;
    document.querySelectorAll('.topbar-ghost').forEach(el => {
      el.innerHTML = chip + logo;
    });
  },

  // ── Student Home ─────────────────────────────────────────────────────────
  renderStudentHome() {
    App._setTopbarUser(State.student?.name || '');
    document.getElementById('sh-name').textContent = State.student.name;
    const myPlan    = DB.plans().find(p => p.studentId === State.student.id);
    const planBanner = document.getElementById('sh-plan-banner');
    if (myPlan) {
      planBanner.style.display = 'flex';
      planBanner.className = 'status-banner active';
      planBanner.innerHTML = `<div class="status-icon">✅</div><div>
        <div class="status-title">خطتك جاهزة!</div>
        <div class="status-desc">تمت الموافقة على خطة دعم التعلم. <a href="#" onclick="App.viewStudentPlan();return false;" style="color:var(--primary);font-weight:700;">عرض الخطة ←</a></div>
      </div>`;
    } else {
      planBanner.style.display = 'none';
    }
    // Performance indicator (2nd test onwards)
    App.renderStudentPerformanceCard();
    // Check for unread support replies
    App.loadTicketNotifications();
    // Prompt phone if missing (non-blocking — student can skip)
    if (!State.student.phone) {
      setTimeout(() => App.showStudentPhoneModal(), 800);
    }
  },

  toggleTheme() {
    const current = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  },

  showStudentPhoneModal() {
    const el = document.getElementById('student-phone-modal');
    if (!el) return;
    const inp = document.getElementById('sphone-input');
    const err = document.getElementById('sphone-err');
    if (inp) inp.value = '';
    if (err) err.classList.remove('show');
    el.classList.add('open');
    if (inp) setTimeout(() => inp.focus(), 50);
  },

  closeStudentPhoneModal() {
    const el = document.getElementById('student-phone-modal');
    if (el) el.classList.remove('open');
  },

  async saveStudentPhone() {
    const inp     = document.getElementById('sphone-input');
    const errEl   = document.getElementById('sphone-err');
    const trimmed = (inp?.value || '').trim();
    if (!trimmed) { App.closeStudentPhoneModal(); return; }
    if (!/^05\d{8}$/.test(trimmed)) {
      showAlert(errEl, 'رقم الجوال يجب أن يبدأ بـ 05 ويكون 10 أرقام.');
      return;
    }
    try {
      await DB.updateStudentPhone(State.student.id, trimmed);
      State.student.phone = trimmed;
    } catch (_) {
      // Save failed silently — don't block the student
    }
    App.closeStudentPhoneModal();
  },

  goToAcademic() {
    const user = State.student || State.admin || {};
    const name = user.name || user.admin_name || '';
    const role = State.student ? 'student' : (State.admin ? 'admin' : '');
    localStorage.setItem('lg_academic_user', JSON.stringify({ name, role }));
    window.location.href = 'academic/index.html';
  },

  async startCapabilities() {
    try { await DB.loadStudentData(); } catch (e) {}
    const plans = DB.studentPlans(State.student.id);
    const latest = plans[0];
    if (latest) {
      State.currentPlan = latest;
      const rem = daysRemaining(latest);
      if (rem > 0) {
        // Show cooldown screen
        App.renderCooldown(latest, rem, plans);
        show('screen-cooldown');
        return;
      }
      // Cooldown expired but plan exists — let them retake OR view plan
      App.renderRetakeOrView(latest, plans);
      show('screen-cooldown');
      return;
    }
    show('screen-intro');
  },

  // ── Self-Diagnostic ───────────────────────────────────────────────────────
  startSelfDiag() {
    State.selfDiag = {};
    App.renderSelfDiag();
    show('screen-selfdiag');
  },

  renderSelfDiag() {
    const verbal = SKILLS.filter(s => s.category === 'verbal');
    const quant  = SKILLS.filter(s => s.category === 'quantitative');
    const buildSection = (skills, label) => `
      <div class="diag-section-head">${label}</div>
      <table class="diag-table">
        <thead><tr>
          <th style="text-align:right">المهارة</th>
          <th style="width:130px;text-align:center">متقن</th>
          <th style="width:130px;text-align:center">متوسط</th>
          <th style="width:130px;text-align:center">غير متقن</th>
        </tr></thead>
        <tbody>${skills.map(sk => `
          <tr>
            <td><strong>${sk.name}</strong><br><span style="font-size:12px;color:var(--muted)">${sk.desc}</span></td>
            <td style="text-align:center">
              <label class="diag-radio"><input type="radio" name="diag_${sk.id}" value="mastered" onchange="App.setDiag('${sk.id}','mastered')"><span class="diag-dot mastered">●</span></label>
            </td>
            <td style="text-align:center">
              <label class="diag-radio"><input type="radio" name="diag_${sk.id}" value="partial" onchange="App.setDiag('${sk.id}','partial')"><span class="diag-dot partial">●</span></label>
            </td>
            <td style="text-align:center">
              <label class="diag-radio"><input type="radio" name="diag_${sk.id}" value="need" onchange="App.setDiag('${sk.id}','need')"><span class="diag-dot need">●</span></label>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    document.getElementById('selfdiag-content').innerHTML =
      buildSection(verbal, '📚 القسم اللفظي') +
      buildSection(quant,  '🔢 القسم الكمي');
  },

  setDiag(skillId, val) {
    State.selfDiag[skillId] = val;
    const btn  = document.getElementById('selfdiag-submit');
    const done = Object.keys(State.selfDiag).length === SKILLS.length;
    btn.disabled     = !done;
    btn.style.opacity = done ? '1' : '.5';
  },

  submitSelfDiag() {
    if (Object.keys(State.selfDiag).length < SKILLS.length) {
      alert('الرجاء تقييم جميع المهارات قبل المتابعة.'); return;
    }
    State.currentQ   = 0;
    State.testAnswers = {};
    show('screen-pretest-intro');
  },

  startPretest() {
    App.renderQuestion();
    App.startTestTimer();
    App._saveTestState();
    show('screen-pretest');
  },

  // ── Test Timer (50 min) ───────────────────────────────────────────────────
  _testTimer: null,
  startTestTimer() {
    clearInterval(App._testTimer);
    const SECS = 50 * 60;
    let deadline = Number(sessionStorage.getItem('lg_test_deadline') || 0);
    if (!deadline || deadline <= Date.now()) {
      deadline = Date.now() + SECS * 1000;
    }
    try { sessionStorage.setItem('lg_test_deadline', String(deadline)); } catch(_) {}
    const el = document.getElementById('test-timer');
    const update = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      const m = String(Math.floor(remaining / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      if (el) {
        el.textContent = `⏱ ${m}:${s}`;
        el.style.color = remaining <= 300 ? '#ef4444' : '#fff';
      }
      if (remaining <= 0) {
        clearInterval(App._testTimer);
        App.finishTest();
      }
    };
    update();
    App._testTimer = setInterval(update, 1000);
  },

  stopTestTimer() {
    clearInterval(App._testTimer);
    App._testTimer = null;
    try { sessionStorage.removeItem('lg_test_deadline'); sessionStorage.removeItem('lg_test_state'); } catch(_) {}
  },

  _saveTestState() {
    try {
      sessionStorage.setItem('lg_test_state', JSON.stringify({
        currentQ: State.currentQ,
        testAnswers: State.testAnswers
      }));
    } catch(_) {}
  },

  // ── Pre-Test ──────────────────────────────────────────────────────────────
  renderQuestion() {
    const QBANK   = window.QUESTION_BANK;
    const q       = QBANK[State.currentQ];
    const total   = QBANK.length;
    const pct     = Math.round((State.currentQ / total) * 100);
    const isVerbal = q.type === 'verbal';

    document.getElementById('test-progress-bar').style.width = pct + '%';
    document.getElementById('test-progress-label').textContent = `السؤال ${State.currentQ + 1} من ${total}`;
    document.getElementById('test-section-badge').textContent  = isVerbal ? '📚 القسم اللفظي' : '🔢 القسم الكمي';
    document.getElementById('test-section-badge').className    = 'test-section-badge ' + (isVerbal ? 'badge-verbal' : 'badge-quant');

    const selected = State.testAnswers[q.id];
    const opts = [...q.opts.map((opt, i) => `
      <div class="q-opt${selected === i ? ' selected' : ''}" onclick="App.selectAnswer(${i})">
        <div class="opt-circle"></div><span>${opt}</span>
      </div>`),
      `<div class="q-opt dont-know${selected === 'dk' ? ' selected' : ''}" onclick="App.selectAnswer('dk')">
        <div class="opt-circle"></div><span>لا أعرف الإجابة</span>
      </div>`
    ].join('');

    document.getElementById('q-num').textContent  = `سؤال ${State.currentQ + 1}`;
    document.getElementById('q-text').textContent = q.text;
    document.getElementById('q-opts').innerHTML   = opts;
    document.getElementById('btn-prev').disabled  = State.currentQ === 0;

    const isLast = State.currentQ === total - 1;
    const nextBtn = document.getElementById('btn-next');
    nextBtn.textContent = isLast ? 'إنهاء الاختبار' : 'التالي';
    nextBtn.className   = 'btn ' + (isLast ? 'btn-success' : 'btn-primary');
  },

  selectAnswer(idx) {
    State.testAnswers[window.QUESTION_BANK[State.currentQ].id] = idx;
    App.renderQuestion();
    App._saveTestState();
  },

  prevQ() {
    if (State.currentQ > 0) { State.currentQ--; App.renderQuestion(); App._saveTestState(); }
  },

  nextQ() {
    const QBANK = window.QUESTION_BANK;
    const q = QBANK[State.currentQ];
    if (State.testAnswers[q.id] === undefined) {
      showToast('يرجى اختيار إجابة أو "لا أعرف الإجابة" قبل المتابعة');
      return;
    }
    if (State.currentQ < QBANK.length - 1) { State.currentQ++; App.renderQuestion(); App._saveTestState(); }
    else App.finishTest();
  },

  finishTest() {
    App.stopTestTimer();
    show('screen-processing');
    setTimeout(() => App.processResults(), 2800);
  },

  // ── Gap Analysis ──────────────────────────────────────────────────────────
  async processResults() {
    const scores = {};
    SKILLS.forEach(sk => { scores[sk.id] = { correct: 0, total: 0 }; });
    window.QUESTION_BANK.forEach(q => {
      scores[q.skillId].total++;
      if (State.testAnswers[q.id] === q.ans) scores[q.skillId].correct++;
    });

    const gaps = SKILLS.map(sk => {
      const s    = scores[sk.id];
      const pct  = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      const self = State.selfDiag[sk.id] || 'need';
      const level = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
      const overconfident = self === 'mastered' && level === 'low';
      const rec = overconfident
        ? 'مهارة تحتاج مراجعة عاجلة — أجبت أنك متقن لها لكن أداءك كان ضعيفاً.'
        : level === 'low'  ? 'مهارة ضعيفة — تحتاج تدريباً مكثفاً وأساسيات.'
        : level === 'mid'  ? 'مهارة متوسطة — تحتاج تعزيزاً وتدريباً إضافياً.'
        : 'مهارة جيدة — الاستمرار في التطوير مستحسن.';
      return { skillId: sk.id, skillName: sk.name, category: sk.category, pct, level, selfAssess: self, recommendation: rec, overconfident };
    }); // order follows SKILL_ORDER (SKILLS array is already ordered)

    App._pendingGaps = gaps;
    const _loadEl = document.getElementById('processing-loading');
    const _errEl  = document.getElementById('processing-error');
    if (_loadEl) _loadEl.style.display = '';
    if (_errEl)  _errEl.style.display  = 'none';
    await App._submitPlan(gaps);
  },

  async _submitPlan(gaps) {
    const loadEl = document.getElementById('processing-loading');
    const errEl  = document.getElementById('processing-error');
    if (loadEl) loadEl.style.display = '';
    if (errEl)  errEl.style.display  = 'none';
    let plan;
    try {
      plan = await DB.addAttempt({ studentId: State.student.id, studentName: State.student.name, status: 'active', gaps, adminNote: '' });
    } catch (e) {
      ActivityLog.error('✗ حفظ الخطة فشل: ' + (e?.message || e));
      serverLog('error', 'plan', '✗ حفظ الخطة فشل: ' + (e?.message || e));
      if (loadEl) loadEl.style.display = 'none';
      if (errEl)  errEl.style.display  = '';
      return;
    }
    State.currentPlan = plan;
    App.renderLevelAnalysis(plan);
    show('screen-level-analysis');
  },

  _pendingGaps: null,

  async retryProcessResults() {
    if (App._pendingGaps) await App._submitPlan(App._pendingGaps);
  },

  // ── Level Analysis ───────────────────────────────────────────────────────
  levelLabel(pct) {
    if (pct <= 30) return 'مهارة ضعيفة — تحتاج تدريباً مكثفاً';
    if (pct <= 49) return 'مهارة دون المتوسط — تحتاج تدريباً مكثفاً';
    if (pct <= 70) return 'مستوى متوسط — يحتاج تدريباً مناسباً';
    return 'مستوى فوق المتوسط — يُستحسن الاستمرار في التطوير';
  },

  matchLabel(pct, sa) {
    const n = pct <= 30 ? 1 : pct <= 49 ? 2 : pct <= 70 ? 3 : 4;
    if (n === 1) {
      if (sa === 'mastered') return 'تشخيصك لذاتك كان غير مطابق — أداؤك أضعف مما توقعت';
      if (sa === 'partial')  return 'مستوى الأداء أقل من تشخيصك لذاتك';
      return 'فعلاً اتضح أنك غير متقن للمهارة';
    }
    if (n === 2) {
      if (sa === 'mastered') return 'تشخيصك لذاتك كان غير مطابق — أداؤك دون المتوسط';
      if (sa === 'partial')  return 'مستوى الأداء أقل من تشخيصك لذاتك';
      return 'فعلاً اتضح أنك غير متقن للمهارة كما اخترت في التشخيص الذاتي';
    }
    if (n === 3) {
      if (sa === 'mastered') return 'مستوى الأداء متوسط الإتقان — أقل مما توقعت';
      if (sa === 'partial')  return 'فعلاً اتضح أن مستوى الأداء متوسط في المهارة';
      return 'مستوى الأداء متوسط الإتقان — أفضل مما توقعت';
    }
    if (sa === 'mastered') return 'فعلاً اتضح أنك متقن للمهارة';
    if (sa === 'partial')  return 'فعلاً اتضح أن لديك إتقان جيد — أفضل من توقعاتك';
    return 'فعلاً اتضح أن لديك إتقان جيد رغم توقعاتك الأولية';
  },

  nSkills(n) {
    if (n === 1) return 'مهارة واحدة';
    if (n === 2) return 'مهارتان';
    return `${n} مهارات`;
  },

  renderLevelAnalysis(plan) {
    const sorted = sortBySkillOrder(plan.gaps);
    const verbal = sorted.filter(g => g.category === 'verbal');
    const quant  = sorted.filter(g => g.category === 'quantitative');
    const buildRow = g => {
      const cls = g.level === 'high' ? 'score-high' : g.level === 'mid' ? 'score-mid' : 'score-low';
      return `<tr>
        <td>${g.skillName}</td>
        <td style="text-align:center;"><span class="gap-score ${cls}">${g.pct}%</span></td>
        <td>${App.levelLabel(g.pct)}</td>
        <td>${App.matchLabel(g.pct, g.selfAssess)}</td>
      </tr>`;
    };
    document.getElementById('la-verbal-body').innerHTML = verbal.map(buildRow).join('');
    document.getElementById('la-quant-body').innerHTML  = quant.map(buildRow).join('');
    State.currentPlan = plan;
  },

  // ── Student Plan View ────────────────────────────────────────────────────
  viewStudentPlan(idx) {
    const plans = DB.studentPlans(State.student.id);
    const i = (idx !== undefined) ? idx : 0;
    const plan = plans[i];
    if (!plan) return;
    State.currentPlan = plan;
    State._planIdx = i;
    App.renderLevelAnalysis(plan);
    show('screen-level-analysis');
  },

  // ── Support Plan ─────────────────────────────────────────────────────────
  showSupportPlan(idx) {
    const plans = DB.studentPlans(State.student.id);
    if (!plans.length) return;
    const i = (idx !== undefined) ? idx : (State._planIdx || 0);
    State._planIdx = i;
    State.currentPlan = plans[i];
    App.renderSupportPlan(plans[i], i, plans.length);
    show('screen-support-plan');
  },

  navPlan(dir) {
    const plans = DB.studentPlans(State.student.id);
    const newIdx = (State._planIdx || 0) + dir;
    if (newIdx < 0 || newIdx >= plans.length) return;
    App.showSupportPlan(newIdx);
  },

  renderSupportPlan(plan, idx, total) {
    // Plan navigator bar
    const nav = document.getElementById('sp-plan-nav');
    if (nav) {
      if (total > 1) {
        nav.style.display = 'flex';
        const num = total - idx;
        const ordinals = ['الأولى','الثانية','الثالثة','الرابعة','الخامسة','السادسة','السابعة','الثامنة','التاسعة','العاشرة'];
        const ord = ordinals[num - 1] || num;
        const dateStr = plan.createdAt ? new Date(plan.createdAt).toLocaleDateString('ar-SA', { day:'numeric', month:'short', year:'numeric' }) : '';
        document.getElementById('sp-plan-label').textContent = `الخطة ${ord} — ${dateStr}`;
        const prevBtn = nav.children[0];
        const nextBtn = nav.children[2];
        prevBtn.disabled = idx >= total - 1;
        prevBtn.style.opacity = idx >= total - 1 ? '.4' : '1';
        nextBtn.disabled = idx <= 0;
        nextBtn.style.opacity = idx <= 0 ? '.4' : '1';
      } else {
        nav.style.display = 'none';
      }
    }
    // Admin note
    const note = document.getElementById('sp-admin-note');
    note.style.display = plan.adminNote ? 'block' : 'none';
    note.textContent   = plan.adminNote ? `ملاحظة المشرف: ${plan.adminNote}` : '';

    // Print header
    const nameEl = document.getElementById('sp-student-name-print');
    if (nameEl) nameEl.textContent = plan.studentName || (State.student && State.student.name) || '';
    const school = State.school || (State.student && State.student.school) || '';
    const schoolEl = document.getElementById('sp-print-school');
    if (schoolEl) schoolEl.innerHTML = school ? `<strong>المدرسة:</strong> ${escapeHtml(school)}` : '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const timeStr = now.toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' });
    const dateEl = document.getElementById('sp-print-date');
    if (dateEl) dateEl.innerHTML = `<strong>التاريخ:</strong> ${dateStr}`;
    const metaEl = document.getElementById('sp-print-meta');
    if (metaEl) metaEl.innerHTML = `<div>${dateStr}</div><div>${timeStr}</div>${school ? `<div>${escapeHtml(school)}</div>` : ''}`;
    const footerDate = document.getElementById('sp-print-footer-date');
    if (footerDate) footerDate.textContent = dateStr;

    // Intro section
    const weak = plan.gaps.filter(g => g.level === 'low').length;
    const mid  = plan.gaps.filter(g => g.level === 'mid').length;
    const high = plan.gaps.filter(g => g.level === 'high').length;
    document.getElementById('sp-intro').innerHTML = `
      <div class="sp-intro-box">
        <div class="sp-intro-title">أولاً / مقدمة الخطة (اقرأها بعناية لتستفيد من المكونات اللاحقة)</div>
        <p class="sp-intro-text">
          مرحباً بك في خطة الدعم — هذه الخطة المقترحة لك للتدريب والاستعداد تم تصميمها على ضوء المدخلين السابقين:<br>
          <strong>الأول</strong> / تشخيصك الذاتي لمستوى تدريبك من خلال الاستطلاع السابق.<br>
          <strong>الثاني</strong> / أداؤك في الاختبار التشخيصي القبلي الذي أنهيته في الصفحات السابقة.
        </p>
        <p class="sp-intro-text" style="margin-top:10px;">
          وتتكون الخطة من عدة عناصر يمكنك مدارستها مع الموجه الأكاديمي، وقد ضُمِّنت معها مواد علمية تدريبية يمكنك البدء بها وفق التعليمات وبمراجعة الموجه الطلابي.
        </p>
        <div class="sp-summary-chips">
          ${weak ? `<span class="sp-chip sp-chip-red">🔴 ${App.nSkills(weak)} تحتاج تدريباً مكثفاً</span>` : ''}
          ${mid  ? `<span class="sp-chip sp-chip-orange">🟡 ${App.nSkills(mid)} متوسطة المستوى</span>` : ''}
          ${high ? `<span class="sp-chip sp-chip-green">🟢 ${App.nSkills(high)} جيدة المستوى</span>` : ''}
        </div>
      </div>
      <p class="section-heading" style="margin-bottom:8px;">ثانياً / محتويات الدعم مرتبة حسب أولويات الخطة</p>
    `;

    // Build accordion cards
    const buildCard = (g, idx) => {
      const cls  = g.level === 'high' ? 'score-high' : g.level === 'mid' ? 'score-mid' : 'score-low';
      const icon = g.category === 'verbal' ? '📚' : '🔢';
      return `
        <div class="skill-card" id="sk-card-${g.skillId}">
          <div class="skill-card-header" onclick="App.toggleSkillCard('${g.skillId}')">
            <span class="skill-card-rank">${idx + 1}</span>
            <span class="skill-card-icon">${icon}</span>
            <span class="skill-card-name">${g.skillName}</span>
            <span class="gap-score ${cls}" style="flex-shrink:0;">${g.pct}%</span>
            <span class="skill-card-chevron">⌄</span>
          </div>
          <div class="skill-card-body">
            <div class="skill-tabs">
              <button class="skill-tab active" onclick="App.switchSkillTab('${g.skillId}','guide',this)">📖 دليل التدريب</button>
              <button class="skill-tab" onclick="App.switchSkillTab('${g.skillId}','videos',this)">🎬 المواد العلمية</button>
              <button class="skill-tab" onclick="App.switchSkillTab('${g.skillId}','quiz',this)">✏️ تدرّب الآن</button>
            </div>
            <div id="sk-guide-${g.skillId}"  class="skill-tab-content active">${App.buildGuideTab(g.skillId)}</div>
            <div id="sk-videos-${g.skillId}" class="skill-tab-content">${App.buildVideosTab(g.skillId)}</div>
            <div id="sk-quiz-${g.skillId}"   class="skill-tab-content">${App.buildQuizTab(g.skillId)}</div>
          </div>
        </div>`;
    };

    const sortedGaps = sortBySkillOrder(plan.gaps);
    const verbal = sortedGaps.filter(g => g.category === 'verbal');
    const quant  = sortedGaps.filter(g => g.category === 'quantitative');
    document.getElementById('sp-verbal-cards').innerHTML = verbal.map((g, i) => buildCard(g, i)).join('');
    document.getElementById('sp-quant-cards').innerHTML  = quant.map((g, i) => buildCard(g, i)).join('');

    // Print table
    document.getElementById('sp-print-body').innerHTML = sortedGaps.map((g, i) => {
      const fullUrl = SKILL_LESSONS[g.skillId] || '';
      const shortUrl = fullUrl ? fullUrl.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') : '—';
      const cls = g.level === 'high' ? 'score-high' : g.level === 'mid' ? 'score-mid' : 'score-low';
      return `<tr>
        <td style="text-align:center;font-weight:800;">${i + 1}</td>
        <td>${g.skillName}</td>
        <td style="text-align:center;"><span class="gap-score ${cls}">${g.pct}%</span></td>
        <td>${g.recommendation}</td>
        <td>${shortUrl}</td>
      </tr>`;
    }).join('');
  },

  // ── Skill card interaction ───────────────────────────────────────────────
  toggleSkillCard(skillId) {
    const card = document.getElementById(`sk-card-${skillId}`);
    if (card) card.classList.toggle('open');
  },

  switchSkillTab(skillId, tab, btn) {
    const card = document.getElementById(`sk-card-${skillId}`);
    if (!card) return;
    card.querySelectorAll('.skill-tab').forEach(b => b.classList.remove('active'));
    card.querySelectorAll('.skill-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const content = document.getElementById(`sk-${tab}-${skillId}`);
    if (content) content.classList.add('active');
  },

  // ── Tab content builders ─────────────────────────────────────────────────
  buildGuideTab(skillId) {
    const g = (typeof SKILL_GUIDES !== 'undefined') ? SKILL_GUIDES[skillId] : null;
    if (!g) return '<p class="tab-empty">المحتوى قريباً.</p>';
    let html = `<div class="guide-section"><div class="guide-label">📌 ما هذه المهارة؟</div><p class="guide-text">${g.what}</p></div>`;
    if (g.warning) html += `<div class="guide-warning"><span>⚠️</span><span>${g.warning}</span></div>`;
    if (g.subskills && g.subskills.length) {
      html += `<div class="guide-section"><div class="guide-label">🔍 المهارات الفرعية</div>`;
      g.subskills.forEach(s => {
        html += `<div class="guide-subskill"><div class="guide-subskill-title">${s.title}</div><div class="guide-subskill-body"><p><strong>التعريف:</strong> ${s.def}</p>`;
        if (s.errors && s.errors.length) html += `<div class="guide-subskill-err">⚠️ خطأ شائع:<ul>${s.errors.map(e=>`<li>${e}</li>`).join('')}</ul></div>`;
        if (s.practice && s.practice.length) html += `<div class="guide-subskill-practice">✏️ كيف أتدرب؟<ul>${s.practice.map(p=>`<li>${p}</li>`).join('')}</ul></div>`;
        if (s.when) html += `<div class="guide-subskill-when">🎯 متى أركز؟ ${s.when}</div>`;
        html += `</div></div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="guide-section"><div class="guide-label">✅ ما الذي تحتاجه لإتقانها؟</div><ul class="guide-list">${g.needs.map(n=>`<li>${n}</li>`).join('')}</ul></div>`;
    }
    if (g.confusions && g.confusions.length) {
      html += `<div class="guide-section"><div class="guide-label">🔄 العلاقات التي يكثر الخلط بينها</div>`;
      g.confusions.forEach(c => { html += `<div class="guide-confusion-item"><div class="guide-confusion-title">${c.label}</div><ul class="guide-list">${c.items.map(i=>`<li>${i}</li>`).join('')}</ul></div>`; });
      html += `</div>`;
    }
    html += `<div class="guide-section"><div class="guide-label">⚠️ أين يخطئ أغلب الطلاب؟</div><ul class="guide-list mistakes">${g.mistakes.map(m=>`<li>${m}</li>`).join('')}</ul></div>`;
    if (g.trainingOrder && g.trainingOrder.length) {
      html += `<div class="guide-section"><div class="guide-label">📋 ترتيب مقترح للتدريب</div><ol class="guide-order">${g.trainingOrder.map(t=>`<li>${t}</li>`).join('')}</ol></div>`;
    }
    if (g.mastery && g.mastery.length) {
      html += `<div class="guide-section guide-mastery-box"><div class="guide-label">🏆 مؤشرات الإتقان</div><ul class="guide-list guide-mastery">${g.mastery.map(m=>`<li>${m}</li>`).join('')}</ul></div>`;
    }
    html += `<div class="guide-tip"><span>💡</span><span>${g.tip}</span></div>`;
    return html;
  },

  buildVideosTab(skillId) {
    const url = SKILL_LESSONS[skillId];
    if (!url) return '<p class="tab-empty">المواد العلمية لهذه المهارة قريباً.</p>';
    return `
      <p class="videos-note">
        تجد هنا جميع المقاطع والشروحات المتعلقة بهذه المهارة — ابدأ بمقطع التأسيس ثم انتقل للمقاطع بالترتيب.
      </p>
      <div class="videos-btn-wrap">
        <a href="${url}" target="_blank" class="sp-lesson-btn" style="font-size:15px;padding:13px 28px;">
          🎬 عرض المقاطع التعليمية
        </a>
        <p style="color:var(--muted);font-size:12px;margin-top:10px;">يفتح في تبويب جديد</p>
      </div>`;
  },

  buildQuizTab(skillId) {
    const q = (typeof SKILL_QUIZZES !== 'undefined') ? SKILL_QUIZZES[skillId] : null;
    if (q && q.urls && q.urls.length) {
      const QUIZ_FOLDERS = {v1:'comprehension',v2:'inference',v3:'contextual',v4:'analogy',v5:'completion',q1:'arithmetic',q2:'algebra',q3:'geometry',q4:'comparison',q5:'statistics'};
      const pageUrl = `quizzes/${QUIZ_FOLDERS[skillId] || '?skill=' + skillId}/`;
      return `
        <p class="videos-note">
          تجد هنا جميع الاختبارات التدريبية المتعلقة بهذه المهارة — تدرّب بشكل منتظم لتحسين أدائك.
        </p>
        <div class="videos-btn-wrap">
          <a href="${pageUrl}" target="_blank" class="sp-lesson-btn" style="font-size:15px;padding:13px 28px;">
            ✏️ عرض الاختبارات التدريبية
          </a>
          <p style="color:var(--muted);font-size:12px;margin-top:10px;">${q.urls.length >= 3 && q.urls.length <= 10 ? q.urls.length + ' اختبارات متاحة' : q.urls.length + ' اختبار متاح'} · يفتح في تبويب جديد</p>
        </div>`;
    }
    return `
      <div class="quiz-soon">
        <div class="quiz-soon-icon">🕐</div>
        <div style="font-weight:700;margin-bottom:6px;">الاختبار التدريبي قريباً</div>
        <div style="font-size:13px;">سيُضاف رابط الاختبار عند توفره من الموجه.</div>
      </div>`;
  },

  // ── Admin Dashboard ───────────────────────────────────────────────────────
  renderAdminDashboard(tab) {
    State.tab = tab || State.tab;
    const students = DB.students();
    const plans    = DB.plans();

    // Stats: total | tested | in-cooldown | avg score
    const studentIds = new Set(plans.map(p => p.studentId));
    const cooldownCount = students.filter(st => {
      const plan = plans.find(p => p.studentId === st.id);
      return plan && actualDaysRemaining(plan) > 0 && !plan.retakeOverride;
    }).length;
    // avg score across latest plan per student
    const latestPerStudent = students.map(st => plans.find(p => p.studentId === st.id)).filter(Boolean);
    const allAvgs = latestPerStudent.map(p => p.gaps.length ? Math.round(p.gaps.reduce((s,g) => s+g.pct, 0) / p.gaps.length) : null).filter(v => v !== null);
    const avgScore = allAvgs.length ? Math.round(allAvgs.reduce((s,v) => s+v, 0) / allAvgs.length) : null;
    document.getElementById('stat-total').textContent    = students.length;
    document.getElementById('stat-tested').textContent   = studentIds.size;
    document.getElementById('stat-cooldown').textContent = cooldownCount;
    document.getElementById('stat-avg').textContent      = avgScore !== null ? avgScore + '%' : '—';

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === State.tab));
    const listEl = document.getElementById('admin-student-list');

    if (State.tab === 'students') {
      if (!students.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد طلاب مضافون بعد</p></div>`; return; }
      // School filter for director — inject into the dedicated #school-filter-bar div in the toolbar
      if (State.admin?.school === '*') {
        const uniqueSchools = [...new Set(students.map(s => s.school).filter(Boolean))].sort();
        const filterBarEl = document.getElementById('school-filter-bar');
        if (filterBarEl && !filterBarEl.querySelector('select') && uniqueSchools.length > 1) {
          filterBarEl.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
          filterBarEl.innerHTML = `<label style="font-size:13px;font-weight:600;color:var(--text);">🏫 المدرسة:</label>
            <select id="school-filter-select" onchange="App._filterStudentList()" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;background:var(--bg-card);color:var(--text);">
              <option value="">الكل</option>
              ${uniqueSchools.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
            </select>`;
        }
      }
      listEl.innerHTML = students.map(st => {
        const plan      = plans.find(p => p.studentId === st.id);
        const actualRem = plan ? actualDaysRemaining(plan) : 0;
        const inCooldown = plan && actualRem > 0 && !plan.retakeOverride;
        const badge = !plan
          ? '<span class="student-badge sbadge-new">لم يبدأ</span>'
          : inCooldown
            ? `<span class="student-badge sbadge-pending">انتظار ${actualRem}${actualRem === 1 ? ' يوم' : ' أيام'} ⏳</span>`
          : plan.retakeOverride
            ? '<span class="student-badge" style="background:#fff7ed;color:#92400e;">مسموح بالإعادة 🔓</span>'
          : '<span class="student-badge sbadge-active">أجرى الاختبار ✅</span>';
        const avgScore = plan && plan.gaps.length
          ? Math.round(plan.gaps.reduce((s,g) => s+g.pct, 0) / plan.gaps.length) : null;
        const scoreChip = avgScore !== null
          ? `<span class="gap-score ${avgScore >= 71 ? 'score-high' : avgScore >= 50 ? 'score-mid' : 'score-low'}">${avgScore}%</span>` : '';
        const unlockBtn = inCooldown
          ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff;" onclick="App.grantRetake('${st.id}')">🔓 سماح</button>`
          : '';
        const accessDot = plan
          ? '<span title="دخل المنصة" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a;margin-left:5px;flex-shrink:0;"></span>'
          : '<span title="لم يدخل المنصة بعد" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#94a3b8;margin-left:5px;flex-shrink:0;"></span>';
        return `<div class="student-row" data-school="${escapeHtml(st.school || '')}">
          <div class="student-avatar">${escapeHtml(st.name.charAt(0))}</div>
          <div class="student-info" onclick="App.openStudentDetail('${st.id}')" style="cursor:pointer;">
            <div class="student-name" style="display:flex;align-items:center;gap:4px;">${accessDot}${escapeHtml(st.name)}</div>
            <div class="student-code">رمز: ${escapeHtml(st.code)}${st.school && State.admin?.school === '*' ? ` · <span style="color:var(--primary);font-size:11px">🏫 ${escapeHtml(st.school)}</span>` : ''}</div>
          </div>
          <button class="btn btn-outline btn-sm" style="white-space:nowrap;" onclick="event.stopPropagation();App.editStudentPhone('${st.id}','${escapeHtml(st.phone || '')}')">${st.phone ? `📱 ${escapeHtml(st.phone)}` : '📱 إضافة جوال'}</button>
          ${badge}
          ${scoreChip}
          ${unlockBtn}
          <button class="btn btn-danger btn-sm" onclick="App.deleteStudent('${st.id}')">حذف</button>
        </div>`;
      }).join('');
    } else {
      listEl.innerHTML = '';
    }
  },

  _filterStudentList() {
    const q = (document.getElementById('student-search-input')?.value || '').trim().toLowerCase();
    const schoolFilter = (document.getElementById('school-filter-select')?.value || '').toLowerCase();
    document.querySelectorAll('#admin-student-list .student-row').forEach(row => {
      const name = row.querySelector('.student-name')?.textContent.toLowerCase() || '';
      const code = row.querySelector('.student-code')?.textContent.toLowerCase() || '';
      const school = (row.dataset.school || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || code.includes(q);
      const matchesSchool = !schoolFilter || school === schoolFilter;
      row.style.display = (matchesSearch && matchesSchool) ? '' : 'none';
    });
  },

  setTab(tab) {
    // 'performance' is now merged into 'stats'
    if (tab === 'performance') tab = 'stats';

    const toolbar    = document.getElementById('admin-students-toolbar');
    const listEl     = document.getElementById('admin-student-list');
    const tabStats   = document.getElementById('tab-stats');
    const tabSup     = document.getElementById('tab-supervisors');
    const tabQ       = document.getElementById('tab-questions');
    const tabBC      = document.getElementById('tab-broadcast');

    // Show/hide toolbar and student list
    if (toolbar) toolbar.style.display = tab === 'students' ? 'block' : 'none';
    if (listEl)  listEl.style.display  = tab === 'students' ? ''      : 'none';

    // Show/hide tab panels
    if (tabStats) tabStats.style.display = tab === 'stats'       ? 'block' : 'none';
    if (tabSup)   tabSup.style.display   = tab === 'supervisors' ? 'block' : 'none';
    if (tabQ)     tabQ.style.display     = tab === 'questions'   ? 'block' : 'none';
    if (tabBC)    tabBC.style.display    = tab === 'broadcast'   ? 'block' : 'none';

    if (tab === 'students') {
      App.renderAdminDashboard('students');
      return;
    }
    if (tab === 'stats') {
      App.renderAdminDashboard('stats');
      App.renderAdminStats();
      App.renderPerformanceTab();
      return;
    }
    if (tab === 'supervisors') { App.renderAdminDashboard('supervisors'); App.loadSupervisors(); return; }
    if (tab === 'questions')   { App.renderAdminDashboard('questions');   App.loadQuestions();   return; }
    if (tab === 'broadcast')   { App.renderAdminDashboard('broadcast');   App.renderBroadcastHistory(); return; }
    App.renderAdminDashboard(tab);
  },

  toggleAddStudentPanel() {
    const panel = document.getElementById('add-student-panel');
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    if (isOpen) { panel.classList.remove('open'); return; }
    panel.classList.add('open');
    this._showAddStep('choice');
  },

  _showAddStep(step) {
    const choice = document.getElementById('add-choice-step');
    const manual = document.getElementById('add-manual-step');
    const excel  = document.getElementById('add-excel-step');
    if (!choice) return;
    choice.style.display = step === 'choice' ? 'block' : 'none';
    if (manual) manual.style.display = step === 'manual' ? 'block' : 'none';
    if (excel)  excel.style.display  = step === 'excel'  ? 'block' : 'none';
  },

  async downloadStudentsTemplate() {
    try {
      await _loadXlsx();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['اسم الطالب', 'السجل المدني', 'رقم الجوال'],
        ['محمد أحمد العمري', '1012345678', '0512345678'],
        ['سارة علي الزهراني', '1098765432', ''],
      ]);
      // Set RTL and column widths
      ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');

      const instructionsWs = XLSX.utils.aoa_to_sheet([
        ['تعليمات تعبئة قالب الطلاب'],
        [''],
        ['1. لا تغيّر أسماء الأعمدة في الصف الأول من ورقة "الطلاب".'],
        ['2. اسم الطالب: يكتب كاملاً (الاسم الأول، الأب، الجد، العائلة) — حقل مطلوب.'],
        ['3. السجل المدني: 10 أرقام بدون فراغات أو رموز — حقل مطلوب ويجب أن يكون فريداً لكل طالب.'],
        ['4. رقم الجوال: يبدأ بـ 05 ويتكون من 10 أرقام — حقل اختياري، يمكن تركه فارغاً.'],
        ['5. لا تترك صفوفاً فارغة بين الطلاب.'],
        ['6. بعد التعبئة، احفظ الملف بصيغة xlsx وقم برفعه من شاشة "إضافة طلاب".'],
      ]);
      instructionsWs['!cols'] = [{ wch: 70 }];
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'تعليمات');

      XLSX.writeFile(wb, 'students-template.xlsx');
    } catch (e) { alert('تعذّر إنشاء القالب: ' + e.message); }
  },

  async exportStudentsList() {
    const students = DB.students();
    if (!students.length) { alert('لا يوجد طلاب لتصديرهم'); return; }
    try {
      await _loadXlsx();
      const rows = students.map(s => ({
        'اسم الطالب': s.name, 'السجل المدني': s.code,
        'رقم الجوال': s.phone || '', 'المدرسة': s.school || '',
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `students-export-${stamp}.xlsx`);
      showToast('تم تصدير القائمة ✅');
    } catch (e) { alert('تعذّر تصدير القائمة: ' + e.message); }
  },

  async deleteNoSchoolStudents() {
    if (!confirm('سيتم حذف جميع الطلاب الذين ليس لديهم مدرسة. هل أنت متأكد؟')) return;
    try {
      await DB.deleteNoSchoolStudents();
      App.renderAdminDashboard('students');
      showToast('تم حذف الطلاب بدون مدرسة ✅');
    } catch (e) { alert('فشل الحذف: ' + e.message); }
  },

  // ── مؤشر الأداء — Admin view ───────────────────────────────────────────────
  renderPerformanceTab(filter) {
    const el = document.getElementById('tab-performance');
    if (!el) return;
    const students = DB.students();
    const plans    = DB.plans();
    if (!students.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><p>لا يوجد طلاب بعد</p></div>`;
      return;
    }

    const planScore = p => p && p.gaps.length
      ? Math.round(p.gaps.reduce((s,g) => s+g.pct, 0) / p.gaps.length) : null;

    const scoreClass = sc =>
      sc === null ? 'pf-none' : sc >= 71 ? 'pf-high' : sc >= 50 ? 'pf-mid' : 'pf-low';

    // Build per-student data
    const data = students.map(st => {
      const myPlans  = DB.studentPlans(st.id);          // sorted newest-first
      const latest   = myPlans[0] || null;
      const previous = myPlans[1] || null;
      const latestSc  = planScore(latest);
      const prevSc    = planScore(previous);
      const delta     = (latestSc !== null && prevSc !== null) ? latestSc - prevSc : null;
      return { st, myPlans, latest, latestSc, prevSc, delta };
    });

    // Filter logic
    const f = filter || 'all';
    const filtered = f === 'tested'   ? data.filter(d => d.latestSc !== null)
                   : f === 'untested' ? data.filter(d => d.latestSc === null)
                   : data;

    // Summary counts
    const tested   = data.filter(d => d.latestSc !== null).length;
    const untested = students.length - tested;
    const allSc    = data.filter(d => d.latestSc !== null).map(d => d.latestSc);
    const classAvg = allSc.length ? Math.round(allSc.reduce((a,b) => a+b,0)/allSc.length) : null;

    const ringPath = (pct) => {
      const r = 34, c = 40, circ = 2 * Math.PI * r;
      const dash = ((pct ?? 0) / 100) * circ;
      return `<svg viewBox="0 0 80 80" width="80" height="80">
        <circle class="perf-ring-bg" cx="${c}" cy="${c}" r="${r}"/>
        <circle class="perf-ring-fg" cx="${c}" cy="${c}" r="${r}"
          stroke-dasharray="${circ.toFixed(1)}"
          stroke-dashoffset="${(circ - dash).toFixed(1)}"/>
      </svg>`;
    };

    const cardHtml = (d) => {
      const { st, myPlans, latestSc, prevSc, delta } = d;
      const sc  = latestSc;
      const cls = scoreClass(sc);

      const ring = sc !== null ? ringPath(sc) : ringPath(0);
      const ringLabel = sc !== null
        ? `<div class="perf-ring-label">${sc}%</div>`
        : `<div class="perf-ring-label">لم<br>يختبر</div>`;

      const trendHtml = (() => {
        if (sc === null) return `<span class="perf-none-badge">لم يختبر بعد</span>`;
        if (delta === null) return `<div class="perf-trend trend-same"><span class="perf-trend-arrow">◉</span>محاولة أولى</div>`;
        if (delta > 0)  return `<div class="perf-trend trend-up"><span class="perf-trend-arrow">↑</span>+${delta} نقطة</div>`;
        if (delta < 0)  return `<div class="perf-trend trend-down"><span class="perf-trend-arrow">↓</span>${delta} نقطة</div>`;
        return `<div class="perf-trend trend-same"><span class="perf-trend-arrow">→</span>لا تغيير</div>`;
      })();

      const attemptsChip = myPlans.length
        ? `<div class="perf-attempts">${myPlans.length} ${myPlans.length === 1 ? 'محاولة' : 'محاولات'}</div>`
        : '';

      return `<div class="perf-card ${cls}" onclick="App.openStudentTests('${st.id}','${escapeHtml(st.name)}')" style="cursor:pointer;" title="انقر لرؤية نتائج الاختبارات">
        ${attemptsChip}
        <div class="perf-ring-wrap">${ring}${ringLabel}</div>
        <div class="perf-name" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</div>
        <div class="perf-code">رمز: ${escapeHtml(st.code)}</div>
        ${trendHtml}
      </div>`;
    };

    el.innerHTML = `
      <div class="perf-summary-bar">
        <div class="perf-summary-item">
          <div class="perf-summary-num" style="color:var(--primary)">${students.length}</div>
          <div class="perf-summary-lbl">إجمالي الطلاب</div>
        </div>
        <div class="perf-summary-item">
          <div class="perf-summary-num" style="color:#16a34a">${tested}</div>
          <div class="perf-summary-lbl">أجروا الاختبار</div>
        </div>
        <div class="perf-summary-item">
          <div class="perf-summary-num" style="color:var(--primary)">${classAvg !== null ? classAvg + '%' : '—'}</div>
          <div class="perf-summary-lbl">متوسط الفصل</div>
        </div>
        <div class="perf-summary-item">
          <div class="perf-summary-num" style="color:#f59e0b;font-size:16px">${untested}</div>
          <div class="perf-summary-lbl">لم يختبروا</div>
        </div>
      </div>
      <div class="perf-skill-breakdown" id="perf-skill-breakdown"></div>
      <div class="perf-filter-bar">
        <input class="perf-search" id="perf-search-input" type="text" placeholder="🔍 ابحث عن طالب…" oninput="App._perfFilter()">
        <button class="perf-filter-btn ${f==='all'?'active':''}"      onclick="App.renderPerformanceTab('all')">الكل</button>
        <button class="perf-filter-btn ${f==='tested'?'active':''}"   onclick="App.renderPerformanceTab('tested')">اختبروا</button>
        <button class="perf-filter-btn ${f==='untested'?'active':''}" onclick="App.renderPerformanceTab('untested')">لم يختبروا</button>
      </div>
      <div class="perf-grid" id="perf-cards-grid">
        ${filtered.map(d => cardHtml(d)).join('')}
      </div>`;
    // Render skill breakdown
    App._renderSkillBreakdown(data.filter(d => d.latestSc !== null));
  },

  _perfFilter() {
    const q = (document.getElementById('perf-search-input')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#perf-cards-grid .perf-card').forEach(card => {
      const name = card.querySelector('.perf-name')?.textContent.toLowerCase() || '';
      const code = card.querySelector('.perf-code')?.textContent.toLowerCase() || '';
      card.style.display = (!q || name.includes(q) || code.includes(q)) ? '' : 'none';
    });
  },

  openStudentTests(studentId, studentName) {
    const modal = document.getElementById('perf-test-modal');
    if (!modal) return;
    document.getElementById('perf-test-modal-name').textContent = studentName;
    modal.style.display = 'flex';

    const plans = DB.studentPlans(studentId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (!plans.length) {
      document.getElementById('perf-test-modal-body').innerHTML =
        '<div class="empty-state"><p>لا توجد محاولات مسجّلة لهذا الطالب</p></div>';
      return;
    }

    const pts = plans.map((p, i) => {
      const avg = p.gaps.length
        ? Math.round(p.gaps.reduce((s, g) => s + g.pct, 0) / p.gaps.length)
        : 0;
      return {
        n: i + 1,
        score: avg,
        date: new Date(p.createdAt).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' }),
        gaps: p.gaps
      };
    });

    // ── SVG line chart ──
    const W = 340, H = 130, pL = 34, pR = 16, pT = 18, pB = 28;
    const cW = W - pL - pR, cH = H - pT - pB;
    const n = pts.length;
    const xs = i => pL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
    const ys = s => pT + cH - (s / 100) * cH;

    const linePts  = pts.map((p, i) => `${xs(i)},${ys(p.score)}`).join(' ');
    const areaPts  = `${xs(0)},${pT + cH} ${linePts} ${xs(n - 1)},${pT + cH}`;
    const gridSvg  = [0, 25, 50, 75, 100].map(v => {
      const y = ys(v);
      return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${v % 50 === 0 ? '' : '3,3'}"/>
        <text x="${pL - 4}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>`;
    }).join('');
    const dotsSvg  = pts.map((p, i) =>
      `<circle cx="${xs(i)}" cy="${ys(p.score)}" r="5.5" fill="white" stroke="#3F7CB8" stroke-width="2.5"
        style="cursor:pointer"
        onmouseover="_pct(event,${p.n},'${p.date.replace(/'/g, '')}',${p.score})"
        onmouseout="_pctH()"/>`
    ).join('');
    const lblSvg   = pts.map((p, i) =>
      `<text x="${xs(i)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#94a3b8">م${p.n}</text>`
    ).join('');

    const chartHtml = `
      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px 14px 8px;margin-bottom:16px;">
        <div style="font-size:11.5px;font-weight:800;color:#64748b;margin-bottom:8px;">📈 تطور الأداء عبر المحاولات</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;overflow:visible;">
          <defs>
            <linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3F7CB8" stop-opacity=".22"/>
              <stop offset="100%" stop-color="#3F7CB8" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridSvg}
          <polygon points="${areaPts}" fill="url(#pcg)"/>
          <polyline points="${linePts}" fill="none" stroke="#3F7CB8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${dotsSvg}
          ${lblSvg}
        </svg>
      </div>`;

    // ── Attempts list (newest first) ──
    const listHtml = [...pts].reverse().map(p => {
      const cls = p.score >= 71 ? 'score-high' : p.score >= 50 ? 'score-mid' : 'score-low';
      const skillRows = sortBySkillOrder(p.gaps).map(g => {
        const gc  = g.pct <= 30 ? 'score-low' : g.pct <= 70 ? 'score-mid' : 'score-high';
        const cat = g.category === 'verbal' ? '📚' : '🔢';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
          <span>${cat} ${g.skillName}</span>
          <span class="gap-score ${gc}" style="padding:2px 8px;font-size:11px;">${g.pct}%</span>
        </div>`;
      }).join('');
      return `<div style="background:var(--bg-card,#fff);border:1.5px solid var(--border,#e2e8f0);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:700;font-size:14px;">المحاولة ${p.n}</span>
          <span class="gap-score ${cls}">${p.score}%</span>
        </div>
        <div style="font-size:12px;color:var(--muted,#64748b);margin-bottom:${p.gaps.length ? '10px' : '0'};">📅 ${p.date}</div>
        ${p.gaps.length ? `<div style="border-top:1px solid #f1f5f9;padding-top:8px;">${skillRows}</div>` : ''}
      </div>`;
    }).join('');

    document.getElementById('perf-test-modal-body').innerHTML =
      chartHtml + listHtml +
      '<div id="perf-chart-tip" style="display:none;position:fixed;background:#0f172a;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;pointer-events:none;z-index:99999;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.3);"></div>';
  },

  closeStudentTests() {
    const modal = document.getElementById('perf-test-modal');
    if (modal) modal.style.display = 'none';
  },

  _renderSkillBreakdown(testedData) {
    const el = document.getElementById('perf-skill-breakdown');
    if (!el || !testedData.length) return;
    const skillNames = { v1:'الاستيعاب القرائي', v2:'الخطأ السياقي', v3:'المفردة الشاذة', v4:'التناظر اللفظي', v5:'إكمال الجمل', q1:'الحساب', q2:'الجبر', q3:'الهندسة', q4:'المقارنات', q5:'الإحصاء' };
    // Aggregate scores per skill across all latest plans
    const skillTotals = {};
    testedData.forEach(d => {
      (d.latest?.gaps || []).forEach(g => {
        if (!skillTotals[g.skillId]) skillTotals[g.skillId] = { sum: 0, count: 0 };
        skillTotals[g.skillId].sum   += g.pct;
        skillTotals[g.skillId].count += 1;
      });
    });
    const skills = Object.entries(skillTotals)
      .map(([id, { sum, count }]) => ({ id, avg: Math.round(sum / count), count }))
      .sort((a, b) => a.avg - b.avg);
    if (!skills.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;">📊 متوسط الأداء بحسب المهارة</div>
      ${skills.map(s => {
        const cls = s.avg >= 71 ? '#16a34a' : s.avg >= 50 ? '#d97706' : '#dc2626';
        const width = Math.max(s.avg, 3);
        return `<div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;">
            <span style="color:var(--text)">${skillNames[s.id] || s.id}</span>
            <span style="font-weight:700;color:${cls}">${s.avg}%</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${width}%;background:${cls};border-radius:4px;transition:width .4s"></div>
          </div>
        </div>`;
      }).join('')}`;
  },

  // ── مؤشر الأداء — Student view ────────────────────────────────────────────
  renderStudentPerformanceCard() {
    const el = document.getElementById('sh-perf-card');
    if (!el) return;
    const myPlans = DB.studentPlans(State.student.id);
    if (myPlans.length < 2) { el.style.display = 'none'; return; }

    const planScore = p => p && p.gaps.length
      ? Math.round(p.gaps.reduce((s,g) => s+g.pct, 0) / p.gaps.length) : null;

    const latest = myPlans[0];
    const prev   = myPlans[1];
    const latestSc = planScore(latest);
    const prevSc   = planScore(prev);

    if (latestSc === null) { el.style.display = 'none'; return; }

    const delta = prevSc !== null ? latestSc - prevSc : null;
    const deltaClass = delta === null ? 'sh-delta-same'
                     : delta > 0     ? 'sh-delta-up'
                     : delta < 0     ? 'sh-delta-down' : 'sh-delta-same';
    const deltaArrow = delta === null ? '◉' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const deltaLabel = delta === null ? '' : delta > 0 ? `+${delta}` : `${delta}`;

    const barClass = latestSc >= 71 ? 'pf-high' : latestSc >= 50 ? 'pf-mid' : 'pf-low';
    const attempts = myPlans.length;

    // ── SVG line chart (all attempts, oldest→newest) ──
    const allPts = [...myPlans].reverse().map((p, i) => ({
      i, score: planScore(p) ?? 0,
      date: new Date(p.createdAt).toLocaleDateString('ar-SA', { day:'numeric', month:'short' })
    }));
    const W = 320, H = 110, pL = 6, pR = 6, pT = 22, pB = 10;
    const cW = W - pL - pR, cH = H - pT - pB;
    const n = allPts.length;
    const xs = i => pL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
    const ys = s => pT + cH - (s / 100) * cH;
    const linePts = allPts.map((p, i) => `${xs(i)},${ys(p.score)}`).join(' ');
    const areaPts = `${xs(0)},${pT + cH} ${linePts} ${xs(n-1)},${pT + cH}`;
    const gridSvg = [0, 25, 50, 75, 100].map(v => {
      const y = ys(v);
      return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="rgba(63,124,184,.15)" stroke-width="1" stroke-dasharray="4,3"/>`;
    }).join('');
    const dotsSvg = allPts.map((p, i) => {
      const isLast = i === n - 1;
      const cx = xs(i), cy = ys(p.score);
      const lY  = p.score > 80 ? cy + 14 : cy - 8;
      return `<g style="cursor:pointer" onclick="_spt(event,'${p.date}',${p.score})" onmouseout="_spth()">
        <circle cx="${cx}" cy="${cy}" r="${isLast ? 5.5 : 4}"
          fill="${isLast ? '#3F7CB8' : '#fff'}" stroke="#3F7CB8" stroke-width="2"/>
        <text x="${cx}" y="${lY}" text-anchor="middle" font-size="10" font-weight="800"
          fill="${isLast ? '#1e40af' : '#475569'}">${p.score}%</text>
      </g>`;
    }).join('');
    const chartSvg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;overflow:visible;margin-bottom:10px;">
      <defs>
        <linearGradient id="spg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3F7CB8" stop-opacity=".18"/>
          <stop offset="100%" stop-color="#3F7CB8" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridSvg}
      <polygon points="${areaPts}" fill="url(#spg)"/>
      <polyline points="${linePts}" fill="none" stroke="#3F7CB8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dotsSvg}
    </svg>`;

    el.style.display = 'block';
    el.innerHTML = `<div class="sh-perf-card">
      <div class="sh-perf-title">📈 مؤشر أدائك</div>
      ${chartSvg}
      <div class="sh-perf-scores">
        ${prevSc !== null ? `<div class="sh-score-box prev">
          <div class="sh-score-num">${prevSc}%</div>
          <div class="sh-score-lbl">المحاولة السابقة</div>
        </div>` : ''}
        ${delta !== null ? `<div class="sh-perf-delta ${deltaClass}">
          <div class="sh-delta-arrow">${deltaArrow}</div>
          <div class="sh-delta-val">${deltaLabel}</div>
        </div>` : ''}
        <div class="sh-score-box latest">
          <div class="sh-score-num">${latestSc}%</div>
          <div class="sh-score-lbl">آخر محاولة</div>
        </div>
      </div>
      <div class="sh-perf-bar-wrap" style="margin-top:14px;">
        <div class="sh-perf-bar-fill ${barClass}" style="width:${latestSc}%"></div>
      </div>
      <div class="sh-perf-footer">محاولاتك الإجمالية: ${attempts} · استمر وأنت قادر! 💪</div>
    </div>
    <div id="sp-tip" style="display:none;position:fixed;background:#0f172a;color:#fff;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:700;pointer-events:none;z-index:9999;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);"></div>`;
  },

  // ── Director: Supervisors Management ─────────────────────────────────────
  async loadSupervisors() {
    const listEl = document.getElementById('supervisors-list');
    if (!listEl) return;
    // Populate school dropdown from students list (directors only)
    const schoolSel = document.getElementById('add-sup-school');
    if (schoolSel) {
      const schools = [...new Set(DB.students().map(s => s.school).filter(Boolean))].sort();
      const current = schoolSel.value;
      schoolSel.innerHTML = '<option value="">— اختر المدرسة —</option>' +
        schools.map(s => `<option value="${escapeHtml(s)}"${s === current ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
      // If admin (not director), only show their school
      if (State.admin?.school && State.admin.school !== '*') {
        schoolSel.value = State.admin.school;
        schoolSel.disabled = true;
      }
    }
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">جاري التحميل…</div>';
    try {
      const school = encodeURIComponent(State.school || '');
      const data   = await apiFetch(`/director/admins?school=${school}`);
      const admins = data.admins || [];
      if (!admins.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>لا يوجد مشرفون مضافون بعد</p></div>';
        return;
      }
      listEl.innerHTML = admins.map(a => `
        <div class="student-row">
          <div class="student-avatar">${escapeHtml(a.name.charAt(0))}</div>
          <div class="student-info" style="flex:1;">
            <div class="student-name">${escapeHtml(a.name)}</div>
            <div class="student-code">رمز: ${escapeHtml(a.code)} · ${a.role === 'director' ? '👑 مدير' : '👤 مشرف'}</div>
          </div>
          ${a.role !== 'director' ? `<button class="btn btn-danger btn-sm" onclick="App.deleteSupervisor('${a.id}')">حذف</button>` : ''}
        </div>`).join('');
    } catch (e) {
      listEl.innerHTML = '<div style="color:var(--danger);padding:12px;">تعذّر التحميل</div>';
    }
  },

  async addSupervisor() {
    const name   = document.getElementById('add-sup-name').value.trim();
    const code   = document.getElementById('add-sup-code').value.trim();
    const school = State.school || document.getElementById('add-sup-school')?.value || '';
    const errEl  = document.getElementById('add-sup-err');
    errEl.style.display = 'none';
    if (!name) { showAlert(errEl, 'أدخل اسم المشرف'); errEl.style.display=''; return; }
    if (!/^\d{10}$/.test(code)) { showAlert(errEl, 'الرمز يجب أن يكون ١٠ أرقام'); errEl.style.display=''; return; }
    if (!school) { showAlert(errEl, 'اختر المدرسة أولاً'); errEl.style.display=''; return; }
    try {
      await apiFetch('/director/admins?school=' + encodeURIComponent(school), {
        method: 'POST',
        body: JSON.stringify({ name, code })
      });
      document.getElementById('add-sup-name').value = '';
      document.getElementById('add-sup-code').value = '';
      showToast('تمت إضافة المشرف ✅');
      App.loadSupervisors();
    } catch (e) {
      showAlert(errEl, e.message || 'حدث خطأ');
      errEl.style.display = '';
    }
  },

  async deleteSupervisor(adminId) {
    if (!confirm('هل تريد حذف هذا المشرف؟')) return;
    try {
      const school = encodeURIComponent(State.school || '');
      await apiFetch(`/director/admins/${adminId}?school=${school}`, { method: 'DELETE' });
      showToast('تم حذف المشرف');
      App.loadSupervisors();
    } catch (e) {
      showToast('تعذّر الحذف: ' + (e.message || ''));
    }
  },

  // ── Director: Questions Management ───────────────────────────────────────
  _allQuestions: [],

  async loadQuestions() {
    const listEl  = document.getElementById('questions-list');
    const badgeEl = document.getElementById('q-count-badge');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);">جاري التحميل…</div>';
    try {
      let data = await apiFetch('/questions');
      // Auto-seed from hardcoded questions if DB is empty
      if (!(data.questions || []).length) {
        await apiFetch('/director/seed-questions?school=' + encodeURIComponent(State.school || ''), {
          method: 'POST',
          body: JSON.stringify({})
        }).catch(() => {});
        data = await apiFetch('/questions');
      }
      App._allQuestions = data.questions || [];
      if (badgeEl) badgeEl.textContent = App._allQuestions.length + ' سؤال';
      App.renderQuestionsList(App._allQuestions);
    } catch (e) {
      listEl.innerHTML = '<div style="padding:16px;color:var(--danger);">تعذّر التحميل</div>';
    }
  },

  renderQuestionsList(questions) {
    const listEl = document.getElementById('questions-list');
    if (!listEl) return;
    if (!questions.length) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">لا توجد أسئلة</div>';
      return;
    }
    const typeLabel = { verbal: 'لفظي', quantitative: 'كمي' };
    const skillNames = {};
    if (typeof SKILLS !== 'undefined') SKILLS.forEach(s => skillNames[s.id] = s.name);
    listEl.innerHTML = questions.map(q => `
      <div draggable="true" data-id="${q.id}" data-qnum="${q.qnum}"
           style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);transition:background .15s,opacity .15s;"
           ondragstart="App._dragStart(event)"
           ondragover="App._dragOver(event)"
           ondrop="App._dragDrop(event)"
           ondragleave="App._dragLeave(event)"
           ondragend="App._dragEnd(event)">
        <div style="color:#cbd5e1;font-size:20px;cursor:grab;flex-shrink:0;padding:0 2px;line-height:1;" title="اسحب لإعادة الترتيب">⠿</div>
        <div style="min-width:36px;height:36px;border-radius:8px;background:var(--primary);color:#fff;
                    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">
          ${q.qnum}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13.5px;font-weight:600;margin-bottom:5px;line-height:1.6;">${escapeHtml(q.text)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);">
            <span style="background:#eaf2f9;color:var(--primary);border-radius:99px;padding:2px 10px;font-weight:700;">${skillNames[q.skill_id] || q.skill_id}</span>
            <span style="background:#f1f5f9;border-radius:99px;padding:2px 10px;">${typeLabel[q.type] || q.type}</span>
            <span style="background:#dcfce7;color:#15803d;border-radius:99px;padding:2px 10px;">✓ ${['1','2','3','4'][q.ans]}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm" style="background:#f59e0b;color:#fff;" onclick="App.openEditQuestion('${q.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteQuestion('${q.id}', ${q.qnum})">🗑</button>
        </div>
      </div>`).join('');
  },

  _dragId: null,

  _dragStart(e) {
    App._dragId = e.currentTarget.dataset.id;
    e.currentTarget.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  },

  _dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.currentTarget;
    if (row.dataset.id !== App._dragId) {
      row.style.background = '#eaf2f9';
      row.style.boxShadow = 'inset 0 2px 0 var(--primary)';
    }
  },

  _dragLeave(e) {
    e.currentTarget.style.background = '';
    e.currentTarget.style.boxShadow = '';
  },

  _dragEnd(e) {
    e.currentTarget.style.opacity = '';
    e.currentTarget.style.background = '';
    e.currentTarget.style.boxShadow = '';
    App._dragId = null;
  },

  async _dragDrop(e) {
    e.preventDefault();
    const targetRow = e.currentTarget;
    targetRow.style.background = '';
    targetRow.style.boxShadow = '';

    const dragId = App._dragId;
    const dropId = targetRow.dataset.id;
    if (!dragId || dragId === dropId) return;

    const dragQ = App._allQuestions.find(x => x.id === dragId);
    const dropQ = App._allQuestions.find(x => x.id === dropId);
    if (!dragQ || !dropQ) return;

    const dragQnum = dragQ.qnum;
    const dropQnum = dropQ.qnum;

    try {
      const school = encodeURIComponent(State.school || '');
      await Promise.all([
        apiFetch(`/director/questions/${dragId}?school=${school}`, {
          method: 'PATCH',
          body: JSON.stringify({ qnum: dropQnum, type: dragQ.type, skill_id: dragQ.skill_id, text: dragQ.text,
            opt1: dragQ.opt1, opt2: dragQ.opt2, opt3: dragQ.opt3, opt4: dragQ.opt4, ans: dragQ.ans })
        }),
        apiFetch(`/director/questions/${dropId}?school=${school}`, {
          method: 'PATCH',
          body: JSON.stringify({ qnum: dragQnum, type: dropQ.type, skill_id: dropQ.skill_id, text: dropQ.text,
            opt1: dropQ.opt1, opt2: dropQ.opt2, opt3: dropQ.opt3, opt4: dropQ.opt4, ans: dropQ.ans })
        })
      ]);
      dragQ.qnum = dropQnum;
      dropQ.qnum = dragQnum;
      App._allQuestions.sort((a, b) => a.qnum - b.qnum);
      App.filterQuestions();
      showToast('تم تحديث الترتيب ✅');
    } catch (err) {
      showToast('تعذّر تحديث الترتيب');
    }
  },

  filterQuestions() {
    const search = (document.getElementById('q-search')?.value || '').toLowerCase();
    const type   = document.getElementById('q-filter-type')?.value || '';
    const skill  = document.getElementById('q-filter-skill')?.value || '';
    const filtered = App._allQuestions.filter(q =>
      (!search || q.text.toLowerCase().includes(search) || String(q.qnum).includes(search)) &&
      (!type  || q.type === type) &&
      (!skill || q.skill_id === skill)
    );
    App.renderQuestionsList(filtered);
  },

  openEditQuestion(id) {
    const q = App._allQuestions.find(x => x.id === id);
    if (!q) return;
    document.getElementById('eq-id').value    = q.id;
    document.getElementById('eq-qnum').value  = q.qnum;
    document.getElementById('eq-type').value  = q.type;
    document.getElementById('eq-skill').value = q.skill_id;
    document.getElementById('eq-text').value  = q.text;
    document.getElementById('eq-ans').value   = q.ans;
    const opts = document.getElementById('eq-options');
    opts.innerHTML = ['opt1','opt2','opt3','opt4'].map((k, i) => `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="min-width:22px;font-weight:700;color:var(--primary);">${i+1}.</span>
        <input type="text" id="eq-${k}" class="form-input" value="${q[k] || ''}" placeholder="الخيار ${i+1}" style="flex:1;font-size:13px;">
      </div>`).join('');
    document.getElementById('edit-q-modal').classList.add('open');
  },

  closeEditQuestion() {
    document.getElementById('edit-q-modal').classList.remove('open');
  },

  async saveQuestion() {
    const id     = document.getElementById('eq-id').value;
    const qnum   = parseInt(document.getElementById('eq-qnum').value);
    const type   = document.getElementById('eq-type').value;
    const skill_id = document.getElementById('eq-skill').value;
    const text   = document.getElementById('eq-text').value.trim();
    const opt1   = document.getElementById('eq-opt1').value.trim();
    const opt2   = document.getElementById('eq-opt2').value.trim();
    const opt3   = document.getElementById('eq-opt3').value.trim();
    const opt4   = document.getElementById('eq-opt4').value.trim();
    const ans    = parseInt(document.getElementById('eq-ans').value);
    if (!text || !opt1 || !opt2 || !opt3 || !opt4) { showToast('أكمل جميع الحقول'); return; }
    try {
      const school = encodeURIComponent(State.school || '');
      await apiFetch(`/director/questions/${id}?school=${school}`, {
        method: 'PATCH',
        body: JSON.stringify({ qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans })
      });
      // Update local cache
      const idx = App._allQuestions.findIndex(x => x.id === id);
      if (idx >= 0) App._allQuestions[idx] = { ...App._allQuestions[idx], qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans };
      App.closeEditQuestion();
      App.filterQuestions();
      showToast('تم حفظ التعديلات ✅');
    } catch (e) {
      showToast('تعذّر الحفظ: ' + (e.message || ''));
    }
  },

  async deleteQuestion(id, qnum) {
    if (!confirm(`هل تريد حذف السؤال رقم ${qnum}؟`)) return;
    try {
      const school = encodeURIComponent(State.school || '');
      await apiFetch(`/director/questions/${id}?school=${school}`, { method: 'DELETE' });
      App._allQuestions = App._allQuestions.filter(x => x.id !== id);
      document.getElementById('q-count-badge').textContent = App._allQuestions.length + ' سؤال';
      App.filterQuestions();
      showToast('تم حذف السؤال');
    } catch (e) {
      showToast('تعذّر الحذف: ' + (e.message || ''));
    }
  },

  // ── Statistics Tab ────────────────────────────────────────────────────────
  async renderAdminStats() {
    const listEl   = document.getElementById('admin-stats-kpis');
    const students = DB.students();
    const allPlans = DB.plans();

    // Latest plan per student
    const latestPlans = students.map(s => allPlans.find(p => p.studentId === s.id)).filter(Boolean);
    const tested    = latestPlans.length;
    const total     = students.length;
    const partRate  = total ? Math.round(tested / total * 100) : 0;
    const allGaps   = latestPlans.flatMap(p => p.gaps);

    // Global avg
    const globalAvg = allGaps.length
      ? Math.round(allGaps.reduce((s, g) => s + g.pct, 0) / allGaps.length) : null;

    // Per-skill averages
    const skillMap = {};
    for (const g of allGaps) {
      if (!skillMap[g.skillId]) skillMap[g.skillId] = { name: g.skillName, category: g.category, sum: 0, cnt: 0 };
      skillMap[g.skillId].sum += g.pct;
      skillMap[g.skillId].cnt++;
    }
    const skillRows = Object.entries(skillMap)
      .map(([id, v]) => ({ id, name: v.name, category: v.category, avg: Math.round(v.sum / v.cnt) }))
      .sort((a, b) => a.avg - b.avg);

    // Level distribution across all gaps
    let lvlWeak = 0, lvlBelow = 0, lvlMid = 0, lvlHigh = 0;
    for (const g of allGaps) {
      if (g.pct <= 30) lvlWeak++;
      else if (g.pct <= 49) lvlBelow++;
      else if (g.pct <= 70) lvlMid++;
      else lvlHigh++;
    }

    const notTested = total - tested;
    const barColor = avg => avg <= 30 ? '#ef4444' : avg <= 49 ? '#f59e0b' : avg <= 70 ? '#3b82f6' : '#22c55e';

    // ── HTML horizontal bar chart for skill averages (SVG breaks Arabic text) ──
    function skillsChart(rows) {
      if (!rows.length) return '<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">لا توجد بيانات بعد</div>';
      return rows.map(sk => {
        const col = barColor(sk.avg);
        const icon = sk.category === 'verbal' ? '📚' : '🔢';
        return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:160px;min-width:160px;font-size:12.5px;color:#475569;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon} ${escapeHtml(sk.name)}</div>
          <div style="flex:1;height:18px;background:#e2e8f0;border-radius:9px;overflow:hidden;">
            <div style="height:100%;width:${sk.avg}%;background:${col};border-radius:9px;transition:width .4s;"></div>
          </div>
          <div style="width:36px;text-align:left;font-size:12px;font-weight:800;color:${col};">${sk.avg}%</div>
        </div>`;
      }).join('');
    }

    // ── SVG vertical bar chart for level distribution (5 bars incl. not-tested) ──
    function levelChart(weak, below, mid, high, none) {
      const vals = [none, weak, below, mid, high];
      const cols = ['#94a3b8','#ef4444','#f59e0b','#3b82f6','#22c55e'];
      const lbls = ['لم يختبروا','ضعيف\n≤30%','دون المتوسط\n31-49%','متوسط\n50-70%','فوق المتوسط\n>70%'];
      const maxV = Math.max(...vals, 1);
      const W = 480, H = 150, barW = 52, gap = 16;
      const chartW = vals.length * (barW + gap) - gap;
      const startX = (W - chartW) / 2;
      const maxBarH = 85;
      const baseY = H - 44;
      const bars = vals.map((v, i) => {
        const bH = Math.max(4, Math.round(v / maxV * maxBarH));
        const x = startX + i * (barW + gap);
        const y = baseY - bH;
        const lines = lbls[i].split('\n');
        return `
          <rect x="${x}" y="${y}" width="${barW}" height="${bH}" rx="6" fill="${cols[i]}"/>
          <text x="${x + barW/2}" y="${y - 6}" text-anchor="middle" font-size="13" font-weight="800" fill="${cols[i]}" font-family="Tajawal,sans-serif">${v}</text>
          <text x="${x + barW/2}" y="${baseY + 14}" text-anchor="middle" font-size="10" fill="#64748b" font-family="Tajawal,sans-serif">${lines[0]}</text>
          ${lines[1] ? `<text x="${x + barW/2}" y="${baseY + 26}" text-anchor="middle" font-size="9" fill="#94a3b8" font-family="Tajawal,sans-serif">${lines[1]}</text>` : ''}`;
      }).join('');
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:520px;display:block;margin:0 auto;" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
    }

    // Support section — dev role only
    let supportHTML = '';
    if (State.role === 'dev') {
      let ticketsOpen = 0, ticketsProgress = 0, ticketsResolved = 0, messagesTotal = 0;
      try {
        const school = State.school || '';
        const [tData, mData] = await Promise.all([
          apiFetch(`/tickets?school=${encodeURIComponent(school)}`),
          apiFetch(`/messages/unread?school=${encodeURIComponent(school)}`),
        ]);
        ticketsOpen     = (tData.tickets || []).filter(t => t.status === 'open').length;
        ticketsProgress = (tData.tickets || []).filter(t => t.status === 'in_progress').length;
        ticketsResolved = (tData.tickets || []).filter(t => t.status === 'resolved').length;
        messagesTotal   = (mData.counts || []).reduce((s, c) => s + c.cnt, 0);
      } catch {}
      supportHTML = `
      <div class="stats-section">
        <div class="stats-section-title">🎫 الدعم والتواصل</div>
        <div class="support-stats-grid">
          <div class="support-stat"><div class="support-stat-val" style="color:#1e40af;">${ticketsOpen}</div><div class="support-stat-lbl">تذاكر مفتوحة</div></div>
          <div class="support-stat"><div class="support-stat-val" style="color:#854d0e;">${ticketsProgress}</div><div class="support-stat-lbl">قيد المعالجة</div></div>
          <div class="support-stat"><div class="support-stat-val" style="color:#166534;">${ticketsResolved}</div><div class="support-stat-lbl">تم الحل</div></div>
          ${messagesTotal ? `<div class="support-stat"><div class="support-stat-val" style="color:var(--primary);">${messagesTotal}</div><div class="support-stat-lbl">رسائل غير مقروءة</div></div>` : ''}
        </div>
      </div>`;
    }

    // Top 3 weakest skills
    const weakest3 = skillRows.slice(0, 3);

    // Category averages
    const verbal = skillRows.filter(s => s.category === 'verbal');
    const quant  = skillRows.filter(s => s.category !== 'verbal');
    const avgOf  = arr => arr.length ? Math.round(arr.reduce((s, r) => s + r.avg, 0) / arr.length) : null;
    const verbalAvg = avgOf(verbal);
    const quantAvg  = avgOf(quant);

    listEl.innerHTML = `
      <!-- Level distribution chart -->
      <div class="stats-section">
        <div class="stats-section-title">📈 توزيع المستويات</div>
        ${levelChart(lvlWeak, lvlBelow, lvlMid, lvlHigh, notTested)}
      </div>

      <!-- Category averages -->
      ${(verbalAvg !== null || quantAvg !== null) ? `
      <div class="stats-section">
        <div class="stats-section-title">🗂 متوسط أداء كل نوع</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${verbalAvg !== null ? `<div class="stats-kpi" style="flex:1;min-width:120px;">
            <div class="stats-kpi-val" style="color:${barColor(verbalAvg)};">${verbalAvg}%</div>
            <div class="stats-kpi-lbl">📚 لفظي</div>
          </div>` : ''}
          ${quantAvg !== null ? `<div class="stats-kpi" style="flex:1;min-width:120px;">
            <div class="stats-kpi-val" style="color:${barColor(quantAvg)};">${quantAvg}%</div>
            <div class="stats-kpi-lbl">🔢 كمي</div>
          </div>` : ''}
        </div>
      </div>` : ''}

      <!-- Weakest skills alert -->
      ${weakest3.length ? `
      <div class="stats-section">
        <div class="stats-section-title">⚠️ المهارات الأكثر ضعفاً</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${weakest3.map((sk, i) => {
            const col = barColor(sk.avg);
            const icon = sk.category === 'verbal' ? '📚' : '🔢';
            const medals = ['🥇','🥈','🥉'];
            return `<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1.5px solid var(--border);border-right:4px solid ${col};border-radius:10px;padding:10px 14px;">
              <span style="font-size:18px;">${medals[i]}</span>
              <div style="flex:1;font-size:13px;font-weight:700;color:var(--text);">${icon} ${escapeHtml(sk.name)}</div>
              <div style="font-size:16px;font-weight:900;color:${col};">${sk.avg}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Skills breakdown chart -->
      <div class="stats-section">
        <div class="stats-section-title">📊 متوسط الأداء بحسب المهارة</div>
        ${skillsChart(skillRows)}
      </div>

      ${supportHTML}
    `;
  },

  // ── Add Student ────────────────────────────────────────────────────────────
  async addStudent() {
    const name  = document.getElementById('add-st-name').value.trim();
    const code  = document.getElementById('add-st-code').value.trim();
    const phone = document.getElementById('add-st-phone').value.trim();
    const errEl = document.getElementById('add-st-err');
    if (!name) { showAlert(errEl, 'أدخل اسم الطالب.'); return; }
    if (!/^\d{10}$/.test(code)) { showAlert(errEl, 'السجل المدني يجب أن يكون ١٠ أرقام.'); return; }
    if (phone && !/^05\d{8}$/.test(phone)) { showAlert(errEl, 'رقم الجوال يجب أن يبدأ بـ 05 ويكون 10 أرقام.'); return; }
    if (DB.students().find(s => s.code === code)) { showAlert(errEl, 'هذا السجل المدني مسجّل مسبقاً.'); return; }
    try { await DB.addStudent({ name, code, phone }); }
    catch (e) { showAlert(errEl, e.message || 'فشل الحفظ.'); return; }
    ActivityLog.success(`➕ إضافة طالب: ${name} (${code})`);
    document.getElementById('add-st-name').value = '';
    document.getElementById('add-st-code').value = '';
    document.getElementById('add-st-phone').value = '';
    showToast('تمت إضافة الطالب ✅');
    App.toggleAddStudentPanel(); // close the panel
    App.renderAdminDashboard('students');
  },

  editStudentPhone(id, currentPhone) {
    App._ephoneId = id;
    const input = document.getElementById('ephone-input');
    const errEl = document.getElementById('ephone-err');
    if (errEl) errEl.classList.remove('show');
    if (input) input.value = currentPhone || '';
    document.getElementById('edit-phone-modal').classList.add('open');
    if (input) setTimeout(() => input.focus(), 50);
  },

  closeEditPhoneModal() {
    document.getElementById('edit-phone-modal').classList.remove('open');
    App._ephoneId = null;
  },

  async saveEditPhoneModal() {
    const id = App._ephoneId;
    if (!id) return;
    const input = document.getElementById('ephone-input');
    const errEl = document.getElementById('ephone-err');
    const trimmed = (input?.value || '').trim();
    if (trimmed && !/^05\d{8}$/.test(trimmed)) { showAlert(errEl, 'رقم الجوال يجب أن يبدأ بـ 05 ويكون 10 أرقام.'); return; }
    try { await DB.updateStudentPhone(id, trimmed); }
    catch (e) { showAlert(errEl, e.message || 'فشل الحفظ.'); return; }
    App.closeEditPhoneModal();
    showToast('تم تحديث رقم الجوال ✅');
    App.renderAdminDashboard('students');
  },

  // ── Excel: Students ────────────────────────────────────────────────────────
  _importRows: [],

  async importStudents(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const rows = await readExcel(file);
      const allRows = rows.map((r, i) => ({
        _idx: i,
        code:  String(r['السجل المدني'] ?? r['code']  ?? r['رمز الدخول'] ?? '').trim(),
        name:  String(r['اسم الطالب']  ?? r['name']  ?? r['الاسم']      ?? '').trim(),
        phone: String(r['رقم الجوال']  ?? r['phone'] ?? r['الجوال']     ?? '').trim(),
      }));
      if (!allRows.length) { alert('الملف فارغ أو لا يحتوي على بيانات.'); return; }

      // Detect per-row issues
      const codesSeen = {};
      allRows.forEach(r => {
        r.validCode  = /^\d{10}$/.test(r.code);
        r.validName  = r.name.length > 0;
        r.validPhone = !r.phone || /^05\d{8}$/.test(r.phone);
        if (r.validCode) {
          if (codesSeen[r.code] !== undefined) {
            r.dupOf = codesSeen[r.code];
            allRows[codesSeen[r.code]].isDupSrc = true;
          } else {
            codesSeen[r.code] = r._idx;
          }
        }
      });

      // Check existing students in system
      const existing = new Set(DB.students().map(s => s.code));
      allRows.forEach(r => { r.existsInDB = r.validCode && existing.has(r.code); });

      App._importRows = allRows;
      App._renderImportPreview();
      document.getElementById('import-preview-modal').style.display = 'flex';
    } catch (e) { alert('فشل قراءة الملف: ' + (e.message || e)); }
  },

  _renderImportPreview() {
    const rows = App._importRows;
    const valid   = rows.filter(r => r.validCode && r.validName && r.validPhone && !r.dupOf && !r.existsInDB).length;
    const errors  = rows.filter(r => !r.validCode || !r.validName || !r.validPhone).length;
    const dups    = rows.filter(r => r.dupOf !== undefined).length;
    const inDB    = rows.filter(r => r.existsInDB && !r.dupOf).length;

    const bar = document.getElementById('imp-summary-bar');
    bar.innerHTML = `
      <span style="background:#dcfce7;color:#166534;padding:3px 12px;border-radius:99px;">✅ صالح للإضافة: ${valid}</span>
      ${errors  ? `<span style="background:#fee2e2;color:#991b1b;padding:3px 12px;border-radius:99px;">❌ خطأ: ${errors}</span>` : ''}
      ${dups    ? `<span style="background:#fef9c3;color:#854d0e;padding:3px 12px;border-radius:99px;">⚠️ مكرر في الملف: ${dups}</span>` : ''}
      ${inDB    ? `<span style="background:#f0f4ff;color:#3730a3;padding:3px 12px;border-radius:99px;">🔵 موجود مسبقاً: ${inDB}</span>` : ''}
    `;

    const btn = document.getElementById('imp-confirm-btn');
    btn.disabled = valid === 0;
    btn.style.opacity = valid === 0 ? '.5' : '1';
    if (valid === 0) btn.title = 'لا توجد صفوف صالحة للإضافة';

    const body = document.getElementById('imp-preview-body');
    body.innerHTML = rows.map((r, i) => {
      let status = '', rowStyle = '';
      if (!r.validCode || !r.validName || !r.validPhone) {
        status = `<span style="background:#fee2e2;color:#991b1b;border-radius:99px;padding:2px 8px;font-size:11px;white-space:nowrap;">❌ خطأ</span>`;
        rowStyle = 'background:#fff5f5;';
      } else if (r.dupOf !== undefined) {
        status = `<span style="background:#fef9c3;color:#854d0e;border-radius:99px;padding:2px 8px;font-size:11px;white-space:nowrap;">⚠️ مكرر</span>`;
        rowStyle = 'background:#fefce8;';
      } else if (r.existsInDB) {
        status = `<span style="background:#e0e7ff;color:#3730a3;border-radius:99px;padding:2px 8px;font-size:11px;white-space:nowrap;">🔵 موجود</span>`;
        rowStyle = 'background:#f5f7ff;';
      } else {
        status = `<span style="background:#dcfce7;color:#166534;border-radius:99px;padding:2px 8px;font-size:11px;white-space:nowrap;">✅ صالح</span>`;
      }
      const borderBottom = i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : '';
      return `<tr style="${rowStyle}${borderBottom}">
        <td style="padding:8px 12px;text-align:center;color:var(--muted);font-size:12px;">${i + 1}</td>
        <td style="padding:8px 12px;">
          <input type="text" value="${escapeHtml(r.code)}" maxlength="10" inputmode="numeric"
            onchange="App._importRows[${i}].code=this.value.trim();App._importRows[${i}].validCode=/^\\d{10}$/.test(this.value.trim());App._revalidateImport();App._renderImportPreview()"
            style="width:120px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-family:monospace;font-size:13px;">
        </td>
        <td style="padding:8px 12px;">
          <input type="text" value="${escapeHtml(r.name)}"
            onchange="App._importRows[${i}].name=this.value.trim();App._importRows[${i}].validName=this.value.trim().length>0;App._revalidateImport();App._renderImportPreview()"
            style="width:100%;min-width:140px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;">
        </td>
        <td style="padding:8px 12px;">
          <input type="text" value="${escapeHtml(r.phone || '')}" maxlength="10" inputmode="numeric"
            onchange="App._importRows[${i}].phone=this.value.trim();App._importRows[${i}].validPhone=!this.value.trim()||/^05\\d{8}$/.test(this.value.trim());App._renderImportPreview()"
            style="width:120px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-family:monospace;font-size:13px;">
        </td>
        <td style="padding:8px 12px;text-align:center;">${status}</td>
      </tr>`;
    }).join('');
  },

  _revalidateImport() {
    const rows = App._importRows;
    const codesSeen = {};
    rows.forEach(r => { delete r.dupOf; delete r.isDupSrc; });
    rows.forEach((r, i) => {
      if (r.validCode) {
        if (codesSeen[r.code] !== undefined) {
          r.dupOf = codesSeen[r.code];
          rows[codesSeen[r.code]].isDupSrc = true;
        } else {
          codesSeen[r.code] = i;
        }
      }
    });
    const existing = new Set(DB.students().map(s => s.code));
    rows.forEach(r => { r.existsInDB = r.validCode && existing.has(r.code); });
  },

  closeImportPreview() {
    document.getElementById('import-preview-modal').style.display = 'none';
    App._importRows = [];
  },

  async confirmImport() {
    const toAdd = App._importRows.filter(r => r.validCode && r.validName && r.validPhone && !r.dupOf && !r.existsInDB);
    if (!toAdd.length) return;
    const errEl = document.getElementById('imp-modal-err');
    errEl.style.display = 'none';
    try {
      // For directors (State.school is null), use selected school filter or prompt
      const importSchool = State.school || document.getElementById('school-filter-select')?.value || '';
      if (!importSchool) {
        errEl.textContent = 'يرجى اختيار المدرسة من القائمة أولاً قبل الاستيراد.';
        errEl.style.display = 'block';
        return;
      }
      const res = await DB.bulkAddStudents(toAdd.map(r => ({ code: r.code, name: r.name, phone: r.phone || '', school: r.school || importSchool })));
      App.closeImportPreview();
      showToast(`تمت إضافة ${res.added} ${res.added >= 3 && res.added <= 10 ? 'طلاب' : 'طالب'}${res.skipped ? ' (تجاهل ' + res.skipped + ' مكرر)' : ''} ✅`);
      App.renderAdminDashboard('students');
    } catch (e) {
      errEl.textContent = 'فشلت عملية الإضافة: ' + (e.message || e);
      errEl.style.display = 'block';
    }
  },

  // ── Excel: Questions ────────────────────────────────────────────────────────
  async importQuestions(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!confirm('سيتم إضافة الأسئلة الجديدة (يتم تجاهل المكرر). متابعة؟')) return;
    try {
      const rows   = await readExcel(file);
      const parsed = rows.map(r => ({
        qnum:    Number(r['رقم السؤال'] ?? r['qnum'] ?? r['id']),
        type:    String(r['النوع']       ?? r['type']  ?? '').trim(),
        skillId: String(r['رمز المهارة'] ?? r['skillId'] ?? r['skill'] ?? '').trim(),
        text:    String(r['نص السؤال']   ?? r['text']  ?? '').trim(),
        opts: [
          String(r['الخيار الأول']  ?? r['opt1'] ?? '').trim(),
          String(r['الخيار الثاني'] ?? r['opt2'] ?? '').trim(),
          String(r['الخيار الثالث'] ?? r['opt3'] ?? '').trim(),
          String(r['الخيار الرابع'] ?? r['opt4'] ?? '').trim(),
        ],
        ans: Number(r['رقم الإجابة الصحيحة'] ?? r['ans']),
      })).filter(q => q.qnum && q.text && ['verbal','quantitative'].includes(q.type) && q.opts.every(o => o) && q.ans >= 0 && q.ans <= 3);
      if (!parsed.length) { alert('لا توجد أسئلة صالحة في الملف.'); return; }
      const res = await DB.appendQuestions(parsed);
      showToast(`تمت إضافة ${res.added} ${res.added >= 3 && res.added <= 10 ? 'أسئلة' : 'سؤال'}${res.skipped ? ' (تجاهل ' + res.skipped + ' ' + (res.skipped >= 3 && res.skipped <= 10 ? 'مكررات' : 'مكرر') + ')' : ''} ✅`);
    } catch (e) { alert('فشل الاستيراد: ' + (e.message || e)); }
  },

  async deleteStudent(studentId) {
    if (!confirm('هل تريد حذف هذا الطالب وخطته؟')) return;
    const st = DB.students().find(s => s.id === studentId);
    try { await DB.deleteStudent(studentId); }
    catch (e) { alert('تعذّر الحذف.'); return; }
    ActivityLog.warn(`🗑 حذف طالب: ${st?.name || studentId}`);
    App.renderAdminDashboard('students');
    showToast('تم الحذف');
  },

  // ── Add Question Modal ──────────────────────────────────────────────────────
  _AQ_SKILLS: {
    verbal: [
      { id:'v1', label:'v1 — الاستيعاب القرائي' },
      { id:'v2', label:'v2 — الخطأ السياقي' },
      { id:'v3', label:'v3 — المفردة الشاذة' },
      { id:'v4', label:'v4 — التناظر اللفظي' },
      { id:'v5', label:'v5 — إكمال الجمل' },
    ],
    quantitative: [
      { id:'q1', label:'q1 — الحساب' },
      { id:'q2', label:'q2 — الجبر' },
      { id:'q3', label:'q3 — الهندسة والقياس' },
      { id:'q4', label:'q4 — المقارنات الكمية' },
      { id:'q5', label:'q5 — الإحصاء والاحتمالات' },
    ],
  },

  openAddQuestionModal(editQ) {
    const modal = document.getElementById('add-question-modal');
    // Reset form
    document.getElementById('aq-err').style.display = 'none';
    document.getElementById('aq-num').value  = editQ?.qnum || '';
    document.getElementById('aq-type').value = editQ?.type || '';
    document.getElementById('aq-text').value = editQ?.text || '';
    document.querySelectorAll('input[name="aq-ans"]').forEach(r => r.checked = false);
    document.querySelectorAll('.aq-opt-input').forEach((inp, i) => { inp.value = editQ?.opts?.[i] || ''; });
    if (editQ?.ans !== undefined) {
      const radio = document.querySelector(`input[name="aq-ans"][value="${editQ.ans}"]`);
      if (radio) radio.checked = true;
    }
    App._aqUpdateSkills(editQ?.skillId);
    modal.dataset.editQnum = editQ?.qnum || '';
    document.getElementById('aq-modal-title').textContent = editQ ? '✏️ تعديل السؤال' : '➕ إضافة سؤال جديد';
    modal.classList.add('open');
  },

  closeAddQuestionModal() {
    document.getElementById('add-question-modal').classList.remove('open');
  },

  _aqUpdateSkills(preselect) {
    const type = document.getElementById('aq-type').value;
    const sel  = document.getElementById('aq-skill');
    const skills = App._AQ_SKILLS[type] || [];
    sel.innerHTML = skills.length
      ? `<option value="">— اختر المهارة —</option>` + skills.map(s => `<option value="${s.id}"${preselect===s.id?' selected':''}>${s.label}</option>`).join('')
      : `<option value="">— اختر النوع أولاً —</option>`;
  },

  _aqHighlight() {
    // visual only — handled by CSS :has selector
  },

  async submitAddQuestion() {
    const errEl   = document.getElementById('aq-err');
    errEl.style.display = 'none';
    const qnum    = Number(document.getElementById('aq-num').value) || (window.QUESTION_BANK.length + 1);
    const type    = document.getElementById('aq-type').value;
    const skillId = document.getElementById('aq-skill').value;
    const text    = document.getElementById('aq-text').value.trim();
    const opts    = [...document.querySelectorAll('.aq-opt-input')].map(i => i.value.trim());
    const ansRadio = document.querySelector('input[name="aq-ans"]:checked');

    if (!type)               { errEl.textContent = 'اختر نوع السؤال.'; errEl.style.display = 'block'; return; }
    if (!skillId)            { errEl.textContent = 'اختر المهارة.'; errEl.style.display = 'block'; return; }
    if (!text)               { errEl.textContent = 'أدخل نص السؤال.'; errEl.style.display = 'block'; return; }
    if (opts.some(o => !o)) { errEl.textContent = 'أدخل جميع الخيارات الأربعة.'; errEl.style.display = 'block'; return; }
    if (!ansRadio)           { errEl.textContent = 'اختر الإجابة الصحيحة بالضغط على أحد الخيارات.'; errEl.style.display = 'block'; return; }

    const q = { qnum, type, skillId, text, opts, ans: Number(ansRadio.value) };
    try {
      const res = await DB.appendQuestions([q]);
      ActivityLog.success(`➕ إضافة سؤال #${qnum}: "${text.slice(0,40)}..."`);
      App.closeAddQuestionModal();
      showToast(`تمت إضافة السؤال ✅${res.skipped ? ' (مكرر، تجاهل)' : ''}`);
      App.renderAdminDashboard('questions');
    } catch(e) {
      errEl.textContent = 'فشلت الإضافة: ' + (e.message || e);
      errEl.style.display = 'block';
    }
  },

  // ── Review Modal ───────────────────────────────────────────────────────────
  openReview(planId) {
    const plan = DB.plans().find(p => p.id === planId);
    if (!plan) return;
    State.reviewPlanId = planId;
    document.getElementById('modal-student-name').textContent = plan.studentName;
    document.getElementById('modal-plan-date').textContent    = `تاريخ التشخيص: ${new Date(plan.createdAt).toLocaleDateString('ar-SA')}`;
    document.getElementById('modal-admin-note').value         = plan.adminNote || '';
    document.getElementById('modal-gaps').innerHTML = sortBySkillOrder(plan.gaps).map(g => `
      <div class="gap-item">
        <div class="gap-item-head">
          <span>${g.category === 'verbal' ? '📚' : '🔢'}</span>
          <span class="gap-skill">${g.skillName}</span>
          <span class="gap-score score-${g.level}">${g.pct}%</span>
        </div>
        <div class="gap-rec">${g.recommendation}</div>
      </div>`).join('');
    document.getElementById('review-modal').classList.add('open');
  },

  closeModal() {
    document.getElementById('review-modal').classList.remove('open');
    State.reviewPlanId = null;
  },

  async approvePlan() {
    if (!State.reviewPlanId) return;
    const note = document.getElementById('modal-admin-note').value.trim();
    try { await DB.approvePlan(State.reviewPlanId, note); }
    catch (e) { alert('تعذّر اعتماد الخطة.'); return; }
    App.closeModal();
    App.renderAdminDashboard();
    showToast('تم اعتماد الخطة ونشرها للطالب ✅');
  },

  async grantRetake(studentId) {
    const plans = DB.plans().filter(p => p.studentId === studentId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = plans[0];
    if (!latest) return;
    if (!confirm('هل تريد السماح لهذا الطالب بإعادة الاختبار الآن؟')) return;
    try {
      await DB.approvePlan(latest.id, 'OVERRIDE:' + latest.adminNote);
    } catch (e) { alert('فشلت العملية.'); return; }
    App.renderAdminDashboard('students');
    showToast('تم السماح للطالب بإعادة الاختبار ✅');
  },

  // ── Student Detail Modal ─────────────────────────────────────────────────
  openStudentDetail(studentId) {
    const st      = DB.students().find(s => s.id === studentId);
    if (!st) return;
    const allPlans = DB.plans()
      .filter(p => p.studentId === studentId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest  = allPlans[0];

    document.getElementById('sdm-avatar').textContent = st.name.charAt(0);
    document.getElementById('sdm-name').textContent   = st.name;
    document.getElementById('sdm-code').textContent   = `رمز الدخول: ${st.code}`;
    document.getElementById('sdm-attempts').textContent = allPlans.length || '—';

    // Access status: if has any plans → has entered; else unknown (show as not entered)
    const accessEl = document.getElementById('sdm-access-status');
    if (allPlans.length > 0) {
      accessEl.innerHTML = '<span style="color:#16a34a;font-size:13px;font-weight:800;">✅ دخل</span>';
    } else {
      accessEl.innerHTML = '<span style="color:#64748b;font-size:13px;font-weight:800;">⭕ لم يدخل</span>';
    }

    const bestAvg = allPlans.length
      ? Math.max(...allPlans.map(p => p.gaps.length ? Math.round(p.gaps.reduce((s,g)=>s+g.pct,0)/p.gaps.length) : 0))
      : null;
    document.getElementById('sdm-best').textContent = bestAvg !== null ? bestAvg + '%' : '—';
    document.getElementById('sdm-last-date').textContent = latest
      ? new Date(latest.createdAt).toLocaleDateString('ar-SA', { day:'numeric', month:'short' }) : '—';

    // Status banner
    const banner = document.getElementById('sdm-status-banner');
    if (!latest) {
      banner.style.cssText = 'background:#f1f5f9;color:#64748b;';
      banner.textContent   = 'لم يبدأ الطالب الاختبار بعد';
    } else {
      const rem = actualDaysRemaining(latest);
      if (rem > 0 && !latest.retakeOverride) {
        banner.style.cssText = 'background:#fef9c3;color:#854d0e;';
        banner.textContent   = `⏳ في فترة الانتظار — يفتح الاختبار بعد ${rem} ${rem===1?'يوم':'أيام'}`;
      } else if (latest.retakeOverride) {
        banner.style.cssText = 'background:#fff7ed;color:#92400e;';
        banner.textContent   = '🔓 مسموح له بإعادة الاختبار من قِبَل المشرف';
      } else {
        banner.style.cssText = 'background:#dcfce7;color:#166534;';
        banner.textContent   = '✅ يمكنه إعادة الاختبار الآن';
      }
    }

    // Skills table
    const skillsBody = document.getElementById('sdm-skills-body');
    if (latest && latest.gaps.length) {
      skillsBody.innerHTML = sortBySkillOrder(latest.gaps).map(g => {
        const lvl = g.pct <= 30 ? 'ضعيف' : g.pct <= 49 ? 'دون المتوسط' : g.pct <= 70 ? 'متوسط' : 'فوق المتوسط';
        const cls = g.pct <= 49 ? 'score-low' : g.pct <= 70 ? 'score-mid' : 'score-high';
        const cat = g.category === 'verbal' ? '📚 لفظي' : '🔢 كمي';
        return `<tr>
          <td style="font-weight:700;">${g.skillName}</td>
          <td>${cat}</td>
          <td><span class="gap-score ${cls}">${g.pct}%</span></td>
          <td style="font-size:12px;color:var(--muted);">${lvl}</td>
        </tr>`;
      }).join('');
    } else {
      skillsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px;">لا توجد بيانات</td></tr>';
    }

    // History table
    const histBody = document.getElementById('sdm-history-body');
    if (allPlans.length) {
      histBody.innerHTML = allPlans.map((p, i) => {
        const avg = p.gaps.length ? Math.round(p.gaps.reduce((s,g)=>s+g.pct,0)/p.gaps.length) : 0;
        const cls = avg >= 71 ? 'score-high' : avg >= 50 ? 'score-mid' : 'score-low';
        const date = new Date(p.createdAt).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
        return `<tr>
          <td style="text-align:center;font-weight:700;">${allPlans.length - i}</td>
          <td>${date}</td>
          <td style="text-align:center;"><span class="gap-score ${cls}">${avg}%</span></td>
        </tr>`;
      }).join('');
    } else {
      histBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px;">لا توجد محاولات</td></tr>';
    }

    document.getElementById('student-detail-modal').classList.add('open');
    State.detailStudentId = studentId;
    // Load chat messages for this student ↔ this admin
    App.loadDetailChatMessages(studentId);
  },

  closeStudentDetail() {
    document.getElementById('student-detail-modal').classList.remove('open');
    State.detailStudentId = null;
  },

  exportStudentPlanPDF() {
    const studentId = State.detailStudentId;
    if (!studentId) return;
    const st = DB.students().find(s => s.id === studentId);
    const allPlans = DB.plans().filter(p => p.studentId === studentId)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = allPlans[0];
    if (!st || !latest) { showToast('لا توجد بيانات اختبار لهذا الطالب'); return; }

    const avg = latest.gaps.length ? Math.round(latest.gaps.reduce((s,g)=>s+g.pct,0)/latest.gaps.length) : 0;
    const avgColor = avg >= 71 ? '#16a34a' : avg >= 50 ? '#d97706' : '#dc2626';
    const dateStr = new Date(latest.createdAt).toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
    const school = State.school || st.school || '';
    const printDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });

    const skillRows = sortBySkillOrder(latest.gaps).map((g, i) => {
      const lvlTxt = g.pct <= 30 ? 'ضعيف' : g.pct <= 49 ? 'دون المتوسط' : g.pct <= 70 ? 'متوسط' : 'فوق المتوسط';
      const barColor = g.pct <= 30 ? '#ef4444' : g.pct <= 49 ? '#f59e0b' : g.pct <= 70 ? '#3b82f6' : '#22c55e';
      const catTxt = g.category === 'verbal' ? 'لفظي' : 'كمي';
      return `<tr style="background:${i%2===0?'#f9fafb':'#fff'}">
        <td style="padding:9px 14px;font-weight:700;border-bottom:1px solid #e2e8f0;">${g.skillName || g.skillId}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:center;">${catTxt}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;background:#e2e8f0;border-radius:99px;height:8px;overflow:hidden;">
              <div style="width:${g.pct}%;height:100%;background:${barColor};border-radius:99px;"></div>
            </div>
            <span style="font-weight:800;color:${barColor};min-width:38px;text-align:left;">${g.pct}%</span>
          </div>
        </td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">${lvlTxt}</td>
      </tr>`;
    }).join('');

    const histRows = allPlans.map((p,i) => {
      const a = p.gaps.length ? Math.round(p.gaps.reduce((s,g)=>s+g.pct,0)/p.gaps.length) : 0;
      const c = a >= 71 ? '#16a34a' : a >= 50 ? '#d97706' : '#dc2626';
      const d = new Date(p.createdAt).toLocaleDateString('ar-SA', {year:'numeric',month:'short',day:'numeric'});
      return `<tr style="background:${i%2===0?'#f9fafb':'#fff'}">
        <td style="padding:8px 14px;text-align:center;font-weight:700;border-bottom:1px solid #e2e8f0;">${allPlans.length-i}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e2e8f0;">${d}</td>
        <td style="padding:8px 14px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:800;color:${c};">${a}%</td>
      </tr>`;
    }).join('');

    const adminNote = latest.adminNote ? `<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;line-height:1.7;">
      <strong style="color:#92400e;">ملاحظة المشرف:</strong> ${latest.adminNote.replace(/</g,'&lt;')}
    </div>` : '';

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>تقرير أداء — ${st.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Tajawal','Cairo',Arial,sans-serif;background:#fff;color:#0f172a;font-size:14px;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @media print{body{margin:0;} .no-print{display:none!important;}}
  table{width:100%;border-collapse:collapse;}
  th{background:#f0f4ff;padding:10px 14px;font-weight:800;text-align:right;border-bottom:2px solid #cbd5e1;}
</style>
</head>
<body>
<div style="max-width:780px;margin:0 auto;padding:28px 24px;">
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:3px solid #3F7CB8;margin-bottom:24px;">
    <div>
      <div style="font-size:22px;font-weight:900;color:#3F7CB8;line-height:1.2;">تقرير أداء الطالب</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">برنامج الاستعداد لاختبار القدرات</div>
    </div>
    <div style="text-align:left;font-size:12px;color:#64748b;line-height:1.8;">
      <div><strong>تاريخ الطباعة:</strong> ${printDate}</div>
      ${school ? `<div><strong>المدرسة:</strong> ${school.replace(/</g,'&lt;')}</div>` : ''}
    </div>
  </div>

  <!-- Student info -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
    <div style="background:#f0f7ff;border-radius:12px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:900;color:#3F7CB8;">${avg}%</div>
      <div style="font-size:11px;color:#64748b;font-weight:700;margin-top:4px;">آخر متوسط درجة</div>
    </div>
    <div style="background:#f0fdf4;border-radius:12px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:900;color:#16a34a;">${allPlans.length}</div>
      <div style="font-size:11px;color:#64748b;font-weight:700;margin-top:4px;">عدد المحاولات</div>
    </div>
    <div style="background:#fef3e2;border-radius:12px;padding:14px;text-align:center;">
      <div style="font-size:14px;font-weight:900;color:#d97706;padding-top:4px;">${dateStr}</div>
      <div style="font-size:11px;color:#64748b;font-weight:700;margin-top:4px;">تاريخ آخر اختبار</div>
    </div>
  </div>

  <div style="background:linear-gradient(135deg,#3F7CB8,#4FA877);border-radius:14px;padding:16px 20px;margin-bottom:24px;color:#fff;display:flex;align-items:center;gap:16px;">
    <div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;flex-shrink:0;">${st.name.charAt(0)}</div>
    <div>
      <div style="font-size:18px;font-weight:900;">${st.name.replace(/</g,'&lt;')}</div>
      <div style="font-size:12px;opacity:.85;margin-top:2px;">رمز الدخول: ${st.code}</div>
    </div>
  </div>

  ${adminNote}

  <!-- Skills table -->
  <div style="font-size:15px;font-weight:800;color:#3F7CB8;margin-bottom:12px;border-right:4px solid #4FA877;padding-right:10px;">📊 تفصيل المهارات — آخر اختبار</div>
  <table style="margin-bottom:24px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
    <thead><tr><th>المهارة</th><th style="text-align:center;">القسم</th><th>الدرجة</th><th style="text-align:center;">المستوى</th></tr></thead>
    <tbody>${skillRows}</tbody>
  </table>

  <!-- History -->
  <div style="font-size:15px;font-weight:800;color:#3F7CB8;margin-bottom:12px;border-right:4px solid #4FA877;padding-right:10px;">📋 سجل المحاولات</div>
  <table style="margin-bottom:32px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
    <thead><tr><th style="text-align:center;">المحاولة</th><th>التاريخ</th><th style="text-align:center;">المتوسط</th></tr></thead>
    <tbody>${histRows}</tbody>
  </table>

  <div style="text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">
    بوابة دعم التعلم — ثانوية الخالدية · ${printDate}
  </div>
</div>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),800);};<\/script>
</body></html>`;

    const w = window.open('', '_blank', 'width=850,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  },

  async loadDetailChatMessages(studentId) {
    const el = document.getElementById('sdm-chat-messages');
    if (!el || !State.admin) return;
    try {
      const data = await apiFetch(`/messages?studentId=${studentId}&adminId=${State.admin.id}`);
      const msgs = data.messages || [];
      // mark student messages as read
      if (msgs.some(m => m.sender_type === 'student' && !m.is_read)) {
        apiFetch('/messages/read', { method:'PATCH', body: JSON.stringify({ studentId, readerType:'admin' }) }).catch(() => {});
      }
      if (!msgs.length) { el.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد</div>'; return; }
      el.innerHTML = msgs.map(m => {
        const sent = m.sender_type === 'admin';
        const time = new Date(m.created_at).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' });
        return `<div style="display:flex;flex-direction:column;align-items:${sent ? 'flex-end' : 'flex-start'};">
          <div class="chat-bubble ${sent ? 'sent' : 'received'}">${escapeHtml(m.body)}</div>
          <div class="chat-time">${sent ? 'أنت' : escapeHtml(m.student_name)} · ${time}</div>
        </div>`;
      }).join('');
      el.scrollTop = el.scrollHeight;
    } catch {}
  },

  async sendAdminMsgFromDetail() {
    const input = document.getElementById('sdm-chat-input');
    const body  = input.value.trim();
    if (!body || !State.detailStudentId || !State.admin) return;
    const st = DB.students().find(s => s.id === State.detailStudentId);
    input.value = '';
    try {
      await apiFetch('/messages', {
        method:'POST',
        body: JSON.stringify({
          studentId: State.detailStudentId,
          body,
          recipientAdminId: State.admin.id,
        }),
      });
      App.loadDetailChatMessages(State.detailStudentId);
    } catch { showToast('تعذّر الإرسال'); input.value = body; }
  },

  // ── Cooldown / Retake ────────────────────────────────────────────────────
  _cooldownTimer: null,

  startCooldownTimer(until) {
    clearInterval(App._cooldownTimer);
    const update = () => {
      const el = document.getElementById('cd-countdown');
      if (!el || !document.getElementById('screen-cooldown').classList.contains('active')) {
        clearInterval(App._cooldownTimer); return;
      }
      const diff = until - Date.now();
      if (diff <= 0) { clearInterval(App._cooldownTimer); App.startCapabilities(); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.innerHTML =
        `<span class="cd-unit"><span class="cd-val">${d}</span><span class="cd-lbl">يوم</span></span>` +
        `<span class="cd-sep">:</span>` +
        `<span class="cd-unit"><span class="cd-val">${String(h).padStart(2,'0')}</span><span class="cd-lbl">ساعة</span></span>` +
        `<span class="cd-sep">:</span>` +
        `<span class="cd-unit"><span class="cd-val">${String(m).padStart(2,'0')}</span><span class="cd-lbl">دقيقة</span></span>` +
        `<span class="cd-sep">:</span>` +
        `<span class="cd-unit"><span class="cd-val">${String(s).padStart(2,'0')}</span><span class="cd-lbl">ثانية</span></span>`;
    };
    update();
    App._cooldownTimer = setInterval(update, 1000);
  },

  stopCooldownTimer() { clearInterval(App._cooldownTimer); App._cooldownTimer = null; },

  renderCooldown(latest, rem, allPlans) {
    const until   = cooldownUntil(latest);
    const dateStr = until.toLocaleDateString('ar-SA', { day:'numeric', month:'long' });
    document.getElementById('cd-content').innerHTML = `
      <div class="analysis-intro" style="text-align:center;margin-bottom:24px;">
        <div style="font-size:36px;margin-bottom:12px;">⏳</div>
        <div id="cd-countdown" style="display:flex;justify-content:center;align-items:flex-end;gap:6px;margin-bottom:10px;direction:ltr;"></div>
        <div style="font-size:13px;color:var(--muted);">يفتح الاختبار في ${dateStr}</div>
      </div>
      <button class="btn btn-outline btn-full" onclick="App.viewStudentPlan()" style="margin-bottom:12px;">
        📊 عرض آخر خطة دعم
      </button>
      <button class="btn btn-outline btn-full" onclick="App.showHistory()">
        📋 سجل الاختبارات السابقة
      </button>`;
    App.startCooldownTimer(until);
  },

  renderRetakeOrView(latest, allPlans) {
    document.getElementById('cd-content').innerHTML = `
      <div class="analysis-intro" style="text-align:center;margin-bottom:24px;">
        <div style="font-size:40px;margin-bottom:8px;">✅</div>
        <div style="font-size:17px;font-weight:800;margin-bottom:6px;">يمكنك إعادة الاختبار الآن</div>
        <div style="font-size:13.5px;color:var(--muted);">يمكنك البدء بمحاولة جديدة</div>
      </div>
      <button class="btn btn-primary btn-full" onclick="show('screen-intro')" style="margin-bottom:12px;">
        🚀 ابدأ محاولة جديدة
      </button>
      <button class="btn btn-outline btn-full" onclick="App.viewStudentPlan()" style="margin-bottom:12px;">
        📊 عرض آخر خطة دعم
      </button>
      <button class="btn btn-outline btn-full" onclick="App.showHistory()">
        📋 سجل الاختبارات السابقة
      </button>`;
  },

  showHistory() {
    const plans = DB.studentPlans(State.student.id);
    const rows = plans.map((p, i) => {
      const date = new Date(p.createdAt).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
      const avg = p.gaps.length ? Math.round(p.gaps.reduce((s,g) => s+g.pct, 0) / p.gaps.length) : 0;
      const cls = avg >= 71 ? 'score-high' : avg >= 50 ? 'score-mid' : 'score-low';
      const attempt = plans.length - i;
      return `<tr>
        <td style="text-align:center;font-weight:700;">${attempt}</td>
        <td>${date}</td>
        <td style="text-align:center;"><span class="gap-score ${cls}">${avg}%</span></td>
        <td style="text-align:center;">
          <button onclick="App.viewAttempt(${i})"
                  style="background:var(--primary);color:#fff;border:none;border-radius:8px;
                         padding:6px 14px;font-size:12px;font-family:inherit;cursor:pointer;">
            عرض
          </button>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('hist-body').innerHTML = rows || '<tr><td colspan="4" style="text-align:center;color:var(--muted);">لا توجد محاولات سابقة</td></tr>';
    show('screen-history');
  },

  viewAttempt(idx) {
    const plans = DB.studentPlans(State.student.id);
    const plan = plans[idx];
    if (!plan) return;
    State.currentPlan = plan;
    App.renderLevelAnalysis(plan);
    show('screen-level-analysis');
  },

  // ── Logout ─────────────────────────────────────────────────────────────────
  // ── Chat (Student) ───────────────────────────────────────────────────────
  _chatTimer: null,
  _chatMsgCount: 0,

  // ── Chat: WhatsApp-style split layout ───────────────────────────────────
  _chatContacts: [],   // list shown in sidebar

  // Student: open chat screen and load supervisors of this school
  async goToChat() {
    const title = document.getElementById('chat-topbar-title');
    if (title) title.textContent = 'التواصل مع المشرف';
    show('screen-chat');
    App._chatShowSidebar();
    const contacts = document.getElementById('wachat-contacts');
    contacts.innerHTML = '<div class="wachat-loading">جارٍ التحميل…</div>';
    let admins = [];
    try {
      const data = await apiFetch(`/admins?school=${encodeURIComponent(State.school || '')}`);
      admins = (data.admins || []).filter(a => a.school === State.school || a.school === '*');
    } catch {}
    App._chatContacts = admins.map(a => ({ id: a.id, name: a.name, role: 'admin' }));
    if (!admins.length) {
      contacts.innerHTML = '<div class="wachat-loading">لا يوجد مشرفون في هذه المدرسة</div>';
      return;
    }
    App._chatRenderContacts(admins.map(a => ({ id: a.id, name: a.name, sub: 'مشرف' })));
    App.startChatPoll();
    // Auto-open first if only one
    if (admins.length === 1) App.openChatWithAdmin(admins[0].id, admins[0].name);
  },

  // Admin: open chat screen and load students who have messages
  async goToAdminChat() {
    const title = document.getElementById('chat-topbar-title');
    if (title) title.textContent = 'محادثات الطلاب';
    show('screen-chat');
    App._chatShowSidebar();
    const contacts = document.getElementById('wachat-contacts');
    contacts.innerHTML = '<div class="wachat-loading">جارٍ التحميل…</div>';
    try {
      const school  = State.school || '';
      const adminId = State.admin?.id || '';
      const data = await apiFetch(`/messages/threads?school=${encodeURIComponent(school)}&adminId=${encodeURIComponent(adminId)}`);
      const threads = data.threads || [];
      App._chatContacts = threads.map(t => ({ id: t.student_id, name: t.student_name, role: 'student', unread: t.unread }));
      if (!threads.length) {
        contacts.innerHTML = '<div class="wachat-loading">لا توجد محادثات بعد</div>';
        return;
      }
      App._chatRenderContacts(threads.map(t => ({
        id: t.student_id, name: t.student_name,
        sub: t.last_msg ? t.last_msg.slice(0, 35) : 'لا توجد رسائل',
        unread: t.unread
      })));
    } catch {
      contacts.innerHTML = '<div class="wachat-loading" style="color:var(--danger)">تعذّر التحميل</div>';
    }
    App.startChatPoll();
  },

  _chatRenderContacts(list) {
    const el = document.getElementById('wachat-contacts');
    if (!list.length) { el.innerHTML = '<div class="wachat-loading">لا توجد محادثات</div>'; return; }
    el.innerHTML = list.map(c => `
      <div class="wachat-contact-item" id="wcc-${c.id}" onclick="App._chatSelectContact('${c.id}','${escapeHtml(c.name).replace(/'/g,"&#39;")}')">
        <div class="wachat-contact-avatar">${escapeHtml(c.name.charAt(0))}</div>
        <div class="wachat-contact-info">
          <div class="wachat-contact-name">${escapeHtml(c.name)}</div>
          ${c.sub ? `<div class="wachat-contact-preview">${escapeHtml(c.sub)}</div>` : ''}
        </div>
        ${c.unread ? `<span class="wachat-contact-badge">${c.unread}</span>` : ''}
      </div>`).join('');
  },

  _chatFilterContacts(q) {
    const s = q.trim().toLowerCase();
    document.querySelectorAll('.wachat-contact-item').forEach(el => {
      const name = el.querySelector('.wachat-contact-name')?.textContent.toLowerCase() || '';
      el.style.display = !s || name.includes(s) ? '' : 'none';
    });
  },

  _chatSelectContact(id, name) {
    document.querySelectorAll('.wachat-contact-item').forEach(el => el.classList.remove('active'));
    const item = document.getElementById('wcc-' + id);
    if (item) item.classList.add('active');
    if (State.role === 'admin' || State.role === 'director') {
      App.openAdminChatWith(id, name);
    } else {
      App.openChatWithAdmin(id, name);
    }
    // On mobile: hide sidebar, show conversation
    if (window.innerWidth <= 640) App._chatShowConv();
  },

  _chatShowSidebar() {
    const sidebar = document.getElementById('wachat-sidebar');
    const main    = document.getElementById('wachat-main');
    if (sidebar) sidebar.style.display = '';
    if (main)    main.style.display    = window.innerWidth <= 640 ? 'none' : '';
  },

  _chatShowConv() {
    const sidebar = document.getElementById('wachat-sidebar');
    const main    = document.getElementById('wachat-main');
    if (window.innerWidth <= 640) {
      if (sidebar) sidebar.style.display = 'none';
    }
    if (main) main.style.display = '';
    const backBtn = document.getElementById('wachat-back-btn');
    if (backBtn) backBtn.style.display = window.innerWidth <= 640 ? 'flex' : 'none';
  },

  openChatWithAdmin(adminId, adminName) {
    State.chatAdminId   = adminId;
    State.chatAdminName = adminName;
    State.chatStudentId = null;
    App._chatOpenConv(adminName, 'مشرف');
    App._chatMsgCount = 0;
    App.loadChatMessages();
  },

  openAdminChatWith(studentId, studentName) {
    State.chatStudentId  = studentId;
    State.chatStudentName = studentName;
    State.chatAdminId    = null;
    App._chatOpenConv(studentName, 'طالب');
    App._chatMsgCount = 0;
    App.loadChatMessages();
  },

  // Support panel (dev-key login): open a student's full message thread across all admins
  openSupportMsgThread(studentId, studentName) {
    show('screen-chat');
    const sidebar = document.getElementById('wachat-sidebar');
    const main    = document.getElementById('wachat-main');
    if (sidebar) sidebar.style.display = 'none';
    if (main)    main.style.display    = '';
    State.chatStudentId  = studentId;
    State.chatStudentName = studentName;
    State.chatAdminId    = null;
    App._chatOpenConv(studentName, 'طالب');
    App._chatMsgCount = 0;
    App.loadChatMessages();
    App.startChatPoll();
  },

  _chatOpenConv(name, role) {
    const empty = document.getElementById('wachat-empty');
    const conv  = document.getElementById('wachat-conv');
    const hdr   = document.getElementById('wachat-conv-header');
    if (empty) empty.style.display = 'none';
    if (conv)  { conv.style.display = 'flex'; }
    if (hdr) hdr.innerHTML = `
      <button class="wachat-back-btn" onclick="App._chatShowSidebar()" style="${window.innerWidth<=640?'':'display:none'}">→</button>
      <div class="wachat-contact-avatar" style="width:36px;height:36px;font-size:14px;">${escapeHtml(name.charAt(0))}</div>
      <div>
        <div class="wachat-conv-name">${escapeHtml(name)}</div>
        <div class="wachat-conv-sub">${role}</div>
      </div>`;
  },

  leaveChatScreen() {
    clearInterval(App._chatTimer);
    App._chatTimer = null;
    State.chatAdminId   = null;
    State.chatStudentId = null;
    const back = (State.role === 'admin' || State.role === 'director') ? 'screen-admin'
      : State.role === 'support' ? 'screen-support-admin'
      : 'screen-student-home';
    show(back);
  },

  async loadChatMessages() {
    const el = document.getElementById('chat-messages');
    if (!el) return;
    let msgs = [], readPatch = null;

    try {
      if ((State.role === 'admin' || State.role === 'director') && State.chatStudentId) {
        const data = await apiFetch(`/messages?studentId=${State.chatStudentId}&adminId=${State.admin.id}`);
        msgs = data.messages || [];
        if (msgs.some(m => m.sender_type === 'student' && !m.is_read))
          readPatch = { studentId: State.chatStudentId, readerType: 'admin' };
      } else if (State.role === 'support' && State.chatStudentId) {
        // Support (dev-key) panel: full thread across all admins for this student
        const data = await apiFetch(`/messages?studentId=${State.chatStudentId}`);
        msgs = data.messages || [];
        if (msgs.some(m => m.sender_type === 'student' && !m.is_read))
          readPatch = { studentId: State.chatStudentId, readerType: 'admin' };
      } else if (State.chatAdminId && State.student) {
        const data = await apiFetch(`/messages?studentId=${State.student.id}&adminId=${State.chatAdminId}`);
        msgs = data.messages || [];
        if (msgs.some(m => m.sender_type === 'admin' && !m.is_read))
          readPatch = { studentId: State.student.id, readerType: 'student' };
      }
    } catch { return; }

    if (readPatch) apiFetch('/messages/read', { method:'PATCH', body: JSON.stringify(readPatch) }).catch(() => {});

    if (!msgs.length) { el.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد — ابدأ المحادثة 👋</div>'; App._chatMsgCount = 0; return; }
    el.innerHTML = msgs.map(m => {
      const isMine = (State.role === 'admin' || State.role === 'director' || State.role === 'support') ? m.sender_type === 'admin' : m.sender_type === 'student';
      const senderName = isMine ? 'أنت' : ((State.role === 'admin' || State.role === 'director' || State.role === 'support') ? escapeHtml(m.student_name || 'الطالب') : escapeHtml(State.chatAdminName || 'المشرف'));
      const time = new Date(m.created_at).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' });
      return `<div style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};">
        <div class="chat-bubble ${isMine ? 'sent' : 'received'}">${escapeHtml(m.body)}</div>
        <div class="chat-time">${senderName} · ${time}</div>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
    App._chatMsgCount = msgs.length;
    const badge = document.getElementById('chat-unread-badge');
    if (badge) badge.style.display = 'none';
  },

  startChatPoll() {
    clearInterval(App._chatTimer);
    App._chatTimer = setInterval(async () => {
      if (!document.getElementById('screen-chat').classList.contains('active')) {
        clearInterval(App._chatTimer); return;
      }
      try {
        let count = 0;
        if ((State.role === 'admin' || State.role === 'director') && State.chatStudentId) {
          const d = await apiFetch(`/messages?studentId=${State.chatStudentId}&adminId=${State.admin.id}`);
          count = (d.messages || []).length;
        } else if (State.role === 'support' && State.chatStudentId) {
          const d = await apiFetch(`/messages?studentId=${State.chatStudentId}`);
          count = (d.messages || []).length;
        } else if (State.chatAdminId && State.student) {
          const d = await apiFetch(`/messages?studentId=${State.student.id}&adminId=${State.chatAdminId}`);
          count = (d.messages || []).length;
        }
        if (count !== App._chatMsgCount) App.loadChatMessages();
      } catch {}
    }, 6000);
  },

  async sendChatMsg() {
    const input = document.getElementById('chat-input');
    const body  = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      if ((State.role === 'admin' || State.role === 'director') && State.chatStudentId) {
        await apiFetch('/messages', { method:'POST', body: JSON.stringify({ studentId: State.chatStudentId, body, recipientAdminId: State.admin.id }) });
      } else if (State.role === 'support' && State.chatStudentId) {
        await apiFetch('/messages', { method:'POST', body: JSON.stringify({ studentId: State.chatStudentId, body }) });
      } else if (State.chatAdminId) {
        await apiFetch('/messages', { method:'POST', body: JSON.stringify({ body, recipientAdminId: State.chatAdminId }) });
      }
      App.loadChatMessages();
    } catch { showToast('تعذّر الإرسال'); input.value = body; }
  },

  // ── Tickets (Student) ────────────────────────────────────────────────────
  goToTickets() {
    show('screen-tickets');
    App.loadStudentTickets();
  },

  async loadStudentTickets() {
    const el = document.getElementById('st-ticket-list');
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">جارٍ التحميل...</div>';
    try {
      const { tickets } = await apiFetch(`/tickets?studentId=${State.student.id}`);

      // Stats bar
      const statsBar = document.getElementById('ticket-stats-bar');
      if (statsBar) {
        const open     = tickets.filter(t => t.status === 'open').length;
        const progress = tickets.filter(t => t.status === 'in_progress').length;
        const resolved = tickets.filter(t => t.status === 'resolved').length;
        statsBar.style.display = tickets.length ? 'grid' : 'none';
        statsBar.innerHTML = `
          <div class="tstat-mini"><div class="tstat-mini-val" style="color:#1e40af;">${open}</div><div class="tstat-mini-lbl">مفتوحة</div></div>
          <div class="tstat-mini"><div class="tstat-mini-val" style="color:#854d0e;">${progress}</div><div class="tstat-mini-lbl">قيد المعالجة</div></div>
          <div class="tstat-mini"><div class="tstat-mini-val" style="color:#166534;">${resolved}</div><div class="tstat-mini-lbl">تم الحل</div></div>`;
      }

      // Notification badge
      const totalUnread = tickets.reduce((s, t) => s + (t.unread_count || 0), 0);
      const badge = document.getElementById('ticket-notif-badge');
      if (badge) { badge.style.display = totalUnread ? 'inline' : 'none'; badge.textContent = totalUnread || ''; }

      if (!tickets.length) {
        el.innerHTML = `<div style="padding:40px 20px;text-align:center;">
          <div style="font-size:44px;margin-bottom:12px;">🎫</div>
          <div style="font-weight:700;font-size:15px;">لا توجد طلبات دعم بعد</div>
          <div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.6;">
            هل تواجه مشكلة أو لديك استفسار؟<br>اضغط الزر أدناه لرفع طلب جديد
          </div>
        </div>`;
        return;
      }

      const catIcons = {
        'مشكلة تسجيل دخول':'🔐','مشكلة في الاختبار':'📝','خطة التعلم والنتائج':'📋',
        'خطأ تقني':'⚙️','استفسار عام':'💬','اقتراح أو ملاحظة':'🌟',
        'تسجيل دخول':'🔐','مشكلة تقنية':'⚙️','حساب وصلاحيات':'👤',
        'طلب ميزة':'✨','أخرى':'📋',
      };

      el.innerHTML = tickets.map(t => {
        const statusMap  = { open:['tbadge-open','مفتوح'], in_progress:['tbadge-progress','قيد المعالجة'], resolved:['tbadge-resolved','تم الحل'], rejected:['tbadge-rejected','مرفوض'] };
        const [badgeCls, badgeTxt] = statusMap[t.status] || ['tbadge-open','مفتوح'];
        const date       = new Date(t.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short', year:'numeric' });
        const catIcon    = catIcons[t.category] || '📋';
        const unreadBadge = t.unread_count > 0
          ? `<span style="background:#dc2626;color:#fff;border-radius:99px;font-size:10px;font-weight:800;padding:2px 8px;">● رد جديد</span>` : '';
        const urgentBadge = t.priority === 'عالية'
          ? `<span style="font-size:10px;font-weight:700;color:#dc2626;">🚨 عاجل</span>` : '';
        return `<div class="ticket-card" onclick="App.openTicketDetail('${t.id}','student')"
          style="${t.unread_count > 0 ? 'border-color:var(--primary);background:var(--surface);' : ''}">
          <div class="ticket-card-top">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px;">
                ${t.ticket_num ? `<span class="ticket-num-badge">${escapeHtml(t.ticket_num)}</span>` : ''}
                ${unreadBadge}
                ${urgentBadge}
              </div>
              <div class="ticket-subject" style="margin-bottom:5px;">${escapeHtml(t.subject)}</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                ${t.category ? `<span style="font-size:11px;color:var(--muted);">${catIcon} ${escapeHtml(t.category)}</span>` : ''}
                <span style="font-size:11px;color:var(--muted);">🗓 ${date}</span>
              </div>
            </div>
            <span class="${badgeCls}" style="flex-shrink:0;margin-top:2px;">${badgeTxt}</span>
          </div>
        </div>`;
      }).join('');
    } catch { el.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;font-size:13px;">تعذّر التحميل</div>'; }
  },

  async loadTicketNotifications() {
    if (!State.student?.id) return;
    try {
      const { count } = await apiFetch(`/tickets/unread?studentId=${State.student.id}`);
      const badge = document.getElementById('ticket-notif-badge');
      if (badge) { badge.style.display = count > 0 ? 'inline' : 'none'; badge.textContent = count > 0 ? count : ''; }
    } catch {}
  },

  _selectedCat: '',

  _selectCat(btn) {
    document.querySelectorAll('#nt-cat-grid .cat-card').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    App._selectedCat = btn.dataset.cat || '';
    const hint = btn.dataset.hint || 'اشرح المشكلة بالتفصيل...';
    document.getElementById('nt-body').placeholder = hint;
    // Auto-suggest subject if empty
    const subjectEl = document.getElementById('nt-subject');
    if (!subjectEl.value.trim()) {
      subjectEl.placeholder = btn.dataset.icon + ' ' + btn.dataset.cat;
    }
  },

  openNewTicketModal() {
    document.getElementById('nt-subject').value   = '';
    document.getElementById('nt-body').value      = '';
    document.getElementById('nt-err').textContent = '';
    const urgentEl = document.getElementById('nt-urgent');
    if (urgentEl) urgentEl.checked = false;
    App._selectedCat = '';
    document.querySelectorAll('#nt-cat-grid .cat-card').forEach(b => b.classList.remove('selected'));
    document.getElementById('nt-body').placeholder    = 'اشرح المشكلة بالتفصيل...';
    document.getElementById('nt-subject').placeholder = 'اكتب موضوع طلبك بإيجاز...';
    const num = 'T-' + String(Math.floor(10000 + Math.random() * 90000));
    document.getElementById('nt-ticket-num').textContent = num;
    document.getElementById('new-ticket-modal').classList.add('open');
  },

  closeNewTicketModal() { document.getElementById('new-ticket-modal').classList.remove('open'); },

  async submitTicket() {
    const subject  = document.getElementById('nt-subject').value.trim();
    const body     = document.getElementById('nt-body').value.trim();
    const category = App._selectedCat || 'استفسار عام';
    const urgent   = document.getElementById('nt-urgent')?.checked;
    const priority = urgent ? 'عالية' : 'متوسطة';
    const errEl    = document.getElementById('nt-err');
    if (!App._selectedCat) { showAlert(errEl, 'اختر نوع الطلب أولاً'); return; }
    if (!subject) { showAlert(errEl, 'أدخل موضوع الطلب'); return; }
    if (!body)    { showAlert(errEl, 'أدخل تفاصيل الطلب'); return; }
    const btn = document.querySelector('#new-ticket-modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الإرسال...'; }
    try {
      await apiFetch('/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, body, category, priority }),
      });
      App.closeNewTicketModal();
      showToast('✅ تم إرسال طلبك — سنتواصل معك قريباً');
      App.loadStudentTickets();
    } catch (e) {
      showAlert(errEl, e.message || 'فشل الإرسال');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'إرسال الطلب ←'; }
    }
  },

  // ── Guest Support (contact support without an account) ────────────────────
  _guestCat: '',

  openGuestSupport() {
    document.getElementById('gs-name').value   = '';
    document.getElementById('gs-phone').value  = '';
    document.getElementById('gs-school').value = '';
    document.getElementById('gs-body').value   = '';
    document.getElementById('gs-err1').textContent = '';
    document.getElementById('gs-err2').textContent = '';
    document.getElementById('gs-step1').style.display = '';
    document.getElementById('gs-step2').style.display = 'none';
    App._guestCat = '';
    document.querySelectorAll('#gs-cat-grid .cat-card').forEach(b => b.classList.remove('selected'));
    document.getElementById('guest-support-modal').classList.add('open');
  },

  closeGuestSupportModal() { document.getElementById('guest-support-modal').classList.remove('open'); },

  guestSupportNext() {
    const errEl = document.getElementById('gs-err1');
    if (!document.getElementById('gs-name').value.trim())   { showAlert(errEl, 'أدخل اسمك الكامل'); return; }
    if (!document.getElementById('gs-phone').value.trim())  { showAlert(errEl, 'أدخل رقم جوالك'); return; }
    if (!document.getElementById('gs-school').value.trim()) { showAlert(errEl, 'أدخل اسم مدرستك'); return; }
    document.getElementById('gs-step1').style.display = 'none';
    document.getElementById('gs-step2').style.display = '';
  },

  guestSupportBack() {
    document.getElementById('gs-step2').style.display = 'none';
    document.getElementById('gs-step1').style.display = '';
  },

  _selectGuestCat(btn) {
    document.querySelectorAll('#gs-cat-grid .cat-card').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    App._guestCat = btn.dataset.cat || '';
  },

  async submitGuestSupport() {
    const errEl = document.getElementById('gs-err2');
    const body  = document.getElementById('gs-body').value.trim();
    if (!App._guestCat) { showAlert(errEl, 'اختر نوع المشكلة أولاً'); return; }
    if (!body)          { showAlert(errEl, 'اشرح مشكلتك بالتفصيل'); return; }
    const btn = document.querySelector('#guest-support-modal #gs-step2 .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الإرسال...'; }
    try {
      const { ticket } = await apiFetch('/tickets/guest', {
        method: 'POST',
        body: JSON.stringify({
          name:   document.getElementById('gs-name').value.trim(),
          phone:  document.getElementById('gs-phone').value.trim(),
          school: document.getElementById('gs-school').value.trim(),
          category: App._guestCat,
          body,
        }),
      });
      App.closeGuestSupportModal();
      showToast(`✅ تم إرسال طلبك (${ticket?.ticket_num || ''}) — سنتواصل معك على رقم جوالك قريباً`);
    } catch (e) {
      showAlert(errEl, e.message || 'فشل الإرسال، حاول مرة أخرى');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'إرسال الطلب ←'; }
    }
  },

  // ── Ticket Detail (shared student & admin) ────────────────────────────────
  _currentTicketId: null,
  _ticketSenderType: 'student',
  _ticketStatus: null,

  async openTicketDetail(ticketId, senderType) {
    App._currentTicketId  = ticketId;
    App._ticketSenderType = senderType;
    try {
      const { ticket, replies } = await apiFetch(`/tickets/${ticketId}`);
      App._ticketStatus = ticket.status;

      // Header
      document.getElementById('td-subject').textContent = ticket.subject;
      const date = new Date(ticket.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short', year:'numeric' });
      const statusMap = { open: ['tbadge-open','مفتوح'], in_progress: ['tbadge-progress','قيد المعالجة'], resolved: ['tbadge-resolved','تم الحل'], rejected: ['tbadge-rejected','مرفوض'] };
      const [badgeCls, badgeTxt] = statusMap[ticket.status] || ['tbadge-open','مفتوح'];
      document.getElementById('td-status-badge').innerHTML = `<span class="${badgeCls}">${badgeTxt}</span>`;

      // Meta chips
      const prioIcon = ticket.priority === 'عالية' ? '🚨' : ticket.priority === 'منخفضة' ? '🟢' : '🟡';
      document.getElementById('td-meta-chips').innerHTML = `
        ${ticket.ticket_num ? `<span class="ticket-num-badge">${escapeHtml(ticket.ticket_num)}</span>` : ''}
        ${String(ticket.student_id || '').startsWith('guest-') ? '<span class="cat-chip" style="background:#fef3c7;color:#92400e;">👤 بدون حساب</span>' : ''}
        ${ticket.category   ? `<span class="cat-chip">${escapeHtml(ticket.category)}</span>` : ''}
        ${ticket.priority   ? `<span style="font-size:11px;">${prioIcon} ${escapeHtml(ticket.priority)}</span>` : ''}
        ${ticket.phone      ? `<span style="font-size:11px;">📱 ${escapeHtml(ticket.phone)}</span>` : ''}
        <span style="font-size:11px;color:var(--muted);">${escapeHtml(ticket.student_name)} · ${escapeHtml(ticket.school || '')} · ${date}</span>`;

      // Chat bubbles
      const thread = document.getElementById('td-thread');
      thread.innerHTML = replies.length ? replies.map(r => {
        const time = new Date(r.created_at).toLocaleString('ar-SA', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        const who  = r.sender_type === 'student' ? escapeHtml(ticket.student_name || 'الطالب') : '🛠 الدعم الفني';
        return `<div class="chat-bubble-wrap ${r.sender_type}">
          <div class="chat-bubble">
            <div class="chat-label">${who}</div>
            <div>${escapeHtml(r.body)}</div>
            <div class="chat-time">${time}</div>
          </div>
        </div>`;
      }).join('') : '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px;">لا توجد رسائل بعد</div>';
      thread.scrollTop = thread.scrollHeight;

      // Mark replies as read
      apiFetch(`/tickets/${ticketId}/read`, { method:'POST', body: JSON.stringify({ readerType: senderType }) }).catch(() => {});

      // Buttons
      const isResolved = ticket.status === 'resolved' || ticket.status === 'rejected';
      document.getElementById('td-resolve-btn').style.display = (senderType === 'admin' && !isResolved) ? 'inline-flex' : 'none';
      document.getElementById('td-student-close-btn').style.display = (senderType === 'student' && ticket.status === 'in_progress') ? 'inline-flex' : 'none';
      document.getElementById('td-reply-area').style.display = isResolved ? 'none' : 'block';

      // Rating (student, resolved, not yet rated)
      const showRating = senderType === 'student' && isResolved && !(ticket.rating > 0);
      document.getElementById('td-rating-area').style.display = showRating ? 'block' : 'none';
      if (ticket.rating > 0) App._renderStars(ticket.rating);

      document.getElementById('td-reply-input').value = '';
      document.getElementById('ticket-detail-modal').classList.add('open');

      // Refresh notifications
      if (senderType === 'student') App.loadStudentTickets();
    } catch { showToast('تعذّر تحميل التذكرة'); }
  },

  _renderStars(val) {
    document.querySelectorAll('#td-stars span').forEach((s, i) => {
      s.textContent = i < val ? '⭐' : '☆';
      s.classList.toggle('lit', i < val);
    });
  },

  async rateTicket(val) {
    if (!App._currentTicketId) return;
    App._renderStars(val);
    try {
      await apiFetch(`/tickets/${App._currentTicketId}`, { method:'PATCH', body: JSON.stringify({ rating: val }) });
      document.getElementById('td-rating-area').style.display = 'none';
      showToast('شكراً على تقييمك ⭐');
    } catch {}
  },

  closeTicketDetail() {
    document.getElementById('ticket-detail-modal').classList.remove('open');
    App._currentTicketId = null;
  },

  async sendTicketReply() {
    const body = document.getElementById('td-reply-input').value.trim();
    if (!body || !App._currentTicketId) return;
    const btn = document.getElementById('td-send-btn');
    btn.disabled = true;
    try {
      await apiFetch(`/tickets/${App._currentTicketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      document.getElementById('td-reply-input').value = '';
      await App.openTicketDetail(App._currentTicketId, App._ticketSenderType);
    } catch { showToast('تعذّر الإرسال'); }
    finally { btn.disabled = false; }
  },

  async resolveTicket() {
    if (!App._currentTicketId) return;
    try {
      await apiFetch(`/tickets/${App._currentTicketId}`, { method:'PATCH', body: JSON.stringify({ status:'resolved' }) });
      App.closeTicketDetail();
      showToast('تم إغلاق التذكرة ✅');
      App.renderSupportTickets();
    } catch { showToast('تعذّر التحديث'); }
  },

  async studentCloseTicket() {
    if (!App._currentTicketId) return;
    try {
      await apiFetch(`/tickets/${App._currentTicketId}`, { method:'PATCH', body: JSON.stringify({ status:'resolved' }) });
      App._ticketStatus = 'resolved';
      document.getElementById('td-student-close-btn').style.display = 'none';
      document.getElementById('td-reply-area').style.display = 'none';
      document.getElementById('td-rating-area').style.display = 'block';
      document.getElementById('td-status-badge').innerHTML = '<span class="tbadge-resolved">تم الحل</span>';
      showToast('تم إغلاق الطلب ✔');
      App.loadStudentTickets();
    } catch { showToast('تعذّر التحديث'); }
  },

  // ── Support Admin ────────────────────────────────────────────────────────
  _supportAllTickets: [],

  async supportAdminLogin() {
    const key   = document.getElementById('sp-login-key').value.trim();
    const errEl = document.getElementById('sp-login-err');
    if (!key) { showAlert(errEl, 'أدخل مفتاح الدخول'); return; }
    try {
      const data = await apiFetch('/auth/dev', {
        method: 'POST',
        body: JSON.stringify({ key }),
      });
      _authToken = data.token;
    } catch (e) {
      if (e.message && e.message.includes('429')) {
        showAlert(errEl, 'محاولات كثيرة — انتظر دقيقة'); return;
      }
      showAlert(errEl, 'مفتاح الدخول غير صحيح'); return;
    }
    State.role = 'support';
    startIdleWatch();
    show('screen-support-admin');
    App.setSupportTab('sa-tickets');
  },

  setSupportTab(tab) {
    document.querySelectorAll('#screen-support-admin .tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('support-filter-bar').style.display = tab === 'sa-tickets' ? 'flex' : 'none';
    const logPanel = document.getElementById('sa-log-panel');
    const mainList = document.getElementById('support-admin-list');
    if (tab === 'sa-log') {
      if (logPanel) logPanel.style.display = 'block';
      if (mainList) mainList.style.display = 'none';
      App.renderActivityLog();
    } else {
      if (logPanel) logPanel.style.display = 'none';
      if (mainList) mainList.style.display = 'block';
      if (tab === 'sa-tickets') App.renderSupportTickets();
      else App.renderSupportMessages();
    }
  },

  async renderActivityLog() {
    const el = document.getElementById('sa-log-list');
    if (!el) return;
    const active = el.dataset.filter || 'all';
    el.innerHTML = '<span style="color:#64748b;">جاري التحميل...</span>';
    try {
      const qs = active === 'all' ? '' : `?level=${encodeURIComponent(active)}`;
      const { logs } = await apiFetch(`/dev/logs${qs}`);
      if (!logs || !logs.length) {
        el.innerHTML = '<span style="color:#64748b;">لا توجد سجلات بعد.</span>';
      } else {
        const colorMap = { success:'#4ade80', info:'#93c5fd', warn:'#fbbf24', error:'#f87171' };
        el.innerHTML = logs.map(l => {
          const ts = new Date(l.created_at).toLocaleString('ar-SA');
          return `<div style="border-bottom:1px solid #1e293b;padding:4px 0;display:flex;gap:10px;flex-wrap:wrap;">
            <span style="color:#475569;flex-shrink:0;">${ts}</span>
            <span style="color:${colorMap[l.level]||'#e2e8f0'};flex-shrink:0;font-size:11px;text-transform:uppercase;">[${l.level}]</span>
            <span style="color:#64748b;flex-shrink:0;">${escapeHtml(l.category||'')}</span>
            <span style="word-break:break-all;">${escapeHtml(l.message)}${l.user_name ? ' — ' + escapeHtml(l.user_name) : ''}</span>
          </div>`;
        }).join('');
      }
    } catch {
      el.innerHTML = '<span style="color:#f87171;">تعذّر تحميل السجل.</span>';
    }
    el.dataset.filter = active;
  },

  filterLog(type, btn) {
    document.querySelectorAll('#sa-log-filter .filter-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const el = document.getElementById('sa-log-list');
    if (el) el.dataset.filter = type;
    App.renderActivityLog();
  },

  async renderSupportTickets() {
    const listEl = document.getElementById('support-admin-list');
    listEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">جاري التحميل...</div>';
    try {
      const [{ tickets }, stats] = await Promise.all([
        apiFetch('/tickets'),
        apiFetch('/tickets/stats').catch(() => ({})),
      ]);
      App._supportAllTickets = tickets;

      // Stats bar
      const sb = document.getElementById('support-stats-bar');
      if (sb && stats.total !== undefined) {
        sb.innerHTML = `
          <div class="stat-card"><div class="stat-num">${stats.total}</div><div class="stat-label">إجمالي</div></div>
          <div class="stat-card"><div class="stat-num" style="color:#1e40af;">${stats.open || 0}</div><div class="stat-label">جديد</div></div>
          <div class="stat-card"><div class="stat-num" style="color:#92400e;">${stats.inProgress || 0}</div><div class="stat-label">معالجة</div></div>
          <div class="stat-card urgent"><div class="stat-num">${stats.urgent || 0}</div><div class="stat-label">🚨 عاجل</div></div>`;
      }

      App._renderSupportList(tickets);
    } catch {
      listEl.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">تعذّر التحميل</div>';
    }
  },

  filterSupportTickets(filter) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
    let list = App._supportAllTickets;
    if (filter === 'open')        list = list.filter(t => t.status === 'open');
    else if (filter === 'in_progress') list = list.filter(t => t.status === 'in_progress');
    else if (filter === 'resolved')    list = list.filter(t => t.status === 'resolved');
    else if (filter === 'urgent')      list = list.filter(t => t.priority === 'عالية' && t.status !== 'resolved');
    App._renderSupportList(list);
  },

  _renderSupportList(tickets) {
    const listEl = document.getElementById('support-admin-list');
    if (!tickets.length) { listEl.innerHTML = '<div class="chat-empty" style="padding:40px 0;text-align:center;">لا توجد تذاكر في هذا التصنيف</div>'; return; }
    const statusMap = { open: ['tbadge-open','مفتوح'], in_progress: ['tbadge-progress','قيد المعالجة'], resolved: ['tbadge-resolved','تم الحل'], rejected: ['tbadge-rejected','مرفوض'] };
    listEl.innerHTML = tickets.map(t => {
      const [badgeCls, badgeTxt] = statusMap[t.status] || ['tbadge-open','مفتوح'];
      const date = new Date(t.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short' });
      const prioIcon = t.priority === 'عالية' ? '🚨 ' : t.priority === 'منخفضة' ? '🟢 ' : '🟡 ';
      return `<div class="ticket-card" onclick="App.openTicketDetail('${t.id}','admin')">
        <div class="ticket-card-top">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span class="ticket-num-badge">${escapeHtml(t.ticket_num || '—')}</span>
            ${String(t.student_id || '').startsWith('guest-') ? '<span class="cat-chip" style="background:#fef3c7;color:#92400e;">👤 بدون حساب</span>' : ''}
            <div class="ticket-subject">${escapeHtml(t.subject)}</div>
          </div>
          <span class="${badgeCls}" style="flex-shrink:0;">${badgeTxt}</span>
        </div>
        <div class="ticket-card-footer">
          ${t.category ? `<span class="cat-chip">${escapeHtml(t.category)}</span>` : ''}
          ${t.priority ? `<span style="font-size:11px;">${prioIcon}${escapeHtml(t.priority)}</span>` : ''}
          ${t.phone ? `<span style="font-size:11px;">📱 ${escapeHtml(t.phone)}</span>` : ''}
          <span style="font-size:11px;color:var(--muted);margin-right:auto;">${escapeHtml(t.student_name)} · ${escapeHtml(t.school || '')} · ${date}</span>
        </div>
      </div>`;
    }).join('');
  },

  async renderSupportMessages() {
    document.getElementById('support-filter-bar').style.display = 'none';
    const listEl = document.getElementById('support-admin-list');
    listEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">جاري التحميل...</div>';
    try {
      const { counts } = await apiFetch('/messages/unread');
      if (!counts || !counts.length) {
        listEl.innerHTML = '<div class="chat-empty" style="padding:40px 0;">لا توجد رسائل غير مقروءة</div>';
        return;
      }
      listEl.innerHTML = counts.map(c => `
        <div class="msg-preview-row" onclick="App.openSupportMsgThread('${c.student_id}','${escapeHtml(c.student_name).replace(/'/g,"&#39;")}')">
          <div class="student-avatar">${escapeHtml((c.student_name || '؟').charAt(0))}</div>
          <div class="msg-preview-info">
            <div class="msg-preview-name">${escapeHtml(c.student_name)}</div>
            <div class="msg-preview-last" style="font-size:12px;color:var(--muted);">رسائل غير مقروءة</div>
          </div>
          <span class="msg-unread-count">${c.cnt}</span>
        </div>`).join('');
    } catch {
      listEl.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">تعذّر التحميل</div>';
    }
  },

  logout() {
    const who = State.student?.name || State.admin?.name || '—';
    ActivityLog.warn(`🚪 تسجيل خروج: ${who}`);
    serverLog('info', 'logout', `تسجيل خروج: ${who}`, { user_name: who });
    App.stopCooldownTimer();
    clearInterval(App._chatTimer);
    stopIdleWatch();
    State.student     = null;
    State.role        = null;
    State.admin       = null;
    State.selfDiag    = {};
    State.testAnswers = {};
    State.currentPlan = null;
    document.getElementById('sl-code').value = '';
    const alCode = document.getElementById('al-code');
    if (alCode) alCode.value = '';
    sessionStorage.removeItem('lg_session');
    localStorage.removeItem('lg_xsession');
    localStorage.removeItem('lg_remember');
    App.stopNotifPolling();
    App.closeNotifPanel();
    show('screen-school');
  },

  // ══════════════════════════════════════════════════════
  // NOTIFICATION SYSTEM — إشعارات داخلية
  // ══════════════════════════════════════════════════════
  _notifTimer: null,
  _notifPrev: { studentMsg: 0, ticket: 0, adminMsg: 0 },
  _notifItems: [],   // [{id, type, title, sub, read, action}]

  // ── Broadcast ──────────────────────────────────────────────────────────
  _broadcastQueue: [],
  _broadcastCurrent: null,

  async sendBroadcast() {
    const ta  = document.getElementById('broadcast-msg');
    const msg = (ta?.value || '').trim();
    if (!msg) { showToast('اكتب رسالة أولاً'); return; }
    if (msg.length > 500) { showToast('الرسالة طويلة جداً (الحد 500 حرف)'); return; }
    try {
      await apiFetch('/broadcasts', { method: 'POST', body: JSON.stringify({ message: msg }) });
      ta.value = '';
      document.getElementById('broadcast-char').textContent = '0';
      showToast('✅ تم إرسال الرسالة لجميع الطلاب');
      App.renderBroadcastHistory();
    } catch (e) { showToast('تعذّر الإرسال: ' + (e.message || '')); }
  },

  async renderBroadcastHistory() {
    const el = document.getElementById('broadcast-history');
    if (!el) return;
    try {
      const sc   = encodeURIComponent(State.school || '');
      const data = await apiFetch(`/broadcasts/active?school=${sc}`);
      const list = data.broadcasts || [];
      if (!list.length) { el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px;">لا توجد رسائل بعد</div>'; return; }
      el.innerHTML = list.map(b => `
        <div style="border:1.5px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:10px;background:var(--bg);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:12.5px;font-weight:700;color:var(--primary);">📢 ${escapeHtml(b.admin_name)}</span>
            <span style="font-size:11px;color:var(--muted);">${new Date(b.created_at).toLocaleString('ar-SA',{dateStyle:'short',timeStyle:'short'})}</span>
          </div>
          <div style="font-size:14px;line-height:1.7;color:var(--text);margin-bottom:10px;">${escapeHtml(b.message)}</div>
          <button onclick="App.deleteBroadcast('${b.id}')" style="background:#fee2e2;color:#991b1b;border:none;border-radius:8px;padding:5px 14px;font-size:12px;font-family:inherit;font-weight:700;cursor:pointer;">🗑 حذف</button>
        </div>`).join('');
    } catch { el.innerHTML = '<div style="color:var(--muted);padding:12px;font-size:13px;">تعذّر تحميل السجل</div>'; }
  },

  async deleteBroadcast(id) {
    if (!confirm('تأكيد حذف الرسالة؟')) return;
    try {
      await apiFetch(`/broadcasts/${id}`, { method: 'DELETE' });
      App.renderBroadcastHistory();
      showToast('تم الحذف');
    } catch { showToast('تعذّر الحذف'); }
  },

  _showNextBroadcast() {
    if (App._broadcastCurrent) return;
    if (!App._broadcastQueue.length) return;
    const b = App._broadcastQueue.shift();
    App._broadcastCurrent = b.id;
    const modal = document.getElementById('broadcast-modal');
    if (!modal) return;
    document.getElementById('bc-admin-name').textContent = 'رسالة من: ' + (b.admin_name || 'المشرف');
    document.getElementById('bc-message').textContent    = b.message;
    document.getElementById('bc-time').textContent       = new Date(b.created_at).toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'});
    const more = document.getElementById('bc-more-indicator');
    if (App._broadcastQueue.length > 0) {
      more.style.display = '';
      more.textContent   = `يوجد ${App._broadcastQueue.length} رسالة إضافية`;
    } else { more.style.display = 'none'; }
    modal.style.display = 'flex';
  },

  async dismissBroadcast() {
    const id = App._broadcastCurrent;
    App._broadcastCurrent = null;
    document.getElementById('broadcast-modal').style.display = 'none';
    if (id) {
      try { await apiFetch(`/broadcasts/${id}/dismiss`, { method: 'POST' }); } catch {}
    }
    setTimeout(() => App._showNextBroadcast(), 400);
  },

  async _checkBroadcasts() {
    if (State.role !== 'student' || !State.student?.school) return;
    try {
      const sc   = encodeURIComponent(State.student.school);
      const data = await apiFetch(`/broadcasts/active?school=${sc}`);
      const list = (data.broadcasts || []).filter(b => b.id !== App._broadcastCurrent && !App._broadcastQueue.find(q => q.id === b.id));
      if (list.length) {
        App._broadcastQueue.push(...list);
        App._showNextBroadcast();
      }
    } catch {}
  },

  startNotifPolling() {
    App.stopNotifPolling();
    App._checkNotifications();
    App._notifTimer = setInterval(() => App._checkNotifications(), 30000);
  },

  stopNotifPolling() {
    clearInterval(App._notifTimer);
    App._notifTimer = null;
  },

  async _checkNotifications() {
    try {
      if (State.role === 'student' && State.student?.id) {
        const [msgRes, tkRes] = await Promise.all([
          apiFetch('/messages/unread-student').catch(() => ({ count: 0 })),
          apiFetch(`/tickets/unread?studentId=${State.student.id}`).catch(() => ({ count: 0 })),
        ]);
        const msgCount = msgRes.count || 0;
        const tkCount  = tkRes.count  || 0;

        const items = [];
        if (msgCount > 0) items.push({ id:'msg', type:'msg', title:`${msgCount} رسالة جديدة من المشرف`, sub:'اضغط للاطلاع', read: false, action: () => App.goToChat() });
        if (tkCount  > 0) items.push({ id:'ticket', type:'ticket', title:`${tkCount} رد جديد على طلبات الدعم`, sub:'اضغط للمراجعة', read: false, action: () => App.goToTickets() });

        // Toast on new notifications
        if (msgCount > App._notifPrev.studentMsg && App._notifPrev.studentMsg !== null) {
          const diff = msgCount - App._notifPrev.studentMsg;
          showToast(`🔔 وصلتك ${diff > 1 ? diff + ' رسائل' : 'رسالة'} جديدة من المشرف`);
          App._ringBell('student');
        }
        if (tkCount > App._notifPrev.ticket && App._notifPrev.ticket !== null) {
          const diff = tkCount - App._notifPrev.ticket;
          showToast(`🎫 وصلك ${diff > 1 ? diff + ' ردود' : 'رد'} جديد على طلب الدعم`);
          App._ringBell('student');
        }
        App._notifPrev.studentMsg = msgCount;
        App._notifPrev.ticket     = tkCount;
        App._notifItems = items;
        App._updateBell('student', msgCount + tkCount);
        App._checkBroadcasts();

      } else if (State.role === 'admin' || State.role === 'director') {
        const school = encodeURIComponent(State.school || '');
        const data = await apiFetch(`/messages/unread?school=${school}`).catch(() => ({ counts: [] }));
        const counts = data.counts || [];
        const total  = counts.reduce((s,c) => s + (c.cnt || 0), 0);

        const items = counts.map(c => ({
          id: 'msg_' + c.student_id,
          type: 'msg',
          title: `${c.cnt} ${c.cnt === 1 ? 'رسالة' : 'رسائل'} من ${c.student_name}`,
          sub: 'لم تُقرأ بعد',
          read: false,
          action: () => { App.setTab('students'); }
        }));

        if (total > App._notifPrev.adminMsg && App._notifPrev.adminMsg !== null) {
          const diff = total - App._notifPrev.adminMsg;
          showToast(`🔔 وصلتك ${diff > 1 ? diff + ' رسائل' : 'رسالة'} جديدة من الطلاب`);
          App._ringBell('admin');
        }
        App._notifPrev.adminMsg = total;
        App._notifItems = items;
        App._updateBell('admin', total);
      }
    } catch {}
  },

  _updateBell(who, count) {
    const badge = document.getElementById(`notif-count-${who}`);
    if (!badge) return;
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent   = count > 9 ? '9+' : count;
  },

  _ringBell(who) {
    const btn = document.getElementById(`notif-bell-${who}`);
    if (!btn) return;
    btn.classList.remove('has-notif');
    void btn.offsetWidth;
    btn.classList.add('has-notif');
    setTimeout(() => btn.classList.remove('has-notif'), 700);
  },

  toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    const overlay = document.getElementById('notif-overlay');
    if (!panel) return;
    if (panel.style.display === 'none') {
      App._renderNotifPanel();
      panel.style.display = 'block';
      overlay.style.display = 'block';
    } else {
      App.closeNotifPanel();
    }
  },

  closeNotifPanel() {
    const panel = document.getElementById('notif-panel');
    const overlay = document.getElementById('notif-overlay');
    if (panel)   panel.style.display   = 'none';
    if (overlay) overlay.style.display = 'none';
  },

  _renderNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const items = App._notifItems;
    const iconMap = { msg: '💬', ticket: '🎫', plan: '📋' };
    const clsMap  = { msg: 'msg-icon', ticket: 'ticket-icon', plan: 'plan-icon' };
    const bodyHtml = items.length
      ? items.map(item => `
        <div class="notif-item ${item.read ? '' : 'unread'}"
             onclick="App._notifClick('${item.id}')">
          <div class="notif-icon ${clsMap[item.type] || 'msg-icon'}">${iconMap[item.type] || '🔔'}</div>
          <div class="notif-info">
            <div class="notif-info-title">${escapeHtml(item.title)}</div>
            <div class="notif-info-sub">${escapeHtml(item.sub)}</div>
          </div>
          ${!item.read ? '<div class="notif-dot"></div>' : ''}
        </div>`).join('')
      : `<div class="notif-empty">🎉 لا توجد إشعارات جديدة</div>`;

    panel.innerHTML = `
      <div class="notif-panel-header">
        <div class="notif-panel-title">🔔 الإشعارات</div>
        ${items.length ? `<button class="notif-clear-btn" onclick="App._clearNotifs()">مسح الكل</button>` : ''}
      </div>
      <div class="notif-panel-body">${bodyHtml}</div>`;
  },

  _notifClick(id) {
    const item = App._notifItems.find(i => i.id === id);
    if (!item) return;
    item.read = true;
    App.closeNotifPanel();
    if (item.action) item.action();
  },

  _clearNotifs() {
    App._notifItems = [];
    App._notifPrev  = { studentMsg: 0, ticket: 0, adminMsg: 0 };
    if (State.role === 'student') App._updateBell('student', 0);
    else App._updateBell('admin', 0);
    App.closeNotifPanel();
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────
async function readExcel(file) {
  await _loadXlsx();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
    reader.onload  = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }));
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function showAlert(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:50%;transform:translateX(50%);
    background:#1a5fa8;color:#fff;padding:12px 24px;border-radius:12px;
    font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2);
    transition:opacity .4s`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
}

// ── Path/hash routing ─────────────────────────────────────────────────────
function routeHash() {
  const path = location.pathname;
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));

  if ((path === '/capabilities' || hash === 'capabilities') && State.student) {
    history.replaceState(null, '', '/capabilities');
    App.startCapabilities();
    return;
  }
  if (path === '/admin' && (State.role === 'admin' || State.role === 'director')) {
    show('screen-admin');
    return;
  }
  if (path === '/history' && State.student) {
    show('screen-history');
    return;
  }
  if (path === '/chat' && State.student) {
    show('screen-chat');
    return;
  }
  // /login while already authenticated → go home
  if (path === '/login') {
    if (State.student) { show('screen-student-home'); return; }
    if (State.role === 'admin' || State.role === 'director') { show('screen-admin'); return; }
    // not logged in → stay on landing (already showing)
  }
}

// ── Init ──────────────────────────────────────────────────────────────────

// Fast path: skip auth API call when token is still valid
async function _quickRestoreSession(sess) {
  // If returning from an academic/lesson/quiz sub-page, skip loading screen entirely
  const _fromSubPage = /\/(academic|lessons|quizzes)\//.test(document.referrer);
  if (!_fromSubPage) show('screen-loading');

  const _minDelay = new Promise(r => setTimeout(r, _fromSubPage ? 0 : 700));
  const _maxDelay = new Promise(r => setTimeout(r, 5000));
  const _slowHint = _fromSubPage ? null : setTimeout(() => {
    const hint = document.querySelector('#screen-loading [data-slow]');
    if (hint) hint.style.display = 'block';
  }, 2500);

  try {
    _authToken = sess.token;
    const expiry = Date.now() + 4 * 60 * 60 * 1000;
    if (sess.role === 'student') {
      State.student = { id: sess.id, code: sess.code, name: sess.name, school: sess.school || '' };
      State.role = 'student';
      if (sess.school) { State.school = sess.school; App._updateSchoolDisplay(sess.school); }
      const _sess = { ...sess, expiry };
      try { sessionStorage.setItem('lg_session', JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem('lg_xsession', JSON.stringify(_sess)); } catch(_) {}
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(sess.name);
      try { await Promise.race([Promise.all([DB.loadStudentData(), _minDelay]), _maxDelay]); } catch (e) { await _minDelay; }
      if (_slowHint) clearTimeout(_slowHint);

      const _testDeadline = Number(sessionStorage.getItem('lg_test_deadline') || 0);
      if (_testDeadline && _testDeadline > Date.now()) {
        try {
          const _ts = JSON.parse(sessionStorage.getItem('lg_test_state') || '{}');
          State.currentQ    = _ts.currentQ || 0;
          State.testAnswers = _ts.testAnswers || {};
        } catch(_) {}
        App.renderQuestion();
        App.startTestTimer();
        show('screen-pretest');
        document.documentElement.style.visibility = '';
        return;
      } else if (_testDeadline) {
        App.stopTestTimer();
      }

      App.renderStudentHome();
      show('screen-student-home');
      document.documentElement.style.visibility = '';
      routeHash();
    } else {
      State.role  = sess.role;
      State.admin = { code: sess.code, name: sess.name, school: sess.school || '' };
      if (sess.school && sess.school !== '*') { State.school = sess.school; App._updateSchoolDisplay(sess.school); }
      const _sess = { ...sess, expiry };
      try { sessionStorage.setItem('lg_session', JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem('lg_xsession', JSON.stringify(_sess)); } catch(_) {}
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(sess.name);
      document.querySelectorAll('.director-tab').forEach(el => {
        el.style.display = State.role === 'director' ? '' : 'none';
      });
      // Restoring an existing admin/director session on page load also lands in the
      // new React admin dashboard at /admin/ rather than the legacy in-SPA screen.
      window.location.href = '/admin/';
      return;
    }
  } catch (e) {
    _authToken = null;
    sessionStorage.removeItem('lg_session');
    localStorage.removeItem('lg_xsession');
    await _minDelay;
    show('screen-landing');
    document.documentElement.style.visibility = '';
  }
}

function _autoLogin(role, code, token, school) {
  show('screen-loading');
  if (token) _authToken = token;
  if (role === 'student') {
    if (school) { State.school = school; App._updateSchoolDisplay(school); }
    const input = document.getElementById('sl-code');
    const cb    = document.getElementById('sl-remember');
    if (input) input.value = code;
    if (cb)    cb.checked  = true;
  } else {
    const input = document.getElementById('al-code');
    const cb    = document.getElementById('al-remember');
    if (input) input.value = code;
    if (cb)    cb.checked  = true;
  }
  // setTimeout(0) lets the browser paint screen-loading before starting the API call
  setTimeout(() => {
    const login = role === 'student' ? App.studentLogin() : App.adminLogin();
    const _bail = () => { sessionStorage.removeItem('lg_session'); localStorage.removeItem('lg_xsession'); show('screen-landing'); document.documentElement.style.visibility = ''; };
    login
      .then(() => {
        // studentLogin/adminLogin swallow their own errors (no throw) and just leave the
        // button restored without switching screens — if we're still stuck on the loading
        // screen here, the login actually failed, so fall back instead of leaving it stuck.
        if (document.getElementById('screen-loading')?.classList.contains('active')) _bail();
      })
      .catch(_bail);
  }, 0);
}

// Browser back/forward (bfcache) restores the page exactly as it was left, including a
// submit button stuck disabled with the loading spinner from a previous attempt.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  [['sl-submit-btn', 'دخول ←'], ['al-submit-btn', 'دخول ←']].forEach(([id, label]) => {
    const btn = document.getElementById(id);
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  ActivityLog.info(`🌐 تحميل الصفحة — ${new Date().toLocaleString('ar-SA')} — ${navigator.userAgent.split(' ').slice(-2).join(' ')}`);
  const btn = document.getElementById('selfdiag-submit');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  DB.loadQuestions().catch(() => {});

  // Helper: check if a session has a valid, unexpired token
  const _canFastRestore = (s) =>
    s.token && s.expiry && Date.now() < s.expiry &&
    (s.role !== 'student' || s.id); // student needs stored id

  // 1) Same-tab refresh
  try {
    const raw = sessionStorage.getItem('lg_session');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.role && s.code) {
        if (_canFastRestore(s)) { _quickRestoreSession(s); return; }
        _autoLogin(s.role, s.code, s.token, s.school); return;
      }
    }
  } catch (e) { sessionStorage.removeItem('lg_session'); }

  // 2) Cross-tab session (new tab from lesson/quiz pages, 4h expiry)
  try {
    const raw = localStorage.getItem('lg_xsession');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.expiry && Date.now() > s.expiry) { localStorage.removeItem('lg_xsession'); }
      else if (s.role && s.code) {
        if (_canFastRestore(s)) { _quickRestoreSession(s); return; }
        _autoLogin(s.role, s.code, s.token, s.school); return;
      }
    }
  } catch (e) { localStorage.removeItem('lg_xsession'); }

  // 3) Long-term remember-me (2 days, no JWT — must re-auth but show loading screen)
  try {
    const raw = localStorage.getItem('lg_remember');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.expiry && Date.now() > s.expiry) { localStorage.removeItem('lg_remember'); }
      else if (s.role && s.code) { _autoLogin(s.role, s.code, null, s.school); return; }
    }
  } catch (e) { localStorage.removeItem('lg_remember'); }

  show('screen-landing');
  document.documentElement.style.visibility = '';
});

function _spt(e, date, score) {
  const t = document.getElementById('sp-tip');
  if (!t) return;
  t.textContent = `${score}%  ·  ${date}`;
  t.style.display = 'block';
  t.style.left = (e.clientX + 14) + 'px';
  t.style.top  = (e.clientY - 36) + 'px';
}
function _spth() {
  const t = document.getElementById('sp-tip');
  if (t) t.style.display = 'none';
}

function _pct(e, n, date, score) {
  const tip = document.getElementById('perf-chart-tip');
  if (!tip) return;
  tip.textContent = `محاولة ${n}  ·  ${score}%  ·  ${date}`;
  tip.style.display = 'block';
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top  = (e.clientY - 40) + 'px';
}
function _pctH() {
  const t = document.getElementById('perf-chart-tip');
  if (t) t.style.display = 'none';
}

