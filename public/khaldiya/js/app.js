'use strict';

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

// ── Cloudflare D1 data layer (via Pages Functions API) ───────────────────
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
  let res;
  try {
    res = await fetch('/api' + path, { headers, ...opts });
  } catch (netErr) {
    ActivityLog.error(`✗ ${method} /api${path} — خطأ شبكة: ${netErr.message}`);
    throw new Error('NETWORK_ERROR: ' + (netErr.message || 'failed to fetch'));
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

const _mapStudent = r => ({ id: r.id, code: r.code, name: r.name, createdAt: r.created_at });
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
    ]);
    Cache.students = (s.students || []).map(_mapStudent);
    Cache.plans    = (p.plans    || []).map(_mapPlan);
    Cache.loaded   = true;
    await DB.loadQuestions();
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

  async addStudent({ name, code }) {
    const { student } = await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify({ name, code, school: State.school || '' }),
    });
    const s = _mapStudent(student);
    Cache.students.push(s);
    return s;
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
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
  if (id === 'screen-student-home') { history.replaceState(null, '', '/'); }
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

  _updateSchoolDisplay(name) {
    ['id-school-name', 'sh-school-sub', 'ad-school-sub'].forEach(id => {
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
    let token, student;
    try {
      const data = await apiFetch('/auth/student-login', {
        method: 'POST',
        body: JSON.stringify({ code, school: State.school || '' }),
      });
      token = data.token;
      student = { id: data.student.id, code, name: data.student.name, school: data.student.school || '' };
    } catch (e) {
      const msg = e?.message || '';
      const status = e?.status;
      if (status === 404 || msg.includes('غير مسجّل')) {
        showAlert(errEl, 'السجل المدني غير مسجّل — راجع المشرف لإضافتك في النظام.'); return;
      }
      if (status === 429 || msg.includes('Too many') || msg.includes('429')) {
        showAlert(errEl, 'محاولات كثيرة — انتظر دقيقة وأعد المحاولة.'); return;
      }
      if (status === 400 || msg.includes('غير صالح')) {
        showAlert(errEl, 'رقم السجل المدني يجب أن يكون ١٠ أرقام إنجليزية.'); return;
      }
      if (!navigator.onLine || msg.includes('NETWORK_ERROR')) {
        showAlert(errEl, 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة وأعد المحاولة.'); return;
      }
      showAlert(errEl, 'تعذّر الاتصال بالخادم — حاول مرة أخرى. (رمز: ' + (e?.status || '؟') + ')'); return;
    }
    ActivityLog.success(`🎓 تسجيل دخول طالب: ${student.name} (${code}) — ${student.school || '—'}`);
    serverLog('success', 'login', `تسجيل دخول طالب: ${student.name}`, { user_name: student.name, user_role: 'student', school: student.school || '' });
    _authToken = token;
    State.student = student;
    State.role = 'student';
    if (student.school) { State.school = student.school; App._updateSchoolDisplay(student.school); }
    const _sess = { role: 'student', code, name: student.name, school: student.school, token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
    sessionStorage.setItem('lg_session', JSON.stringify(_sess));
    localStorage.setItem('lg_xsession', JSON.stringify(_sess));
    const remember = document.getElementById('sl-remember');
    if (remember && remember.checked) {
      localStorage.setItem('lg_remember', JSON.stringify({ role: 'student', code, name: student.name, school: student.school || '', expiry: Date.now() + 2 * 24 * 60 * 60 * 1000 }));
    } else {
      localStorage.removeItem('lg_remember');
    }
    startIdleWatch();
    App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
    App.startNotifPolling();
    App._setTopbarUser(student.name);
    try { await DB.loadStudentData(); } catch (e) {}
    App.renderStudentHome();
    show('screen-student-home');
    routeHash();
  },

  // ── Admin Login ──────────────────────────────────────────────────────────
  async adminLogin() {
    const code  = document.getElementById('al-code').value.trim();
    const errEl = document.getElementById('al-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(errEl, 'الرجاء إدخال رقم السجل المدني (١٠ أرقام).'); return;
    }
    let token, admin;
    try {
      const data = await apiFetch('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ code, school: State.school || '' }),
      });
      token = data.token;
      admin = data.admin;
    } catch (e) {
      const msg = e?.message || '';
      const status = e?.status;
      if (status === 404 || msg.includes('غير مسجّل')) {
        showAlert(errEl, 'السجل المدني غير مسجّل ضمن المشرفين.'); return;
      }
      if (status === 429 || msg.includes('Too many') || msg.includes('429')) {
        showAlert(errEl, 'محاولات كثيرة — انتظر دقيقة وأعد المحاولة.'); return;
      }
      if (status === 403 || msg.includes('غير مصرح')) {
        showAlert(errEl, 'هذا الرمز غير مصرح له بالدخول على هذه المدرسة.'); return;
      }
      if (status === 400 || msg.includes('غير صالح')) {
        showAlert(errEl, 'رقم السجل المدني يجب أن يكون ١٠ أرقام إنجليزية.'); return;
      }
      if (!navigator.onLine || msg.includes('NETWORK_ERROR')) {
        showAlert(errEl, 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة وأعد المحاولة.'); return;
      }
      showAlert(errEl, 'تعذّر الاتصال بالخادم — حاول مرة أخرى. (رمز: ' + (e?.status || '؟') + ')'); return;
    }
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
      if (!navigator.onLine) { showAlert(errEl, 'لا يوجد اتصال بالإنترنت — تحقق من الشبكة.'); return; }
      if (e?.status === 401) { showAlert(errEl, 'الصلاحيات غير كافية — راجع مدير النظام لضبط دورك في قاعدة البيانات.'); return; }
      showAlert(errEl, 'تم الدخول لكن تعذّر تحميل البيانات — حاول مرة أخرى. (رمز: ' + (e?.status || '؟') + ')'); return;
    }
    const _sess = { role: State.role, code, name: adminName, school: admin.school || '', token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
    sessionStorage.setItem('lg_session', JSON.stringify(_sess));
    localStorage.setItem('lg_xsession', JSON.stringify(_sess));
    const alRemember = document.getElementById('al-remember');
    if (alRemember && alRemember.checked) {
      localStorage.setItem('lg_remember', JSON.stringify({ role: 'admin', code, name: adminName, school: admin.school || '', expiry: Date.now() + 2 * 24 * 60 * 60 * 1000 }));
    } else {
      localStorage.removeItem('lg_remember');
    }
    startIdleWatch();
    App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
    App.startNotifPolling();
    App._setTopbarUser(adminName);
    document.querySelectorAll('.director-tab').forEach(el => {
      el.style.display = State.role === 'director' ? '' : 'none';
    });
    App.renderAdminDashboard('students');
    show('screen-admin');
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
    show('screen-pretest');
  },

  // ── Test Timer (50 min) ───────────────────────────────────────────────────
  _testTimer: null,
  startTestTimer() {
    clearInterval(App._testTimer);
    const SECS = 50 * 60;
    let remaining = SECS;
    const el = document.getElementById('test-timer');
    const update = () => {
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
      remaining--;
    };
    update();
    App._testTimer = setInterval(update, 1000);
  },

  stopTestTimer() {
    clearInterval(App._testTimer);
    App._testTimer = null;
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
  },

  prevQ() {
    if (State.currentQ > 0) { State.currentQ--; App.renderQuestion(); }
  },

  nextQ() {
    const QBANK = window.QUESTION_BANK;
    const q = QBANK[State.currentQ];
    if (State.testAnswers[q.id] === undefined) {
      showToast('يرجى اختيار إجابة أو "لا أعرف الإجابة" قبل المتابعة');
      return;
    }
    if (State.currentQ < QBANK.length - 1) { State.currentQ++; App.renderQuestion(); }
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
    }).sort((a, b) => a.pct - b.pct);

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
    const verbal = plan.gaps.filter(g => g.category === 'verbal');
    const quant  = plan.gaps.filter(g => g.category === 'quantitative');
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

    const verbal = plan.gaps.filter(g => g.category === 'verbal');
    const quant  = plan.gaps.filter(g => g.category === 'quantitative');
    document.getElementById('sp-verbal-cards').innerHTML = verbal.map((g, i) => buildCard(g, i)).join('');
    document.getElementById('sp-quant-cards').innerHTML  = quant.map((g, i) => buildCard(g, i)).join('');

    // Print table
    document.getElementById('sp-print-body').innerHTML = plan.gaps.map((g, i) => {
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
    return `
      <div class="guide-section">
        <div class="guide-label">📌 ما هذه المهارة؟</div>
        <p class="guide-text">${g.what}</p>
      </div>
      ${g.warning ? `<div class="guide-warning"><span>⚠️</span><span>${g.warning}</span></div>` : ''}
      <div class="guide-section">
        <div class="guide-label">✅ ما الذي تحتاجه لإتقانها؟</div>
        <ul class="guide-list">${g.needs.map(n => `<li>${n}</li>`).join('')}</ul>
      </div>
      <div class="guide-section">
        <div class="guide-label">⚠️ الأخطاء الشائعة</div>
        <ul class="guide-list mistakes">${g.mistakes.map(m => `<li>${m}</li>`).join('')}</ul>
      </div>
      <div class="guide-tip"><span>💡</span><span>${g.tip}</span></div>`;
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
    const searchBar = document.getElementById('student-search-bar');
    if (searchBar) searchBar.style.display = State.tab === 'students' ? 'block' : 'none';
    const listEl = document.getElementById('admin-student-list');

    if (State.tab === 'students') {
      if (!students.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد طلاب مضافون بعد</p></div>`; return; }
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
        return `<div class="student-row">
          <div class="student-avatar">${escapeHtml(st.name.charAt(0))}</div>
          <div class="student-info" onclick="App.openStudentDetail('${st.id}')" style="cursor:pointer;">
            <div class="student-name" style="display:flex;align-items:center;gap:4px;">${accessDot}${escapeHtml(st.name)}</div>
            <div class="student-code">رمز: ${escapeHtml(st.code)}</div>
          </div>
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
    document.querySelectorAll('#admin-student-list .student-row').forEach(row => {
      const name = row.querySelector('.student-name')?.textContent.toLowerCase() || '';
      const code = row.querySelector('.student-code')?.textContent.toLowerCase() || '';
      row.style.display = (!q || name.includes(q) || code.includes(q)) ? '' : 'none';
    });
  },

  setTab(tab) {
    document.getElementById('tab-manage').style.display       = tab === 'settings'    ? 'block' : 'none';
    document.getElementById('tab-supervisors').style.display  = tab === 'supervisors' ? 'block' : 'none';
    document.getElementById('tab-questions').style.display    = tab === 'questions'   ? 'block' : 'none';
    document.getElementById('tab-performance').style.display  = tab === 'performance' ? 'block' : 'none';
    if (tab === 'stats')       { App.renderAdminDashboard(tab); App.renderAdminStats(); return; }
    if (tab === 'supervisors') { App.renderAdminDashboard(tab); App.loadSupervisors(); return; }
    if (tab === 'questions')   { App.renderAdminDashboard(tab); App.loadQuestions(); return; }
    if (tab === 'performance') { App.renderAdminDashboard(tab); App.renderPerformanceTab(); return; }
    App.renderAdminDashboard(tab);
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

      return `<div class="perf-card ${cls}">
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
      </div>
      <div class="perf-filter-bar">
        <input class="perf-search" id="perf-search-input" type="text" placeholder="🔍 ابحث عن طالب…" oninput="App._perfFilter()">
        <button class="perf-filter-btn ${f==='all'?'active':''}"      onclick="App.renderPerformanceTab('all')">الكل</button>
        <button class="perf-filter-btn ${f==='tested'?'active':''}"   onclick="App.renderPerformanceTab('tested')">اختبروا</button>
        <button class="perf-filter-btn ${f==='untested'?'active':''}" onclick="App.renderPerformanceTab('untested')">لم يختبروا</button>
      </div>
      <div class="perf-grid" id="perf-cards-grid">
        ${filtered.map(d => cardHtml(d)).join('')}
      </div>`;
  },

  _perfFilter() {
    const q = (document.getElementById('perf-search-input')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#perf-cards-grid .perf-card').forEach(card => {
      const name = card.querySelector('.perf-name')?.textContent.toLowerCase() || '';
      const code = card.querySelector('.perf-code')?.textContent.toLowerCase() || '';
      card.style.display = (!q || name.includes(q) || code.includes(q)) ? '' : 'none';
    });
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

    el.style.display = 'block';
    el.innerHTML = `<div class="sh-perf-card">
      <div class="sh-perf-title">📈 مؤشر أدائك</div>
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
    </div>`;
  },

  // ── Director: Supervisors Management ─────────────────────────────────────
  async loadSupervisors() {
    const listEl = document.getElementById('supervisors-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">جاري التحميل…</div>';
    try {
      const school = encodeURIComponent(State.school || '');
      const code   = encodeURIComponent(State.admin.code);
      const data   = await apiFetch(`/director/admins?school=${school}&director_code=${code}`);
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
    const errEl  = document.getElementById('add-sup-err');
    errEl.style.display = 'none';
    if (!name) { showAlert(errEl, 'أدخل اسم المشرف'); errEl.style.display=''; return; }
    if (!/^\d{10}$/.test(code)) { showAlert(errEl, 'الرمز يجب أن يكون ١٠ أرقام'); errEl.style.display=''; return; }
    try {
      const school = State.school || '';
      await apiFetch('/director/admins?school=' + encodeURIComponent(school), {
        method: 'POST',
        body: JSON.stringify({ name, code, director_code: State.admin.code })
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
      const code   = encodeURIComponent(State.admin.code);
      await apiFetch(`/director/admins/${adminId}?school=${school}&director_code=${code}`, { method: 'DELETE' });
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
          body: JSON.stringify({ director_code: State.admin.code })
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
          <div style="font-size:13.5px;font-weight:600;margin-bottom:5px;line-height:1.6;">${q.text}</div>
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
      const code   = encodeURIComponent(State.admin.code);
      await Promise.all([
        apiFetch(`/director/questions/${dragId}?school=${school}&director_code=${code}`, {
          method: 'PATCH',
          body: JSON.stringify({ qnum: dropQnum, type: dragQ.type, skill_id: dragQ.skill_id, text: dragQ.text,
            opt1: dragQ.opt1, opt2: dragQ.opt2, opt3: dragQ.opt3, opt4: dragQ.opt4, ans: dragQ.ans })
        }),
        apiFetch(`/director/questions/${dropId}?school=${school}&director_code=${code}`, {
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
      const code   = encodeURIComponent(State.admin.code);
      await apiFetch(`/director/questions/${id}?school=${school}&director_code=${code}`, {
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
      const code   = encodeURIComponent(State.admin.code);
      await apiFetch(`/director/questions/${id}?school=${school}&director_code=${code}`, { method: 'DELETE' });
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
    const listEl   = document.getElementById('admin-student-list');
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

    // Support stats
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

    const barColor = avg => avg <= 30 ? '#ef4444' : avg <= 49 ? '#f59e0b' : avg <= 70 ? '#3b82f6' : '#22c55e';

    listEl.innerHTML = `
      <!-- KPIs -->
      <div class="stats-section">
        <div class="stats-section-title">📌 ملخص عام</div>
        <div class="stats-summary-grid">
          <div class="stats-kpi">
            <div class="stats-kpi-val">${partRate}%</div>
            <div class="stats-kpi-lbl">نسبة المشاركة في الاختبار</div>
          </div>
          <div class="stats-kpi">
            <div class="stats-kpi-val" style="color:${globalAvg ? barColor(globalAvg) : 'var(--primary)'};">${globalAvg !== null ? globalAvg + '%' : '—'}</div>
            <div class="stats-kpi-lbl">المتوسط العام للدرجات</div>
          </div>
          <div class="stats-kpi">
            <div class="stats-kpi-val">${tested}</div>
            <div class="stats-kpi-lbl">طالب أجرى الاختبار</div>
          </div>
          <div class="stats-kpi">
            <div class="stats-kpi-val">${total - tested}</div>
            <div class="stats-kpi-lbl">لم يبدأ بعد</div>
          </div>
        </div>
      </div>

      <!-- Skill bars -->
      <div class="stats-section">
        <div class="stats-section-title">📊 متوسط الأداء لكل مهارة</div>
        ${skillRows.length ? skillRows.map(sk => `
          <div class="skill-bar-row">
            <div class="skill-bar-label">
              <span class="skill-bar-name">${sk.category === 'verbal' ? '📚' : '🔢'} ${sk.name}</span>
              <span class="skill-bar-pct" style="color:${barColor(sk.avg)};">${sk.avg}%</span>
            </div>
            <div class="skill-bar-track">
              <div class="skill-bar-fill" style="width:${sk.avg}%;background:${barColor(sk.avg)};"></div>
            </div>
          </div>`).join('')
          : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0;">لا توجد بيانات بعد</div>'}
      </div>

      <!-- Level distribution -->
      <div class="stats-section">
        <div class="stats-section-title">📈 توزيع المستويات (عدد المهارات)</div>
        <div class="level-dist">
          <div class="level-chip">
            <div class="level-chip-val" style="color:#ef4444;">${lvlWeak}</div>
            <div class="level-chip-lbl">ضعيف (≤30%)</div>
          </div>
          <div class="level-chip">
            <div class="level-chip-val" style="color:#f59e0b;">${lvlBelow}</div>
            <div class="level-chip-lbl">دون المتوسط (31-49%)</div>
          </div>
          <div class="level-chip">
            <div class="level-chip-val" style="color:#3b82f6;">${lvlMid}</div>
            <div class="level-chip-lbl">متوسط (50-70%)</div>
          </div>
          <div class="level-chip">
            <div class="level-chip-val" style="color:#22c55e;">${lvlHigh}</div>
            <div class="level-chip-lbl">فوق المتوسط (>70%)</div>
          </div>
        </div>
      </div>

      <!-- Support stats -->
      <div class="stats-section">
        <div class="stats-section-title">🎫 إحصائيات الدعم والتواصل</div>
        <div class="support-stats-grid">
          <div class="support-stat">
            <div class="support-stat-val" style="color:#1e40af;">${ticketsOpen}</div>
            <div class="support-stat-lbl">تذاكر مفتوحة</div>
          </div>
          <div class="support-stat">
            <div class="support-stat-val" style="color:#854d0e;">${ticketsProgress}</div>
            <div class="support-stat-lbl">قيد المعالجة</div>
          </div>
          <div class="support-stat">
            <div class="support-stat-val" style="color:#166534;">${ticketsResolved}</div>
            <div class="support-stat-lbl">تم الحل</div>
          </div>
        </div>
        ${messagesTotal ? `<div style="margin-top:10px;font-size:13px;color:var(--muted);text-align:center;">
          <span style="font-weight:700;color:var(--primary);">${messagesTotal}</span> رسالة غير مقروءة في الشات
        </div>` : ''}
      </div>`;
  },

  // ── Add Student ────────────────────────────────────────────────────────────
  async addStudent() {
    const name  = document.getElementById('add-st-name').value.trim();
    const code  = document.getElementById('add-st-code').value.trim();
    const errEl = document.getElementById('add-st-err');
    if (!name) { showAlert(errEl, 'أدخل اسم الطالب.'); return; }
    if (!/^\d{10}$/.test(code)) { showAlert(errEl, 'السجل المدني يجب أن يكون ١٠ أرقام.'); return; }
    if (DB.students().find(s => s.code === code)) { showAlert(errEl, 'هذا السجل المدني مسجّل مسبقاً.'); return; }
    try { await DB.addStudent({ name, code }); }
    catch (e) { showAlert(errEl, e.message || 'فشل الحفظ.'); return; }
    ActivityLog.success(`➕ إضافة طالب: ${name} (${code})`);
    document.getElementById('add-st-name').value = '';
    document.getElementById('add-st-code').value = '';
    showToast('تمت إضافة الطالب ✅');
    App.renderAdminDashboard('manage');
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
        code: String(r['السجل المدني'] ?? r['code'] ?? r['رمز الدخول'] ?? '').trim(),
        name: String(r['اسم الطالب']  ?? r['name']  ?? r['الاسم']      ?? '').trim(),
      }));
      if (!allRows.length) { alert('الملف فارغ أو لا يحتوي على بيانات.'); return; }

      // Detect per-row issues
      const codesSeen = {};
      allRows.forEach(r => {
        r.validCode = /^\d{10}$/.test(r.code);
        r.validName = r.name.length > 0;
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
    const valid   = rows.filter(r => r.validCode && r.validName && !r.dupOf && !r.existsInDB).length;
    const errors  = rows.filter(r => !r.validCode || !r.validName).length;
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
      if (!r.validCode || !r.validName) {
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
    const toAdd = App._importRows.filter(r => r.validCode && r.validName && !r.dupOf && !r.existsInDB);
    if (!toAdd.length) return;
    const errEl = document.getElementById('imp-modal-err');
    errEl.style.display = 'none';
    try {
      const res = await DB.bulkAddStudents(toAdd.map(r => ({ code: r.code, name: r.name })));
      App.closeImportPreview();
      showToast(`تمت إضافة ${res.added} ${res.added >= 3 && res.added <= 10 ? 'طلاب' : 'طالب'}${res.skipped ? ' (تجاهل ' + res.skipped + ' مكرر)' : ''} ✅`);
      App.renderAdminDashboard('manage');
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
    App.renderAdminDashboard('manage');
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
    document.getElementById('modal-gaps').innerHTML = plan.gaps.map(g => `
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
    App.renderAdminDashboard('manage');
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
      skillsBody.innerHTML = latest.gaps.map(g => {
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

    const skillRows = latest.gaps.map((g, i) => {
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

  async goToChat() {
    // Fetch supervisors for this school
    const school = State.school || '';
    let admins = [];
    try {
      const data = await apiFetch(`/admins?school=${encodeURIComponent(school)}`);
      admins = data.admins || [];
    } catch {}

    if (!admins.length) {
      showToast('لا يوجد مشرفون مسجّلون في هذه المدرسة حالياً');
      return;
    }

    if (admins.length === 1) {
      // Only one supervisor — go directly
      App.openChatWithAdmin(admins[0].id, admins[0].name);
      return;
    }

    // Show selection modal
    const list = document.getElementById('supervisor-list');
    list.innerHTML = admins.map(a => `
      <button class="supervisor-btn" onclick="App.openChatWithAdmin('${a.id}','${escapeHtml(a.name).replace(/'/g,"&#39;")}');document.getElementById('supervisor-select-modal').classList.remove('open');">
        <div class="supervisor-avatar">${escapeHtml(a.name.charAt(0))}</div>
        <span>${escapeHtml(a.name)}</span>
      </button>`).join('');
    document.getElementById('supervisor-select-modal').classList.add('open');
  },

  openChatWithAdmin(adminId, adminName) {
    State.chatAdminId   = adminId;
    State.chatAdminName = adminName;
    // Update chat screen title
    const sub = document.querySelector('#screen-chat .topbar-title');
    if (sub) sub.textContent = `محادثة مع ${adminName}`;
    show('screen-chat');
    App._chatMsgCount = 0;
    App.loadChatMessages();
    App.startChatPoll();
  },

  leaveChatScreen() {
    clearInterval(App._chatTimer);
    App._chatTimer = null;
    show('screen-student-home');
  },

  async loadChatMessages() {
    if (!State.chatAdminId) return;
    let msgs;
    try {
      const data = await apiFetch(`/messages?studentId=${State.student.id}&adminId=${State.chatAdminId}`);
      msgs = data.messages || [];
    } catch { return; }
    // mark admin messages as read
    if (msgs.some(m => m.sender_type === 'admin' && !m.is_read)) {
      apiFetch('/messages/read', { method:'PATCH', body: JSON.stringify({ studentId: State.student.id, readerType:'student' }) }).catch(() => {});
    }
    const el = document.getElementById('chat-messages');
    if (!el) return;
    if (!msgs.length) { el.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد — ابدأ المحادثة 👋</div>'; return; }
    el.innerHTML = msgs.map(m => {
      const sent = m.sender_type === 'student';
      const time = new Date(m.created_at).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' });
      return `<div style="display:flex;flex-direction:column;align-items:${sent ? 'flex-end' : 'flex-start'};">
        <div class="chat-bubble ${sent ? 'sent' : 'received'}">${escapeHtml(m.body)}</div>
        <div class="chat-time">${sent ? 'أنت' : escapeHtml(State.chatAdminName || 'المشرف')} · ${time}</div>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
    App._chatMsgCount = msgs.length;
    document.getElementById('chat-unread-badge').style.display = 'none';
  },

  startChatPoll() {
    clearInterval(App._chatTimer);
    App._chatTimer = setInterval(async () => {
      if (!document.getElementById('screen-chat').classList.contains('active')) {
        clearInterval(App._chatTimer); return;
      }
      if (!State.chatAdminId) return;
      try {
        const data = await apiFetch(`/messages?studentId=${State.student.id}&adminId=${State.chatAdminId}`);
        if ((data.messages || []).length !== App._chatMsgCount) App.loadChatMessages();
      } catch {}
    }, 6000);
  },

  async sendChatMsg() {
    if (!State.chatAdminId) return;
    const input = document.getElementById('chat-input');
    const body  = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      await apiFetch('/messages', {
        method:'POST',
        body: JSON.stringify({
          body,
          recipientAdminId: State.chatAdminId,
        }),
      });
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
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">جاري التحميل...</div>';
    try {
      const { tickets } = await apiFetch(`/tickets?studentId=${State.student.id}`);
      if (!tickets.length) {
        el.innerHTML = `<div class="chat-empty" style="padding:36px 0;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">🎫</div>
          <div style="font-weight:700;">لا توجد طلبات دعم بعد</div>
          <div style="font-size:13px;color:var(--muted);margin-top:4px;">اضغط "طلب دعم جديد" لإرسال طلبك</div>
        </div>`;
        // Update notification badge
        const badge = document.getElementById('ticket-notif-badge');
        if (badge) { badge.style.display = 'none'; }
        return;
      }
      const totalUnread = tickets.reduce((s, t) => s + (t.unread_count || 0), 0);
      const badge = document.getElementById('ticket-notif-badge');
      if (badge) { badge.style.display = totalUnread ? 'inline' : 'none'; badge.textContent = totalUnread || ''; }
      el.innerHTML = tickets.map(t => {
        const statusMap = { open: ['tbadge-open','مفتوح'], in_progress: ['tbadge-progress','قيد المعالجة'], resolved: ['tbadge-resolved','تم الحل'], rejected: ['tbadge-rejected','مرفوض'] };
        const [badgeCls, badgeTxt] = statusMap[t.status] || ['tbadge-open','مفتوح'];
        const date = new Date(t.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short' });
        const prioClass = t.priority === 'عالية' ? 'prio-chip-high' : t.priority === 'منخفضة' ? 'prio-chip-low' : 'prio-chip-med';
        const prioIcon = t.priority === 'عالية' ? '🚨 ' : t.priority === 'منخفضة' ? '🟢 ' : '🟡 ';
        const unreadHtml = t.unread_count > 0 ? `<span class="unread-dot">● رد جديد</span>` : '';
        return `<div class="ticket-card" onclick="App.openTicketDetail('${t.id}','student')" style="${t.unread_count > 0 ? 'border-color:var(--primary);' : ''}">
          <div class="ticket-card-top">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span class="ticket-num-badge">${escapeHtml(t.ticket_num || '—')}</span>
              <div class="ticket-subject">${escapeHtml(t.subject)}</div>
            </div>
            <span class="${badgeCls}" style="flex-shrink:0;">${badgeTxt}</span>
          </div>
          <div class="ticket-card-footer">
            ${t.category ? `<span class="cat-chip">${escapeHtml(t.category)}</span>` : ''}
            ${t.priority ? `<span class="${prioClass}">${prioIcon}${escapeHtml(t.priority)}</span>` : ''}
            ${unreadHtml}
            <span style="font-size:11px;color:var(--muted);margin-right:auto;">${date}</span>
          </div>
        </div>`;
      }).join('');
    } catch { el.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">تعذّر التحميل</div>'; }
  },

  async loadTicketNotifications() {
    if (!State.student?.id) return;
    try {
      const { count } = await apiFetch(`/tickets/unread?studentId=${State.student.id}`);
      const badge = document.getElementById('ticket-notif-badge');
      if (badge) { badge.style.display = count > 0 ? 'inline' : 'none'; badge.textContent = count > 0 ? count : ''; }
    } catch {}
  },

  openNewTicketModal() {
    document.getElementById('nt-subject').value  = '';
    document.getElementById('nt-body').value     = '';
    document.getElementById('nt-err').textContent = '';
    // Preview ticket number
    const num = 'T-' + String(Math.floor(10000 + Math.random() * 90000));
    document.getElementById('nt-ticket-num').textContent = num;
    // Reset priority
    const medRadio = document.querySelector('input[name="nt-priority"][value="متوسطة"]');
    if (medRadio) medRadio.checked = true;
    document.getElementById('nt-category').selectedIndex = 4;
    document.getElementById('new-ticket-modal').classList.add('open');
  },

  closeNewTicketModal() { document.getElementById('new-ticket-modal').classList.remove('open'); },

  async submitTicket() {
    const subject  = document.getElementById('nt-subject').value.trim();
    const body     = document.getElementById('nt-body').value.trim();
    const category = document.getElementById('nt-category').value;
    const priority = document.querySelector('input[name="nt-priority"]:checked')?.value || 'متوسطة';
    const errEl    = document.getElementById('nt-err');
    if (!subject) { showAlert(errEl, 'أدخل موضوع الطلب'); return; }
    if (!body)    { showAlert(errEl, 'أدخل تفاصيل المشكلة'); return; }
    try {
      await apiFetch('/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, body, category, priority }),
      });
      App.closeNewTicketModal();
      showToast('تم إرسال طلب الدعم ✅');
      App.loadStudentTickets();
    } catch (e) { showAlert(errEl, e.message || 'فشل الإرسال'); }
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
        ${ticket.category   ? `<span class="cat-chip">${escapeHtml(ticket.category)}</span>` : ''}
        ${ticket.priority   ? `<span style="font-size:11px;">${prioIcon} ${escapeHtml(ticket.priority)}</span>` : ''}
        <span style="font-size:11px;color:var(--muted);">${escapeHtml(ticket.student_name)} · ${date}</span>`;

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

  renderActivityLog() {
    const el = document.getElementById('sa-log-list');
    if (!el) return;
    const entries = ActivityLog.entries();
    if (!entries.length) {
      el.innerHTML = '<span style="color:#64748b;">لا توجد سجلات في هذه الجلسة بعد.</span>';
      return;
    }
    const active = el.dataset.filter || 'all';
    const filtered = active === 'all' ? entries : entries.filter(e => e.type === active);
    const colorMap = { success:'#4ade80', info:'#93c5fd', warn:'#fbbf24', error:'#f87171' };
    el.innerHTML = filtered.map(e =>
      `<div style="border-bottom:1px solid #1e293b;padding:4px 0;display:flex;gap:10px;">
        <span style="color:#475569;flex-shrink:0;">${e.ts}</span>
        <span style="color:${colorMap[e.type]||'#e2e8f0'};flex-shrink:0;font-size:11px;text-transform:uppercase;">[${e.type}]</span>
        <span style="word-break:break-all;">${escapeHtml(e.msg)}</span>
      </div>`
    ).join('');
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
            <div class="ticket-subject">${escapeHtml(t.subject)}</div>
          </div>
          <span class="${badgeCls}" style="flex-shrink:0;">${badgeTxt}</span>
        </div>
        <div class="ticket-card-footer">
          ${t.category ? `<span class="cat-chip">${escapeHtml(t.category)}</span>` : ''}
          ${t.priority ? `<span style="font-size:11px;">${prioIcon}${escapeHtml(t.priority)}</span>` : ''}
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
        <div class="msg-preview-row">
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
function readExcel(file) {
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

// ── Hash routing ──────────────────────────────────────────────────────────
function routeHash() {
  const path = location.pathname;
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if ((path === '/capabilities' || hash === 'capabilities') && State.student) {
    history.replaceState(null, '', '/capabilities');
    App.startCapabilities();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
function _autoLogin(role, code, token, school) {
  // Restore JWT if we have one stored
  if (token) _authToken = token;
  if (role === 'student') {
    if (school) { State.school = school; App._updateSchoolDisplay(school); }
    const input = document.getElementById('sl-code');
    const cb    = document.getElementById('sl-remember');
    if (input) input.value = code;
    if (cb)    cb.checked  = true;
    App.studentLogin().catch(() => { sessionStorage.removeItem('lg_session'); show('screen-landing'); });
  } else {
    const input = document.getElementById('al-code');
    const cb    = document.getElementById('al-remember');
    if (input) input.value = code;
    if (cb)    cb.checked  = true;
    App.adminLogin().catch(() => { sessionStorage.removeItem('lg_session'); show('screen-landing'); });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ActivityLog.info(`🌐 تحميل الصفحة — ${new Date().toLocaleString('ar-SA')} — ${navigator.userAgent.split(' ').slice(-2).join(' ')}`);
  const btn = document.getElementById('selfdiag-submit');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  DB.loadQuestions().catch(() => {});

  // 1) Same-tab refresh
  try {
    const sess = sessionStorage.getItem('lg_session');
    if (sess) { const { role, code, token, school } = JSON.parse(sess); if (role && code) { _autoLogin(role, code, token, school); return; } }
  } catch (e) { sessionStorage.removeItem('lg_session'); }

  // 2) Cross-tab session (new tab from lesson/quiz pages, 4h expiry)
  try {
    const xs = localStorage.getItem('lg_xsession');
    if (xs) {
      const { role, code, token, school, expiry } = JSON.parse(xs);
      if (expiry && Date.now() > expiry) { localStorage.removeItem('lg_xsession'); }
      else if (role && code) { _autoLogin(role, code, token, school); return; }
    }
  } catch (e) { localStorage.removeItem('lg_xsession'); }

  // 3) Long-term remember-me token (2 days)
  try {
    const saved = localStorage.getItem('lg_remember');
    if (saved) {
      const { role, code, school, expiry } = JSON.parse(saved);
      if (expiry && Date.now() > expiry) { localStorage.removeItem('lg_remember'); }
      else if (role && code) { _autoLogin(role, code, null, school); return; }
    }
  } catch (e) { localStorage.removeItem('lg_remember'); }

  show('screen-landing');
});
