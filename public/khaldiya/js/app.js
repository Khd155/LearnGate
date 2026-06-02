'use strict';

// ── Supabase-backed data layer ────────────────────────────────────────────
// Cached arrays mirror the DB so render methods can stay synchronous.
const Cache = { students: [], plans: [], loaded: false };

// Active question bank — starts from data.js QUESTIONS, replaced when admin
// imports an Excel file (stored in Supabase `questions` table).
window.QUESTION_BANK = (typeof QUESTIONS !== 'undefined' ? QUESTIONS.slice() : []);

const _mapStudent = r => ({ id: r.id, code: r.code, name: r.name, createdAt: r.created_at });
const _mapPlan = r => ({
  id: r.id, studentId: r.student_id, studentName: r.student_name,
  status: r.status, gaps: r.gaps || [], adminNote: r.admin_note || '',
  createdAt: r.created_at, approvedAt: r.approved_at,
});

const DB = {
  students: () => Cache.students,
  plans:    () => Cache.plans,

  async loadAll() {
    const [s, p] = await Promise.all([
      SB.from('students').select('*').order('created_at', { ascending: true }),
      SB.from('plans').select('*').order('created_at', { ascending: false }),
    ]);
    if (s.error) console.error('students load', s.error);
    if (p.error) console.error('plans load', p.error);
    Cache.students = (s.data || []).map(_mapStudent);
    Cache.plans    = (p.data || []).map(_mapPlan);
    Cache.loaded = true;
    await DB.loadQuestions();
  },

  async loadQuestions() {
    const { data, error } = await SB.from('questions')
      .select('*').order('qnum', { ascending: true });
    if (error) { console.error('questions load', error); return; }
    if (data && data.length) {
      window.QUESTION_BANK = data.map(r => ({
        id: r.qnum, type: r.type, skillId: r.skill_id,
        text: r.text, opts: [r.opt1, r.opt2, r.opt3, r.opt4], ans: r.ans,
      }));
    } else if (typeof QUESTIONS !== 'undefined') {
      window.QUESTION_BANK = QUESTIONS.slice();
    }
  },

  async replaceQuestions(rows) {
    // Wipe then bulk-insert (chunked for safety)
    const del = await SB.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (del.error) throw del.error;
    const payload = rows.map(r => ({
      qnum: r.qnum, type: r.type, skill_id: r.skillId,
      text: r.text, opt1: r.opts[0], opt2: r.opts[1], opt3: r.opts[2], opt4: r.opts[3],
      ans: r.ans,
    }));
    const ins = await SB.from('questions').insert(payload);
    if (ins.error) throw ins.error;
    await DB.loadQuestions();
  },

  async appendQuestions(rows) {
    // Add to existing questions; skip rows whose qnum already exists.
    const existingNums = new Set(
      (window.QUESTION_BANK || []).map(q => Number(q.qnum)).filter(Boolean)
    );
    const fresh = rows.filter(r => !existingNums.has(Number(r.qnum)));
    if (!fresh.length) return { added: 0, skipped: rows.length };
    const payload = fresh.map(r => ({
      qnum: r.qnum, type: r.type, skill_id: r.skillId,
      text: r.text, opt1: r.opts[0], opt2: r.opts[1], opt3: r.opts[2], opt4: r.opts[3],
      ans: r.ans,
    }));
    const ins = await SB.from('questions').insert(payload);
    if (ins.error) throw ins.error;
    await DB.loadQuestions();
    return { added: fresh.length, skipped: rows.length - fresh.length };
  },

  async bulkAddStudents(rows) {
    // rows: [{ name, code }]
    const existing = new Set(Cache.students.map(s => s.code));
    const fresh = rows.filter(r => r.code && r.name && !existing.has(r.code));
    if (!fresh.length) return { added: 0, skipped: rows.length };
    const { data, error } = await SB.from('students').insert(fresh).select();
    if (error) throw error;
    (data || []).forEach(d => Cache.students.push(_mapStudent(d)));
    return { added: data.length, skipped: rows.length - data.length };
  },

  async addStudent({ name, code }) {
    const { data, error } = await SB.from('students')
      .insert({ name, code }).select().single();
    if (error) throw error;
    Cache.students.push(_mapStudent(data));
    return _mapStudent(data);
  },

  async deleteStudent(id) {
    const { error } = await SB.from('students').delete().eq('id', id);
    if (error) throw error;
    Cache.students = Cache.students.filter(s => s.id !== id);
    Cache.plans    = Cache.plans.filter(p => p.studentId !== id);
  },

  async upsertPlan(plan) {
    // remove any existing plan for this student, then insert fresh
    await SB.from('plans').delete().eq('student_id', plan.studentId);
    const { data, error } = await SB.from('plans').insert({
      student_id: plan.studentId,
      student_name: plan.studentName,
      status: plan.status,
      gaps: plan.gaps,
      admin_note: plan.adminNote || '',
    }).select().single();
    if (error) throw error;
    Cache.plans = Cache.plans.filter(p => p.studentId !== plan.studentId);
    Cache.plans.unshift(_mapPlan(data));
    return _mapPlan(data);
  },

  async approvePlan(planId, adminNote) {
    const { data, error } = await SB.from('plans').update({
      status: 'active',
      admin_note: adminNote || '',
      approved_at: new Date().toISOString(),
    }).eq('id', planId).select().single();
    if (error) throw error;
    const idx = Cache.plans.findIndex(p => p.id === planId);
    if (idx >= 0) Cache.plans[idx] = _mapPlan(data);
    return _mapPlan(data);
  },
};

// ── App State ─────────────────────────────────────────────────────────────
const State = {
  role: null,           // 'student' | 'admin'
  school: null,         // selected school name
  student: null,        // current student object
  selfDiag: {},         // { skillId: 'mastered'|'partial'|'need' }
  testAnswers: {},      // { qId: ansIdx }
  currentQ: 0,
  tab: 'pending',
};

// ── Screen router ─────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

// ── App object ────────────────────────────────────────────────────────────
const App = {

  // ── Screen 0b: School Selection ─────────────────────────────────────────
  selectSchool(name) {
    State.school = name;
    ['id-school-name', 'sh-school-sub', 'ad-school-sub'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = name;
    });
    show('screen-identity');
  },

  // ── Screen 1: Identity ──────────────────────────────────────────────────
  selectRole(role) {
    State.role = role;
    if (role === 'student') show('screen-student-login');
    else                    show('screen-admin-login');
  },

  // ── Screen 2a: Student Login ────────────────────────────────────────────
  async studentLogin() {
    const code = document.getElementById('sl-code').value.trim();
    const err  = document.getElementById('sl-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(err, 'الرجاء إدخال رقم السجل المدني (١٠ أرقام).'); return;
    }

    try { await DB.loadAll(); }
    catch (e) { showAlert(err, 'تعذّر الاتصال بقاعدة البيانات.'); return; }
    const students = DB.students();
    const student  = students.find(s => s.code === code);
    if (!student) {
      showAlert(err, 'السجل المدني غير مسجّل. راجع المشرف لإضافتك في النظام.');
      return;
    }
    State.student = student;
    App.renderStudentHome();
    show('screen-student-home');
  },

  // ── Screen 2b: Admin Login ──────────────────────────────────────────────
  async adminLogin() {
    const code = document.getElementById('al-code').value.trim();
    const err  = document.getElementById('al-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(err, 'الرجاء إدخال رقم السجل المدني (١٠ أرقام).'); return;
    }
    let admin;
    try {
      const { data, error } = await SB.from('admins').select('*').eq('code', code).maybeSingle();
      if (error) throw error;
      admin = data;
    } catch (e) {
      showAlert(err, 'تعذّر الاتصال بقاعدة البيانات.'); return;
    }
    if (!admin) {
      showAlert(err, 'السجل المدني غير مسجّل ضمن المشرفين.'); return;
    }
    try { await DB.loadAll(); }
    catch (e) { showAlert(err, 'تعذّر الاتصال بقاعدة البيانات.'); return; }
    App.renderAdminDashboard('pending');
    show('screen-admin');
  },

  // ── Screen 3a: Student Home ─────────────────────────────────────────────
  renderStudentHome() {
    document.getElementById('sh-name').textContent = State.student.name;
    const plans  = DB.plans();
    const myPlan = plans.find(p => p.studentId === State.student.id);

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
          <div class="status-desc">تم إرسال خطتك للمشرف. ستظهر هنا فور اعتمادها.</div>
        </div>`;
      }
    } else {
      planBanner.style.display = 'none';
    }
  },

  async startCapabilities() {
    try { await DB.loadAll(); } catch (e) {}
    const plans  = DB.plans();
    const myPlan = plans.find(p => p.studentId === State.student.id);
    if (myPlan) {
      if (myPlan.status === 'active') App.viewStudentPlan();
      else {
        alert('لديك خطة قيد المراجعة. انتظر موافقة المشرف.');
      }
      return;
    }
    show('screen-intro');
  },

  // ── Screen 4: Intro ─────────────────────────────────────────────────────

  // ── Screen 5: Self-Diagnostic ───────────────────────────────────────────
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
          <th style="width:130px;text-align:center">مُتقنتُها</th>
          <th style="width:130px;text-align:center">نسبياً</th>
          <th style="width:130px;text-align:center">أحتاج تدريب</th>
        </tr></thead>
        <tbody>${skills.map(sk => `
          <tr>
            <td><strong>${sk.name}</strong><br><span style="font-size:12px;color:var(--muted)">${sk.desc}</span></td>
            <td style="text-align:center">
              <label class="diag-radio">
                <input type="radio" name="diag_${sk.id}" value="mastered" onchange="App.setDiag('${sk.id}','mastered')">
                <span class="diag-dot mastered">✓</span>
              </label>
            </td>
            <td style="text-align:center">
              <label class="diag-radio">
                <input type="radio" name="diag_${sk.id}" value="partial" onchange="App.setDiag('${sk.id}','partial')">
                <span class="diag-dot partial">~</span>
              </label>
            </td>
            <td style="text-align:center">
              <label class="diag-radio">
                <input type="radio" name="diag_${sk.id}" value="need" onchange="App.setDiag('${sk.id}','need')">
                <span class="diag-dot need">✗</span>
              </label>
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
    const btn = document.getElementById('selfdiag-submit');
    const done = Object.keys(State.selfDiag).length === SKILLS.length;
    btn.disabled = !done;
    btn.style.opacity = done ? '1' : '.5';
  },

  submitSelfDiag() {
    if (Object.keys(State.selfDiag).length < SKILLS.length) {
      alert('الرجاء تقييم جميع المهارات قبل المتابعة.'); return;
    }
    State.currentQ = 0;
    State.testAnswers = {};
    App.renderQuestion();
    show('screen-pretest');
  },

  // ── Screen 6: Pre-Test ──────────────────────────────────────────────────
  renderQuestion() {
    const QBANK = window.QUESTION_BANK;
    const q = QBANK[State.currentQ];
    const total = QBANK.length;
    const pct   = Math.round((State.currentQ / total) * 100);
    const isVerbal = q.type === 'verbal';

    document.getElementById('test-progress-bar').style.width  = pct + '%';
    document.getElementById('test-progress-label').textContent =
      `السؤال ${State.currentQ + 1} من ${total}`;

    document.getElementById('test-section-badge').textContent =
      isVerbal ? '📚 القسم اللفظي' : '🔢 القسم الكمي';
    document.getElementById('test-section-badge').className =
      'test-section-badge ' + (isVerbal ? 'badge-verbal' : 'badge-quant');

    const selected = State.testAnswers[q.id];
    const opts = [...q.opts.map((opt, i) => `
      <div class="q-opt${selected === i ? ' selected' : ''}" onclick="App.selectAnswer(${i})">
        <div class="opt-circle"></div>
        <span>${opt}</span>
      </div>`),
      `<div class="q-opt dont-know${selected === 'dk' ? ' selected' : ''}" onclick="App.selectAnswer('dk')">
        <div class="opt-circle"></div>
        <span>لا أعرف الإجابة</span>
      </div>`
    ].join('');

    document.getElementById('q-num').textContent  = `سؤال ${State.currentQ + 1}`;
    document.getElementById('q-text').textContent = q.text;
    document.getElementById('q-opts').innerHTML   = opts;

    document.getElementById('btn-prev').disabled = State.currentQ === 0;
    const isLast = State.currentQ === total - 1;
    const nextBtn = document.getElementById('btn-next');
    nextBtn.textContent = isLast ? 'إنهاء الاختبار' : 'التالي';
    nextBtn.className   = 'btn ' + (isLast ? 'btn-success' : 'btn-primary');
  },

  selectAnswer(idx) {
    const q = window.QUESTION_BANK[State.currentQ];
    State.testAnswers[q.id] = idx;
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
    if (State.currentQ < QBANK.length - 1) {
      State.currentQ++;
      App.renderQuestion();
    } else {
      App.finishTest();
    }
  },

  finishTest() {
    show('screen-processing');
    setTimeout(() => App.processResults(), 2800);
  },

  // ── Gap Analysis Engine ─────────────────────────────────────────────────
  async processResults() {
    // Score per skill
    const scores = {};
    SKILLS.forEach(sk => { scores[sk.id] = { correct: 0, total: 0, name: sk.name }; });
    window.QUESTION_BANK.forEach(q => {
      scores[q.skillId].total++;
      const ans = State.testAnswers[q.id];
      if (ans === q.ans) scores[q.skillId].correct++;
    });

    // Build gaps
    const gaps = SKILLS.map(sk => {
      const s    = scores[sk.id];
      const pct  = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      const self = State.selfDiag[sk.id] || 'need';
      let level;
      if (pct >= 80)      level = 'high';
      else if (pct >= 50) level = 'mid';
      else                level = 'low';

      // Priority: overconfident (thought mastered but scored low) = critical
      const overconfident = self === 'mastered' && level === 'low';
      const rec = overconfident
        ? `مهارة تحتاج مراجعة عاجلة — أجبت أنك متقن لها لكن أداءك كان ضعيفاً.`
        : level === 'low'  ? `مهارة ضعيفة — تحتاج تدريباً مكثفاً وأساسيات.`
        : level === 'mid'  ? `مهارة متوسطة — تحتاج تعزيزاً وتدريباً إضافياً.`
        : `مهارة جيدة — الاستمرار في التطوير مستحسن.`;

      return {
        skillId: sk.id, skillName: sk.name, category: sk.category,
        pct, level, selfAssess: self, recommendation: rec, overconfident
      };
    }).sort((a, b) => a.pct - b.pct); // weakest first

    let plan;
    try {
      plan = await DB.upsertPlan({
        studentId: State.student.id,
        studentName: State.student.name,
        status: 'pending',
        gaps,
        adminNote: '',
      });
    } catch (e) {
      alert('تعذّر حفظ الخطة في قاعدة البيانات. حاول مرة أخرى.');
      console.error(e);
      show('screen-student-home');
      return;
    }
    App.renderPendingPlan(plan);
    show('screen-plan-pending');
  },

  renderPendingPlan(plan) {
    const el = document.getElementById('pending-gaps');
    el.innerHTML = plan.gaps.map(g => `
      <div class="gap-item">
        <div class="gap-item-head">
          <span style="font-size:14px">${g.category==='verbal'?'📚':'🔢'}</span>
          <span class="gap-skill">${g.skillName}</span>
          <span class="gap-score score-${g.level}">${g.pct}%</span>
        </div>
        <div class="gap-rec">${g.recommendation}</div>
      </div>`).join('');
  },

  // ── Student: View Active Plan ───────────────────────────────────────────
  viewStudentPlan() {
    const plan = DB.plans().find(p => p.studentId === State.student.id && p.status === 'active');
    if (!plan) return;
    App.renderActivePlan(plan);
    show('screen-active-plan');
  },

  renderActivePlan(plan) {
    const note = document.getElementById('ap-admin-note');
    note.style.display = plan.adminNote ? 'block' : 'none';
    note.textContent   = plan.adminNote ? `ملاحظة المشرف: ${plan.adminNote}` : '';

    document.getElementById('ap-gaps').innerHTML = plan.gaps.map(g => `
      <div class="gap-item">
        <div class="gap-item-head">
          <span>${g.category==='verbal'?'📚':'🔢'}</span>
          <span class="gap-skill">${g.skillName}</span>
          <span class="gap-score score-${g.level}">${g.pct}%</span>
        </div>
        <div class="gap-rec">${g.recommendation}</div>
      </div>`).join('');
  },

  // ── Admin Dashboard ─────────────────────────────────────────────────────
  renderAdminDashboard(tab) {
    State.tab = tab || State.tab;
    const students = DB.students();
    const plans    = DB.plans();

    const pending = plans.filter(p => p.status === 'pending').length;
    const active  = plans.filter(p => p.status === 'active').length;

    document.getElementById('stat-total').textContent   = students.length;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-active').textContent  = active;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === State.tab);
    });

    const listEl = document.getElementById('admin-student-list');

    if (State.tab === 'pending') {
      const pendingPlans = plans.filter(p => p.status === 'pending');
      if (!pendingPlans.length) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>لا توجد خطط معلقة حالياً</p></div>`;
        return;
      }
      listEl.innerHTML = pendingPlans.map(p => `
        <div class="student-row">
          <div class="student-avatar">${p.studentName.charAt(0)}</div>
          <div class="student-info">
            <div class="student-name">${p.studentName}</div>
            <div class="student-code">تم الإنشاء: ${new Date(p.createdAt).toLocaleDateString('ar-SA')}</div>
          </div>
          <span class="student-badge sbadge-pending">معلقة ⏳</span>
          <button class="btn btn-primary btn-sm" onclick="App.openReview('${p.id}')">مراجعة</button>
        </div>`).join('');

    } else if (State.tab === 'active') {
      const activePlans = plans.filter(p => p.status === 'active');
      if (!activePlans.length) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>لا توجد خطط نشطة بعد</p></div>`;
        return;
      }
      listEl.innerHTML = activePlans.map(p => `
        <div class="student-row">
          <div class="student-avatar">${p.studentName.charAt(0)}</div>
          <div class="student-info">
            <div class="student-name">${p.studentName}</div>
            <div class="student-code">تم الاعتماد: ${p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('ar-SA') : '-'}</div>
          </div>
          <span class="student-badge sbadge-active">نشطة ✅</span>
          <button class="btn btn-outline btn-sm" onclick="App.openReview('${p.id}')">عرض</button>
        </div>`).join('');

    } else {
      // Manage students
      if (!students.length) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>لا يوجد طلاب مضافون بعد</p></div>`;
        return;
      }
      listEl.innerHTML = students.map(st => {
        const plan = plans.find(p => p.studentId === st.id);
        const badge = !plan ? '<span class="student-badge sbadge-new">لم يبدأ</span>'
          : plan.status === 'pending'
            ? '<span class="student-badge sbadge-pending">خطة معلقة</span>'
            : '<span class="student-badge sbadge-active">خطة نشطة</span>';
        return `<div class="student-row">
          <div class="student-avatar">${st.name.charAt(0)}</div>
          <div class="student-info">
            <div class="student-name">${st.name}</div>
            <div class="student-code">رمز: ${st.code}</div>
          </div>
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

  // ── Admin: Add Student ──────────────────────────────────────────────────
  async addStudent() {
    const name = document.getElementById('add-st-name').value.trim();
    const code = document.getElementById('add-st-code').value.trim();
    const err  = document.getElementById('add-st-err');
    if (!name) { showAlert(err, 'أدخل اسم الطالب.'); return; }
    if (!/^\d{10}$/.test(code)) {
      showAlert(err, 'السجل المدني يجب أن يكون ١٠ أرقام.'); return;
    }

    if (DB.students().find(s => s.code === code)) {
      showAlert(err, 'هذا السجل المدني مسجّل مسبقاً.'); return;
    }
    try { await DB.addStudent({ name, code }); }
    catch (e) { showAlert(err, e.message || 'فشل الحفظ.'); return; }
    document.getElementById('add-st-name').value = '';
    document.getElementById('add-st-code').value = '';
    showToast('تمت إضافة الطالب ✅');
    App.renderAdminDashboard('manage');
  },

  // ── Excel: Import Students ──────────────────────────────────────────────
  async importStudents(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const rows = await readExcel(file);
      // Expect columns: السجل المدني | اسم الطالب
      const parsed = rows.map(r => {
        const code = String(r['السجل المدني'] ?? r['code'] ?? r['رمز الدخول'] ?? '').trim();
        const name = String(r['اسم الطالب'] ?? r['name'] ?? r['الاسم'] ?? '').trim();
        return { code, name };
      }).filter(r => /^\d{10}$/.test(r.code) && r.name);
      if (!parsed.length) { alert('لم يتم العثور على صفوف صالحة. تأكد من أن السجل المدني ١٠ أرقام.'); return; }
      const res = await DB.bulkAddStudents(parsed);
      showToast(`تمت إضافة ${res.added} طالب${res.skipped ? ' (تجاهل ' + res.skipped + ')' : ''} ✅`);
      App.renderAdminDashboard('manage');
    } catch (e) {
      console.error(e);
      alert('فشل قراءة الملف: ' + (e.message || e));
    }
  },

  // ── Excel: Import Questions ─────────────────────────────────────────────
  async importQuestions(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!confirm('سيتم إضافة الأسئلة الجديدة إلى البنك الحالي (يتم تجاهل المكرر حسب رقم السؤال). متابعة؟')) return;
    try {
      const rows = await readExcel(file);
      const parsed = rows.map(r => ({
        qnum: Number(r['رقم السؤال'] ?? r['qnum'] ?? r['id']),
        type: String(r['النوع'] ?? r['type'] ?? '').trim(),
        skillId: String(r['رمز المهارة'] ?? r['skillId'] ?? r['skill'] ?? '').trim(),
        text: String(r['نص السؤال'] ?? r['text'] ?? '').trim(),
        opts: [
          String(r['الخيار الأول'] ?? r['opt1'] ?? '').trim(),
          String(r['الخيار الثاني'] ?? r['opt2'] ?? '').trim(),
          String(r['الخيار الثالث'] ?? r['opt3'] ?? '').trim(),
          String(r['الخيار الرابع'] ?? r['opt4'] ?? '').trim(),
        ],
        ans: Number(r['رقم الإجابة الصحيحة'] ?? r['ans']),
      })).filter(q =>
        q.qnum && q.text && ['verbal','quantitative'].includes(q.type) &&
        q.opts.every(o => o) && q.ans >= 0 && q.ans <= 3
      );
      if (!parsed.length) { alert('لا توجد أسئلة صالحة في الملف.'); return; }
      const res = await DB.appendQuestions(parsed);
      let msg = `تمت إضافة ${res.added} سؤالاً ✅`;
      if (res.skipped) msg += ` (تم تجاهل ${res.skipped} مكرراً)`;
      showToast(msg);
    } catch (e) {
      console.error(e);
      alert('فشل الاستيراد: ' + (e.message || e));
    }
  },

  async deleteStudent(studentId) {
    if (!confirm('هل تريد حذف هذا الطالب وخطته؟')) return;
    try { await DB.deleteStudent(studentId); }
    catch (e) { alert('تعذّر الحذف.'); return; }
    App.renderAdminDashboard('manage');
    showToast('تم الحذف');
  },

  // ── Review Modal ────────────────────────────────────────────────────────
  openReview(planId) {
    const plan = DB.plans().find(p => p.id === planId);
    if (!plan) return;
    State.reviewPlanId = planId;

    document.getElementById('modal-student-name').textContent = plan.studentName;
    document.getElementById('modal-plan-date').textContent =
      `تاريخ التشخيص: ${new Date(plan.createdAt).toLocaleDateString('ar-SA')}`;
    document.getElementById('modal-admin-note').value = plan.adminNote || '';

    document.getElementById('modal-gaps').innerHTML = plan.gaps.map(g => `
      <div class="gap-item">
        <div class="gap-item-head">
          <span>${g.category==='verbal'?'📚':'🔢'}</span>
          <span class="gap-skill">${g.skillName}</span>
          <span class="gap-score score-${g.level}">${g.pct}%</span>
        </div>
        <div class="gap-rec">${g.recommendation}</div>
      </div>`).join('');

    const approveBtn = document.getElementById('btn-modal-approve');
    approveBtn.style.display = plan.status === 'pending' ? 'flex' : 'none';

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

  // ── Logout ──────────────────────────────────────────────────────────────
  logout() {
    State.student = null;
    State.role    = null;
    State.selfDiag = {};
    State.testAnswers = {};
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
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
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
  // Setup selfdiag submit button state
  const btn = document.getElementById('selfdiag-submit');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  // Preload questions in the background so the test uses DB-imported set if any
  DB.loadQuestions().catch(() => {});
});
