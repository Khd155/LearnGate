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
const _mapPlan    = r => ({
  id: r.id, studentId: r.student_id, studentName: r.student_name,
  status: r.status, gaps: r.gaps || [], adminNote: r.admin_note || '',
  createdAt: r.created_at, approvedAt: r.approved_at,
});

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

  async upsertPlan(plan) {
    const { plan: p } = await apiFetch('/plans', {
      method: 'POST',
      body: JSON.stringify({ ...plan, school: State.school || '' }),
    });
    const mapped = _mapPlan(p);
    Cache.plans = Cache.plans.filter(pl => pl.studentId !== plan.studentId);
    Cache.plans.unshift(mapped);
    return mapped;
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
  selfDiag: {},
  testAnswers: {},
  currentQ: 0,
  tab: 'pending',
  currentPlan: null,
};

// ── Screen router ─────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
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
    State.role = 'admin';
    startIdleWatch();
    App.renderAdminDashboard('pending');
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
    const myPlan = DB.plans().find(p => p.studentId === State.student.id);
    if (myPlan) {
      State.currentPlan = myPlan;
      App.renderLevelAnalysis(myPlan);
      show('screen-level-analysis');
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
      if (!confirm('لم تختر إجابة لهذا السؤال. هل تريد المتابعة؟')) return;
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
      plan = await DB.upsertPlan({ studentId: State.student.id, studentName: State.student.name, status: 'active', gaps, adminNote: '' });
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
    if (q && q.url) {
      return `
        <div class="quiz-start-screen">
          <div class="quiz-start-icon">✏️</div>
          <div class="quiz-start-title">${q.title}</div>
          <div class="quiz-start-sub">اختبار قصير — حوالي 10 أسئلة</div>
          <a href="${q.url}" target="_blank" class="btn btn-primary"
             style="width:auto;display:inline-flex;padding:12px 32px;margin-top:16px;text-decoration:none;">
            ابدأ الاختبار ←
          </a>
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
    document.getElementById('stat-total').textContent   = students.length;
    document.getElementById('stat-pending').textContent = plans.filter(p => p.status === 'pending').length;
    document.getElementById('stat-active').textContent  = plans.filter(p => p.status === 'active').length;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === State.tab));
    const listEl = document.getElementById('admin-student-list');

    if (State.tab === 'pending') {
      const pp = plans.filter(p => p.status === 'pending');
      if (!pp.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>لا توجد خطط معلقة حالياً</p></div>`; return; }
      listEl.innerHTML = pp.map(p => `
        <div class="student-row">
          <div class="student-avatar">${p.studentName.charAt(0)}</div>
          <div class="student-info"><div class="student-name">${p.studentName}</div><div class="student-code">تم الإنشاء: ${new Date(p.createdAt).toLocaleDateString('ar-SA')}</div></div>
          <span class="student-badge sbadge-pending">معلقة ⏳</span>
          <button class="btn btn-primary btn-sm" onclick="App.openReview('${p.id}')">مراجعة</button>
        </div>`).join('');

    } else if (State.tab === 'active') {
      const ap = plans.filter(p => p.status === 'active');
      if (!ap.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>لا توجد خطط نشطة بعد</p></div>`; return; }
      listEl.innerHTML = ap.map(p => `
        <div class="student-row">
          <div class="student-avatar">${p.studentName.charAt(0)}</div>
          <div class="student-info"><div class="student-name">${p.studentName}</div><div class="student-code">تم الاعتماد: ${p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('ar-SA') : '-'}</div></div>
          <span class="student-badge sbadge-active">نشطة ✅</span>
          <button class="btn btn-outline btn-sm" onclick="App.openReview('${p.id}')">عرض</button>
        </div>`).join('');

    } else {
      if (!students.length) { listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد طلاب مضافون بعد</p></div>`; return; }
      listEl.innerHTML = students.map(st => {
        const plan  = plans.find(p => p.studentId === st.id);
        const badge = !plan ? '<span class="student-badge sbadge-new">لم يبدأ</span>'
          : plan.status === 'pending' ? '<span class="student-badge sbadge-pending">خطة معلقة</span>'
          : '<span class="student-badge sbadge-active">خطة نشطة</span>';
        return `<div class="student-row">
          <div class="student-avatar">${st.name.charAt(0)}</div>
          <div class="student-info"><div class="student-name">${st.name}</div><div class="student-code">رمز: ${st.code}</div></div>
          ${badge}
          <button class="btn btn-danger btn-sm" onclick="App.deleteStudent('${st.id}')">حذف</button>
        </div>`;
      }).join('');
    }
  },

  setTab(tab) {
    document.getElementById('tab-manage').style.display = tab === 'manage' ? 'block' : 'none';
    App.renderAdminDashboard(tab);
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
      showToast(`تمت إضافة ${res.added} طالب${res.skipped ? ' (تجاهل ' + res.skipped + ')' : ''} ✅`);
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
      showToast(`تمت إضافة ${res.added} سؤالاً${res.skipped ? ' (تجاهل ' + res.skipped + ' مكرر)' : ''} ✅`);
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

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout() {
    stopIdleWatch();
    State.student     = null;
    State.role        = null;
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
