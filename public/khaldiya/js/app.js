'use strict';

// ── Cloudflare D1 data layer (via Pages Functions API) ───────────────────
const Cache = { students: [], plans: [], loaded: false };
window.QUESTION_BANK = (typeof QUESTIONS !== 'undefined' ? QUESTIONS.slice() : []);

// Base API call helper
async function apiFetch(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
    ['id-school-name', 'sh-school-sub', 'ad-school-sub'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = name;
    });
    show('screen-identity');
  },

  showOtherSchools() {
    const list = document.getElementById('other-schools-list');
    const s = 'width:112px;padding:16px 10px;flex-shrink:0;';
    const soon = () => `
      <div class="identity-card" style="${s}opacity:.5;cursor:default;position:relative;">
        <span style="position:absolute;top:8px;left:8px;background:rgba(255,255,255,.25);
              color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;">قريباً</span>
        <div class="card-icon" style="font-size:24px;">🏫</div>
        <div class="card-title" style="opacity:.35;font-size:13px;">—</div>
        <div class="card-desc" style="opacity:.6;font-size:11px;">قريباً</div>
      </div>`;
    const active = `
      <button class="identity-card" style="${s}" onclick="App.selectSchool('ثانوية ذات الصواري')">
        <div class="card-icon" style="font-size:24px;">🏫</div>
        <div class="card-title" style="font-size:13px;">ثانوية ذات الصواري</div>
        <div class="card-desc" style="font-size:11px;">اضغط للمتابعة</div>
      </button>`;
    // ذات الصواري في المنتصف (موقع 3 من 5)
    list.innerHTML = soon() + soon() + active + soon() + soon();
    document.getElementById('school-cards').style.display = 'none';
    document.getElementById('other-schools-panel').style.display = 'block';
  },

  hideOtherSchools() {
    document.getElementById('other-schools-panel').style.display = 'none';
    document.getElementById('school-cards').style.display = 'flex';
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
    try { await DB.loadAll(); }
    catch (e) { showAlert(errEl, 'تعذّر الاتصال بقاعدة البيانات.'); return; }
    const student = DB.students().find(s => s.code === code);
    if (!student) {
      showAlert(errEl, 'السجل المدني غير مسجّل. راجع المشرف لإضافتك في النظام.'); return;
    }
    State.student = student;
    State.role = 'student';
    startIdleWatch();
    App.renderStudentHome();
    show('screen-student-home');
  },

  // ── Admin Login ──────────────────────────────────────────────────────────
  async adminLogin() {
    const code  = document.getElementById('al-code').value.trim();
    const errEl = document.getElementById('al-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(errEl, 'الرجاء إدخال رقم السجل المدني (١٠ أرقام).'); return;
    }
    let admin;
    try {
      const school = encodeURIComponent(State.school || '');
      const data = await apiFetch(`/admins/${code}?school=${school}`);
      admin = data.admin;
    } catch (e) {
      if (e.message && e.message.includes('404')) {
        showAlert(errEl, 'السجل المدني غير مسجّل ضمن المشرفين.'); return;
      }
      showAlert(errEl, 'تعذّر الاتصال بقاعدة البيانات.'); return;
    }
    if (!admin) { showAlert(errEl, 'السجل المدني غير مسجّل ضمن المشرفين.'); return; }
    try { await DB.loadAll(); }
    catch (e) { showAlert(errEl, 'تعذّر الاتصال بقاعدة البيانات.'); return; }
    State.role  = admin.role === 'director' ? 'director' : 'admin';
    State.admin = admin;
    startIdleWatch();
    // Show director-only tabs
    document.querySelectorAll('.director-tab').forEach(el => {
      el.style.display = State.role === 'director' ? '' : 'none';
    });
    App.renderAdminDashboard('students');
    show('screen-admin');
  },

  // ── Student Home ─────────────────────────────────────────────────────────
  renderStudentHome() {
    document.getElementById('sh-name').textContent = State.student.name;
    const myPlan    = DB.plans().find(p => p.studentId === State.student.id);
    const planBanner = document.getElementById('sh-plan-banner');
    if (myPlan) {
      planBanner.style.display = 'flex';
      if (myPlan.status === 'active') {
        planBanner.className = 'status-banner active';
        planBanner.innerHTML = `<div class="status-icon">✅</div><div>
          <div class="status-title">خطتك جاهزة!</div>
          <div class="status-desc">تمت الموافقة على خطة دعم التعلم. <a href="#" onclick="App.viewStudentPlan();return false;" style="color:var(--primary);font-weight:700;">عرض الخطة ←</a></div>
        </div>`;
      } else {
        planBanner.className = 'status-banner pending';
        planBanner.innerHTML = `<div class="status-icon">⏳</div><div>
          <div class="status-title">خطتك قيد المراجعة</div>
          <div class="status-desc">تم إنشاء خطة دعمك. <a href="#" onclick="App.viewStudentPlan();return false;" style="color:var(--primary);font-weight:700;">عرض نتائجك وخطتك ←</a></div>
        </div>`;
      }
    } else {
      planBanner.style.display = 'none';
    }
  },

  async startCapabilities() {
    try { await DB.loadAll(); } catch (e) {}
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
      buildSection(verbal, '📚 المهارات اللفظية') +
      buildSection(quant,  '🔢 المهارات الكمية');
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

    let plan;
    try {
      plan = await DB.addAttempt({ studentId: State.student.id, studentName: State.student.name, status: 'active', gaps, adminNote: '' });
    } catch (e) {
      alert('تعذّر حفظ الخطة. حاول مرة أخرى.');
      show('screen-student-home'); return;
    }
    State.currentPlan = plan;
    App.renderLevelAnalysis(plan);
    show('screen-level-analysis');
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
      return 'فعلاً أتضح أنك غير متقن للمهارة';
    }
    if (n === 2) {
      if (sa === 'mastered') return 'تشخيصك لذاتك كان غير مطابق — أداؤك دون المتوسط';
      if (sa === 'partial')  return 'مستوى الأداء أقل من تشخيصك لذاتك';
      return 'فعلاً أتضح أنك غير متقن للمهارة كما اخترت في التشخيص الذاتي';
    }
    if (n === 3) {
      if (sa === 'mastered') return 'مستوى الأداء متوسط الإتقان — أقل مما توقعت';
      if (sa === 'partial')  return 'فعلاً أتضح أن مستوى الأداء متوسط في المهارة';
      return 'مستوى الأداء متوسط الإتقان — أفضل مما توقعت';
    }
    if (sa === 'mastered') return 'فعلاً أتضح أنك متقن للمهارة';
    if (sa === 'partial')  return 'فعلاً أتضح أن لديك إتقان جيد — أفضل من توقعاتك';
    return 'فعلاً أتضح أن لديك إتقان جيد رغم توقعاتك الأولية';
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
  viewStudentPlan() {
    const plan = DB.plans().find(p => p.studentId === State.student.id);
    if (!plan) return;
    State.currentPlan = plan;
    App.renderLevelAnalysis(plan);
    show('screen-level-analysis');
  },

  // ── Support Plan ─────────────────────────────────────────────────────────
  showSupportPlan() {
    const plan = State.currentPlan || DB.plans().find(p => p.studentId === State.student.id);
    if (!plan) return;
    App.renderSupportPlan(plan);
    show('screen-support-plan');
  },

  renderSupportPlan(plan) {
    // Admin note
    const note = document.getElementById('sp-admin-note');
    note.style.display = plan.adminNote ? 'block' : 'none';
    note.textContent   = plan.adminNote ? `ملاحظة المشرف: ${plan.adminNote}` : '';

    // Print header name
    const nameEl = document.getElementById('sp-student-name-print');
    if (nameEl) nameEl.textContent = `الطالب: ${plan.studentName || (State.student && State.student.name) || ''}`;

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
      const url = SKILL_LESSONS[g.skillId] || '';
      const cls = g.level === 'high' ? 'score-high' : g.level === 'mid' ? 'score-mid' : 'score-low';
      return `<tr>
        <td style="text-align:center;font-weight:700;">${i + 1}</td>
        <td>${g.skillName}</td>
        <td style="text-align:center;"><span class="gap-score ${cls}">${g.pct}%</span></td>
        <td style="font-size:12px;">${g.recommendation}</td>
        <td style="font-size:11px;word-break:break-all;">${url}</td>
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
      const QUIZ_FOLDERS = {v1:'comprehension',v2:'inference',v3:'contextual',v4:'analogy',v5:'completion',q1:'arithmetic',q2:'algebra',q3:'geometry',q4:'comparison'};
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
        return `<div class="student-row">
          <div class="student-avatar">${st.name.charAt(0)}</div>
          <div class="student-info" onclick="App.openStudentDetail('${st.id}')" style="cursor:pointer;">
            <div class="student-name">${st.name}</div>
            <div class="student-code">رمز: ${st.code}</div>
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

  setTab(tab) {
    document.getElementById('tab-manage').style.display      = tab === 'settings'   ? 'block' : 'none';
    document.getElementById('tab-supervisors').style.display = tab === 'supervisors' ? 'block' : 'none';
    document.getElementById('tab-questions').style.display   = tab === 'questions'   ? 'block' : 'none';
    if (tab === 'stats')       { App.renderAdminDashboard(tab); App.renderAdminStats(); return; }
    if (tab === 'supervisors') { App.renderAdminDashboard(tab); App.loadSupervisors(); return; }
    if (tab === 'questions')   { App.renderAdminDashboard(tab); App.loadQuestions(); return; }
    App.renderAdminDashboard(tab);
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
          <div class="student-avatar">${a.name.charAt(0)}</div>
          <div class="student-info" style="flex:1;">
            <div class="student-name">${a.name}</div>
            <div class="student-code">رمز: ${a.code} · ${a.role === 'director' ? '👑 مدير' : '👤 مشرف'}</div>
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
      const data = await apiFetch('/questions');
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
    listEl.innerHTML = questions.map(q => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);">
        <div style="min-width:36px;height:36px;border-radius:8px;background:var(--primary);color:#fff;
                    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">
          ${q.qnum}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13.5px;font-weight:600;margin-bottom:5px;line-height:1.6;">${q.text}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);">
            <span style="background:#eaf2f9;color:var(--primary);border-radius:99px;padding:2px 10px;font-weight:700;">${q.skill_id}</span>
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
    document.getElementById('add-st-name').value = '';
    document.getElementById('add-st-code').value = '';
    showToast('تمت إضافة الطالب ✅');
    App.renderAdminDashboard('manage');
  },

  // ── Excel: Students ────────────────────────────────────────────────────────
  async importStudents(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const rows   = await readExcel(file);
      const parsed = rows.map(r => ({
        code: String(r['السجل المدني'] ?? r['code'] ?? r['رمز الدخول'] ?? '').trim(),
        name: String(r['اسم الطالب']  ?? r['name']  ?? r['الاسم']      ?? '').trim(),
      })).filter(r => /^\d{10}$/.test(r.code) && r.name);
      if (!parsed.length) { alert('لم يتم العثور على صفوف صالحة.'); return; }
      const res = await DB.bulkAddStudents(parsed);
      showToast(`تمت إضافة ${res.added} ${res.added >= 3 && res.added <= 10 ? 'طلاب' : 'طالب'}${res.skipped ? ' (تجاهل ' + res.skipped + ' ' + (res.skipped >= 3 && res.skipped <= 10 ? 'مكررين' : 'مكرر') + ')' : ''} ✅`);
      App.renderAdminDashboard('manage');
    } catch (e) { alert('فشل قراءة الملف: ' + (e.message || e)); }
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
    try { await DB.deleteStudent(studentId); }
    catch (e) { alert('تعذّر الحذف.'); return; }
    App.renderAdminDashboard('manage');
    showToast('تم الحذف');
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
    document.getElementById('btn-modal-approve').style.display = plan.status === 'pending' ? 'flex' : 'none';
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
          <div class="chat-bubble ${sent ? 'sent' : 'received'}">${m.body}</div>
          <div class="chat-time">${sent ? 'أنت' : m.student_name} · ${time}</div>
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
          studentName: st ? st.name : '',
          senderType: 'admin',
          body,
          school: State.school || '',
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
      <button class="supervisor-btn" onclick="App.openChatWithAdmin('${a.id}','${a.name.replace(/'/g,"\\'")}');document.getElementById('supervisor-select-modal').classList.remove('open');">
        <div class="supervisor-avatar">${a.name.charAt(0)}</div>
        <span>${a.name}</span>
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
        <div class="chat-bubble ${sent ? 'sent' : 'received'}">${m.body}</div>
        <div class="chat-time">${sent ? 'أنت' : State.chatAdminName || 'المشرف'} · ${time}</div>
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
          studentId: State.student.id, studentName: State.student.name,
          senderType:'student', body,
          school: State.school || '',
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
      if (!tickets.length) { el.innerHTML = '<div class="chat-empty" style="padding:30px 0;">لا توجد طلبات دعم بعد</div>'; return; }
      el.innerHTML = tickets.map(t => {
        const badgeCls = t.status === 'open' ? 'tbadge-open' : t.status === 'in_progress' ? 'tbadge-progress' : 'tbadge-resolved';
        const badgeTxt = t.status === 'open' ? 'مفتوح' : t.status === 'in_progress' ? 'قيد المعالجة' : 'تم الحل';
        const date = new Date(t.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short' });
        return `<div class="ticket-card" onclick="App.openTicketDetail('${t.id}', 'student')">
          <div class="ticket-card-top">
            <div class="ticket-subject">${t.subject}</div>
            <span class="${badgeCls}">${badgeTxt}</span>
          </div>
          <div class="ticket-meta">${date}</div>
        </div>`;
      }).join('');
    } catch { el.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">تعذّر التحميل</div>'; }
  },

  openNewTicketModal() {
    document.getElementById('nt-subject').value = '';
    document.getElementById('nt-body').value    = '';
    document.getElementById('nt-err').textContent = '';
    document.getElementById('new-ticket-modal').classList.add('open');
  },

  closeNewTicketModal() { document.getElementById('new-ticket-modal').classList.remove('open'); },

  async submitTicket() {
    const subject = document.getElementById('nt-subject').value.trim();
    const body    = document.getElementById('nt-body').value.trim();
    const errEl   = document.getElementById('nt-err');
    if (!subject) { showAlert(errEl, 'أدخل موضوع الطلب'); return; }
    if (!body)    { showAlert(errEl, 'أدخل تفاصيل المشكلة'); return; }
    try {
      await apiFetch('/tickets', {
        method:'POST',
        body: JSON.stringify({ studentId: State.student.id, studentName: State.student.name, subject, body, school: State.school || '' }),
      });
      App.closeNewTicketModal();
      showToast('تم إرسال طلب الدعم ✅');
      App.loadStudentTickets();
    } catch (e) { showAlert(errEl, e.message || 'فشل الإرسال'); }
  },

  // ── Ticket Detail (shared student & admin) ────────────────────────────────
  _currentTicketId: null,
  _ticketSenderType: 'student',

  async openTicketDetail(ticketId, senderType) {
    App._currentTicketId  = ticketId;
    App._ticketSenderType = senderType;
    try {
      const { ticket, replies } = await apiFetch(`/tickets/${ticketId}`);
      document.getElementById('td-subject').textContent = ticket.subject;
      const date = new Date(ticket.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short', year:'numeric' });
      document.getElementById('td-meta').textContent = `${ticket.student_name} · ${date}`;
      const badgeCls = ticket.status === 'open' ? 'tbadge-open' : ticket.status === 'in_progress' ? 'tbadge-progress' : 'tbadge-resolved';
      const badgeTxt = ticket.status === 'open' ? 'مفتوح' : ticket.status === 'in_progress' ? 'قيد المعالجة' : 'تم الحل';
      document.getElementById('td-status-badge').innerHTML = `<span class="${badgeCls}">${badgeTxt}</span>`;
      const thread = document.getElementById('td-thread');
      thread.innerHTML = replies.map(r => {
        const time = new Date(r.created_at).toLocaleString('ar-SA', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        const who  = r.sender_type === 'student' ? (ticket.student_name || 'الطالب') : 'المشرف';
        return `<div class="thread-msg ${r.sender_type}">
          <div class="thread-msg-who">${who}</div>
          ${r.body}
          <div class="thread-msg-time">${time}</div>
        </div>`;
      }).join('');
      thread.scrollTop = thread.scrollHeight;
      // Show resolve button for admin only if not resolved
      const resolveBtn = document.getElementById('td-resolve-btn');
      resolveBtn.style.display = (senderType === 'admin' && ticket.status !== 'resolved') ? 'flex' : 'none';
      // Hide reply area if resolved
      document.getElementById('td-reply-area').style.display = ticket.status === 'resolved' ? 'none' : 'block';
      document.getElementById('td-reply-input').value = '';
      document.getElementById('ticket-detail-modal').classList.add('open');
    } catch { showToast('تعذّر تحميل التذكرة'); }
  },

  closeTicketDetail() { document.getElementById('ticket-detail-modal').classList.remove('open'); App._currentTicketId = null; },

  async sendTicketReply() {
    const body = document.getElementById('td-reply-input').value.trim();
    if (!body || !App._currentTicketId) return;
    try {
      await apiFetch(`/tickets/${App._currentTicketId}/reply`, {
        method:'POST',
        body: JSON.stringify({ senderType: App._ticketSenderType, body }),
      });
      document.getElementById('td-reply-input').value = '';
      await App.openTicketDetail(App._currentTicketId, App._ticketSenderType);
      if (App._ticketSenderType === 'student') App.loadStudentTickets();
      else App.renderSupportTickets();
    } catch { showToast('تعذّر الإرسال'); }
  },

  async resolveTicket() {
    if (!App._currentTicketId) return;
    try {
      await apiFetch(`/tickets/${App._currentTicketId}`, { method:'PATCH', body: JSON.stringify({ status:'resolved' }) });
      App.closeTicketDetail();
      showToast('تم تعيين التذكرة كمحلولة ✅');
      App.renderSupportTickets();
    } catch { showToast('تعذّر التحديث'); }
  },

  // ── Support Admin (Developer Page) ──────────────────────────────────────
  async supportAdminLogin() {
    const key    = document.getElementById('sp-login-key').value.trim();
    const errEl  = document.getElementById('sp-login-err');
    if (key !== 'learngate-dev-2026') { showAlert(errEl, 'مفتاح الدخول غير صحيح'); return; }
    State.role = 'support';
    startIdleWatch();
    show('screen-support-admin');
    App.setSupportTab('sa-tickets');
  },

  setSupportTab(tab) {
    document.querySelectorAll('#screen-support-admin .tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'sa-tickets') App.renderSupportTickets();
    else App.renderSupportMessages();
  },

  async renderSupportTickets() {
    const listEl = document.getElementById('support-admin-list');
    listEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;">جاري التحميل...</div>';
    try {
      const { tickets } = await apiFetch('/tickets');
      if (!tickets.length) { listEl.innerHTML = '<div class="chat-empty" style="padding:40px 0;">لا توجد تذاكر دعم</div>'; return; }
      listEl.innerHTML = tickets.map(t => {
        const badgeCls = t.status === 'open' ? 'tbadge-open' : t.status === 'in_progress' ? 'tbadge-progress' : 'tbadge-resolved';
        const badgeTxt = t.status === 'open' ? 'مفتوح' : t.status === 'in_progress' ? 'قيد المعالجة' : 'تم الحل';
        const date = new Date(t.created_at).toLocaleDateString('ar-SA', { day:'numeric', month:'short' });
        return `<div class="ticket-card" onclick="App.openTicketDetail('${t.id}', 'admin')">
          <div class="ticket-card-top">
            <div class="ticket-subject">${t.subject}</div>
            <span class="${badgeCls}">${badgeTxt}</span>
          </div>
          <div class="ticket-meta">${t.student_name} · ${t.school} · ${date}</div>
        </div>`;
      }).join('');
    } catch {
      listEl.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">تعذّر التحميل</div>';
    }
  },

  async renderSupportMessages() {
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
          <div class="student-avatar">${(c.student_name || '؟').charAt(0)}</div>
          <div class="msg-preview-info">
            <div class="msg-preview-name">${c.student_name}</div>
            <div class="msg-preview-last" style="font-size:12px;color:var(--muted);">رسائل غير مقروءة</div>
          </div>
          <span class="msg-unread-count">${c.cnt}</span>
        </div>`).join('');
    } catch {
      listEl.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;">تعذّر التحميل</div>';
    }
  },

  logout() {
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
    show('screen-school');
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

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  show('screen-landing');
  const btn = document.getElementById('selfdiag-submit');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  DB.loadQuestions().catch(() => {});
});
