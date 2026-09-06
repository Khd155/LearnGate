'use strict';

// ── Theme (dark/light) ─────────────────────────────────────────────────────
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'dark' || mode === 'light') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
  _syncThemeButtons();
}
function _syncThemeButtons() {
  // Light is the site-wide default; dark applies only when the user opted in.
  const isDark = localStorage.getItem('theme') === 'dark';
  document.querySelectorAll('.tb-theme-btn').forEach(btn => { btn.textContent = isDark ? '☀️' : '🌙'; });
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

// ── Frequently Asked Questions ──────────────────────────────────────────
// Each item's `action` (when present) is resolved lazily via App.runFaqAction()
// so this array can be declared before App exists — closures aren't called
// until the student actually taps the button.
const FAQ_DATA = [
  { title: '📌 التعريف بالبوابة', items: [
    { q: 'ما هي بوابة دعم التعلم؟', a: 'بوابة تعليمية موجهة لطلاب الثانوية تساعدهم على اكتساب المهارات اللازمة والاستعداد لاختبار القدرات والاختبار التحصيلي.', action: 'about', label: '🔗 التعرف على البوابة' },
    { q: 'كيف أبدأ استخدام البوابة؟', a: 'سجّل الدخول برقمك، ثم ابدأ بالاختبار التشخيصي — تُبنى خطة الدعم تلقائيًا على نتيجتك.', action: 'diagnostic', label: '🚀 بدء الاختبار التشخيصي' },
    { q: 'هل يوجد فيديو يشرح فكرة البوابة؟', a: 'حاليًا التعريف متاح كنص مفصّل في صفحة "عن البوابة"، وسيُضاف فيديو تعريفي لاحقًا.', action: 'about', label: '🔗 التعرف على البوابة' },
    { q: 'كيف أستفيد من البوابة بأفضل طريقة؟', a: 'اتبع خطة التدريب المقترحة بالترتيب: شروحات، ثم تدريبات قصيرة، ثم اختبارات محاكية لكل مهارة تحتاجها.', action: 'training-plan', label: '📅 الجدول الزمني للتدريب' },
    { q: 'هل أبدأ بالشروحات أم بالاختبار التشخيصي؟', a: 'ابدأ بالاختبار التشخيصي أولًا؛ لأنه يحدد المهارات التي تحتاج إلى دعم، ثم ينشئ لك خطة دعم تتضمن الشروحات والتدريبات المناسبة.', action: 'diagnostic', label: '🚀 بدء الاختبار التشخيصي' },
    { q: 'هل تكفي البوابة وحدها للاستعداد لاختبار القدرات؟', a: 'البوابة تقدم برنامجًا مركزًا لإتقان المهارات الأساسية، لكنها لا تغني عن الاستفادة من المصادر الأخرى، خاصة لمن يستهدفون الدرجات المرتفعة جدًا.' },
  ]},
  { title: '🔑 الحساب والدخول', items: [
    { q: 'كيف أحصل على رمز الدخول؟', a: 'رمز الدخول يصدره المشرف لكل طالب. إن لم يصلك، تواصل مع الدعم الفني.', action: 'guest-support', label: '📩 تواصل مع الدعم الفني' },
    { q: 'ماذا أفعل إذا نسيت رمز الدخول؟', a: 'تواصل مع الدعم الفني لاستعادته.', action: 'guest-support', label: '📩 تواصل مع الدعم الفني' },
    { q: 'لا أستطيع تسجيل الدخول، ماذا أفعل؟', a: 'تأكد من صحة الرقم، وإن استمرت المشكلة تواصل مع الدعم الفني.', action: 'guest-support', label: '📩 تواصل مع الدعم الفني' },
    { q: 'هل أستطيع الدخول من الجوال؟', a: 'نعم، يمكن الدخول من الجوال.' },
    { q: 'هل أستطيع الدخول من الكمبيوتر؟', a: 'نعم، يمكن الدخول من الكمبيوتر.' },
    { q: 'هل يمكن استخدام الحساب في أكثر من جهاز؟', a: 'نعم، مع مراعاة ضوابط الاستخدام.' },
  ]},
  { title: '🧠 الاختبار التشخيصي', items: [
    { q: 'ما الاختبار التشخيصي؟', a: 'اختبار يقيس الحد الأدنى لإتقان المهارات الأساسية، ثم يحدد المهارات التي تحتاج إلى دعم ويقترح لك خطة دعم مناسبة.' },
    { q: 'ماذا أستفيد من نتيجة الاختبار التشخيصي؟', a: 'تحصل على خطة دعم دقيقة تناسب مستواك.', action: 'level-analysis', label: '📊 عرض تحليل مستواك' },
    { q: 'هل يمكن إعادة الاختبار التشخيصي؟', a: 'نعم، بعد فترة مناسبة من التدريب على المهارات المطلوبة.', action: 'diagnostic', label: '🚀 إعادة الاختبار' },
    { q: 'متى أعيد الاختبار التشخيصي؟', a: 'في الموعد المحدد داخل البوابة، وإن أنهيت التدريب قبل ذلك فيمكنك طلب إعادة الاختبار من المشرف.', action: 'chat', label: '💬 تواصل مع المشرف' },
    { q: 'هل تظهر المهارات التي أحتاجها بعد الاختبار؟', a: 'نعم، تظهر لك خطة دعم كاملة تشمل المهارات والمواد العلمية الخاصة بها.', action: 'support-plan', label: '📋 عرض خطة الدعم' },
    { q: 'ماذا أفعل بعد انتهاء الاختبار؟', a: 'انتقل إلى خطة الدعم، ثم ابدأ بالشروحات، وبعدها التدريبات القصيرة.', action: 'support-plan', label: '📋 عرض خطة الدعم' },
  ]},
  { title: '🗓️ خطة التدريب', items: [
    { q: 'كيف أصمم خطة التدريب؟', a: 'البوابة تقترح لك خطة تدريب مناسبة، ويمكنك الاطلاع على طريقة الاستفادة منها.', action: 'training-plan', label: '📅 الجدول الزمني للتدريب' },
    { q: 'هل تختلف خطة التدريب من طالب لآخر؟', a: 'نعم، لأنها تعتمد على نتائج الاختبار التشخيصي لكل طالب.' },
    { q: 'كم ساعة أحتاج يوميًا؟', a: 'يختلف ذلك بحسب مستواك وعدد المهارات التي تحتاج إلى دعم.' },
    { q: 'كيف أعرف المهارة التي أبدأ بها؟', a: 'ابدأ بالمهارات التي تقترحها لك خطة الدعم حسب نتائج الاختبار التشخيصي.', action: 'support-plan', label: '📋 عرض خطة الدعم' },
    { q: 'هل أستطيع تعديل خطة التدريب؟', a: 'نعم، بإعادة الاختبار التشخيصي أو باختيار المهارات التي ترغب في التركيز عليها.' },
    { q: 'ماذا أفعل إذا أنهيت جميع المهارات؟', a: 'انتقل إلى الاختبارات التقويمية والمحاكية لقياس مدى تقدمك.', action: 'general-tests', label: '📝 الاختبارات المحاكية' },
  ]},
  { title: '🎬 الشروحات والتدريبات', items: [
    { q: 'كيف أصل إلى الشروحات؟', a: 'من خلال خطة الدعم، أو مباشرة من الصفحة الرئيسية.', action: 'lessons', label: '📚 فتح الشروحات' },
    { q: 'كم مدة مقاطع الشرح؟', a: 'المقاطع التأسيسية غالبًا من 5 إلى 10 دقائق، وقد يصل بعضها إلى 20 دقيقة، أما المقاطع التدريبية فمن دقيقة إلى دقيقتين تقريبًا.' },
    { q: 'هل يجب مشاهدة جميع المقاطع؟', a: 'يُنصح بمشاهدة 3 إلى 7 مقاطع في كل جولة تدريبية، ثم الانتقال إلى المهارة التالية والعودة لاحقًا لاستكمال بقية المقاطع.' },
    { q: 'هل أعيد مشاهدة المقطع أكثر من مرة؟', a: 'نعم، إذا احتجت إلى ذلك حتى تتقن المهارة.' },
    { q: 'كيف أصل إلى التدريبات القصيرة؟', a: 'من خطة الدعم، ثم اختر المهارة، وبعدها اضغط على أيقونة "التدريبات".', action: 'support-plan', label: '📋 عرض خطة الدعم' },
    { q: 'لماذا أؤدي التدريبات القصيرة؟', a: 'لتنمية المهارة والتدرب على سرعة الإجابة بطريقة مختصرة وغير مملة.' },
    { q: 'هل أكرر التدريب؟', a: 'نعم، فالتكرار يساعد على إتقان المهارة.' },
    { q: 'كم تدريبًا يكفي لكل مهارة؟', a: 'يختلف ذلك من طالب لآخر بحسب مستوى إتقانه للمهارة.' },
  ]},
  { title: '🧪 الاختبارات المحاكية', items: [
    { q: 'ما الفرق بين الاختبار التشخيصي والاختبار المحاكي؟', a: 'الاختبار التشخيصي يشبه الاختبار المحاكي، لكنه يركز على قياس الحد الأدنى من المهارات لتحديد جوانب القوة والاحتياج، أما الاختبار المحاكي فيقيس مستوى الاستعداد بصورة أشمل.' },
    { q: 'متى أبدأ الاختبارات المحاكية؟', a: 'بعد الانتهاء من دراسة المهارات ومشاهدة المقاطع وأداء التدريبات القصيرة.', action: 'general-tests', label: '📝 الاختبارات المحاكية' },
    { q: 'كم اختبارًا محاكيًا أحتاج؟', a: 'يختلف ذلك بحسب مستوى إتقانك والدرجة التي حصلت عليها في الاختبارات السابقة.', action: 'general-tests', label: '📝 الاختبارات المحاكية' },
    { q: 'هل يمكن إعادة الاختبار المحاكي؟', a: 'نعم، يمكن إعادة الاختبار من خلال صفحة الاختبارات المحاكية.', action: 'general-tests', label: '📝 الاختبارات المحاكية' },
    { q: 'كيف أستفيد من نتائج الاختبار المحاكي؟', a: 'ركز على المهارات التي ظهر فيها ضعف، ثم ارجع إلى خطة الدعم وأعد التدريب عليها قبل أداء اختبار جديد.', action: 'support-plan', label: '📋 عرض خطة الدعم' },
    { q: 'ما الدرجة التي تدل على جاهزيتي؟', a: 'كلما ارتفعت درجتك دل ذلك على تحسن مستواك، أما الدرجة الكاملة فتدل على إتقان مهارات البوابة، لكنها لا تعني بالضرورة ضمان الحصول على الدرجة نفسها في الاختبار الفعلي.' },
  ]},
  { title: '🎧 الدعم الفني', items: [
    { q: 'كيف أتواصل مع المشرف؟', a: 'تواصل مع المشرف مباشرة عبر شاشة الدردشة داخل حسابك، وستصلك ردوده هناك.', action: 'chat', label: '💬 فتح الدردشة مع المشرف' },
    { q: 'كيف أطلب إعادة فتح الاختبار؟', a: 'أرسل طلبك للمشرف عبر الدردشة، وسيعيد فتح الاختبار لك إذا كان الطلب مناسبًا.', action: 'chat', label: '💬 فتح الدردشة مع المشرف' },
    { q: 'واجهت مشكلة تقنية، ماذا أفعل؟', a: 'ارفع طلب دعم فني موضحًا فيه المشكلة بالتفصيل، وسيتواصل معك المشرف لحلها.', action: 'tickets', label: '🎫 فتح نموذج الدعم الفني' },
    { q: 'كيف أبلغ عن خطأ أو أرسل ملاحظة؟', a: 'يمكنك إرسال ملاحظتك أو الإبلاغ عن أي خطأ عبر نموذج الدعم الفني، وسنأخذها بعين الاعتبار.', action: 'tickets', label: '🎫 فتح نموذج الدعم الفني' },
  ]},
];

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

// ── Session storage keys — namespaced by role ──────────────────────────────
// Student and admin/director sessions used to share the same lg_session/lg_xsession/
// lg_remember keys, so one person switching between their own student and admin
// accounts in the same browser would silently overwrite/blow away the other role's
// session, producing a stuck restore/redirect loop. Each role now gets its own keys;
// `lg_active_role` records whichever was written most recently so a fresh tab restore
// knows which namespace to prefer when both are present.
function _roleNS(role) { return role === 'student' ? 'student' : 'admin'; }
function _skey(base, role) { return `${base}_${_roleNS(role)}`; }
function _setActiveRole(role) { try { localStorage.setItem('lg_active_role', _roleNS(role)); } catch(_) {} }
function _roleNSOrder() {
  let hint = null;
  try { hint = localStorage.getItem('lg_active_role'); } catch(_) {}
  return hint === 'admin' ? ['admin', 'student'] : ['student', 'admin'];
}

// "عرض كطالب" (impersonation) support — admins land here via a synthetic trial-student
// JWT minted by /api/auth/impersonate. The banner lets them jump straight back to /admin/.
function _showTrialBanner() {
  const el = document.getElementById('trial-banner');
  if (el) el.style.display = 'flex';
}
function _exitTrialMode() {
  try { sessionStorage.removeItem(_skey('lg_session', 'student')); } catch(_) {}
  try { localStorage.removeItem(_skey('lg_xsession', 'student')); } catch(_) {}
  try { localStorage.removeItem(_skey('lg_remember', 'student')); } catch(_) {}
  window.location.href = '/admin/';
}
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('trial-banner-exit');
  if (btn) btn.addEventListener('click', _exitTrialMode);
  // Fade in if we arrived from a hard navigation (e.g. back from academic page)
  if (document.body.style.opacity === '0' || parseFloat(getComputedStyle(document.body).opacity) < 1) {
    requestAnimationFrame(() => {
      document.body.style.transition = 'opacity .25s ease';
      document.body.style.opacity = '1';
    });
  }
});

// Landing hero's school-name line — was hardcoded HTML text. Resolution
// order: this deployment's __APP_CONFIG (index.html, one line to edit for a
// different school) -> a remembered prior session on this browser -> a
// generic fallback for a fresh visitor with neither.
function _resolveLandingSchoolName() {
  if (window.__APP_CONFIG && window.__APP_CONFIG.schoolName) return window.__APP_CONFIG.schoolName;
  try {
    for (const key of ['lg_xsession_student', 'lg_xsession_admin', 'lg_remember_student', 'lg_remember_admin']) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (s && s.school && s.school !== '*') return s.school;
    }
  } catch(_) {}
  return 'منصة تعليمية حكومية معتمدة';
}
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('landing-school-name');
  if (el) el.textContent = _resolveLandingSchoolName();
});

// ── First + last name only (drops middle names) — shared by the access-link
// landing page and the WhatsApp send button so both show the same thing.
function firstLastName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return parts[0] + ' ' + parts[parts.length - 1];
}

// ── "أ | <name>" honorific prefix wherever an admin/supervisor's name is
// displayed (chat, broadcasts, topbar chip) — display-only, never applied
// to the underlying stored name so lookups/comparisons stay unaffected.
function adminLabel(name) {
  return name ? `أ | ${name}` : name;
}

// ── Account-access link ("?t=") landing ────────────────────────────────────
// Captured at script-parse time, NOT re-read from location.search later.
// show() rewrites the address bar via history.replaceState() to the plain
// path of whatever screen it opens ('/' for this one, since it has no
// _SCREEN_PATHS entry), which strips the "?t=..." query the moment the
// access-token screen is displayed. Anything that asks "are we on an access
// link?" after that point gets the wrong answer — which is exactly how the
// session-restore handler at the bottom of this file used to miss its own
// guard and overwrite this screen with the landing page.
const IS_ACCESS_LINK_FLOW = !!new URLSearchParams(window.location.search).get('t');

// The access link this page load came from, handed to /auth/student-login so
// the server can retire it once the student is genuinely signed in (a preview
// bot fetching the page never gets that far). Kept in memory only — show()
// wipes the query string, so it can't be re-read off the URL later.
let _accessLinkToken = new URLSearchParams(window.location.search).get('t') || '';

(function initAccessTokenLanding() {
  const t = new URLSearchParams(window.location.search).get('t');
  if (!t) return;
  // A one-time access link owns this page load outright — wipe every stored
  // admin/student session/remember-me entry up front, before anything else
  // runs, so a stale login on this device/browser can't influence this flow
  // in any way (the token exchange below never sent an Authorization header
  // from these anyway — _authToken only gets set by the session-restore path
  // this link's own guard skips — but clearing them removes any doubt and
  // stops a leftover "المدرسة" hint or auto-restore from a *later* plain
  // visit to '/' picking a stale identity back up).
  try {
    for (const role of ['student', 'admin']) {
      sessionStorage.removeItem(`lg_session_${role}`);
      localStorage.removeItem(`lg_xsession_${role}`);
      localStorage.removeItem(`lg_remember_${role}`);
    }
    localStorage.removeItem('lg_active_role');
  } catch (_) {}
  document.addEventListener('DOMContentLoaded', async () => {
    // The inline bootstrap script at the very top of index.html hides the
    // whole page (visibility:hidden) whenever ANY stored admin/student
    // session already exists on this device, to avoid a flash of the
    // landing screen before session-restore below decides where to send
    // it. But the session-restore handler bails out immediately when `?t=`
    // is present (this exact link owns the screen — see its own guard
    // further down) and never reaches the `visibility = ''` reset every
    // other branch there performs. Left alone, that meant any device that
    // ever had a login stored (e.g. the same phone/browser used to test
    // the admin panel) rendered this access-token screen invisible forever.
    document.documentElement.style.visibility = '';
    document.body.style.visibility = 'visible';
    show('screen-access-token');
    // Every exit from here must leave a visible card on screen — a silent
    // redirect or a blank page is never an acceptable outcome for a student
    // who just tapped their access link.
    const _atShow = (which) => {
      const loading = document.getElementById('at-loading');
      if (loading) loading.style.display = 'none';
      const card = document.getElementById(which);
      if (card) card.style.display = 'block';
    };
    try {
      const data = await apiFetch('/auth/access-token?t=' + encodeURIComponent(t));
      document.getElementById('at-name').textContent = firstLastName(data.name);
      document.getElementById('at-code').textContent = data.code || '';
      if (data.school) {
        const schoolEl = document.getElementById('at-school');
        schoolEl.textContent = 'مدرستك: ' + data.school;
        // Raw value kept on the element so useAccessCode() can preselect the
        // school without having to unpick it back out of the label text.
        schoolEl.dataset.school = data.school;
        schoolEl.style.display = 'block';
      }
      _atShow('at-success');
    } catch (e) {
      ActivityLog.error('رابط الدخول السريع: ' + (e && e.message ? e.message : 'خطأ غير معروف'));
      _atShow('at-error');
    }
  });
})();

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
    // A 401 while we believe we're logged in (_authToken set) means the
    // token itself expired/was revoked server-side mid-session — every
    // authenticated call on the current screen fails this way at once
    // (notifications, journey, tickets, ...), and until now each caller's
    // own catch just surfaced the raw "غير مصرح" server string with no
    // explanation, e.g. submitTicket()'s error banner. Handle it once,
    // globally, instead of teaching every call site about session expiry.
    if (res.status === 401 && _authToken) _handleExpiredSession();
    throw e;
  }
  ActivityLog.success(`✓ ${method} /api${path} — ${res.status}`);
  return data;
}

// A whole page's worth of authenticated calls (notifications, journey,
// tickets, plans...) all land 401 within the same tick once a token expires
// or gets revoked — this flag collapses that burst into a single cleanup +
// redirect instead of one toast/logout per failed request. Cleared after a
// few seconds so a genuinely new expiry later in a fresh session is still
// caught (not tied to login, since login itself never sets _authToken until
// AFTER it succeeds, so it can never trigger this path).
let _handlingExpiredSession = false;
function _handleExpiredSession() {
  if (_handlingExpiredSession) return;
  _handlingExpiredSession = true;
  setTimeout(() => { _handlingExpiredSession = false; }, 5000);
  const _exitingRole = State.role || 'student';
  _authToken = null;
  try { App.stopCooldownTimer(); } catch(_) {}
  try { clearInterval(App._chatTimer); } catch(_) {}
  try { stopIdleWatch(); } catch(_) {}
  try { App.stopNotifPolling(); } catch(_) {}
  State.student     = null;
  State.role        = null;
  State.admin       = null;
  State.navStack    = [];
  try { sessionStorage.removeItem(_skey('lg_session', _exitingRole)); } catch(_) {}
  try { localStorage.removeItem(_skey('lg_xsession', _exitingRole)); } catch(_) {}
  try { localStorage.removeItem(_skey('lg_remember', _exitingRole)); } catch(_) {}
  try {
    if (localStorage.getItem('lg_active_role') === _roleNS(_exitingRole)) localStorage.removeItem('lg_active_role');
  } catch(_) {}
  // Modals float above the .screen system regardless of which one is active
  // (position:fixed overlays) — closing only the screen underneath would
  // leave e.g. the new-ticket modal open on top, still showing whatever raw
  // "غير مصرح" text its own catch block put in its error banner.
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  show('screen-school');
  showToast('انتهت صلاحية جلستك — الرجاء تسجيل الدخول مرة أخرى');
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
    // Keep the unfiltered bank so section-choice (verbal/quant/both) — and any
    // retake that re-enters section-choice — can always re-filter from the full set.
    window._fullQuestionBank = window.QUESTION_BANK;
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
// Absolute paths, not relative "lessons/..." — this map is only ever
// rendered while /plan is the active screen today, but a relative href
// resolves against the CURRENT URL, not the site root, so it would silently
// break the moment this card is reused from a nested route. Absolute is
// correct regardless of where it's rendered from.
const SKILL_LESSONS = {
  v1: '/lessons/comprehension/',
  v2: '/lessons/contextual/',
  v3: '/lessons/inference/',
  v4: '/lessons/analogy/',
  v5: '/lessons/completion/',
  q5: '/lessons/statistics/',
  q1: '/lessons/arithmetic/',
  q2: '/lessons/algebra/',
  q3: '/lessons/geometry/',
  q4: '/lessons/comparison/',
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
  diagSection: null, // 'verbal' | 'quantitative' | 'both' — chosen on screen-section-choice
  testAnswers: {},
  currentQ: 0,
  tab: 'students',
  currentPlan: null,
  _quizTree: null,       // cached GET /api/quiz-structure response for the quiz hub
  _quizSection: null,    // 'verbal' | 'quantitative' — currently browsed section
  _quizLevel: null,      // 'easy' | 'medium' | 'advanced' — currently browsed level
  _academicGrade: null,  // 'g10' | 'g11' | 'g12' — currently browsed grade on screen-academic-subjects
  qz: null,              // { quizSkillId, questions, idx, answers } — active skill quiz
  detailStudentId: null, // student currently open in detail modal
  navStack: [], // screens visited, for goBack() — lets "رجوع" return to
                // wherever the student actually came from instead of a
                // single hardcoded target
  pendingAction: null, // set by App.requireAuth() when a gated FAQ action is
                       // triggered while logged out — run once right after login
};

// ── Screen router ─────────────────────────────────────────────────────────
// Approved "Clean Slugs Routing Map" — reviewed and signed off before this
// was wired up (see the routing inventory artifact). Every screen gets its
// own real, addressable, refresh-safe URL; no two screens share a path.
const _SCREEN_PATHS = {
  'screen-landing':       '/',
  'screen-school':        '/select-school',
  'screen-identity':      '/select-role',
  'screen-student-login': '/login/student',
  'screen-admin-login':   '/login/admin',
  'screen-support-login': '/login/support',

  'screen-student-home':  '/home',
  'screen-history':       '/history',
  'screen-chat':          '/messages',
  'screen-support-hub':   '/support',
  'screen-tickets':       '/support/tickets',
  'screen-about':         '/about',
  'screen-faq':           '/faq',
  'screen-journey-full':  '/journey',

  'screen-intro':          '/diagnostic',
  'screen-section-choice': '/diagnostic/section',
  'screen-selfdiag':       '/diagnostic/self-assessment',
  'screen-pretest-intro':  '/diagnostic/instructions',
  'screen-pretest':        '/diagnostic/test',
  'screen-level-analysis': '/diagnostic/results',
  'screen-cooldown':       '/diagnostic/cooldown',

  'screen-support-plan':  '/plan',
  'screen-training-plan': '/plan/schedule',

  'screen-academic':      '/academic',
  'screen-study':         '/study',
  'screen-lessons':       '/lessons',
  // screen-academic-subjects has a STATE-dependent path (grade) — see
  // _dynamicPathFor() below, same pattern as the quiz hub's sub-screens.

  'screen-general-tests':       '/mock-tests',
  'screen-general-test-take':   '/mock-tests/take',
  'screen-general-test-result': '/mock-tests/result',

  'screen-quiz-hub':          '/skills',
  'screen-quiz-progress':     '/skills/progress',
  'screen-quiz-skill-result': '/skills/result',
  // screen-quiz-levels / screen-quiz-skills / screen-quiz-take have
  // STATE-dependent paths (section/level/skill) — see _dynamicPathFor()
  // below; they're deliberately absent from this static map, and from
  // _PATH_TO_SCREEN (resolvePath() below matches their /skills/... shape
  // directly instead).

  // 'screen-admin' (retired legacy in-SPA admin panel — every live admin/
  // director login path redirects straight to the React dashboard at
  // /admin/ instead of ever calling show('screen-admin')),
  // 'screen-access-token' (lives entirely behind the ?t= query string, see
  // DOMContentLoaded below — never goes through show()), and
  // 'screen-loading'/'screen-processing' (purely transient) intentionally
  // have no entry — show() falls back to '/' for any unmapped screen.
};

// Screens whose URL depends on in-flight State rather than a fixed string —
// built from the exact same State their own render functions already read,
// so the address bar can never drift out of sync with what's on screen.
function _dynamicPathFor(id) {
  if (id === 'screen-academic-subjects') {
    return State._academicGrade ? `/academic/${State._academicGrade}` : '/academic';
  }
  if (id === 'screen-quiz-levels') {
    return State._quizSection ? `/skills/${State._quizSection}` : '/skills';
  }
  if (id === 'screen-quiz-skills') {
    return (State._quizSection && State._quizLevel)
      ? `/skills/${State._quizSection}/${State._quizLevel}` : '/skills';
  }
  if (id === 'screen-quiz-take') {
    const qsId = State.qz && State.qz.quizSkillId;
    // Seeded as `${section}-${level}-${skillId}` server-side — the short
    // skill code (e.g. "v1") is always the final hyphen-delimited segment.
    const skillCode = qsId ? qsId.slice(qsId.lastIndexOf('-') + 1) : null;
    return (State._quizSection && State._quizLevel && skillCode)
      ? `/skills/${State._quizSection}/${State._quizLevel}/${skillCode}` : '/skills';
  }
  return null;
}

function _pathForScreen(id) {
  return _dynamicPathFor(id) || _SCREEN_PATHS[id] || '/';
}

const _PATH_TO_SCREEN = Object.fromEntries(
  Object.entries(_SCREEN_PATHS).map(([id, path]) => [path, id])
);
const _QUIZ_SECTIONS = ['verbal', 'quantitative'];
const _QUIZ_LEVELS = ['easy', 'medium', 'advanced'];
const _ACADEMIC_GRADES = ['g10', 'g11', 'g12'];

// Reverse of _pathForScreen() — turns a URL back into { screenId, params },
// or null for anything unrecognized. Used on every popstate (browser back/
// forward) and once at boot to restore a direct-entry/refreshed deep link.
function resolvePath(pathname) {
  // "/academic" has a real subdirectory on disk (biology-g1/), so express.static
  // 301-redirects a trailing-slash-less request there to "/academic/" before this
  // ever runs — a plain refresh on that screen would otherwise land back on the
  // landing screen instead of restoring it. Normalize so both forms match.
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  if (_PATH_TO_SCREEN[pathname]) return { screenId: _PATH_TO_SCREEN[pathname], params: {} };
  const parts = pathname.split('/').filter(Boolean); // "/skills/verbal/easy" -> ['skills','verbal','easy']
  // "/academic/g10" — the only academic sub-path handled client-side; a
  // second segment that isn't a known grade slug (e.g. "biology-g1") is a
  // real static page under /academic/ and falls through to the server.
  if (parts[0] === 'academic' && parts.length === 2 && _ACADEMIC_GRADES.includes(parts[1])) {
    return { screenId: 'screen-academic-subjects', params: { grade: parts[1] } };
  }
  if (parts[0] !== 'skills' || !parts[1]) return null;
  const section = parts[1];
  if (!_QUIZ_SECTIONS.includes(section)) return null;
  if (parts.length === 2) return { screenId: 'screen-quiz-levels', params: { section } };
  const level = parts[2];
  if (!_QUIZ_LEVELS.includes(level)) return null;
  if (parts.length === 3) return { screenId: 'screen-quiz-skills', params: { section, level } };
  if (parts.length === 4) return { screenId: 'screen-quiz-take', params: { section, level, skill: parts[3] } };
  return null;
}

// Transient/loading screens never make sense as a "back" target — never push them.
const _NAV_STACK_EXCLUDE = new Set(['screen-loading', 'screen-processing']);
let _isBackNav = false;
// True only while restoreFromPath() below is reconstructing multi-step state
// (e.g. hub -> levels -> skills for a /skills/verbal/easy deep link) — every
// show() call in that chain replaces the address bar instead of pushing, so
// a direct deep link always ends up exactly ONE history entry deep, not one
// per intermediate step the student never actually clicked through.
let _restoringFromPath = false;

// Counts real history.pushState() calls made by this SPA session (never
// incremented by replaceState) and is restamped from history.state.depth on
// every popstate — lets goBack() tell "there's a genuine prior entry in
// THIS session to pop" from "we only ever replaceState'd here" (e.g. a deep
// link resolved through restoreFromPath's replaceState chain, or the very
// first screen this session ever showed). That distinction is what makes it
// safe for goBack() to call the browser's own history.back() instead of
// replaceState-ing "backward": calling it when depth is 0 could walk the
// user straight out of the app into whatever page was open before it, since
// there'd be no real SPA-pushed entry underneath to land on.
let _historyDepth = 0;

// screen-loading is a shared full-screen spinner reused for several unrelated
// waits (session restore, capabilities/plan load, quiz/test submission) — its
// caption is set per-call so it never says "جارٍ تسجيل الدخول" (logging in)
// for something that isn't actually a login.
//
// Shows it right away — no debounce. Only for a wait that's already known to
// be short and fixed (a deliberate small setTimeout before navigating to a
// separate static page, giving the browser one paint to show something
// branded instead of a blank flash) rather than a network request of
// unknown duration. showLoadingScreen() below is what every network-bound
// call site uses instead.
let _loadingTimer = null;
function _showLoadingScreenNow(text) {
  clearTimeout(_loadingTimer);
  _loadingTimer = null;
  const el = document.getElementById('screen-loading-text');
  if (el) el.textContent = text;
  show('screen-loading');
}

// Debounced (400ms): the spinner only ever appears once whatever's
// happening — a fetch, a session restore — has genuinely taken longer than
// that. A fast connection or already-cached data finishes well under 400ms,
// so the transition is instant and the spinner never appears at all; only
// real network slowness shows it. Any show() call in the meantime (the
// request finished, or navigation happened another way) cancels the
// pending timer via show()'s own cleanup below, so a stale spinner can
// never pop up over a screen the student has already moved on to.
function showLoadingScreen(text) {
  clearTimeout(_loadingTimer);
  _loadingTimer = setTimeout(() => {
    _loadingTimer = null;
    _showLoadingScreenNow(text);
  }, 400);
}

// `opts.fromPopstate` — set only by the popstate listener below. The
// browser has ALREADY moved the history position by the time popstate
// fires, so this is the one case show() must never call pushState/
// replaceState itself: doing so would fight the back/forward button
// instead of following it. Every other caller (a click, goBack(), boot
// restoration) leaves this false/unset, which is the default.
// Many cards across the app (.service-card, on the home screen and on
// screen-academic/-subjects/-study/-lessons) are clickable <div>s with an
// inline onclick, not real <button>s — a real button-per-card conversion
// would touch every one of those onclick call sites across a 3000+ line
// file. Instead: every such div gets keyboard-operable in one place, right
// where it becomes visible, via a real tabindex + role and a single
// document-level Enter/Space handler — same end result (Tab reaches it,
// Enter/Space activates it, a screen reader announces it as a button) with
// a much smaller blast radius than rewriting the markup.
function _makeCardsAccessible(root) {
  (root || document).querySelectorAll('.service-card[onclick]:not([tabindex])').forEach(el => {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.service-card[onclick][role="button"]');
  if (!card) return;
  e.preventDefault();
  card.click();
});

function show(id, opts) {
  opts = opts || {};
  // Whatever showLoadingScreen()'s 400ms timer was waiting on is over now —
  // the screen is changing one way or another. Cancel it so a delayed
  // spinner can never pop up after the fact over whatever's shown next.
  clearTimeout(_loadingTimer);
  _loadingTimer = null;
  const current = document.querySelector('.screen.active');
  const skipStackPush = _isBackNav || opts.fromPopstate;
  if (current && current.id !== id && !skipStackPush && !_NAV_STACK_EXCLUDE.has(current.id)) {
    State.navStack.push(current.id);
  }
  const wasBackNav = _isBackNav;
  _isBackNav = false;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'screen-home-entered');
  });
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    // Always land at the very top of the new screen — instant, not smooth,
    // so it never reads as a lagging scroll animation on top of the screen
    // swap itself. html/body both get `height:100%` (see style.css) with no
    // overflow-y set, which computes to 'auto' on both — so on any screen
    // whose content overflows the viewport, BODY itself becomes the actual
    // scrolling box, entirely independent of window.scrollY/documentElement
    // (confirmed live: setting document.body.scrollTop directly moves it
    // while window.scrollY stays 0). window.scrollTo() alone never touched
    // that offset, which is exactly why long screens like
    // screen-academic-subjects/screen-faq kept opening mid-scroll after
    // being reached from a scrolled-down screen. Also zero out the screen's
    // own scrollTop and that of any internal scroll container it carries
    // (e.g. a long FAQ list) — on some mobile browsers a container that was
    // mid-scroll keeps its scrollTop across the display:none/active toggle.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    el.scrollTop = 0;
    el.querySelectorAll('.page-wrap, [data-scroll-reset]').forEach(c => { c.scrollTop = 0; });
    // Re-assert one frame later: some screens render/measure content that
    // changes document height right after this point, and Chrome's scroll
    // anchoring can shift the scroll position again while that layout
    // settles — a plain synchronous reset above isn't always the last word.
    requestAnimationFrame(() => {
      if (!el.classList.contains('active')) return;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      el.scrollTop = 0;
    });
    _makeCardsAccessible(el);
  }

  if (!opts.fromPopstate) {
    const path = _pathForScreen(id);
    // Every entry we create carries a snapshot of navStack (and _historyDepth
    // for pushState below) in history.state — popstate restores App state
    // from THIS, not by re-deriving it, so real browser back/forward always
    // reconstructs the exact navStack a click-driven goBack() would have
    // produced at that point. Without this, hardware back/forward and the
    // in-app "رجوع" button silently drift out of sync with each other.
    const stateSnapshot = { navStack: [...State.navStack], depth: _historyDepth };
    if (location.pathname === path) {
      // Same URL already — just keep the entry's title/etc. current, no new entry.
      history.replaceState(stateSnapshot, '', path);
    } else if (wasBackNav || _restoringFromPath) {
      // goBack() already "consumed" a step via State.navStack, or this is
      // one of several show() calls restoreFromPath() is chaining through
      // to reconstruct multi-step state — either way, sync the address bar
      // without growing browser history for it.
      history.replaceState(stateSnapshot, '', path);
    } else {
      _historyDepth++;
      stateSnapshot.depth = _historyDepth;
      history.pushState(stateSnapshot, '', path);
    }
  }
  // Stagger home-screen cards
  if (id === 'screen-student-home' && el) {
    el.classList.add('screen-home-entered');
    const sc = el.querySelector('.service-cards');
    if (sc) {
      sc.classList.remove('animate');
      requestAnimationFrame(() => requestAnimationFrame(() => sc.classList.add('animate')));
    }
    // First-ever visit to home — show the onboarding tour once, then never
    // again. On a brand-new account the welcome modal comes first and owns the
    // screen: the tour's full-screen overlay would otherwise render on top of
    // it and swallow every click, leaving the student staring at a modal whose
    // button does nothing. completeStudentOnboarding() starts the tour itself
    // once that modal is dismissed.
    if (!localStorage.getItem(_skey('lg_tour_seen', 'student')) && !App._shouldShowWelcome()) {
      setTimeout(startOnboardingTour, 500);
    }
  }
}

// ── Onboarding Tour (first visit to student home only) ────────────────────
const ONBOARDING_TOUR_STEPS = [
  { selector: '#notif-bell-student', title: '🔔 الإشعارات', text: 'هنا تصلك كل إشعاراتك — رسائل المشرف، ردود الدعم الفني، وتنبيهات الاختبارات.' },
  { selector: '.tb-theme-btn', title: '🌙 المظهر', text: 'بدّل بين الوضع الفاتح والداكن حسب راحتك.' },
  // #sh-journey (not a sub-element inside it) — it exists synchronously in the
  // DOM even before App.loadJourney()'s async fetch fills it in, so the tour
  // never races the network the way targeting a rendered-in sub-element would.
  { selector: '#sh-journey', title: '🧭 مسار إنجازك', text: 'هنا رحلتك — تشخيصك، مهاراتك، وخطوتك التالية دائمًا في مكان واحد.' },
  { selector: '.quick-actions', title: '⚡ إجراءات سريعة', text: 'الشروحات، التواصل مع المشرف، الأسئلة الشائعة، والدعم الفني — كلها من هنا.' },
];

function startOnboardingTour() {
  // .tb-theme-btn (and, less critically, the others) exist once per screen —
  // an unscoped querySelector grabs whichever copy comes first in the whole
  // document, which is almost never the one on the visible home screen and
  // collapses to a zero-size rect (display:none ancestor), throwing the
  // spotlight/bubble into the top-left corner. Scope every lookup to the
  // home screen's own subtree instead.
  const root = document.getElementById('screen-student-home');
  if (!root) return;

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  const spotlight = document.createElement('div');
  spotlight.className = 'tour-spotlight';
  const bubble = document.createElement('div');
  bubble.className = 'tour-bubble';
  document.body.append(overlay, spotlight, bubble);

  let i = 0;

  function position(el) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    spotlight.style.top = (r.top - pad) + 'px';
    spotlight.style.left = (r.left - pad) + 'px';
    spotlight.style.width = (r.width + pad * 2) + 'px';
    spotlight.style.height = (r.height + pad * 2) + 'px';

    const bw = bubble.offsetWidth || 300, bh = bubble.offsetHeight || 140;
    const margin = 12;
    const spaceBelow = window.innerHeight - (r.bottom + pad);
    const top = spaceBelow > bh + 24
      ? Math.min(r.bottom + pad + 16, window.innerHeight - bh - margin)
      : Math.max(margin, r.top - pad - bh - 16);
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - bw / 2), window.innerWidth - bw - margin);
    bubble.style.top = Math.max(margin, top) + 'px';
    bubble.style.left = left + 'px';
  }

  function renderStep() {
    const step = ONBOARDING_TOUR_STEPS[i];
    if (!step) { endTour(); return; }
    const el = root.querySelector(step.selector);
    if (!el) { i++; renderStep(); return; }

    const isLast = i === ONBOARDING_TOUR_STEPS.length - 1;
    bubble.innerHTML = `
      <div style="font-size:11.5px;color:var(--muted);font-weight:700;margin-bottom:6px;">${i + 1} من ${ONBOARDING_TOUR_STEPS.length}</div>
      <div style="font-weight:800;font-size:15px;margin-bottom:6px;">${escapeHtml(step.title)}</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:14px;">${escapeHtml(step.text)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <a href="#" class="tour-skip">تخطي</a>
        <button type="button" class="btn btn-primary btn-sm tour-next">${isLast ? 'إنهاء ✓' : 'التالي ←'}</button>
      </div>`;
    bubble.querySelector('.tour-skip').onclick = (e) => { e.preventDefault(); endTour(); };
    bubble.querySelector('.tour-next').onclick = () => { i++; renderStep(); };

    // Skip the scroll for a target that's already fully in view (e.g. the
    // notif bell / theme toggle, both inside the sticky topbar) — calling
    // scrollIntoView on an already-visible element still triggers mobile
    // Safari's address-bar collapse, which changes window.innerHeight right
    // as we're about to measure it and throws the spotlight/bubble off.
    const preRect = el.getBoundingClientRect();
    const alreadyVisible = preRect.top >= 0 && preRect.bottom <= window.innerHeight;
    if (!alreadyVisible) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    // Two rAFs (not a fixed timeout) so we measure right after the browser's
    // own smooth-scroll has actually settled, regardless of scroll distance/device speed.
    let tries = 0;
    const settle = () => {
      position(el);
      if (tries++ < 6) requestAnimationFrame(() => setTimeout(settle, 60));
    };
    requestAnimationFrame(settle);
  }

  function onKeydown(e) { if (e.key === 'Escape') endTour(); }
  document.addEventListener('keydown', onKeydown);

  function endTour() {
    overlay.remove(); spotlight.remove(); bubble.remove();
    document.removeEventListener('keydown', onKeydown);
    try { localStorage.setItem(_skey('lg_tour_seen', 'student'), '1'); } catch (_) {}
  }

  renderStep();
}

// Pops `n` steps off navStack. If this session genuinely pushed that many
// real history entries since the last back-navigation (_historyDepth >= n),
// hands off to the browser's own history.go(-n) instead of replaceState-ing
// the screen in place — that's what actually shrinks the browser's real
// history stack, instead of leaving the entries we're logically "leaving"
// sitting there as phantom forward history. (That drift is exactly what
// used to make the hardware/browser back button resurrect a screen the
// student had already backed out of via the in-app button, or made a
// second back-button press look like it "double-hopped".) The popstate
// handler below restores State.navStack and _historyDepth from
// history.state once the browser actually lands on that entry.
//
// Falls back to a plain show() + replaceState (the old behavior) only when
// there's no real entry to go back to — e.g. a deep link that reached this
// screen entirely through restoreFromPath()'s replaceState chain, where
// navStack has logical entries but the browser's own history never grew.
function _goBackSteps(n, fallbackId) {
  let target = fallbackId;
  for (let i = 0; i < n; i++) {
    const popped = State.navStack.pop();
    if (i === n - 1) target = popped || fallbackId;
  }
  if (_historyDepth >= n) {
    history.go(-n);
    return;
  }
  _isBackNav = true;
  show(target);
  // Home's dynamic bits (plan banner, performance card, notifications) need a
  // refresh no matter which route lands us there — safe to call repeatedly.
  if (target === 'screen-student-home') App.renderStudentHome();
}

// Returns to the screen actually visited before this one; falls back to a
// fixed target only when there's no real history (e.g. after a fresh
// deep-link load straight into a sub-page).
function goBack(fallbackId) {
  _goBackSteps(1, fallbackId);
}

// Browser back/forward button — fires for BOTH a hardware/gesture back-
// button press AND the in-app "رجوع" button when goBack()/_goBackSteps()
// hands off to history.go()/history.back() (see there for why). The two no
// longer keep separate bookkeeping: the very first thing this does is
// restore State.navStack and _historyDepth from history.state, which show()
// stamps onto every entry it creates — so whichever mechanism the student
// used to get here, the in-app "رجوع" button's next press always pops the
// correct logical predecessor instead of a stale one. Falls back to an
// empty navStack / zero depth for an entry with no state (e.g. one from
// before a hard refresh, or the very first entry this tab ever had).
//
// The screen itself still resolves straight from location.pathname
// (resolvePath()), not from history.state — a single, uniform code path
// with no dependency on whether a given entry happens to carry state. For
// the vast majority of screens this is a pure, instant, zero-fetch DOM
// class swap — the screen's earlier render is still sitting in the DOM
// exactly as left. Only the 3 State-driven /skills/... screens re-render
// (still zero network — a synchronous read of the already-cached
// State._quizTree), since the SAME DOM element is reused for every
// section/level and would otherwise still show whichever one was rendered
// last.
window.addEventListener('popstate', (event) => {
  _historyDepth = (event.state && typeof event.state.depth === 'number') ? event.state.depth : 0;
  State.navStack = (event.state && Array.isArray(event.state.navStack)) ? event.state.navStack : [];

  const resolved = resolvePath(location.pathname);
  if (!resolved) return; // unrecognized path (e.g. left the app and came back) — leave the screen as-is
  const { screenId, params } = resolved;

  if (screenId === 'screen-academic-subjects') {
    State._academicGrade = params.grade;
    App.renderAcademicSubjects(params.grade);
    show(screenId, { fromPopstate: true });
    return;
  }
  if (screenId === 'screen-quiz-levels') {
    State._quizSection = params.section;
    if (State._quizTree) App.renderQuizLevels();
    show(screenId, { fromPopstate: true });
    return;
  }
  if (screenId === 'screen-quiz-skills') {
    State._quizSection = params.section;
    State._quizLevel = params.level;
    if (State._quizTree) App.renderQuizSkills();
    show(screenId, { fromPopstate: true });
    return;
  }
  if (screenId === 'screen-quiz-take') {
    // A mid-attempt quiz is anti-cheat/ephemeral, same as the diagnostic
    // test itself — never resumed via back/forward. Land on that skill's
    // own list instead, and correct the URL to match what's actually shown.
    State._quizSection = params.section;
    State._quizLevel = params.level;
    if (State._quizTree) App.renderQuizSkills();
    show('screen-quiz-skills', { fromPopstate: true });
    history.replaceState({ navStack: [...State.navStack], depth: _historyDepth }, '', _pathForScreen('screen-quiz-skills'));
    return;
  }
  show(screenId, { fromPopstate: true });
});

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

  // ── Recover login code via WhatsApp OTP ─────────────────────────────────
  // 3-step modal (phone -> OTP -> reveal), state kept local to State._recoverOtp.
  // No navigation/screen-stack entry — a plain overlay on top of screen-student-login.
  openRecoverOtp() {
    State._recoverOtp = { phone: '' };
    document.getElementById('ro-phone').value = '';
    document.getElementById('ro-phone-err').classList.remove('show');
    document.getElementById('ro-fill-pill').style.display = 'none';
    document.getElementById('ro-active-ring').classList.remove('show');
    document.getElementById('ro-step-otp').classList.remove('ro-step-otp-morphing');
    document.getElementById('ro-success-burst').hidden = true;
    document.getElementById('ro-error-card').hidden = true;
    App._roShowStep('phone');
    document.getElementById('recover-otp-modal').classList.add('open');
    setTimeout(() => document.getElementById('ro-phone')?.focus(), 50);
    App._roSetupOtpBoxes();
  },

  closeRecoverOtp() {
    document.getElementById('recover-otp-modal').classList.remove('open');
  },

  _roShowStep(name) {
    ['phone', 'otp', 'reveal'].forEach(s => {
      const el = document.getElementById('ro-step-' + s);
      if (el) el.style.display = s === name ? '' : 'none';
    });
  },

  _roSetupOtpBoxes() {
    if (App._roOtpBound) return;
    App._roOtpBound = true;
    const boxes = Array.from(document.querySelectorAll('.ro-otp-box'));
    const pop = (box) => { box.classList.remove('ro-just-filled'); void box.offsetWidth; box.classList.add('ro-just-filled'); };
    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
        if (box.value) { pop(box); if (boxes[i + 1]) boxes[i + 1].focus(); else App._roPositionRing(); }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && boxes[i - 1]) boxes[i - 1].focus();
        if (e.key === 'Enter') App.recoverOtpVerify();
      });
      box.addEventListener('focus', () => App._roPositionRing());
      box.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        if (!text) return;
        e.preventDefault();
        text.slice(0, 4).split('').forEach((ch, j) => { if (boxes[j]) { boxes[j].value = ch; pop(boxes[j]); } });
        (boxes[Math.min(text.length, 4) - 1] || boxes[3]).focus();
      });
    });
  },

  // Glides the single .ro-active-ring element to sit around whichever box
  // is "active" (the first empty one, or the last box once all are filled)
  // — one continuously-transitioning element reads as a moving spotlight,
  // instead of restyling four static borders.
  _roPositionRing() {
    const wrap = document.getElementById('ro-otp-wrap');
    const ring = document.getElementById('ro-active-ring');
    if (!wrap || !ring) return;
    const boxes = Array.from(document.querySelectorAll('.ro-otp-box'));
    const target = boxes.find(b => !b.value) || boxes[boxes.length - 1];
    if (!target) return;
    const wrapRect = wrap.getBoundingClientRect();
    const boxRect = target.getBoundingClientRect();
    ring.style.transform = `translate(${boxRect.left - wrapRect.left}px, ${boxRect.top - wrapRect.top}px)`;
    ring.classList.add('show');
  },

  // Dev/local-only auto-fill: the pill only ever appears when the backend
  // returned a devCode (SendPulse isn't configured in that environment —
  // see /auth/recover/request), so this never has a real OTP to leak in
  // production. Fills the boxes with a staggered animation, mirroring the
  // "tap to fill" pill an SMS/WhatsApp autofill suggestion would show.
  recoverOtpAutofill() {
    const code = State._recoverOtp?.devCode;
    if (!/^\d{4}$/.test(code || '')) return;
    const boxes = Array.from(document.querySelectorAll('.ro-otp-box'));
    document.getElementById('ro-fill-pill').style.display = 'none';
    code.split('').forEach((digit, i) => {
      setTimeout(() => {
        boxes[i].value = digit;
        boxes[i].classList.remove('ro-just-filled'); void boxes[i].offsetWidth; boxes[i].classList.add('ro-just-filled');
        App._roPositionRing();
        if (i === boxes.length - 1) setTimeout(() => App.recoverOtpVerify(), 350);
      }, i * 110);
    });
  },

  // Anti-enumeration: this always advances to the OTP step on any successful
  // response — the backend itself never reveals whether the phone matched
  // an account (see POST /auth/recover/request), so there is nothing here
  // to branch on. Only client-side format/rate-limit failures short-circuit.
  async recoverOtpRequest(isResend) {
    const phoneInput = document.getElementById('ro-phone');
    const errEl = document.getElementById('ro-phone-err');
    const phone = isResend ? State._recoverOtp?.phone : phoneInput.value.trim();
    if (!/^05\d{8}$/.test(phone || '')) {
      if (!isResend) { errEl.textContent = 'أدخل رقم جوال صحيح (05xxxxxxxx).'; errEl.classList.add('show'); }
      return;
    }
    const btn = document.getElementById('ro-request-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> جارٍ الإرسال…'; }
    try {
      const res = await apiFetch('/auth/recover/request', { method: 'POST', body: JSON.stringify({ phone }) });
      State._recoverOtp = { phone };
      document.getElementById('ro-phone-echo').textContent = phone;
      App.recoverOtpRetry(); // fresh boxes, ring, and no stale error card
      App._roShowStep('otp');
      setTimeout(() => { document.querySelector('.ro-otp-box')?.focus(); App._roPositionRing(); }, 50);
      if (isResend) showToast('تم إرسال رمز جديد');
      if (res?.devCode) {
        State._recoverOtp.devCode = res.devCode;
        document.getElementById('ro-fill-code').textContent = res.devCode;
        document.getElementById('ro-fill-pill').style.display = 'flex';
      } else {
        document.getElementById('ro-fill-pill').style.display = 'none';
      }
    } catch (e) {
      const status = e?.status;
      const msg = status === 429 ? 'طلبات كثيرة — أعد المحاولة بعد قليل'
        : (e?.message || 'تعذّر إرسال الطلب');
      if (isResend) { showToast(msg); } else { errEl.textContent = msg; errEl.classList.add('show'); }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'متابعة'; }
    }
  },

  // Resets the OTP step back to a clean input state — used both when the
  // step is first shown and when "إعادة المحاولة" dismisses the error card.
  recoverOtpRetry() {
    document.querySelectorAll('.ro-otp-box').forEach(b => b.value = '');
    document.getElementById('ro-step-otp').classList.remove('ro-step-otp-morphing');
    document.getElementById('ro-error-card').hidden = true;
    document.getElementById('ro-active-ring').classList.remove('show');
    const boxes = document.querySelectorAll('.ro-otp-box');
    if (boxes[0]) { boxes[0].focus(); }
    App._roPositionRing();
  },

  async recoverOtpVerify() {
    const boxes = Array.from(document.querySelectorAll('.ro-otp-box'));
    const code = boxes.map(b => b.value).join('');
    if (!/^\d{4}$/.test(code)) { boxes.find(b => !b.value)?.focus(); return; }
    const btn = document.getElementById('ro-verify-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> جارٍ التحقق…'; }
    const otpStep = document.getElementById('ro-step-otp');
    try {
      const res = await apiFetch('/auth/recover/verify', {
        method: 'POST', body: JSON.stringify({ phone: State._recoverOtp.phone, code }),
      });
      State._recoverOtp.accessCode = res.access_code;
      document.getElementById('ro-name-echo').textContent = res.name || '';
      document.getElementById('ro-code-box').textContent = res.access_code;
      const copyBtn = document.getElementById('ro-copy-btn');
      copyBtn.classList.remove('ro-copied');
      document.getElementById('ro-copy-label').textContent = 'نسخ رقم الدخول';
      // Morph transition: the OTP boxes shrink/fade while a pulsing
      // checkmark burst plays in their place, then step-reveal takes over
      // once the burst has had time to read — see .ro-step-otp-morphing.
      const burst = document.getElementById('ro-success-burst');
      otpStep.classList.add('ro-step-otp-morphing');
      burst.hidden = false;
      setTimeout(() => {
        App._roShowStep('reveal');
        otpStep.classList.remove('ro-step-otp-morphing');
        burst.hidden = true;
      }, 650);
      return;
    } catch (e) {
      const status = e?.status;
      // The backend only checks account existence AFTER the code itself
      // matches (see /auth/recover/verify) — a code is generated and stored
      // for every phone number regardless of registration, so a wrong-code
      // guess can never reveal whether the phone has an account. That
      // makes each status genuinely distinct, not a security trade-off:
      //   401 — code exists for this phone, submitted value didn't match.
      //   410 — no live code at all (never requested, or expired).
      //   404 — the code WAS correct, but no student owns this phone.
      // Only 404 gets the support link — it's the one case where "try
      // again" can't fix anything. Anything else (network error, timeout,
      // 5xx, dead server) is an infrastructure problem and must say so
      // honestly rather than being folded into any of the above.
      const showSupport = status === 404;
      const msg = status === 429 ? 'تجاوزت عدد المحاولات المسموح — أعد المحاولة لاحقًا'
        : status === 401 ? 'رمز التحقق غير صحيح — حاول مرة أخرى'
        : status === 410 ? 'انتهت صلاحية رمز التحقق — اطلب رمزًا جديدًا'
        : status === 404 ? 'لا يوجد حساب مرتبط برقم الجوال هذا. إذا كنت تعتقد أن لديك حسابًا أو تحتاج إلى مساعدة، يرجى التواصل مع الدعم الفني.'
        : (e?.message || '').includes('TIMEOUT') ? 'انتهت مهلة الاتصال — تحقق من الإنترنت وأعد المحاولة'
        : (!navigator.onLine || (e?.message || '').includes('NETWORK_ERROR')) ? 'لا يوجد اتصال بالخادم — تحقق من الشبكة وأعد المحاولة'
        : 'تعذّر الاتصال بالخادم — حاول مرة أخرى';
      document.getElementById('ro-error-text').textContent = msg;
      document.getElementById('ro-error-support').hidden = !showSupport;
      otpStep.classList.add('ro-step-otp-morphing');
      setTimeout(() => { document.getElementById('ro-error-card').hidden = false; }, 350);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'تحقق'; }
    }
  },

  recoverOtpCopy() {
    const code = document.getElementById('ro-code-box').textContent || '';
    const btn = document.getElementById('ro-copy-btn');
    const slot = document.getElementById('ro-copy-icon-slot');
    const label = document.getElementById('ro-copy-label');
    navigator.clipboard?.writeText(code).then(() => {
      if (!btn) return;
      slot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      label.textContent = 'تم النسخ'; btn.classList.add('ro-copied');
      setTimeout(() => {
        slot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
        label.textContent = 'نسخ رقم الدخول'; btn.classList.remove('ro-copied');
      }, 2000);
    }).catch(() => {});
  },

  roLoginNow() {
    const code = State._recoverOtp?.accessCode;
    if (!code) return;
    App.closeRecoverOtp();
    const input = document.getElementById('sl-code');
    if (input) input.value = code;
    App.studentLogin();
  },

  // ── Student Login ────────────────────────────────────────────────────────
  async studentLogin() {
    const code = document.getElementById('sl-code').value.trim();
    const errEl = document.getElementById('sl-err');
    if (!/^\d{10}$/.test(code)) {
      showAlert(errEl, 'الرجاء إدخال رقم الدخول (١٠ أرقام).'); return;
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
        body: JSON.stringify({
          code,
          school: State.school || '',
          ...(_accessLinkToken ? { accessToken: _accessLinkToken } : {}),
        }),
        timeout: 5000,
      });
      token = data.token;
      student = { id: data.student.id, code, name: data.student.name, school: data.student.school || '', phone: data.student.phone || '', has_seen_welcome: !!data.student.has_seen_welcome };
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
        _restoreBtn(); showAlert(errEl, 'رقم الدخول يجب أن يكون ١٠ أرقام إنجليزية.'); return;
      }
      if (status === 401 || msg.includes('غير صحيحة')) {
        _restoreBtn(); showAlert(errEl, 'بيانات الدخول غير صحيحة — تحقق من رقم الدخول.'); return;
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
      _authToken = token;
      // Consumed server-side by the call above — don't resend it on any later
      // login in this tab (e.g. after a logout), which would be a no-op at
      // best and confusing in the logs at worst.
      _accessLinkToken = '';
      ActivityLog.success(`🎓 تسجيل دخول طالب: ${student.name} (${code}) — ${student.school || '—'}`);
      serverLog('success', 'login', `تسجيل دخول طالب: ${student.name}`, { user_name: student.name, user_role: 'student', school: student.school || '' });
      State.student = student;
      State.role = 'student';
      if (student.school) { State.school = student.school; App._updateSchoolDisplay(student.school); }
      const _sess = { role: 'student', id: student.id, code, name: student.name, school: student.school, phone: student.phone || '', token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
      try { sessionStorage.setItem(_skey('lg_session', 'student'), JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem(_skey('lg_xsession', 'student'), JSON.stringify(_sess)); } catch(_) {}
      _setActiveRole('student');
      const remember = document.getElementById('sl-remember');
      if (remember && remember.checked) {
        try { localStorage.setItem(_skey('lg_remember', 'student'), JSON.stringify({ role: 'student', code, name: student.name, school: student.school || '', expiry: Date.now() + 2 * 24 * 60 * 60 * 1000 })); } catch(_) {}
      } else {
        try { localStorage.removeItem(_skey('lg_remember', 'student')); } catch(_) {}
      }
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(student.name);
      const _minWait = new Promise(r => setTimeout(r, 700));
      try { await Promise.all([DB.loadStudentData(), _minWait]); } catch (_) { await _minWait; }
      App.renderStudentHome();
      document.documentElement.style.visibility = '';
      show('screen-student-home');
      App._checkPhoneGate();
      if (State.pendingAction) {
        const fn = State.pendingAction;
        State.pendingAction = null;
        fn();
      } else if (State.student.phone) {
        _routeToCurrentPath();
        setTimeout(() => App._checkBroadcasts(), 1500);
      }
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
      showAlert(errEl, 'الرجاء إدخال رقم الدخول (١٠ أرقام).'); return;
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
        _restoreBtn(); showAlert(errEl, 'رقم الدخول يجب أن يكون ١٠ أرقام إنجليزية.'); return;
      }
      if (status === 401 || msg.includes('غير صحيحة')) {
        _restoreBtn(); showAlert(errEl, 'بيانات الدخول غير صحيحة — تحقق من رقم الدخول.'); return;
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
      _authToken = token;
      ActivityLog.success(`👨‍💼 تسجيل دخول مشرف: ${admin.name || code} (${code}) — ${admin.school || '—'} — دور: ${admin.role || 'admin'}`);
      serverLog('success', 'login', `تسجيل دخول مشرف: ${admin.name || code}`, { user_name: admin.name || '', user_role: admin.role || 'admin', school: admin.school || '' });
      State.role  = admin.role === 'director' ? 'director' : 'admin';
      State.admin = { ...admin, code };
      if (admin.school && admin.school !== '*') { State.school = admin.school; App._updateSchoolDisplay(admin.school); }
      const adminName = admin.name || '';
      const _sess = { role: State.role, code, name: adminName, school: admin.school || '', token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
      try { sessionStorage.setItem(_skey('lg_session', 'admin'), JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem(_skey('lg_xsession', 'admin'), JSON.stringify(_sess)); } catch(_) {}
      _setActiveRole('admin');
      const alRemember = document.getElementById('al-remember');
      if (alRemember && alRemember.checked) {
        try { localStorage.setItem(_skey('lg_remember', 'admin'), JSON.stringify({ role: 'admin', code, name: adminName, school: admin.school || '', expiry: Date.now() + 2 * 24 * 60 * 60 * 1000 })); } catch(_) {}
      } else {
        try { localStorage.removeItem(_skey('lg_remember', 'admin')); } catch(_) {}
      }
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(adminLabel(adminName));
      document.querySelectorAll('.director-tab').forEach(el => {
        el.style.display = State.role === 'director' ? '' : 'none';
      });
      // New admin dashboard (React) lives at /admin/ — redirect there now that the
      // session is persisted to localStorage.lg_xsession_admin. The old in-SPA admin
      // screen is no longer shown after a successful admin login.
      window.location.href = '/admin/';
    } catch(e) {
      _restoreBtn();
      document.documentElement.style.visibility = '';
      showAlert(errEl, 'حدث خطأ غير متوقع أثناء تحميل اللوحة — حاول مرة أخرى.');
    }
  },

  // ── Dev-only entry point: mints a role:'dev' JWT via DEV_KEY, then reuses
  // the same /admin/ dashboard (React app) with the dev-only tools unlocked.
  async devLogin() {
    const key = window.prompt('مفتاح الدخول (DEV_KEY):');
    if (!key) return;
    try {
      const data = await apiFetch('/auth/dev', { method: 'POST', body: JSON.stringify({ key }) });
      const _sess = { role: 'dev', code: '', name: 'Dev', school: '', token: data.token, expiry: Date.now() + 4 * 60 * 60 * 1000 };
      try { sessionStorage.setItem(_skey('lg_session', 'admin'), JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem(_skey('lg_xsession', 'admin'), JSON.stringify(_sess)); } catch(_) {}
      window.location.href = '/admin/';
    } catch (e) {
      alert('مفتاح غير صحيح: ' + (e?.message || ''));
    }
  },

  // ── Populate all .tb-uname chips with user name ───────────────────────────
  _setTopbarUser(name) {
    document.querySelectorAll('.tb-uname').forEach(chip => {
      const textEl = chip.querySelector('.tb-uname-text');
      if (textEl) textEl.textContent = name || '';
      chip.style.display = name ? 'inline-flex' : 'none';
    });
    document.querySelectorAll('.tb-theme-btn').forEach(btn => {
      btn.style.display = name ? 'inline-flex' : 'none';
    });
    _syncThemeButtons();
  },

  // ── Inject logo + name into all ghost topbar slots ───────────────────────
  _fillTopbarGhosts() {
    const name = State.student?.name || (State.admin?.name ? adminLabel(State.admin.name) : '');
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
    // مسار الإنجاز — server-computed (GET /api/journey), replaces the old
    // standalone plan-banner + quiz-progress-banner (folded into the journey
    // panel below, richer than either on its own).
    App.loadJourney();
    // Performance indicator (2nd test onwards) — kept as-is (a distinct score-
    // trend chart the journey panel doesn't replace).
    App.renderStudentPerformanceCard();
    // Check for unread support replies
    App.loadTicketNotifications();
    // First login ever: the welcome modal comes before anything else that
    // wants the screen (the phone prompt below, the spotlight tour in show()),
    // so a brand-new student gets one thing at a time instead of three
    // overlays at once.
    if (App._shouldShowWelcome()) {
      setTimeout(() => App.showStudentWelcome(), 400);
      return;
    }
    // Prompt phone if missing (non-blocking — student can skip)
    if (!State.student.phone) {
      setTimeout(() => App.showStudentPhoneModal(), 800);
    }
  },

  // ── First-login welcome modal ───────────────────────────────────────────
  // Server flag (students.has_seen_welcome, returned by /auth/student-login)
  // is the source of truth so it follows the student across devices; the
  // per-student localStorage key mirrors it so the modal can't flash again
  // on a reload before the login response lands.
  _welcomeKey() {
    return 'learngate_onboarding_' + (State.student?.id || 'anon');
  },
  _shouldShowWelcome() {
    if (!State.student) return false;
    if (State.student.has_seen_welcome) return false;
    try { if (localStorage.getItem(App._welcomeKey())) return false; } catch (_) {}
    return true;
  },
  showStudentWelcome() {
    const modal = document.getElementById('student-welcome-modal');
    if (!modal) return;
    modal.classList.remove('sw-closing');
    modal.classList.add('open');
  },
  async completeStudentOnboarding(btn) {
    const modal = document.getElementById('student-welcome-modal');
    if (btn) btn.disabled = true;
    // Mark it locally and close immediately — the student should never wait on
    // a network round-trip to get into the platform. A failed request just
    // means the server flag catches up on the next dismissal; the local key
    // already stops it reappearing on this device.
    if (State.student) State.student.has_seen_welcome = true;
    try { localStorage.setItem(App._welcomeKey(), '1'); } catch (_) {}

    if (modal) {
      modal.classList.add('sw-closing');
      setTimeout(() => {
        modal.classList.remove('open', 'sw-closing');
        if (btn) btn.disabled = false;
        // Hand off to whatever the fresh-login flow would have shown next.
        if (State.student && !State.student.phone) App.showStudentPhoneModal();
        else if (!localStorage.getItem(_skey('lg_tour_seen', 'student'))) startOnboardingTour();
      }, 260);
    }

    try {
      await apiFetch('/student/complete-onboarding', { method: 'POST' });
    } catch (_) { /* local flag already set — retried on next dismissal */ }
  },

  // ── مسار الإنجاز (Journey) ──────────────────────────────────────────────
  // The home screen shows ONLY a compact summary of the journey — hero
  // (overall % + stage), the one next-best-action CTA, and a link to the
  // full roadmap. Every section×level×skill breakdown (stepper, per-level
  // skill panel, needs-review list, verbal/quant mini-bars) lives on the
  // dedicated #screen-journey-full page (App.renderJourneyFull), reached via
  // the "تابع تقدمك" button — not squeezed onto the home screen.
  async loadJourney() {
    const el = document.getElementById('sh-journey');
    if (!el) return;
    el.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري تحميل مسارك…</div>';
    try {
      const { journey } = await apiFetch('/journey');
      State._journey = journey;
      App.renderJourney(journey);
    } catch (e) {
      el.innerHTML = '';
    }
  },

  _journeyLevelShort: { easy: 'سهل', medium: 'متوسط', advanced: 'متقدم' },
  _journeySectionLabel: { verbal: 'اللفظي', quantitative: 'الكمي' },
  _journeySectionIcon: { verbal: '📘', quantitative: '📗' },

  renderJourney(j) {
    const el = document.getElementById('sh-journey');
    if (!el || !j) return;

    const pct = j.overallProgressPct || 0;
    const R = 29, C = 2 * Math.PI * R;
    const ringSvg = `
      <div class="journey-ring-wrap">
        <svg class="journey-ring" viewBox="0 0 74 74">
          <circle class="journey-ring-track" cx="37" cy="37" r="${R}"/>
          <circle class="journey-ring-fill" cx="37" cy="37" r="${R}"
            stroke-dasharray="${C}" stroke-dashoffset="${C - (pct / 100) * C}"/>
        </svg>
        <div class="journey-ring-value">${pct}%</div>
      </div>`;

    const dot = (color) => `<span class="jms-dot" style="background:${color}"></span>`;
    const miniStats = `
      <div class="journey-mini-stats">
        <span class="journey-mini-stat">${dot('#3F7CB8')}اللفظي <b>${j.sections.verbal?.progressPct ?? 0}%</b></span>
        <span class="journey-mini-stat">${dot('#4FA877')}الكمي <b>${j.sections.quantitative?.progressPct ?? 0}%</b></span>
        <span class="journey-mini-stat">${dot(j.diagnostic.done ? '#4FA877' : '#cbd5e1')}التشخيص ${j.diagnostic.done ? '<b>✓ مكتمل</b>' : 'لم يبدأ'}</span>
        <span class="journey-mini-stat">${dot('#7C5CD4')}المهارات <b>${j.passedNodes}/${j.totalNodes}</b></span>
      </div>`;

    // Link out to the full roadmap page — same data, dedicated page to
    // breathe in. Placed as the last flex child of the summary row so it
    // sits on the left (RTL: DOM-last = visually left).
    const fullLink = `
      <button type="button" class="journey-summary-link" onclick="show('screen-journey-full');App.renderJourneyFull(State._journey)">
        <span>تابع تقدمك</span><span class="jfl-arrow">←</span>
      </button>`;

    const summary = `
      <div class="journey-summary">
        ${ringSvg}
        <div class="journey-summary-info">
          <div class="journey-summary-title">مسار إنجازك</div>
          <div class="journey-stage-label">${escapeHtml(j.stageLabel)}</div>
          ${miniStats}
        </div>
        ${fullLink}
      </div>`;

    // The completion badge (all skill nodes passed) — the next-action CTA
    // that used to live here on the home screen was removed per explicit
    // request; it's still available (as the primary CTA) on the full
    // /journey page via App.renderJourneyFull.
    const badge = j.badge ? `
      <div class="journey-badge">
        <span class="journey-badge-icon">🏆</span>
        <div>
          <div class="journey-badge-title">أتممت مسار الإنجاز — ${escapeHtml(j.badge.label)}</div>
          <div class="journey-badge-sub">${j.finalMock && j.finalMock.available && !j.finalMock.attempted
            ? 'يمكنك الآن تجربة اختبار المحاكاة الشامل لقياس جاهزيتك النهائية' : 'يمكنك مراجعة أي مهارة في أي وقت'}</div>
        </div>
      </div>` : '';

    // Section×level×skill breakdown, and the needs-review list, live only on
    // the dedicated /journey page (App.renderJourneyFull) — the home screen
    // stays to the summary + completion badge only.
    el.innerHTML = `<div class="journey">${summary}${badge}</div>`;
  },

  // ── Full journey page (#screen-journey-full) ────────────────────────────
  // A visual timeline/path, not a data dashboard: hero (progress shown ONCE)
  // + milestone strip, then a connected path of nodes — diagnostic → verbal
  // levels → quantitative levels → final mock → badge — each expandable to
  // its skills, then needs-review. Nothing here is invented; everything
  // traces to the GET /api/journey payload (`j`), same shape used on home.
  async renderJourneyFull(j) {
    const el = document.getElementById('journey-full-content');
    if (!el) return;
    if (!j) {
      el.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري تحميل مسارك…</div>';
      try {
        const { journey } = await apiFetch('/journey');
        State._journey = journey;
        j = journey;
      } catch (e) {
        el.innerHTML = '<p class="journey-highlights-empty">تعذر تحميل مسارك، حاول لاحقًا.</p>';
        return;
      }
    }

    const LEVELS = ['easy', 'medium', 'advanced'];
    const pct = j.overallProgressPct || 0;

    // ── Path node list: one entry per milestone in visual/travel order.
    // "current" comes straight from j.stage / j.nextAction — no separate
    // heuristic invented client-side.
    const naType = (j.nextAction || {}).type;
    const verbalDone = j.sections.verbal?.progressPct === 100;
    const quantDone = j.sections.quantitative?.progressPct === 100;
    const allSkillsDone = j.totalNodes > 0 && j.passedNodes === j.totalNodes;

    const levelNode = (section, levelKey) => {
      const lvl = ((j.tree && j.tree[section]) || []).find((l) => l.level === levelKey);
      const isCurrent = !!(j.diagnostic.done && j.stage === levelKey &&
        ((section === 'verbal' && !verbalDone) || (section === 'quantitative' && verbalDone && !quantDone)));
      return { kind: 'level', section, levelKey, lvl, isCurrent };
    };

    const nodes = [
      { kind: 'diagnostic', isCurrent: naType === 'diagnostic' },
      levelNode('verbal', 'easy'),
      levelNode('verbal', 'medium'),
      levelNode('verbal', 'advanced'),
      levelNode('quantitative', 'easy'),
      levelNode('quantitative', 'medium'),
      levelNode('quantitative', 'advanced'),
      { kind: 'finalMock', isCurrent: naType === 'final_mock' },
      { kind: 'badge', isCurrent: allSkillsDone && !!(j.finalMock && j.finalMock.available ? j.finalMock.attempted : true) && !!j.badge },
    ];

    // ── Hero ────────────────────────────────────────────────────────────
    const milestoneChip = (icon, label, state) => `
      <span class="jt-mchip jt-mchip-${state}"><span class="jt-mchip-icon">${icon}</span>${label}</span>`;
    const milestones = `
      <div class="jt-milestones">
        ${milestoneChip('🧭', 'التشخيص', j.diagnostic.done ? 'done' : (naType === 'diagnostic' ? 'current' : 'upcoming'))}
        ${milestoneChip('📘', 'اللفظي', verbalDone ? 'done' : (j.diagnostic.done && !verbalDone ? 'current' : 'upcoming'))}
        ${milestoneChip('📗', 'الكمي', quantDone ? 'done' : (verbalDone && !quantDone ? 'current' : (verbalDone ? 'upcoming' : 'locked')))}
        ${milestoneChip('🏁', 'اختبار المحاكاة', j.finalMock && j.finalMock.attempted ? 'done' : (naType === 'final_mock' ? 'current' : (allSkillsDone ? 'upcoming' : 'locked')))}
        ${milestoneChip('🏆', 'الشارة', j.badge ? 'done' : 'locked')}
      </div>`;

    const R = 34, C = 2 * Math.PI * R;
    const hero = `
      <div class="jt-hero">
        <div class="jt-hero-top">
          <div class="jt-hero-ring-wrap">
            <svg class="jt-hero-ring" viewBox="0 0 84 84" aria-hidden="true">
              <circle class="jt-hero-ring-track" cx="42" cy="42" r="${R}"/>
              <circle class="jt-hero-ring-fill" cx="42" cy="42" r="${R}"
                stroke-dasharray="${C}" stroke-dashoffset="${C - (pct / 100) * C}"/>
            </svg>
            <div class="jt-hero-ring-value">${pct}%</div>
          </div>
          <div class="jt-hero-info">
            <div class="jt-hero-title">${escapeHtml(j.stageLabel)}</div>
            <div class="jt-hero-sub">${j.passedNodes}/${j.totalNodes} مهارة مكتملة</div>
          </div>
        </div>
        ${milestones}
      </div>`;

    // ── Primary CTA ─────────────────────────────────────────────────────
    const na = j.nextAction || {};
    const naIcon = { diagnostic: '🧭', retry_skill: '🔁', start_skill: '🎯', final_mock: '🏁' }[na.type] || '🎯';
    const cta = na.type && na.type !== 'done' && na.type !== 'none' ? `
      <button type="button" class="jt-cta" onclick="App.journeyGo('${na.type}','${na.section || ''}','${na.level || ''}')">
        <span class="jt-cta-icon">${naIcon}</span>
        <div class="jt-cta-text">
          <div class="jt-cta-label">${na.type === 'diagnostic' ? 'ابدأ من هنا' : 'متابعة الرحلة'}</div>
          <div class="jt-cta-title">${escapeHtml(na.label || '')}</div>
          ${na.detail ? `<div class="jt-cta-detail">${escapeHtml(na.detail)}</div>` : ''}
        </div>
        <span class="jt-cta-arrow">←</span>
      </button>` : (na.type === 'done' ? `
      <div class="jt-cta jt-cta-done"><span class="jt-cta-icon">🏆</span><div class="jt-cta-text"><div class="jt-cta-title">${escapeHtml(na.label || '')}</div></div></div>` : '');

    // ── Path nodes ──────────────────────────────────────────────────────
    const skillRow = (s, section, levelKey, locked) => {
      const label = App.quizStatusLabel(s.status);
      const isCurrent = !locked && na.quizSkillId && na.quizSkillId === s.quizSkillId;
      const stateHtml = isCurrent
        ? `<span class="jt-skill-state jt-skill-current">◉ التالية</span>`
        : s.status === 'failed'
          ? `<span class="jt-skill-state score-low">🔴 مراجعة</span>`
          : `<span class="jt-skill-state ${label.cls}">${label.text}</span>`;
      const goType = s.status === 'failed' ? 'retry_skill' : 'start_skill';
      return `
        <button type="button" class="jt-skill-row" ${locked ? 'disabled' : `onclick="App.journeyGo('${goType}','${section}','${levelKey}')"`}>
          <span class="jt-skill-name">${escapeHtml(s.skillName)}</span>${stateHtml}
        </button>`;
    };

    const nodeStateOf = (n) => {
      if (n.kind === 'diagnostic') return j.diagnostic.done ? 'done' : (n.isCurrent ? 'current' : 'upcoming');
      if (n.kind === 'level') {
        if (!n.lvl) return 'upcoming';
        if (n.lvl.locked) return 'locked';
        if (n.lvl.progressPct === 100) return 'done';
        if (n.isCurrent) return 'current';
        return n.lvl.progressPct > 0 ? 'current' : 'upcoming';
      }
      if (n.kind === 'finalMock') {
        if (!j.finalMock || !j.finalMock.available) return 'locked';
        if (j.finalMock.attempted) return 'done';
        return n.isCurrent ? 'current' : 'upcoming';
      }
      if (n.kind === 'badge') return j.badge ? 'done' : 'locked';
      return 'upcoming';
    };

    const stateIconOf = (state) => ({ done: '✓', current: '●', upcoming: '○', locked: '🔒' })[state] || '○';

    const nodesHtml = nodes.map((n, i) => {
      const state = nodeStateOf(n);
      const icon = stateIconOf(state);

      if (n.kind === 'diagnostic') {
        return `
          <li class="jt-node jt-node-${state}">
            <span class="jt-node-dot" aria-hidden="true">${state === 'done' ? '✓' : '🧭'}</span>
            <div class="jt-node-body jt-node-simple">
              <div class="jt-node-title">التشخيص الذاتي</div>
              <div class="jt-node-desc">${j.diagnostic.done ? 'تم إكمال التشخيص' : (state === 'current' ? 'خطوتك الأولى — حدّد نقاط قوتك وضعفك' : 'بانتظار البدء')}</div>
            </div>
          </li>`;
      }

      if (n.kind === 'level') {
        const { section, levelKey, lvl } = n;
        if (!lvl) return '';
        const passedCount = lvl.skills.filter((s) => s.status === 'passed').length;
        const skillsHtml = lvl.skills.map((s) => skillRow(s, section, levelKey, lvl.locked)).join('');
        const openAttr = !lvl.locked && (state === 'current') ? 'open' : '';
        return `
          <li class="jt-node jt-node-${state}">
            <span class="jt-node-dot" aria-hidden="true">${icon}</span>
            <div class="jt-node-body">
              <details class="jt-level" ${openAttr}>
                <summary class="jt-level-summary">
                  <span class="jt-level-icon">${App._journeySectionIcon[section]}</span>
                  <span class="jt-level-title">${App._journeySectionLabel[section]} — المستوى ${App._journeyLevelShort[levelKey]}</span>
                  <span class="jt-level-count">${passedCount}/${lvl.skills.length}</span>
                </summary>
                ${lvl.locked
                  ? `<p class="jt-locked-reason">🔒 تُفتح بعد إكمال المستوى السابق من ${App._journeySectionLabel[section]}</p>`
                  : `<div class="jt-skills">${skillsHtml}</div>`}
              </details>
            </div>
          </li>`;
      }

      if (n.kind === 'finalMock') {
        const fm = j.finalMock;
        const desc = !fm || !fm.available
          ? 'يُفتح بعد إكمال جميع المهارات'
          : fm.attempted
            ? `تمت المحاولة${fm.passed ? ' — ناجح ✓' : ''}`
            : 'متاح الآن — لم تتم المحاولة بعد';
        return `
          <li class="jt-node jt-node-${state}">
            <span class="jt-node-dot" aria-hidden="true">${state === 'done' ? '✓' : '🏁'}</span>
            <div class="jt-node-body jt-node-simple">
              <div class="jt-node-title">${escapeHtml((fm && fm.title) || 'اختبار المحاكاة الشامل')}</div>
              <div class="jt-node-desc">${desc}</div>
              ${state === 'current' ? `<button type="button" class="jt-node-btn" onclick="App.journeyGo('final_mock','','')">ابدأ الاختبار ←</button>` : ''}
            </div>
          </li>`;
      }

      // badge
      return `
        <li class="jt-node jt-node-${state}">
          <span class="jt-node-dot" aria-hidden="true">${j.badge ? '🏆' : '🔒'}</span>
          <div class="jt-node-body jt-node-simple">
            <div class="jt-node-title">${j.badge ? escapeHtml(j.badge.label) : 'شارة إتمام المسار'}</div>
            <div class="jt-node-desc">${j.badge ? 'أتممت جميع مهارات المسار 🎉' : 'تُمنح بعد إكمال جميع المهارات'}</div>
          </div>
        </li>`;
    }).join('');

    const path = `<ol class="jt-path">${nodesHtml}</ol>`;

    // ── Needs review (kept, real data) ─────────────────────────────────
    let review = '';
    if ((j.needsReview || []).length) {
      review = `
        <div class="journey-review jt-review">
          <div class="journey-review-head">🔴 يحتاج مراجعة (${j.needsReview.length})</div>
          ${j.needsReview.map(r => `
            <button type="button" class="journey-review-row" onclick="App.journeyGo('retry_skill','${r.section}','${r.level}')">
              <span class="jr-name">${escapeHtml(r.skillName)}</span>
              <span class="jr-score">${r.bestCorrect}/${r.bestTotal}</span>
              <span class="jr-arrow">←</span>
            </button>`).join('')}
        </div>`;
    }

    el.innerHTML = `<div class="journey-full jt-wrap">${hero}${cta}${path}${review}</div>`;
  },


  // Routes the journey's "ابدأ الآن" CTA (and any needs-review row) into the
  // existing quiz-skills / diagnostic screens — no new take-a-quiz UI, this
  // only decides *where* to send the student; the server already decided *what*.
  journeyGo(type, section, level) {
    if (type === 'diagnostic') { App.startCapabilities(); return; }
    if (type === 'final_mock') { App.openGeneralTests(); return; }
    if ((type === 'retry_skill' || type === 'start_skill') && section && level) {
      // Reuse the tree already fetched for the journey panel (same shape as
      // GET /api/quiz-structure) instead of a second round-trip, then drill
      // straight into the relevant level's skill list — screen-quiz-levels
      // still gets pushed onto the nav stack first so "back" behaves exactly
      // like manually clicking a level card would.
      if (State._journey && State._journey.tree) State._quizTree = State._journey.tree;
      App.openQuizLevels(section);
      App.openQuizSkills(section, level);
      return;
    }
  },

  async generateTestAccessLink(studentId) {
    try {
      const { token } = await apiFetch('/dev/access-tokens', {
        method: 'POST',
        body: JSON.stringify({ studentId }),
      });
      const link = `${window.location.origin}/?t=${token}`;
      try { await navigator.clipboard.writeText(link); } catch (_) {}
      window.prompt('رابط تجريبي لمرة واحدة (تم نسخه):', link);
    } catch (e) {
      alert('تعذّر توليد الرابط: ' + (e?.message || ''));
    }
  },

  // Single action for the access-link card: copy the code, confirm it, and
  // drop the student straight on the login form with the code and school
  // already filled in — the seven manual steps that card used to spell out.
  // The copy is best-effort: clipboard access is blocked in plenty of mobile
  // in-app browsers, and the code is prefilled and visible either way, so a
  // failed copy must never stop the navigation.
  async useAccessCode(btn) {
    const code = document.getElementById('at-code')?.textContent.trim() || '';
    if (!code) return;
    if (btn) btn.disabled = true;

    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch (_) { /* not available/permitted — carry on */ }

    const school = (document.getElementById('at-school')?.dataset.school || '').trim();
    if (school) {
      State.school = school;
      App._updateSchoolDisplay(school);
    }

    showToast(copied ? 'تم نسخ رقم الدخول' : 'رقم الدخول جاهز في الحقل');
    show('screen-student-login');

    const input = document.getElementById('sl-code');
    if (input) {
      input.value = code;
      // Remember-me on by default here: this student arrived from a link
      // precisely so they wouldn't have to keep re-entering the number.
      const remember = document.getElementById('sl-remember');
      if (remember) remember.checked = true;
      setTimeout(() => input.focus(), 120);
    }
    if (btn) btn.disabled = false;
  },

  // Runs `fn` immediately if a student is logged in; otherwise remembers it
  // and sends the student to log in first — once they're in, the FAQ screen's
  // requested action fires automatically instead of just landing on home.
  requireAuth(fn) {
    if (State.student) { fn(); return; }
    State.pendingAction = fn;
    showToast('سجّل الدخول أولاً للمتابعة');
    // Keep the normal onboarding order (اختيار المدرسة ← اختيار الدور ← الدخول)
    // instead of dropping the visitor straight into the login form.
    show('screen-school');
  },

  // Show/hide a password field and swap the eye / eye-off icon inside the button
  togglePw(btn, inputId) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    const eye = btn.querySelector('.pw-eye');
    const off = btn.querySelector('.pw-eye-off');
    if (eye) eye.style.display = showing ? '' : 'none';
    if (off) off.style.display = showing ? 'none' : '';
  },

  toggleTheme() {
    const current = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
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
      // Keep the persisted session in sync so quick-restore doesn't re-prompt
      [['sessionStorage', 'lg_session'], ['localStorage', 'lg_xsession']].forEach(([store, key]) => {
        try {
          const raw = window[store].getItem(_skey(key, 'student'));
          if (!raw) return;
          const sess = JSON.parse(raw);
          sess.phone = trimmed;
          window[store].setItem(_skey(key, 'student'), JSON.stringify(sess));
        } catch (_) {}
      });
    } catch (_) {
      // Save failed silently — don't block the student
    }
    App.closeStudentPhoneModal();
  },

  // "دعم التعلم والتحصيل" — native screen now (was a separate /academic/
  // static page reached via a full page navigation, which is exactly what
  // caused the white-flash/hang jumping into and back out of it). Kept the
  // localStorage write: /academic/biology-g1/ is still a separate static
  // page and falls back to reading this if the student's real session
  // somehow isn't present when it loads.
  goToAcademic() {
    const user = State.student || State.admin || {};
    const name = user.name || user.admin_name || '';
    const role = State.student ? 'student' : (State.admin ? 'admin' : '');
    localStorage.setItem('lg_academic_user', JSON.stringify({ name, role }));
    show('screen-academic');
  },

  selectAcademicGrade(slug) {
    State._academicGrade = slug;
    App.renderAcademicSubjects(slug);
    show('screen-academic-subjects');
  },

  renderAcademicSubjects(slug) {
    const GRADE_NAMES = { g10: 'أول ثانوي', g11: 'ثاني ثانوي', g12: 'ثالث ثانوي' };
    const name = GRADE_NAMES[slug] || slug;
    const titleEl = document.getElementById('acad-subjects-title');
    const labelEl = document.getElementById('acad-subjects-label');
    if (titleEl) titleEl.textContent = name;
    if (labelEl) labelEl.textContent = 'المواد الدراسية — ' + name;
    // Only biology is live today, and only for أول ثانوي (g10) — same gate
    // the old /academic/ static page enforced before linking into
    // /academic/biology-g1/, which stays a separate static page (its own
    // sizeable interactive lesson content, out of scope for this merge).
    const SUBJECTS = [
      { icon: '📐', name: 'الرياضيات' },
      { icon: '🔬', name: 'الأحياء', href: slug === 'g10' ? '/academic/biology-g1/' : null },
      { icon: '⚡', name: 'الفيزياء' },
      { icon: '🧪', name: 'الكيمياء' },
      { icon: '🌐', name: 'اللغة الإنجليزية' },
      { icon: '📖', name: 'اللغة العربية' },
    ];
    const listEl = document.getElementById('acad-subjects-list');
    if (!listEl) return;
    listEl.innerHTML = SUBJECTS.map(s => `
      <div class="service-card ${s.href ? 'active' : 'disabled'}" ${s.href ? `onclick="App.goToExternal('${s.href}')"` : ''}>
        <div class="service-card-icon">${s.icon}</div>
        <div class="service-card-info">
          <div class="service-card-name">${escapeHtml(s.name)}</div>
        </div>
        <span class="service-badge ${s.href ? 'badge-active' : 'badge-soon'}">${s.href ? 'متاح' : 'قريباً'}</span>
      </div>`).join('');
  },

  // "المذاكرة والتدريبات" — native screen now (was the separate /study/
  // static page). Mirrors goToAcademic() above.
  goToStudy() {
    show('screen-study');
  },

  openLessons() {
    show('screen-lessons');
  },

  // Hands off to a page this merge deliberately leaves as a separate static
  // site (individual lesson content, the training-quizzes mini-app, or the
  // biology-g1 subject) — same branded spinner used everywhere else in the
  // app instead of a blank-white hard navigation, shown for one frame before
  // the navigation itself so it never reads as a flash.
  goToExternal(url) {
    _showLoadingScreenNow('جارٍ التحميل…');
    requestAnimationFrame(() => { window.location.href = url; });
  },

  async startCapabilities() {
    showLoadingScreen('جارٍ التحميل…');
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
    App.renderSectionChoice();
    show('screen-section-choice');
  },

  skipSelfDiag(e) {
    if (e) e.preventDefault();
    State.selfDiag = {};
    State.currentQ = 0;
    State.testAnswers = {};
    App.renderSectionChoice();
    show('screen-section-choice');
  },

  // ── Diagnostic Section Choice (verbal / quantitative / both) ───────────────
  renderSectionChoice() {
    State.diagSection = null;
    document.querySelectorAll('.section-choice-card').forEach(c => c.classList.remove('selected'));
    const btn = document.getElementById('section-choice-start');
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  },

  selectSection(section) {
    State.diagSection = section;
    document.querySelectorAll('.section-choice-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.section === section);
    });
    const btn = document.getElementById('section-choice-start');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  },

  confirmSectionChoice() {
    if (!State.diagSection) return;
    show('screen-pretest-intro');
  },

  async skipDiagnostic(e) {
    if (e) e.preventDefault();
    const gaps = SKILLS.map(sk => ({
      skillId: sk.id, skillName: sk.name, category: sk.category,
      pct: 0, level: 'low', selfAssess: 'need',
      recommendation: 'مهارة ضعيفة — تحتاج تدريباً مكثفاً وأساسيات.',
      overconfident: false,
    }));
    App._pendingGaps = gaps;
    App._pendingAnswers = {};
    App._pendingSelfDiag = {};
    show('screen-processing');
    await App._submitPlan(gaps, {}, {}, { skipDiagnostic: true });
  },

  startPretest() {
    const sec = State.diagSection || 'both';
    const fullBank = window._fullQuestionBank || window.QUESTION_BANK;
    window.QUESTION_BANK = sec === 'both' ? fullBank.slice() : fullBank.filter(q => q.type === sec);
    State.currentQ = 0;
    State.testAnswers = {};
    App.renderQuestion();
    App.startTestTimer();
    App._saveTestState();
    show('screen-pretest');
  },

  // Reachable from screen-level-analysis's "🔁 إعادة الاختبار" — this used to
  // jump straight to screen-section-choice with no cooldown check at all,
  // unlike startCapabilities()'s own entry point (the home screen's
  // "الاستعداد لاختبار القدرات" card). A student still inside their
  // mandatory waiting period could reach a brand-new attempt through here
  // even though the home screen correctly locked them out — the actual
  // POST /api/plans submission is now also rejected server-side (403) if
  // this check is ever bypassed some other way, but the student should
  // never even see the option in the first place.
  retakeDiagnostic() {
    const plans = DB.studentPlans(State.student.id);
    const latest = plans[0];
    if (latest) {
      const rem = daysRemaining(latest);
      if (rem > 0) {
        App.renderCooldown(latest, rem, plans);
        show('screen-cooldown');
        return;
      }
    }
    State.selfDiag = {};
    State.testAnswers = {};
    State.currentQ = 0;
    State.diagSection = null;
    App.stopTestTimer();
    App.renderSectionChoice();
    show('screen-section-choice');
  },

  // ── Test Timer (50 min) ───────────────────────────────────────────────────
  _testTimer: null,
  _advanceTimer: null,
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
        testAnswers: State.testAnswers,
        diagSection: State.diagSection || 'both'
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
        <div class="opt-circle"></div><span>${escapeHtml(opt)}</span>
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
    nextBtn.textContent   = isLast ? 'إنهاء الاختبار' : 'التالي';
    nextBtn.className     = 'btn ' + (isLast ? 'btn-success' : 'btn-primary');
    // Only answering (not just viewing) advances automatically — but once a
    // question already has a saved answer (e.g. after going back with
    // "السابق"), show "التالي" so the student can move forward without
    // having to re-tap the same choice.
    nextBtn.style.display = (isLast || selected !== undefined) ? 'inline-flex' : 'none';
  },

  selectAnswer(idx) {
    const QBANK = window.QUESTION_BANK;
    const qIdxAtSelect = State.currentQ;
    State.testAnswers[QBANK[qIdxAtSelect].id] = idx;
    App.renderQuestion();
    App._saveTestState();
    clearTimeout(App._advanceTimer);
    if (qIdxAtSelect < QBANK.length - 1) {
      App._advanceTimer = setTimeout(() => {
        if (State.currentQ === qIdxAtSelect) {
          State.currentQ++;
          App.renderQuestion();
          App._saveTestState();
        }
      }, 300);
    }
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

  // ── General Tests (6 stand-alone skill tests, reached from the support-plan screen) ──
  // ── General Tests (6 stand-alone skill tests, reached from the support-plan screen) ──
  async openGeneralTests() {
    show('screen-general-tests');
    const list = document.getElementById('gt-list');
    list.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل…</div>';
    try {
      const { tests } = await apiFetch('/general-tests');
      App.renderGeneralTestsList(tests);
    } catch (e) {
      list.innerHTML = '<div style="text-align:center;color:#dc2626;padding:24px;">تعذّر تحميل الاختبارات</div>';
    }
  },

  renderGeneralTestsList(tests) {
    const list = document.getElementById('gt-list');
    list.innerHTML = tests.map(t => {
      const has = t.question_count > 0;
      const result = t.my_result;
      const resultHtml = result
        ? `<div style="font-size:13px;color:var(--accent);font-weight:700;margin-top:4px;">آخر نتيجة: ${result.score}% (${result.correct}/${result.total})</div>`
        : '';
      return `
        <div class="skill-card" style="padding:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-weight:800;font-size:15px;">${t.title}</div>
              ${t.skill_name ? `<div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${t.skill_name}</div>` : ''}
              ${resultHtml}
            </div>
            <button class="btn ${has ? 'btn-primary' : 'btn-outline'}" style="white-space:nowrap;" ${has ? '' : 'disabled'}
                    onclick="App.startGeneralTest(${t.test_num})">
              ${has ? (result ? 'إعادة الاختبار' : 'بدء الاختبار') : 'قريباً'}
            </button>
          </div>
        </div>`;
    }).join('');
  },

  async startGeneralTest(num) {
    showLoadingScreen('جارٍ تحميل الاختبار…');
    try {
      const { questions } = await apiFetch(`/general-tests/${num}/questions`);
      State.gt = { num, questions, idx: 0, answers: {} };
      document.getElementById('gt-take-title').textContent = `اختبار عام رقم ${num}`;
      show('screen-general-test-take');
      App.renderGTQuestion();
      App.startGTTimer();
    } catch (e) {
      showToast('تعذّر تحميل الاختبار');
      show('screen-general-tests');
    }
  },

  // ── General-test timer (50 min, same budget as the diagnostic test) ────────
  _gtTimer: null,
  startGTTimer() {
    clearInterval(App._gtTimer);
    const SECS = 50 * 60;
    const deadline = Date.now() + SECS * 1000;
    const el = document.getElementById('gt-timer');
    const update = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      const m = String(Math.floor(remaining / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      if (el) {
        el.textContent = `⏱ ${m}:${s}`;
        el.style.color = remaining <= 300 ? '#ef4444' : '#fff';
      }
      if (remaining <= 0) {
        clearInterval(App._gtTimer);
        App.gtFinish();
      }
    };
    update();
    App._gtTimer = setInterval(update, 1000);
  },

  stopGTTimer() { clearInterval(App._gtTimer); App._gtTimer = null; },

  renderGTQuestion() {
    const { questions, idx, answers } = State.gt;
    const q = questions[idx];
    const total = questions.length;
    const pct = Math.round((idx / total) * 100);

    document.getElementById('gt-progress-bar').style.width = pct + '%';
    document.getElementById('gt-progress-label').textContent = `السؤال ${idx + 1} من ${total}`;
    document.getElementById('gt-q-num').textContent = `سؤال ${idx + 1}`;
    document.getElementById('gt-q-text').textContent = q.text;

    const selected = answers[q.qnum];
    document.getElementById('gt-q-opts').innerHTML = [...q.opts.map((opt, i) => `
      <div class="q-opt${selected === i ? ' selected' : ''}" onclick="App.gtSelect(${i})">
        <div class="opt-circle"></div><span>${escapeHtml(opt)}</span>
      </div>`),
      `<div class="q-opt dont-know${selected === 'dk' ? ' selected' : ''}" onclick="App.gtSelect('dk')">
        <div class="opt-circle"></div><span>لا أعرف الإجابة</span>
      </div>`
    ].join('');

    document.getElementById('gt-btn-prev').disabled = idx === 0;
    const isLast = idx === total - 1;
    const nextBtn = document.getElementById('gt-btn-next');
    nextBtn.textContent   = isLast ? 'إنهاء الاختبار' : 'التالي';
    nextBtn.className     = 'btn ' + (isLast ? 'btn-success' : 'btn-primary');
    nextBtn.style.display = (isLast || selected !== undefined) ? 'inline-flex' : 'none';
    // Same reasoning as the skill-quiz's renderQuizQuestion(): a fresh render
    // always starts clickable, so a stale "disabled" left by a prior
    // successful gtFinish() (which never re-enables it, since it navigates
    // away) can't carry over into a retake.
    nextBtn.disabled = false;
  },

  gtSelect(i) {
    const { questions, idx } = State.gt;
    State.gt.answers[questions[idx].qnum] = i;
    App.renderGTQuestion();
    clearTimeout(App._advanceTimer);
    if (idx < questions.length - 1) {
      App._advanceTimer = setTimeout(() => {
        if (State.gt.idx === idx) { State.gt.idx++; App.renderGTQuestion(); }
      }, 300);
    }
  },

  gtPrev() {
    if (State.gt.idx > 0) { State.gt.idx--; App.renderGTQuestion(); }
  },

  async gtNext() {
    const { questions, idx, answers } = State.gt;
    if (answers[questions[idx].qnum] === undefined) {
      showToast('يرجى اختيار إجابة أو "لا أعرف الإجابة" قبل المتابعة');
      return;
    }
    if (idx < questions.length - 1) { State.gt.idx++; App.renderGTQuestion(); return; }
    await App.gtFinish();
  },

  async gtFinish() {
    // Same double-submit guard as quizFinish()/biology's preNext() — this
    // endpoint does a blind INSERT into general_test_results with no
    // upsert/dedup, so a rapid double-click here genuinely created two
    // identical attempt rows for one real attempt.
    if (State.gt.submitting) return;
    State.gt.submitting = true;
    const _gtBtnNext = document.getElementById('gt-btn-next');
    if (_gtBtnNext) _gtBtnNext.disabled = true;
    App.stopGTTimer();
    const { questions, answers } = State.gt;
    showLoadingScreen('جارٍ تصحيح الاختبار…');
    try {
      const payload = questions.map(q => ({ qnum: q.qnum, selected: answers[q.qnum] }));
      const res = await apiFetch(`/general-tests/${State.gt.num}/submit`, {
        method: 'POST', body: JSON.stringify({ answers: payload }),
      });
      document.getElementById('gt-result-score').textContent = res.score + '%';
      document.getElementById('gt-result-detail').textContent = `${res.correct} إجابة صحيحة من ${res.total}`;
      const skillsEl = document.getElementById('gt-result-skills');
      if (skillsEl) {
        skillsEl.innerHTML = (res.skillBreakdown || []).map(s => {
          const cls = s.pct >= 71 ? 'score-high' : s.pct >= 50 ? 'score-mid' : 'score-low';
          return `<tr>
            <td>${escapeHtml(s.skillName)}</td>
            <td style="text-align:center;"><span class="gap-score ${cls}">${s.pct}%</span></td>
            <td>${App.levelLabel(s.pct)}</td>
          </tr>`;
        }).join('');
      }
      show('screen-general-test-result');
    } catch (e) {
      State.gt.submitting = false;
      if (_gtBtnNext) _gtBtnNext.disabled = false;
      showToast('تعذّر إرسال الاختبار');
      show('screen-general-test-take');
    }
  },

  // ── Quiz Skills Hub (section → level → skill, 5Q/skill, 4/5 pass) ─────────
  quizStatusLabel(status) {
    if (status === 'passed')      return { text: 'مكتملة',       cls: 'score-high' };
    if (status === 'failed')      return { text: 'لم تجتز بعد',  cls: 'score-low'  };
    if (status === 'in_progress') return { text: 'قيد التنفيذ',  cls: 'score-mid'  };
    return { text: 'لم تبدأ', cls: 'score-gray' };
  },

  // ── Quiz Progress (read-only breakdown: level 1/2/3 → skill % + bar) ──────
  async openQuizProgress() {
    show('screen-quiz-progress');
    const el = document.getElementById('qzp-content');
    el.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل…</div>';
    try {
      const { tree } = await apiFetch('/quiz-structure');
      State._quizTree = tree;
      App.renderQuizProgress();
    } catch (e) {
      el.innerHTML = '<div style="text-align:center;color:#dc2626;padding:24px;">تعذّر تحميل المؤشرات</div>';
    }
  },

  renderQuizProgress() {
    const tree = State._quizTree;
    const LEVELS = [
      { key: 'easy',     num: 1, label: 'المستوى الأول — سهل' },
      { key: 'medium',   num: 2, label: 'المستوى الثاني — متوسط' },
      { key: 'advanced', num: 3, label: 'المستوى الثالث — متقدم' },
    ];
    const html = LEVELS.map(lv => {
      const verbalLevel = (tree.verbal || []).find(l => l.level === lv.key);
      const quantLevel  = (tree.quantitative || []).find(l => l.level === lv.key);
      const skills = [...(verbalLevel?.skills || []), ...(quantLevel?.skills || [])];
      if (!skills.length) return '';
      const skillsHtml = skills.map(sk => {
        const pct = sk.bestTotal ? Math.round((sk.bestCorrect / sk.bestTotal) * 100) : 0;
        const cls = sk.status === 'passed' ? 'score-high' : sk.status === 'failed' ? 'score-mid' : 'score-gray';
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:4px;">
            <span>${escapeHtml(sk.skillName)}</span>
            <span class="gap-score ${cls}">${sk.attempts ? pct + '%' : 'لم تبدأ'}</span>
          </div>
          <div class="test-progress-bar-wrap" style="margin-bottom:0;">
            <div class="test-progress-bar" style="width:${sk.attempts ? pct : 0}%"></div>
          </div>
        </div>`;
      }).join('');
      const locked = (verbalLevel?.locked ?? true) && (quantLevel?.locked ?? true);
      return `<div class="skill-card" style="padding:18px;margin-bottom:14px;${locked ? 'opacity:.6;' : ''}">
        <div style="font-weight:800;font-size:14.5px;margin-bottom:14px;">
          ${lv.label} ${locked ? '🔒' : ''}
        </div>
        ${skillsHtml}
      </div>`;
    }).join('');
    document.getElementById('qzp-content').innerHTML = html
      || '<div style="text-align:center;color:var(--muted);padding:24px;">لا توجد بيانات بعد</div>';
  },

  async openQuizHub() {
    show('screen-quiz-hub');
    const el = document.getElementById('qz-hub-cards');
    el.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل…</div>';
    try {
      const { tree } = await apiFetch('/quiz-structure');
      State._quizTree = tree;
      App.renderQuizHub();
    } catch (e) {
      el.innerHTML = '<div style="text-align:center;color:#dc2626;padding:24px;">تعذّر تحميل الاختبارات</div>';
    }
  },

  // "Back" navigation inside the quiz hierarchy uses goBack() (pop, not push) so the
  // shared State.navStack doesn't grow forever from hub<->levels<->skills round-trips —
  // App.openQuizHub()/openQuizLevels()/openQuizSkills() are for *forward* navigation
  // only (clicking a card), each re-renders with the latest cached State._quizTree
  // (already patched in-memory by quizFinish()) before popping back.
  backToQuizHub() {
    App.renderQuizHub();
    goBack('screen-quiz-hub');
  },

  backToQuizLevels() {
    App.renderQuizLevels();
    goBack('screen-quiz-levels');
  },

  // Used by the take-screen's own exit button (abandoning mid-quiz, no extra hop).
  backToQuizSkills() {
    App.renderQuizSkills();
    goBack('screen-quiz-skills');
  },

  // Used by the result screen: finishing a quiz pushes an extra 'screen-quiz-take'
  // entry (the take->result transition), so a single goBack() would land back on
  // the just-finished questions instead of the skills list — discard that one
  // stale entry first, then pop the real previous screen underneath it.
  backFromQuizResult() {
    App.renderQuizSkills();
    _goBackSteps(2, 'screen-quiz-skills');
  },

  // Inline SVG icons (no icon library) for the quiz hub section cards.
  _quizSectionIcon(key) {
    if (key === 'verbal') {
      // Open book — verbal/reading section.
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6.5c-1.6-1.3-3.7-2-6-2v13c2.3 0 4.4.7 6 2 1.6-1.3 3.7-2 6-2V4.5c-2.3 0-4.4.7-6 2Z"/>
        <path d="M12 6.5v13"/>
      </svg>`;
    }
    // Calculator — quantitative section.
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2"/>
      <path d="M8 7h8"/>
      <circle cx="8.3" cy="12.3" r=".9" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12.3" r=".9" fill="currentColor" stroke="none"/>
      <circle cx="15.7" cy="12.3" r=".9" fill="currentColor" stroke="none"/>
      <circle cx="8.3" cy="16" r=".9" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="16" r=".9" fill="currentColor" stroke="none"/>
      <circle cx="15.7" cy="16" r=".9" fill="currentColor" stroke="none"/>
    </svg>`;
  },

  renderQuizHub() {
    const tree = State._quizTree;
    const sections = [
      { key: 'verbal',       title: 'الاختبارات التقويمية القصيرة للقسم اللفظي' },
      { key: 'quantitative', title: 'الاختبارات التقويمية القصيرة للقسم الكمي' },
    ];
    const R = 38; // ring radius, matches qz-hub-ring 84px box with 7px stroke
    const CIRC = 2 * Math.PI * R;
    document.getElementById('qz-hub-cards').innerHTML = sections.map(s => {
      const levels = tree[s.key] || [];
      // Reuse the same completed-skills count already computed per level
      // (progressPct / passed-count) rather than inventing a new metric.
      const totalSkills = levels.reduce((a, l) => a + (l.skills ? l.skills.length : 0), 0);
      const doneSkills = levels.reduce((a, l) => a + (l.skills ? l.skills.filter(sk => sk.status === 'passed').length : 0), 0);
      const avgPct = levels.length ? Math.round(levels.reduce((a, l) => a + l.progressPct, 0) / levels.length) : 0;
      const offset = CIRC - (CIRC * avgPct / 100);
      return `
        <div class="qz-hub-card">
          <div class="qz-hub-icon">${App._quizSectionIcon(s.key)}</div>
          <div class="qz-hub-title">${s.title}</div>
          <div class="qz-hub-ring-wrap">
            <svg class="qz-hub-ring" viewBox="0 0 84 84">
              <circle class="qz-hub-ring-track" cx="42" cy="42" r="${R}"/>
              <circle class="qz-hub-ring-fill" cx="42" cy="42" r="${R}"
                      stroke-dasharray="${CIRC}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="qz-hub-ring-value">${avgPct}%</div>
          </div>
          <div class="qz-hub-sub">${doneSkills} من ${totalSkills} مهارة مكتملة</div>
          <button class="btn btn-primary" onclick="App.openQuizLevels('${s.key}')">ابدأ</button>
        </div>`;
    }).join('');
  },

  openQuizLevels(section) {
    State._quizSection = section;
    document.getElementById('qz-levels-title').textContent =
      section === 'verbal' ? '📚 مستويات القسم اللفظي' : '🔢 مستويات القسم الكمي';
    App.renderQuizLevels();
    show('screen-quiz-levels');
  },

  renderQuizLevels() {
    const levels = (State._quizTree && State._quizTree[State._quizSection]) || [];
    const LEVEL_META = {
      easy: {
        label: 'المستوى المبدئي — سهل', icon: '🟢',
        descOpen: 'نقطة البداية — متاح دائمًا',
      },
      medium: {
        label: 'المستوى المتوسط', icon: '🟡',
        descLocked: 'يمكنك الدخول بعد اجتياز المستوى السهل',
        descOpen: 'أتقنت المستوى السهل — ابدأ الآن',
      },
      advanced: {
        label: 'المستوى المتقدم', icon: '🔴',
        descLocked: 'يمكنك الدخول بعد اجتياز المستوى المتوسط',
        descOpen: 'أتقنت المستوى المتوسط — ابدأ الآن',
      },
    };
    const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>`;
    document.getElementById('qz-levels-cards').innerHTML = levels.map(l => {
      const meta = LEVEL_META[l.level];
      const done = l.progressPct === 100;
      const stateCls = l.locked ? 'locked' : done ? 'done' : 'current';
      let statusHtml;
      if (l.locked) {
        statusHtml = `<div class="qz-level-icon" style="width:26px;height:26px;color:var(--muted);">${LOCK_SVG}</div>`;
      } else if (done) {
        statusHtml = `<span class="qz-level-done-mark"><span style="width:16px;height:16px;display:inline-flex;">${CHECK_SVG}</span>مكتمل</span>`;
      } else {
        statusHtml = `<button class="btn btn-primary btn-sm qz-level-action" onclick="event.stopPropagation();App.openQuizSkills('${State._quizSection}','${l.level}')">ابدأ</button>`;
      }
      const desc = l.locked
        ? (meta.descLocked || 'يتطلب إتقان المستوى السابق للفتح')
        : (done ? 'أنهيت جميع مهارات هذا المستوى' : meta.descOpen);
      return `
        <div class="qz-level-card ${stateCls}"
             ${l.locked ? '' : `onclick="App.openQuizSkills('${State._quizSection}','${l.level}')"`}>
          <div class="qz-level-icon">${l.locked ? '' : meta.icon}</div>
          <div class="qz-level-body">
            <div class="qz-level-title">${meta.label}</div>
            <div class="qz-level-desc">${desc}</div>
            <div class="test-progress-bar-wrap" style="margin-bottom:0;margin-top:10px;">
              <div class="test-progress-bar" style="width:${l.progressPct}%"></div>
            </div>
          </div>
          ${statusHtml}
        </div>`;
    }).join('');
  },

  openQuizSkills(section, level) {
    State._quizSection = section;
    State._quizLevel = level;
    const LEVEL_LABEL = { easy: 'سهل', medium: 'متوسط', advanced: 'متقدم' };
    document.getElementById('qz-skills-title').textContent = `مهارات المستوى ${LEVEL_LABEL[level]}`;
    App.renderQuizSkills();
    show('screen-quiz-skills');
  },

  // Sensible per-skill icon glyphs — no existing skill→icon map found in the
  // data, so this is a small local lookup by common skill-name keywords with
  // a generic fallback; purely decorative, does not affect status/logic.
  _quizSkillIcon(skillName) {
    const n = String(skillName || '');
    if (n.includes('استيعاب') || n.includes('قراء')) return '📖';
    if (n.includes('تناظر')) return '🔗';
    if (n.includes('خطأ') || n.includes('سياقي')) return '✏️';
    if (n.includes('مفرد') || n.includes('لغوي')) return '🔤';
    if (n.includes('هندس')) return '📐';
    if (n.includes('جبر')) return '➗';
    if (n.includes('حساب') || n.includes('عدد')) return '🔢';
    if (n.includes('إحصاء') || n.includes('احتمال')) return '📊';
    return '🧠';
  },

  renderQuizSkills() {
    const levels = (State._quizTree && State._quizTree[State._quizSection]) || [];
    const levelData = levels.find(l => l.level === State._quizLevel);
    const skills = levelData ? levelData.skills : [];
    document.getElementById('qz-skills-cards').innerHTML = skills.map(sk => {
      const st = App.quizStatusLabel(sk.status);
      const hasQ = sk.hasQuestions;
      const btnLabel = !hasQ ? 'قريباً' : sk.status === 'passed' || sk.status === 'failed' ? 'إعادة المحاولة' : 'ابدأ';
      // Only show a figure that is already computed elsewhere — best-attempt
      // score if the student has attempted this skill; otherwise omit the
      // line entirely rather than fabricate a placeholder.
      const scoreLine = sk.attempts ? `<div class="qz-skill-score">أفضل نتيجة: ${sk.bestCorrect}/${sk.bestTotal}</div>` : '';
      return `
        <div class="qz-skill-card">
          <div class="qz-skill-badge gap-score ${st.cls}">${st.text}</div>
          <div class="qz-skill-icon">${App._quizSkillIcon(sk.skillName)}</div>
          <div class="qz-skill-name">${escapeHtml(sk.skillName)}</div>
          ${scoreLine}
          <button class="btn btn-sm ${hasQ ? 'btn-outline' : ''}" ${hasQ ? '' : 'disabled'}
                  onclick="App.startQuizSkill('${sk.quizSkillId}')">
            ${btnLabel}
          </button>
        </div>`;
    }).join('');
  },

  async startQuizSkill(quizSkillId) {
    showLoadingScreen('جارٍ تحميل الأسئلة…');
    try {
      const { skill, questions } = await apiFetch(`/quiz-skills/${quizSkillId}/questions`);
      State.qz = { quizSkillId, skill, questions, idx: 0, answers: {} };
      document.getElementById('qt-title').textContent = skill.skillName;
      show('screen-quiz-take');
      App.renderQuizQuestion();
    } catch (e) {
      showToast(e?.message || 'تعذّر تحميل أسئلة المهارة');
      show('screen-quiz-skills');
    }
  },

  renderQuizQuestion() {
    const { questions, idx, answers } = State.qz;
    const q = questions[idx];
    const total = questions.length;
    const pct = Math.round((idx / total) * 100);

    document.getElementById('qt-progress-bar').style.width = pct + '%';
    document.getElementById('qt-progress-label').textContent = `سؤال ${idx + 1} من ${total}`;
    document.getElementById('qt-q-num').textContent = `سؤال ${idx + 1}`;
    document.getElementById('qt-q-text').textContent = q.text;

    const opts = [q.opt1, q.opt2, q.opt3, q.opt4];
    const selected = answers[q.qnum];
    document.getElementById('qt-q-opts').innerHTML = [...opts.map((opt, i) => `
      <div class="q-opt${selected === i ? ' selected' : ''}" onclick="App.quizSelect(${i})">
        <div class="opt-circle"></div><span>${escapeHtml(opt)}</span>
      </div>`),
      `<div class="q-opt dont-know${selected === 'dk' ? ' selected' : ''}" onclick="App.quizSelect('dk')">
        <div class="opt-circle"></div><span>لا أعرف الإجابة</span>
      </div>`
    ].join('');

    document.getElementById('qt-btn-prev').disabled = idx === 0;
    const isLast = idx === total - 1;
    const nextBtn = document.getElementById('qt-btn-next');
    nextBtn.textContent   = isLast ? 'إنهاء' : 'التالي';
    nextBtn.className     = 'btn ' + (isLast ? 'btn-success' : 'btn-primary');
    nextBtn.style.display = (isLast || selected !== undefined) ? 'inline-flex' : 'none';
    // Every fresh render of a question starts from a clickable button —
    // quizFinish() disables it only for the instant it's actually
    // submitting. Without unconditionally clearing it here too, a retake
    // (retakeQuizSkill -> startQuizSkill -> this render) would inherit
    // "disabled" left over from the PREVIOUS attempt's successful submit,
    // since that success path navigates away without ever re-enabling it.
    nextBtn.disabled = false;
  },

  quizSelect(i) {
    const { questions, idx } = State.qz;
    State.qz.answers[questions[idx].qnum] = i;
    App.renderQuizQuestion();
    clearTimeout(App._advanceTimer);
    if (idx < questions.length - 1) {
      App._advanceTimer = setTimeout(() => {
        if (State.qz.idx === idx) { State.qz.idx++; App.renderQuizQuestion(); }
      }, 300);
    }
  },

  quizPrev() {
    if (State.qz.idx > 0) { State.qz.idx--; App.renderQuizQuestion(); }
  },

  async quizNext() {
    const { questions, idx, answers } = State.qz;
    if (answers[questions[idx].qnum] === undefined) {
      showToast('يرجى اختيار إجابة أو "لا أعرف الإجابة" قبل المتابعة');
      return;
    }
    if (idx < questions.length - 1) { State.qz.idx++; App.renderQuizQuestion(); return; }
    await App.quizFinish();
  },

  async quizFinish() {
    // A rapid double-click/double-tap on "التالي" at the last question used
    // to fire this (and its POST /quiz-skills/:id/submit) twice before the
    // first request resolved — same class of bug as the biology quiz's
    // finish button. It doesn't duplicate a row here (the endpoint updates
    // skill_progress in place), but it does increment `attempts` twice for
    // one real attempt. Reset on failure (the catch below returns the
    // student to this same question to retry) — never reached on success,
    // since that path always moves on to the result screen.
    if (State.qz.submitting) return;
    State.qz.submitting = true;
    const _btnNext = document.getElementById('qt-btn-next');
    if (_btnNext) _btnNext.disabled = true;
    const { quizSkillId, questions, answers } = State.qz;
    showLoadingScreen('جارٍ تصحيح الإجابات…');
    try {
      const payload = questions.map(q => ({ qnum: q.qnum, selected: answers[q.qnum] }));
      const res = await apiFetch(`/quiz-skills/${quizSkillId}/submit`, {
        method: 'POST', body: JSON.stringify({ answers: payload }),
      });
      const iconEl = document.getElementById('qt-result-icon');
      iconEl.className = 'qz-result-icon ' + (res.pass ? 'pass' : 'fail');
      iconEl.innerHTML = res.pass
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
      document.getElementById('qt-result-score').textContent = `${res.correct}/${res.total}`;
      const resultPct = res.total ? Math.round((res.correct / res.total) * 100) : 0;
      document.getElementById('qt-result-bar').style.width = resultPct + '%';
      document.getElementById('qt-result-detail').textContent = res.pass
        ? 'أحسنت! اجتزت هذه المهارة بنجاح.'
        : 'لم تحقق نسبة النجاح المطلوبة (٤ من ٥) — يمكنك إعادة المحاولة.';

      // Smart Feedback & Tiered Hinting Engine — review data only ever
      // arrives here, AFTER submission; never shown during quiz-take.
      State._quizReview = (res.review || []).some(r => r.explanation || r.smartHint) ? res.review : null;
      const reviewToggle = document.getElementById('qt-review-toggle');
      const reviewList = document.getElementById('qt-review-list');
      reviewList.style.display = 'none';
      reviewList.innerHTML = '';
      reviewToggle.textContent = '🔍 مراجعة الأخطاء والشروحات التعليمية';
      reviewToggle.style.display = State._quizReview ? '' : 'none';

      // Patch the cached tree in-memory so gating/progress reflect this attempt
      // immediately without a full re-fetch of /api/quiz-structure.
      const levels = State._quizTree && State._quizTree[res.section];
      const levelData = levels && levels.find(l => l.level === res.level);
      const skillEntry = levelData && levelData.skills.find(s => s.quizSkillId === quizSkillId);
      if (skillEntry) {
        skillEntry.status = res.pass ? 'passed' : 'failed';
        skillEntry.bestCorrect = Math.max(skillEntry.bestCorrect, res.correct);
        skillEntry.attempts = (skillEntry.attempts || 0) + 1;
        const passedCount = levelData.skills.filter(s => s.status === 'passed').length;
        levelData.progressPct = Math.round((passedCount / levelData.skills.length) * 100);
        const LEVEL_ORDER = ['easy', 'medium', 'advanced'];
        const nextLevel = levels.find(l => LEVEL_ORDER.indexOf(l.level) === LEVEL_ORDER.indexOf(res.level) + 1);
        if (nextLevel && levelData.skills.every(s => s.status === 'passed')) nextLevel.locked = false;
      }
      show('screen-quiz-skill-result');
    } catch (e) {
      State.qz.submitting = false;
      if (_btnNext) _btnNext.disabled = false;
      showToast(e?.message || 'تعذّر إرسال الإجابات');
      show('screen-quiz-take');
    }
  },

  retakeQuizSkill() {
    App.startQuizSkill(State.qz.quizSkillId);
  },

  // ── Smart Feedback & Tiered Hinting Engine — review section ──────────────
  // Shown only from screen-quiz-skill-result, only on demand (button toggle),
  // never during quiz-take. Content already arrived with the submit response
  // (App.quizFinish), server-gated per question/attempt — this only renders
  // what it was given, no extra request and no client-side reveal logic.
  toggleQuizReview() {
    const list = document.getElementById('qt-review-list');
    const btn = document.getElementById('qt-review-toggle');
    const opening = list.style.display === 'none';
    if (opening) {
      App.renderQuizReview();
      list.style.display = 'flex';
      btn.textContent = 'إخفاء المراجعة ▲';
    } else {
      list.style.display = 'none';
      btn.textContent = '🔍 مراجعة الأخطاء والشروحات التعليمية';
    }
  },

  renderQuizReview() {
    const list = document.getElementById('qt-review-list');
    const review = State._quizReview || [];
    const letters = ['أ', 'ب', 'ج', 'د'];

    list.innerHTML = review.map((r, i) => {
      const optsHtml = r.opts.map((opt, oi) => {
        let cls = '';
        if (r.correctIndex !== null && oi === r.correctIndex) cls = ' qz-rv-opt-correct';
        else if (oi === r.selected) cls = ' qz-rv-opt-wrong';
        const mark = cls === ' qz-rv-opt-correct' ? ' ✅' : (cls === ' qz-rv-opt-wrong' ? ' ❌' : '');
        return `<div class="qz-rv-opt${cls}"><span class="qz-rv-opt-letter">${letters[oi]}</span><span>${escapeHtml(opt)}</span><span class="qz-rv-opt-mark">${mark}</span></div>`;
      }).join('');

      let feedbackHtml;
      if (r.smartHint) {
        // Advanced tier, first wrong attempt: hint only, answer withheld server-side.
        feedbackHtml = `
          <div class="qz-rv-hint">
            <div class="qz-rv-hint-head">💡 تلميح ذكي</div>
            <div class="qz-rv-hint-text">${escapeHtml(r.smartHint)}</div>
            <div class="qz-rv-hint-note">أعد محاولة هذه المهارة لكشف الشرح الكامل بعد المحاولة الثانية.</div>
          </div>`;
      } else if (r.explanation || r.relation || r.goldenRule) {
        feedbackHtml = `
          <div class="qz-rv-fb">
            ${r.relation ? `<div class="qz-rv-fb-row"><span class="qz-rv-fb-icon">🎯</span><div><b>نوع العلاقة</b><p>${escapeHtml(r.relation)}</p></div></div>` : ''}
            ${r.explanation ? `<div class="qz-rv-fb-row"><span class="qz-rv-fb-icon">📘</span><div><b>الشرح</b><p>${escapeHtml(r.explanation)}</p></div></div>` : ''}
            ${r.goldenRule ? `<div class="qz-rv-fb-row qz-rv-golden"><span class="qz-rv-fb-icon">💎</span><div><b>القاعدة الذهبية</b><p>${escapeHtml(r.goldenRule)}</p></div></div>` : ''}
          </div>`;
      } else {
        feedbackHtml = '';
      }

      return `
        <div class="qz-rv-card">
          <div class="qz-rv-num">سؤال ${i + 1}${r.isCorrect ? ' — ✅ إجابة صحيحة' : ' — ❌ إجابة خاطئة'}</div>
          <div class="qz-rv-text">${escapeHtml(r.text)}</div>
          <div class="qz-rv-opts">${optsHtml}</div>
          ${feedbackHtml}
        </div>`;
    }).join('');
  },

  // ── Gap Analysis ──────────────────────────────────────────────────────────
  async processResults() {
    // window.QUESTION_BANK never has `q.ans` for a student (GET /api/questions
    // strips it server-side to stop answers leaking over the network), so
    // `State.testAnswers[q.id] === q.ans` below is comparing against
    // `undefined` for every question — this client-side "score" is always
    // 0% and must never be trusted as the real result. It only exists to
    // pre-render *something* instantly; the actual grading that becomes the
    // saved plan happens server-side in POST /api/plans, which has the real
    // `ans` values and grades from the raw `answers`/`selfDiag` sent below.
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
    App._pendingAnswers = { ...State.testAnswers };
    App._pendingSelfDiag = { ...State.selfDiag };
    const _loadEl = document.getElementById('processing-loading');
    const _errEl  = document.getElementById('processing-error');
    if (_loadEl) _loadEl.style.display = '';
    if (_errEl)  _errEl.style.display  = 'none';
    await App._submitPlan(gaps, App._pendingAnswers, App._pendingSelfDiag, { section: State.diagSection || 'both' });
  },

  async _submitPlan(gaps, answers, selfDiag, opts = {}) {
    const loadEl = document.getElementById('processing-loading');
    const errEl  = document.getElementById('processing-error');
    if (loadEl) loadEl.style.display = '';
    if (errEl)  errEl.style.display  = 'none';
    let plan;
    // A student can lose their whole 50-question diagnostic to a single
    // mobile-network blip (cell tower handoff mid-request) — apiFetch throws
    // a plain NETWORK_ERROR/TIMEOUT (no `.status`) when the request never
    // reached the server, as opposed to a real HTTP error response. Retry
    // only that case a couple of times before giving up.
    const RETRY_DELAYS_MS = [1200, 2500];
    for (let attempt = 0; ; attempt++) {
      try {
        // `answers`/`selfDiag` (raw per-question picks) let the server grade
        // with the real `ans` values it has access to — `gaps` is sent too,
        // only as a fallback for non-student roles that don't send answers.
        plan = await DB.addAttempt({
          studentId: State.student.id, studentName: State.student.name, status: 'active',
          gaps, answers, selfDiag, adminNote: '',
          section: opts.section || State.diagSection || 'both',
          skipDiagnostic: !!opts.skipDiagnostic,
        });
        break;
      } catch (e) {
        const isNetworkIssue = !e?.status && (String(e?.message || '').startsWith('NETWORK_ERROR') || e?.message === 'TIMEOUT');
        if (isNetworkIssue && attempt < RETRY_DELAYS_MS.length) {
          ActivityLog.warn(`⏳ إعادة محاولة حفظ الخطة (${attempt + 1}/${RETRY_DELAYS_MS.length}) بعد خطأ شبكة`);
          await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        ActivityLog.error('✗ حفظ الخطة فشل: ' + (e?.message || e));
        serverLog('error', 'plan', '✗ حفظ الخطة فشل: ' + (e?.message || e));
        if (loadEl) loadEl.style.display = 'none';
        if (errEl)  errEl.style.display  = '';
        return;
      }
    }
    State.currentPlan = plan;
    App.renderLevelAnalysis(plan);
    show('screen-level-analysis');
  },

  _pendingGaps: null,
  _pendingAnswers: null,
  _pendingSelfDiag: null,

  async retryProcessResults() {
    if (App._pendingGaps) {
      await App._submitPlan(App._pendingGaps, App._pendingAnswers, App._pendingSelfDiag, { section: State.diagSection || 'both' });
    }
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
    // A section-scoped diagnostic (verbal-only or quant-only) legitimately produces
    // zero gaps for the other category — hide that whole block instead of showing
    // an empty table.
    document.querySelectorAll('#screen-level-analysis .la-verbal-block').forEach(el => el.style.display = verbal.length ? '' : 'none');
    document.querySelectorAll('#screen-level-analysis .la-quant-block').forEach(el => el.style.display = quant.length ? '' : 'none');
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
    document.querySelectorAll('#screen-support-plan .sp-verbal-block').forEach(el => el.style.display = verbal.length ? '' : 'none');
    document.querySelectorAll('#screen-support-plan .sp-quant-block').forEach(el => el.style.display = quant.length ? '' : 'none');

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
          ${State.role === 'dev' ? `<button class="btn btn-outline btn-sm" title="توليد رابط دخول تجريبي (اختبار)" onclick="event.stopPropagation();App.generateTestAccessLink('${st.id}')">🔗 اختبار</button>` : ''}
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
    let   tabGT      = document.getElementById('tab-gt-results');
    if (!tabGT) {
      tabGT = document.createElement('div');
      tabGT.id = 'tab-gt-results';
      tabGT.style.cssText = 'display:none;';
      document.getElementById('admin-student-list')?.parentNode?.appendChild(tabGT);
    }

    // Show/hide toolbar and student list
    if (toolbar) toolbar.style.display = tab === 'students' ? 'block' : 'none';
    if (listEl)  listEl.style.display  = tab === 'students' ? ''      : 'none';

    // Show/hide tab panels
    if (tabStats) tabStats.style.display = tab === 'stats'       ? 'block' : 'none';
    if (tabSup)   tabSup.style.display   = tab === 'supervisors' ? 'block' : 'none';
    if (tabQ)     tabQ.style.display     = tab === 'questions'   ? 'block' : 'none';
    if (tabBC)    tabBC.style.display    = tab === 'broadcast'   ? 'block' : 'none';
    if (tabGT)    tabGT.style.display    = tab === 'gt-results'  ? 'block' : 'none';

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    if (tab === 'students') { App.renderAdminDashboard('students'); return; }
    if (tab === 'stats')    { App.renderAdminDashboard('stats'); App.renderAdminStats(); App.renderPerformanceTab(); return; }
    if (tab === 'supervisors') { App.renderAdminDashboard('supervisors'); App.loadSupervisors(); return; }
    if (tab === 'questions')   { App.renderAdminDashboard('questions');   App.loadQuestions();   return; }
    if (tab === 'broadcast')   { App.renderAdminDashboard('broadcast');   App.renderBroadcastHistory(); return; }
    if (tab === 'gt-results')  { App.loadGTResults(tabGT); return; }
    App.renderAdminDashboard(tab);
  },

  async loadGTResults(container) {
    container.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل…</div>';
    try {
      const { results } = await apiFetch('/general-tests/results');
      if (!results.length) {
        container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);">لا توجد نتائج بعد</div>';
        return;
      }
      // Group by student
      const byStudent = {};
      for (const r of results) {
        if (!byStudent[r.student_id]) byStudent[r.student_id] = { name: r.student_name, school: r.school, attempts: [] };
        byStudent[r.student_id].attempts.push(r);
      }
      // Filter by testNum selector
      const testNums = [...new Set(results.map(r => r.test_num))].sort((a,b) => a-b);
      const filterOpts = `<option value="">كل الاختبارات</option>` + testNums.map(n => `<option value="${n}">اختبار رقم ${n}</option>`).join('');

      const rows = Object.entries(byStudent).map(([sid, data]) => {
        const best = data.attempts.reduce((b, a) => a.score > b.score ? a : b, data.attempts[0]);
        const attempts = data.attempts.map(a => {
          const ansArr = Array.isArray(a.answers) ? a.answers : [];
          const verbal = ansArr.filter(d => d.q <= 25);
          const quant  = ansArr.filter(d => d.q > 25);
          const vRight = verbal.filter(d => d.a === d.corr).length;
          const qRight = quant.filter(d => d.a === d.corr).length;
          return `<div style="background:#f8fafc;border-radius:8px;padding:8px 12px;margin-top:6px;display:flex;gap:12px;align-items:center;font-size:12px;flex-wrap:wrap;">
            <span style="font-weight:700;color:${a.score>=70?'#16a34a':a.score>=50?'#d97706':'#dc2626'}">${a.score}%</span>
            <span style="color:#64748b;">اختبار ${a.test_num}</span>
            <span style="color:#64748b;">📚 ${vRight}/${verbal.length}</span>
            <span style="color:#64748b;">🔢 ${qRight}/${quant.length}</span>
            <span style="color:#94a3b8;font-size:11px;">${new Date(a.created_at).toLocaleDateString('ar-SA')}</span>
          </div>`;
        }).join('');
        return `<div style="background:#fff;border-radius:16px;border:1.5px solid #e5e7eb;padding:16px;margin-bottom:10px;" data-school="${escapeHtml(data.school||'')}">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:120px;">
              <div style="font-weight:700;font-size:14px;">${escapeHtml(data.name||'—')}</div>
              <div style="font-size:12px;color:#64748b;">${escapeHtml(data.school||'')}</div>
            </div>
            <span style="background:${best.score>=70?'#dcfce7':best.score>=50?'#fef3c7':'#fee2e2'};color:${best.score>=70?'#16a34a':best.score>=50?'#92400e':'#dc2626'};padding:4px 12px;border-radius:20px;font-weight:800;font-size:14px;">${best.score}%</span>
            <span style="font-size:11px;color:#94a3b8;">${data.attempts.length} محاولة</span>
          </div>
          ${attempts}
        </div>`;
      }).join('');

      container.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
          <select onchange="App._filterGTResults(this.value)" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;">
            ${filterOpts}
          </select>
          <span style="font-size:13px;color:#64748b;">${Object.keys(byStudent).length} طالب</span>
        </div>
        <div id="gt-results-list">${rows}</div>`;
      container.dataset.raw = JSON.stringify(results);
    } catch(e) {
      container.innerHTML = `<div style="padding:24px;color:#dc2626;">فشل التحميل: ${e.message}</div>`;
    }
  },

  _filterGTResults(testNum) {
    const container = document.getElementById('tab-gt-results');
    if (!container || !container.dataset.raw) return;
    const results = JSON.parse(container.dataset.raw);
    const filtered = testNum ? results.filter(r => String(r.test_num) === testNum) : results;
    const byStudent = {};
    for (const r of filtered) {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = { name: r.student_name, school: r.school, attempts: [] };
      byStudent[r.student_id].attempts.push(r);
    }
    const listEl = document.getElementById('gt-results-list');
    if (!listEl) return;
    if (!Object.keys(byStudent).length) { listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">لا توجد نتائج</div>'; return; }
    listEl.innerHTML = Object.entries(byStudent).map(([sid, data]) => {
      const best = data.attempts.reduce((b, a) => a.score > b.score ? a : b, data.attempts[0]);
      const attempts = data.attempts.map(a => {
        const ansArr = Array.isArray(a.answers) ? a.answers : [];
        const verbal = ansArr.filter(d => d.q <= 25);
        const quant  = ansArr.filter(d => d.q > 25);
        const vRight = verbal.filter(d => d.a === d.corr).length;
        const qRight = quant.filter(d => d.a === d.corr).length;
        return `<div style="background:#f8fafc;border-radius:8px;padding:8px 12px;margin-top:6px;display:flex;gap:12px;align-items:center;font-size:12px;flex-wrap:wrap;">
          <span style="font-weight:700;color:${a.score>=70?'#16a34a':a.score>=50?'#d97706':'#dc2626'}">${a.score}%</span>
          <span style="color:#64748b;">اختبار ${a.test_num}</span>
          <span style="color:#64748b;">📚 ${vRight}/${verbal.length}</span>
          <span style="color:#64748b;">🔢 ${qRight}/${quant.length}</span>
          <span style="color:#94a3b8;font-size:11px;">${new Date(a.created_at).toLocaleDateString('ar-SA')}</span>
        </div>`;
      }).join('');
      return `<div style="background:#fff;border-radius:16px;border:1.5px solid #e5e7eb;padding:16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:120px;">
            <div style="font-weight:700;font-size:14px;">${escapeHtml(data.name||'—')}</div>
            <div style="font-size:12px;color:#64748b;">${escapeHtml(data.school||'')}</div>
          </div>
          <span style="background:${best.score>=70?'#dcfce7':best.score>=50?'#fef3c7':'#fee2e2'};color:${best.score>=70?'#16a34a':best.score>=50?'#92400e':'#dc2626'};padding:4px 12px;border-radius:20px;font-weight:800;font-size:14px;">${best.score}%</span>
          <span style="font-size:11px;color:#94a3b8;">${data.attempts.length} محاولة</span>
        </div>
        ${attempts}
      </div>`;
    }).join('');
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

  // ── مؤشر الأداء — Student view (one card, verbal + quant as two colored series) ──
  _catSeries(myPlans, category) {
    return myPlans
      .map(p => {
        const gaps = p.gaps.filter(g => g.category === category);
        const score = gaps.length ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : null;
        return { plan: p, score };
      })
      .filter(x => x.score !== null);
  },

  // Builds one independent .sh-perf-card (own title, own single-line smooth
  // chart with hover tooltip + line-draw animation, own stat row) for a
  // single category. Two of these render side by side, never merged.
  _buildPerfCard(myPlans, category, title, icon, color, tipLabel, tipId) {
    const series = App._catSeries(myPlans, category);
    if (!series.length) return '';

    const latestSc = series[0].score;
    const prevSc   = series.length > 1 ? series[1].score : null;
    const delta = prevSc !== null ? latestSc - prevSc : null;
    const deltaColor = delta === null ? '#94a3b8' : delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#94a3b8';
    const deltaArrow = delta === null ? '◉' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const deltaLabel = delta === null ? '' : delta > 0 ? `+${delta}` : `${delta}`;

    const ordered = [...series].reverse(); // oldest -> newest
    const W = 300, H = 120, pL = 8, pR = 8, pT = 22, pB = 10;
    const cW = W - pL - pR, cH = H - pT - pB;
    const n = ordered.length;
    const xs = i => pL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
    const ys = s => pT + cH - (s / 100) * cH;
    const gridSvg = [0, 25, 50, 75, 100].map(v => {
      const y = ys(v);
      return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="rgba(100,116,139,.14)" stroke-width="1" stroke-dasharray="3,4"/>`;
    }).join('');

    const pathPts = ordered.map((p, i) => ({ x: xs(i), y: ys(p.score) }));
    const pathD = App._smoothPath(pathPts);
    const dotsSvg = ordered.map((p, i) => {
      const isLast = i === n - 1;
      const cx = xs(i), cy = ys(p.score);
      const halo = isLast ? `<circle cx="${cx}" cy="${cy}" r="10" fill="${color}" opacity=".16" class="sh-perf-halo"/>` : '';
      return `${halo}<circle cx="${cx}" cy="${cy}" r="${isLast ? 6 : 4}" fill="${isLast ? color : 'var(--surface)'}" stroke="${color}" stroke-width="2.2"/>`;
    }).join('');
    const bandW = n > 1 ? cW / (n - 1) : cW;
    const hoverSvg = ordered.map((p, i) => {
      const cx = xs(i);
      const bx = Math.max(pL, cx - bandW / 2);
      return `<rect x="${bx}" y="${pT - 8}" width="${bandW}" height="${cH + 16}" fill="transparent"
                onmouseenter="App._perfTip(event,'${tipId}','${tipLabel}: ${p.score}%')" onmouseleave="App._perfTipHide('${tipId}')"
                style="cursor:pointer"/>`;
    }).join('');

    const chartSvg = `<div style="position:relative;">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;overflow:visible;">
        ${gridSvg}
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"
              pathLength="1" class="sh-perf-line"/>
        ${dotsSvg}
        ${hoverSvg}
      </svg>
      <div id="sh-perf-tip-${tipId}" class="sh-perf-tip" style="display:none;"></div>
    </div>`;

    return `<div class="sh-perf-card">
      <div class="sh-perf-title" style="color:${color};">${icon} ${title}</div>
      ${chartSvg}
      <div class="sh-perf-row" style="border-inline-start-color:${color};">
        <div class="sh-perf-row-stats">
          ${prevSc !== null ? `<span class="sh-perf-row-stat"><b>${prevSc}%</b> سابقة</span>` : ''}
          ${delta !== null ? `<span class="sh-perf-row-stat" style="color:${deltaColor};font-weight:800;">${deltaArrow}${deltaLabel}</span>` : ''}
        </div>
        <span class="sh-perf-row-stat sh-perf-row-latest" style="color:${color};"><b>${latestSc}%</b> آخر محاولة</span>
      </div>
      <div class="sh-perf-footer">محاولاتك: ${series.length} · استمر وأنت قادر! 💪</div>
    </div>`;
  },

  renderStudentPerformanceCard() {
    const el = document.getElementById('sh-perf-card');
    if (!el) return;
    const myPlans = DB.studentPlans(State.student.id);
    if (myPlans.length < 2) { el.style.display = 'none'; return; }

    const verbalCard = App._buildPerfCard(myPlans, 'verbal', 'مؤشر أدائك — اللفظي', '📘', '#3F7CB8', 'اللفظي', 'v');
    const quantCard  = App._buildPerfCard(myPlans, 'quantitative', 'مؤشر أدائك — الكمي', '📗', '#4FA877', 'الكمي', 'q');
    if (!verbalCard && !quantCard) { el.style.display = 'none'; return; }

    el.style.display = 'block';
    el.innerHTML = `<div class="sh-perf-grid">${verbalCard}${quantCard}</div>`;
  },

  // Catmull-Rom -> cubic-bezier smoothing for the performance chart's line paths.
  _smoothPath(pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    const t = 0.18;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  },

  _perfTip(e, tipId, text) {
    const tip = document.getElementById('sh-perf-tip-' + tipId);
    if (!tip) return;
    tip.textContent = text;
    tip.style.display = 'block';
    const wrap = tip.parentElement.getBoundingClientRect();
    const x = e.clientX - wrap.left;
    tip.style.left = Math.min(Math.max(x, 8), wrap.width - 8) + 'px';
  },

  _perfTipHide(tipId) {
    const tip = document.getElementById('sh-perf-tip-' + tipId);
    if (tip) tip.style.display = 'none';
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
    listEl.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل…</div>';
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
    listEl.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل…</div>';
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
        <input type="text" id="eq-${k}" class="form-input" value="${escapeHtml(q[k] || '')}" placeholder="الخيار ${i+1}" style="flex:1;font-size:13px;">
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

    // History table — expandable rows showing skill breakdown
    const histBody = document.getElementById('sdm-history-body');
    if (allPlans.length) {
      histBody.innerHTML = allPlans.map((p, i) => {
        const avg = p.gaps.length ? Math.round(p.gaps.reduce((s,g)=>s+g.pct,0)/p.gaps.length) : 0;
        const cls = avg >= 71 ? 'score-high' : avg >= 50 ? 'score-mid' : 'score-low';
        const date = new Date(p.createdAt).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
        const detailRows = p.gaps.map(g => {
          const gcls = g.pct >= 71 ? 'score-high' : g.pct >= 50 ? 'score-mid' : 'score-low';
          const cat = g.category === 'verbal' ? '📚' : '🔢';
          return `<tr style="background:#f8fafc;">
            <td style="padding:5px 8px;font-size:12px;color:#64748b;" colspan="2">${cat} ${escapeHtml(g.skillName)}</td>
            <td style="text-align:center;"><span class="gap-score ${gcls}" style="font-size:11px;padding:2px 8px;">${g.pct}%</span></td>
            <td></td>
          </tr>`;
        }).join('');
        const idx = allPlans.length - i;
        return `<tr style="cursor:pointer;" onclick="App._togglePlanDetail('pd-${i}')">
          <td style="text-align:center;font-weight:700;">${idx}</td>
          <td>${date}</td>
          <td style="text-align:center;"><span class="gap-score ${cls}">${avg}%</span></td>
          <td style="text-align:center;font-size:12px;color:#2563eb;">عرض ▾</td>
        </tr>
        <tr id="pd-${i}" style="display:none;"><td colspan="4" style="padding:0;">
          <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
        </td></tr>`;
      }).join('');
    } else {
      histBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:16px;">لا توجد محاولات</td></tr>';
    }

    document.getElementById('student-detail-modal').classList.add('open');
    State.detailStudentId = studentId;
    App.loadDetailChatMessages(studentId);

    // Load General Test results async
    const gtEl = document.getElementById('sdm-gt-content');
    if (gtEl) {
      gtEl.innerHTML = '<div class="inline-loading" style="padding:12px;"><span class="inline-spinner"></span>جاري التحميل…</div>';
      apiFetch(`/general-tests/results?studentId=${encodeURIComponent(studentId)}`).then(({ results }) => {
        if (!results.length) { gtEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);">لا توجد نتائج</div>'; return; }
        const labels = ['أ','ب','ج','د'];
        gtEl.innerHTML = results.map((r, ri) => {
          const ans = Array.isArray(r.answers) ? r.answers : [];
          const verbal = ans.filter(d => d.q <= 25);
          const quant  = ans.filter(d => d.q > 25);
          const vRight = verbal.filter(d => d.a === d.corr).length;
          const qRight = quant.filter(d => d.a === d.corr).length;
          const cls = r.score >= 70 ? 'score-high' : r.score >= 50 ? 'score-mid' : 'score-low';
          const date = new Date(r.created_at).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
          const wrongRows = ans.filter(d => d.a !== d.corr).map(d =>
            `<tr style="background:#fff8f8;">
              <td style="padding:4px 8px;font-size:12px;color:#64748b;text-align:center;">${d.q}</td>
              <td style="padding:4px 8px;font-size:12px;color:#64748b;text-align:center;">${d.q<=25?'📚':'🔢'}</td>
              <td style="padding:4px 8px;font-size:12px;color:#dc2626;font-weight:700;text-align:center;">${d.a!==null&&d.a!==undefined?labels[d.a]:'—'}</td>
              <td style="padding:4px 8px;font-size:12px;color:#16a34a;font-weight:700;text-align:center;">${labels[d.corr]}</td>
            </tr>`).join('');
          const detailHtml = `<div style="padding:8px 0 4px;">
            <div style="display:flex;gap:12px;margin-bottom:6px;font-size:12px;">
              <span style="color:#64748b;">📚 لفظي: <b>${vRight}/${verbal.length}</b></span>
              <span style="color:#64748b;">🔢 كمي: <b>${qRight}/${quant.length}</b></span>
            </div>
            ${wrongRows ? `<div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:4px;">الأخطاء:</div>
            <table style="width:100%;border-collapse:collapse;">
              <thead><tr style="background:#f1f5f9;">
                <th style="padding:4px 6px;font-size:11px;color:#64748b;">رقم</th>
                <th style="padding:4px 6px;font-size:11px;color:#64748b;">قسم</th>
                <th style="padding:4px 6px;font-size:11px;color:#64748b;">إجابته</th>
                <th style="padding:4px 6px;font-size:11px;color:#64748b;">الصحيحة</th>
              </tr></thead>
              <tbody>${wrongRows}</tbody>
            </table>` : '<div style="color:#16a34a;font-size:12px;">✅ جميع الإجابات صحيحة</div>'}
          </div>`;
          return `<div style="background:#fff;border-radius:12px;border:1.5px solid #e5e7eb;padding:12px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="App._toggleGTDetail('gtd-${ri}')">
              <span style="font-weight:700;font-size:13px;">اختبار رقم ${r.test_num}</span>
              <span style="color:#64748b;font-size:12px;">${date}</span>
              <span class="gap-score ${cls}" style="margin-right:auto;">${r.score}%</span>
              <span style="font-size:11px;color:#2563eb;">عرض ▾</span>
            </div>
            <div id="gtd-${ri}" style="display:none;border-top:1px solid #f1f5f9;margin-top:8px;padding-top:8px;">${detailHtml}</div>
          </div>`;
        }).join('');
      }).catch(() => { gtEl.innerHTML = '<div style="text-align:center;padding:12px;color:#dc2626;">فشل التحميل</div>'; });
    }
  },

  _togglePlanDetail(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  },

  _toggleGTDetail(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
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
  _chatIsModal: false, // true when student uses the compact modal widget

  // Student: open chat as a modal card widget (not full-screen)
  async goToChat() {
    App._chatIsModal = true;
    const modal = document.getElementById('student-chat-modal');
    if (modal) modal.style.display = 'flex';
    const msgs = document.getElementById('schat-messages');
    if (msgs) msgs.innerHTML = '<div class="chat-empty">جارٍ التحميل…</div>';
    // Try to pick an admin — but open chat regardless
    try {
      const data = await apiFetch(`/admins?school=${encodeURIComponent(State.school || '')}`);
      const admins = (data.admins || []).filter(a => !a.school || a.school === State.school || a.school === '*');
      if (admins.length) {
        State.chatAdminId   = admins[0].id;
        State.chatAdminName = admins[0].name || 'المشرف';
      }
    } catch {}
    State.chatStudentId = null;
    App._chatMsgCount = 0;
    App.loadChatMessages();
    App.startChatPoll();
  },

  async submitRequiredPhone() {
    const input = document.getElementById('req-phone-input');
    const errEl = document.getElementById('req-phone-err');
    const btn   = document.getElementById('req-phone-btn');
    const phone = (input?.value || '').trim();
    if (!/^\d{10}$/.test(phone)) {
      if (errEl) { errEl.textContent = 'أدخل رقم جوال صحيح (١٠ أرقام)'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحفظ…'; }
    try {
      await DB.updateStudentPhone(State.student.id, phone);
      State.student.phone = phone;
      try {
        const _k1 = _skey('lg_session', 'student');
        const _raw1 = sessionStorage.getItem(_k1);
        if (_raw1) { const _s = JSON.parse(_raw1); _s.phone = phone; sessionStorage.setItem(_k1, JSON.stringify(_s)); }
      } catch(_) {}
      try {
        const _k2 = _skey('lg_xsession', 'student');
        const _raw2 = localStorage.getItem(_k2);
        if (_raw2) { const _s = JSON.parse(_raw2); _s.phone = phone; localStorage.setItem(_k2, JSON.stringify(_s)); }
      } catch(_) {}
      App._hidePhoneGate();
      _routeToCurrentPath();
      setTimeout(() => App._checkBroadcasts(), 1500);
    } catch(e) {
      if (errEl) { errEl.textContent = 'تعذّر الحفظ — حاول مرة أخرى'; errEl.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.textContent = 'حفظ ومتابعة ←'; }
    }
  },

  _showPhoneGate() {
    const m = document.getElementById('phone-gate-modal');
    if (!m) return;
    m.style.display = 'flex';
    const inp = document.getElementById('req-phone-input');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
    const err = document.getElementById('req-phone-err');
    if (err) err.style.display = 'none';
    const btn = document.getElementById('req-phone-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'حفظ ومتابعة ←'; }
  },

  _hidePhoneGate() {
    const m = document.getElementById('phone-gate-modal');
    if (m) m.style.display = 'none';
  },

  _checkPhoneGate() {
    if (State.role === 'student' && State.student && !State.student.phone) {
      App._showPhoneGate();
    }
  },

  closeStudentChatModal() {
    clearInterval(App._chatTimer);
    App._chatTimer = null;
    App._chatIsModal = false;
    const modal = document.getElementById('student-chat-modal');
    if (modal) modal.style.display = 'none';
    const badge = document.getElementById('chat-unread-badge');
    if (badge) badge.style.display = 'none';
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
    App.startChatPoll();
  },

  openAdminChatWith(studentId, studentName) {
    State.chatStudentId  = studentId;
    State.chatStudentName = studentName;
    State.chatAdminId    = null;
    App._chatOpenConv(studentName, 'طالب');
    App._chatMsgCount = 0;
    App.loadChatMessages();
    App.startChatPoll();
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
    // Avatar initial always uses the plain name (not the "أ | " prefix), only
    // the visible label gets it, and only when this is an admin conversation.
    const displayName = role === 'مشرف' ? adminLabel(name) : name;
    if (hdr) hdr.innerHTML = `
      <button class="wachat-back-btn" onclick="App._chatShowSidebar()" style="${window.innerWidth<=640?'':'display:none'}">→</button>
      <div class="wachat-contact-avatar" style="width:36px;height:36px;font-size:14px;">${escapeHtml(name.charAt(0))}</div>
      <div>
        <div class="wachat-conv-name">${escapeHtml(displayName)}</div>
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
    if (back === 'screen-student-home') App._checkPhoneGate();
  },

  async loadChatMessages() {
    const el = document.getElementById(App._chatIsModal ? 'schat-messages' : 'chat-messages');
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
      } else if (State.student) {
        // Never scope the student's own view to a single admin: replies get
        // stored under whichever admin actually answered (recipient_admin_id
        // = that admin's own id, set in sendChatMsg() below), which can
        // differ from admins[0] — the admin State.chatAdminId defaults to
        // when the chat is first opened. Filtering by that one id made a
        // reply from any *other* admin invisible to the student. Always show
        // the full thread with the school's whole admin team instead, same
        // as the "support" branch above already does.
        const data = await apiFetch(`/messages?studentId=${State.student.id}`);
        msgs = data.messages || [];
        if (msgs.some(m => m.sender_type === 'admin' && !m.is_read))
          readPatch = { studentId: State.student.id, readerType: 'student' };
      }
    } catch { return; }

    if (readPatch) apiFetch('/messages/read', { method:'PATCH', body: JSON.stringify(readPatch) }).catch(() => {});

    if (!msgs.length) { el.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد — ابدأ المحادثة 👋</div>'; App._chatMsgCount = 0; return; }
    // Rebuilding innerHTML always resets scrollTop to 0, and this function is
    // called on every poll/WebSocket tick — so without this guard, scrolling
    // up to read older messages while a background refresh lands would snap
    // the view back to the top. Only rebuild (and only auto-scroll to the
    // newest message) when the admin/student is already near the bottom, or
    // this is the conversation's very first render.
    const wasEmpty = App._chatMsgCount === 0;
    const nearBottom = wasEmpty || (el.scrollHeight - el.scrollTop - el.clientHeight < 150);
    if (!nearBottom && msgs.length === App._chatMsgCount) { App._chatMsgCount = msgs.length; return; }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    el.innerHTML = msgs.map(m => {
      const isMine = (State.role === 'admin' || State.role === 'director' || State.role === 'support') ? m.sender_type === 'admin' : m.sender_type === 'student';
      const senderName = isMine ? 'أنت' : ((State.role === 'admin' || State.role === 'director' || State.role === 'support') ? escapeHtml(m.student_name || 'الطالب') : escapeHtml(adminLabel(m.admin_name || State.chatAdminName || 'المشرف')));
      const time = new Date(m.created_at).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' });
      return `<div style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};">
        <div class="chat-bubble ${isMine ? 'sent' : 'received'}">${escapeHtml(m.body)}</div>
        <div class="chat-time">${senderName} · ${time}</div>
      </div>`;
    }).join('');
    // Rebuilding innerHTML always resets scrollTop to 0 — restore the
    // reader's position (by distance from bottom) unless they were already
    // near the bottom, in which case snap to the newest message as before.
    el.scrollTop = nearBottom ? el.scrollHeight : (el.scrollHeight - el.clientHeight - distanceFromBottom);
    App._chatMsgCount = msgs.length;
    const badge = document.getElementById('chat-unread-badge');
    if (badge) badge.style.display = 'none';
  },

  startChatPoll() {
    clearInterval(App._chatTimer);
    App._chatTimer = setInterval(async () => {
      const screenActive = document.getElementById('screen-chat').classList.contains('active');
      const modalActive  = App._chatIsModal && document.getElementById('student-chat-modal')?.style.display !== 'none';
      if (!screenActive && !modalActive) { clearInterval(App._chatTimer); return; }
      try {
        let count = 0;
        if ((State.role === 'admin' || State.role === 'director') && State.chatStudentId) {
          const d = await apiFetch(`/messages?studentId=${State.chatStudentId}&adminId=${State.admin.id}`);
          count = (d.messages || []).length;
        } else if (State.role === 'support' && State.chatStudentId) {
          const d = await apiFetch(`/messages?studentId=${State.chatStudentId}`);
          count = (d.messages || []).length;
        } else if (State.student) {
          // Same full-thread fetch as loadChatMessages() — see the comment
          // there for why this must not be scoped to a single admin id.
          const d = await apiFetch(`/messages?studentId=${State.student.id}`);
          count = (d.messages || []).length;
        }
        if (count !== App._chatMsgCount) App.loadChatMessages();
      } catch {}
    }, 6000);
  },

  async sendChatMsg() {
    const input = document.getElementById(App._chatIsModal ? 'schat-input' : 'chat-input');
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

  // ── Support Hub (chat + tickets entry point) ────────────────────────────
  openSupportHub() {
    show('screen-support-hub');
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
    const phoneGroup = document.getElementById('nt-phone-group');
    document.getElementById('nt-phone').value = '';
    phoneGroup.style.display = State.student?.phone ? 'none' : '';
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
    let phone;
    const phoneGroup = document.getElementById('nt-phone-group');
    if (phoneGroup.style.display !== 'none') {
      phone = document.getElementById('nt-phone').value.trim();
      if (!/^05\d{8}$/.test(phone)) { showAlert(errEl, 'سجّل رقم جوالك (05XXXXXXXX) قبل رفع طلب الدعم'); return; }
    }
    const btn = document.querySelector('#new-ticket-modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الإرسال...'; }
    try {
      await apiFetch('/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, body, category, priority, phone }),
      });
      if (phone) State.student.phone = phone;
      App.closeNewTicketModal();
      showToast('✅ تم إرسال طلبك — سنتواصل معك قريباً');
      App.loadStudentTickets();
    } catch (e) {
      showAlert(errEl, e.message || 'فشل الإرسال');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'إرسال الطلب ←'; }
    }
  },

  // ── FAQ ───────────────────────────────────────────────────────────────────
  openFaq() {
    App.renderFaq();
    show('screen-faq');
  },

  renderFaq() {
    const el = document.getElementById('faq-list');
    if (!el) return;
    el.innerHTML = FAQ_DATA.map((cat, ci) => `
      <div class="faq-cat">
        <div class="faq-cat-title">${cat.title}</div>
        ${cat.items.map((it, qi) => `
          <div class="faq-item" id="faq-item-${ci}-${qi}">
            <button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-${ci}-${qi}" onclick="App.toggleFaqItem(${ci},${qi})">
              <span>${escapeHtml(it.q)}</span>
              <span class="faq-q-chevron" aria-hidden="true">▾</span>
            </button>
            <div class="faq-a" id="faq-a-${ci}-${qi}" aria-hidden="true">
              <div class="faq-a-inner">
                <div class="faq-a-text">${escapeHtml(it.a)}</div>
                ${it.action ? `<button class="faq-a-btn" onclick="event.stopPropagation();App.runFaqAction('${it.action}')">${escapeHtml(it.label || 'فتح')}</button>` : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>`).join('');
  },

  toggleFaqItem(ci, qi) {
    const item = document.getElementById(`faq-item-${ci}-${qi}`);
    if (!item) return;
    const isOpen = item.classList.toggle('open');
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    if (q) q.setAttribute('aria-expanded', String(isOpen));
    if (a) a.setAttribute('aria-hidden', String(!isOpen));
  },

  // Central dispatch for FAQ action buttons — screens/actions that need a
  // logged-in student go through App.requireAuth() so a logged-out visitor
  // is sent to log in first, then lands exactly where they asked to go.
  runFaqAction(key) {
    const routes = {
      'about':        () => show('screen-about'),
      'guest-support': () => App.openGuestSupport(),
      // study/index.html has its own guard that bounces straight back to '/'
      // if there's no valid student session — so this must go through
      // requireAuth() too, or a logged-out visitor would just get dumped
      // back on the landing screen with no memory of where they were headed.
      'lessons':       () => App.requireAuth(() => App.goToStudy()),
      // startCapabilities(), not a bare show('screen-intro') — that skipped
      // the cooldown gate entirely (same bug class as retakeDiagnostic()
      // above), letting a student still in their mandatory waiting period
      // reach a brand-new attempt straight from the FAQ.
      'diagnostic':    () => App.requireAuth(() => App.startCapabilities()),
      'support-plan':  () => App.requireAuth(() => App.showSupportPlan()),
      'training-plan': () => App.requireAuth(() => show('screen-training-plan')),
      'level-analysis':() => App.requireAuth(() => App.viewStudentPlan()),
      'general-tests': () => App.requireAuth(() => App.openGeneralTests()),
      'chat':          () => App.requireAuth(() => App.goToChat()),
      'tickets':       () => App.requireAuth(() => App.goToTickets()),
    };
    (routes[key] || (() => {}))();
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
    el.innerHTML = '<span class="inline-loading" style="display:inline-flex;padding:0;"><span class="inline-spinner"></span>جاري التحميل...</span>';
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
    listEl.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل...</div>';
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
    listEl.innerHTML = '<div class="inline-loading"><span class="inline-spinner"></span>جاري التحميل...</div>';
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
    const _exitingRole = State.role || 'student';
    ActivityLog.warn(`🚪 تسجيل خروج: ${who}`);
    serverLog('info', 'logout', `تسجيل خروج: ${who}`, { user_name: who });
    // Revoke the token server-side so it can't be replayed if it leaked —
    // fire-and-forget: logout must complete locally even if this fails
    // (offline, server down, etc).
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    App.stopCooldownTimer();
    clearInterval(App._chatTimer);
    stopIdleWatch();
    State.student     = null;
    State.role        = null;
    State.admin       = null;
    State.selfDiag    = {};
    State.testAnswers = {};
    State.currentPlan = null;
    State.navStack    = [];
    document.getElementById('sl-code').value = '';
    const alCode = document.getElementById('al-code');
    if (alCode) alCode.value = '';
    // Only clear THIS role's session keys — the other role (if the same person is
    // also logged in elsewhere/another tab as admin/student) must stay intact.
    sessionStorage.removeItem(_skey('lg_session', _exitingRole));
    localStorage.removeItem(_skey('lg_xsession', _exitingRole));
    localStorage.removeItem(_skey('lg_remember', _exitingRole));
    try {
      if (localStorage.getItem('lg_active_role') === _roleNS(_exitingRole)) localStorage.removeItem('lg_active_role');
    } catch(_) {}
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
      el.innerHTML = list.map(b => {
        const seen  = b.seen_count  || 0;
        const total = b.total_students || 0;
        const pct   = total ? Math.round(seen / total * 100) : 0;
        const barColor = pct >= 70 ? '#4FA877' : pct >= 30 ? '#f59e0b' : '#ef4444';
        const badgeBg  = pct >= 70 ? '#dcfce7' : pct >= 30 ? '#fef3c7' : '#fee2e2';
        return `
        <div style="border:1.5px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:10px;background:var(--bg);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:12.5px;font-weight:700;color:var(--primary);">📢 ${escapeHtml(adminLabel(b.admin_name))}</span>
            <span style="font-size:11px;color:var(--muted);">${new Date(b.created_at).toLocaleString('ar-SA',{dateStyle:'short',timeStyle:'short'})}</span>
          </div>
          <div style="font-size:14px;line-height:1.7;color:var(--text);margin-bottom:12px;white-space:pre-line;">${escapeHtml(b.message)}</div>
          <!-- عداد المشاهدات -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 14px;background:${badgeBg};border-radius:10px;cursor:pointer;" onclick="App.openBcViewers('${b.id}',${seen},${total})">
            <span style="font-size:22px;font-weight:800;color:${barColor};">${seen}</span>
            <div style="flex:1;">
              <div style="font-size:12px;color:#64748b;">من <b>${total}</b> طالب شاهدوا الرسالة</div>
              <div style="height:5px;border-radius:99px;background:rgba(0,0,0,.08);margin-top:4px;overflow:hidden;">
                <div style="height:100%;border-radius:99px;background:${barColor};width:${pct}%;"></div>
              </div>
            </div>
            <span style="font-size:13px;font-weight:700;color:${barColor};">${pct}%</span>
            <span style="font-size:11px;color:#94a3b8;">التفاصيل ›</span>
          </div>
          <button onclick="App.deleteBroadcast('${b.id}')" style="background:#fee2e2;color:#991b1b;border:none;border-radius:8px;padding:5px 14px;font-size:12px;font-family:inherit;font-weight:700;cursor:pointer;">🗑 حذف</button>
        </div>`;
      }).join('');
    } catch { el.innerHTML = '<div style="color:var(--muted);padding:12px;font-size:13px;">تعذّر تحميل السجل</div>'; }
  },

  async openBcViewers(id, seen, total) {
    const modal = document.getElementById('bc-viewers-modal');
    const body  = document.getElementById('bc-viewers-body');
    const count = document.getElementById('bc-viewers-count');
    if (!modal) return;
    count.textContent = `${seen} من ${total} طالب شاهدوا الرسالة`;
    body.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">جارٍ التحميل…</div>';
    modal.style.display = 'flex';
    try {
      const { viewers } = await apiFetch(`/broadcasts/${id}/viewers`);
      if (!viewers.length) {
        body.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px;">لم يشاهد أحد الرسالة بعد</div>';
        return;
      }
      body.innerHTML = viewers.map((v, i) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f8fafc;">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3F7CB8,#4FA877);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${i+1}</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;color:#1e293b;">${escapeHtml(v.name)}</div>
            <div style="font-size:11px;color:#94a3b8;">${new Date(v.seen_at).toLocaleString('ar-SA',{dateStyle:'short',timeStyle:'short'})}</div>
          </div>
          <div style="font-size:11px;color:#94a3b8;font-family:monospace;">${escapeHtml(v.code)}</div>
        </div>`).join('');
    } catch { body.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px;">تعذّر التحميل</div>'; }
  },

  closeBcViewers() {
    const m = document.getElementById('bc-viewers-modal');
    if (m) m.style.display = 'none';
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
    document.getElementById('bc-message').textContent    = b.message;
    document.getElementById('bc-time').textContent       = new Date(b.created_at).toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
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
        // أضف كل رسالة جماعية كإشعار في لوحة التنبيهات
        const bcItems = list.map(b => ({
          id: 'bc_' + b.id,
          type: 'broadcast',
          title: 'رسالة من الإدارة',
          sub: b.message.length > 60 ? b.message.slice(0, 60) + '…' : b.message,
          read: false,
          action: () => { App._broadcastQueue.unshift(b); App._showNextBroadcast(); },
        }));
        // ادمج مع الإشعارات الحالية (تجنّب التكرار)
        const existingIds = new Set(App._notifItems.map(i => i.id));
        const fresh = bcItems.filter(i => !existingIds.has(i.id));
        if (fresh.length) {
          App._notifItems = [...fresh, ...App._notifItems];
          const unread = App._notifItems.filter(i => !i.read).length;
          App._updateBell('student', unread);
          App._ringBell('student');
        }
        App._broadcastQueue.push(...list);
        App._showNextBroadcast();
      }
    } catch {}
  },

  startNotifPolling() {
    App.stopNotifPolling();
    App._checkNotifications();
    // 30s polling stays as a fallback even when the WebSocket is connected —
    // if the socket silently drops (e.g. a network path that kills idle
    // connections) this still catches up within half a minute.
    App._notifTimer = setInterval(() => {
      if (document.visibilityState === 'visible') App._checkNotifications();
    }, 30000);
    App._connectRealtime();
  },

  stopNotifPolling() {
    clearInterval(App._notifTimer);
    App._notifTimer = null;
    App._disconnectRealtime();
  },

  // Experimental real-time layer (see /dev/monitoring): opens a WebSocket so
  // new messages/ticket replies trigger an immediate unread-count refresh
  // instead of waiting for the next 30s poll. Falls back silently to polling
  // alone if the socket can't connect — no behavior regresses either way.
  _connectRealtime() {
    if (!_authToken) return;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(_authToken)}`);
      App._realtimeSocket = ws;
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'new_message' || data.type === 'ticket_reply') {
            App._checkNotifications();
            // If a chat thread is open right now, refresh it immediately too —
            // otherwise the badge count updates but the open conversation
            // itself only catches up on its next 6s poll (or on re-entering
            // the screen), which reads as "message doesn't show until I leave
            // and come back in".
            const chatScreenOpen = document.getElementById('screen-chat')?.classList.contains('active');
            const chatModalOpen  = App._chatIsModal && document.getElementById('student-chat-modal')?.style.display !== 'none';
            if (data.type === 'new_message' && (chatScreenOpen || chatModalOpen)) {
              App.loadChatMessages();
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        if (App._realtimeSocket !== ws) return; // superseded by a newer connection/explicit disconnect
        const delay = App._realtimeBackoff = Math.min((App._realtimeBackoff || 1000) * 2, 30000);
        App._realtimeReconnectTimer = setTimeout(() => App._connectRealtime(), delay);
      };
      ws.onerror = () => ws.close();
    } catch {}
  },

  _disconnectRealtime() {
    clearTimeout(App._realtimeReconnectTimer);
    App._realtimeBackoff = 1000;
    if (App._realtimeSocket) { App._realtimeSocket.onclose = null; App._realtimeSocket.close(); App._realtimeSocket = null; }
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
    const iconMap = { msg: '💬', ticket: '🎫', plan: '📋', broadcast: '📢' };
    const clsMap  = { msg: 'msg-icon', ticket: 'ticket-icon', plan: 'plan-icon', broadcast: 'msg-icon' };
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
  t.style.cssText = `position:fixed;bottom:4px;right:50%;transform:translateX(50%);
    background:#1a5fa8;color:#fff;padding:12px 24px;border-radius:12px;
    font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2);
    opacity:0;transition:opacity .3s,bottom .3s cubic-bezier(.22,1,.36,1)`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.bottom = '24px'; t.style.opacity = '1'; });
  setTimeout(() => {
    t.style.opacity = '0'; t.style.bottom = '8px';
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ── Deep-link / refresh restoration (authenticated student) ────────────────
// Resolves a URL to the screen it names and gets that screen into the exact
// state it would be in had the student actually clicked their way there —
// reusing the SAME loader/render function each screen's normal nav button
// already calls, never a second copy of that logic. Two deliberate
// exceptions: a screen whose content is mid-flow, ephemeral, and never
// persisted by design (an in-progress diagnostic test, a mid-attempt skill
// quiz — both anti-cheat) can't be reconstructed from a URL alone, so those
// land on their nearest stable parent screen instead of faking it — the
// same "don't hang, always resolve to something real" behavior a refresh on
// any other screen gets. Returns true if it handled the path (including by
// falling back to a parent), false if the path isn't one of ours at all —
// callers keep whatever screen is already showing (the default: home) then.
async function restoreFromPath(pathname) {
  const resolved = resolvePath(pathname);
  if (!resolved) return false;
  const { screenId, params } = resolved;

  _restoringFromPath = true;
  try {
    return await _restoreFromPathInner(screenId, params);
  } finally {
    _restoringFromPath = false;
  }
}

async function _restoreFromPathInner(screenId, params) {
  switch (screenId) {
    case 'screen-student-home':
      return false; // already the default landing spot — nothing to do

    case 'screen-history': App.showHistory(); return true;
    case 'screen-chat': App.goToChat(); return true;
    case 'screen-support-hub': App.openSupportHub(); return true;
    case 'screen-tickets': App.goToTickets(); return true;
    case 'screen-about': show('screen-about'); return true;
    case 'screen-faq': App.openFaq(); return true;

    case 'screen-journey-full':
      await App.loadJourney();
      if (State._journey) App.renderJourneyFull(State._journey);
      show('screen-journey-full');
      return true;

    // Every mid-diagnostic-flow step depends on in-progress
    // answers/selections that are deliberately never persisted — the
    // diagnostic hub itself already knows whether to offer
    // "continue"/"retake"/"start" for this student, so it's the correct
    // landing spot for all of them, not just its own root path.
    case 'screen-intro':
    case 'screen-section-choice':
    case 'screen-selfdiag':
    case 'screen-pretest-intro':
    case 'screen-pretest':
    case 'screen-cooldown':
      await App.startCapabilities();
      return true;
    case 'screen-level-analysis': {
      const plans = DB.studentPlans(State.student.id);
      if (plans.length) App.viewStudentPlan(0);
      else await App.startCapabilities();
      return true;
    }

    case 'screen-support-plan': App.showSupportPlan(); return true;
    case 'screen-training-plan': App.showSupportPlan(); show('screen-training-plan'); return true;

    case 'screen-academic': show('screen-academic'); return true;
    case 'screen-academic-subjects': App.selectAcademicGrade(params.grade); return true;
    case 'screen-study': show('screen-study'); return true;
    case 'screen-lessons': show('screen-lessons'); return true;

    // The take/result screens are a single timed attempt in progress —
    // same anti-cheat reasoning as the diagnostic test above.
    case 'screen-general-tests':
    case 'screen-general-test-take':
    case 'screen-general-test-result':
      App.openGeneralTests();
      return true;

    case 'screen-quiz-hub': App.openQuizHub(); return true;
    case 'screen-quiz-progress': App.openQuizProgress(); return true;
    case 'screen-quiz-levels':
      await App.openQuizHub();
      App.openQuizLevels(params.section);
      return true;
    case 'screen-quiz-skills':
      await App.openQuizHub();
      App.openQuizLevels(params.section);
      App.openQuizSkills(params.section, params.level);
      return true;
    // A mid-attempt skill quiz — anti-cheat/ephemeral, never resumed; land
    // on that skill's own list instead (same as popstate's handling above).
    case 'screen-quiz-take':
      await App.openQuizHub();
      App.openQuizLevels(params.section);
      App.openQuizSkills(params.section, params.level);
      return true;
    case 'screen-quiz-skill-result':
      App.openQuizHub();
      return true;

    default:
      return false;
  }
}

// Captured once, at the very top of DOMContentLoaded, before session-restore
// ever calls show('screen-student-home') — which itself does a pushState/
// replaceState to '/home', permanently overwriting location.pathname. Every
// _routeToCurrentPath() caller used to read location.pathname AT CALL TIME,
// by which point it had already been clobbered to '/home' — so any deep
// link (a "رجوع" button landing on /academic/g10, /lessons, a shared
// /skills/... link, etc.) silently lost its destination and always fell
// back to the home screen on a genuine full-page load. Consumed (nulled)
// after the first restore attempt so a later, unrelated phone-gate/login
// flow during the same page life doesn't replay a stale deep link.
let _bootDeepLinkPath = (location.pathname && location.pathname !== '/' && location.pathname !== '/home')
  ? location.pathname : null;
const _bootDeepLinkHash = location.hash;

// Resumes wherever the URL originally pointed, once a student is fully ready
// to navigate — called right after session-restore, right after a fresh
// login, and right after clearing the phone gate (the 3 moments a student
// can land on a screen with a URL that doesn't match it yet). Keeps the
// pre-routing "#capabilities" hash working as a permanent alias for
// /diagnostic, since old bookmarks/links may still use it.
async function _routeToCurrentPath() {
  const hash = decodeURIComponent(_bootDeepLinkHash.replace(/^#/, ''));
  if (hash === 'capabilities') {
    history.replaceState(null, '', '/diagnostic');
    await App.startCapabilities();
    return;
  }
  const path = _bootDeepLinkPath;
  _bootDeepLinkPath = null;
  if (!path) return; // already home, or already consumed
  try { await restoreFromPath(path); } catch (_) { /* stay on home */ }
}

// ── Init ──────────────────────────────────────────────────────────────────

// Fast path: skip auth API call when token is still valid
async function _quickRestoreSession(sess) {
  // If returning from an academic/study/lesson/quiz sub-page, skip loading screen entirely
  const _fromSubPage = /\/(academic|study|lessons|quizzes)\//.test(document.referrer);
  if (!_fromSubPage) showLoadingScreen('جارٍ تسجيل الدخول…');

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
      State.student = { id: sess.id, code: sess.code, name: sess.name, school: sess.school || '', phone: sess.phone || '', trial: !!sess.trial };
      State.role = 'student';
      if (sess.school) { State.school = sess.school; App._updateSchoolDisplay(sess.school); }
      if (sess.trial) _showTrialBanner();
      const _sess = { ...sess, expiry };
      try { sessionStorage.setItem(_skey('lg_session', 'student'), JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem(_skey('lg_xsession', 'student'), JSON.stringify(_sess)); } catch(_) {}
      _setActiveRole('student');
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(sess.name);
      try { await Promise.race([Promise.all([DB.loadStudentData(), _minDelay]), _maxDelay]); } catch (e) { await _minDelay; }
      if (_slowHint) clearTimeout(_slowHint);
      // A 401 from that failed call means _handleExpiredSession() already
      // fired inside apiFetch — it wipes State.student/_authToken and
      // navigates to screen-school itself. Without this check, the code
      // below barrels on assuming a valid session, rendering the home
      // screen against a null State.student and re-fetching (with no auth
      // token at all this time) everything _handleExpiredSession just tore
      // down, undoing its own redirect.
      if (!State.student) return;

      const _testDeadline = Number(sessionStorage.getItem('lg_test_deadline') || 0);
      if (_testDeadline && _testDeadline > Date.now()) {
        try {
          const _ts = JSON.parse(sessionStorage.getItem('lg_test_state') || '{}');
          State.currentQ    = _ts.currentQ || 0;
          State.testAnswers = _ts.testAnswers || {};
          // Rebuild the same filtered bank startPretest() built, or a refresh
          // mid-"verbal only" attempt silently restores the full 50-question bank.
          State.diagSection = _ts.diagSection || 'both';
          const _fullBank = window._fullQuestionBank || window.QUESTION_BANK;
          window.QUESTION_BANK = State.diagSection === 'both' ? _fullBank.slice() : _fullBank.filter(q => q.type === State.diagSection);
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
      App._checkPhoneGate();
      if (State.student?.phone) _routeToCurrentPath();
    } else {
      State.role  = sess.role;
      State.admin = { code: sess.code, name: sess.name, school: sess.school || '' };
      if (sess.school && sess.school !== '*') { State.school = sess.school; App._updateSchoolDisplay(sess.school); }
      const _sess = { ...sess, expiry };
      try { sessionStorage.setItem(_skey('lg_session', 'admin'), JSON.stringify(_sess)); } catch(_) {}
      try { localStorage.setItem(_skey('lg_xsession', 'admin'), JSON.stringify(_sess)); } catch(_) {}
      _setActiveRole('admin');
      startIdleWatch();
      App._notifPrev = { studentMsg: null, ticket: null, adminMsg: null };
      App.startNotifPolling();
      App._setTopbarUser(adminLabel(sess.name));
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
    const _failRole = sess && sess.role === 'student' ? 'student' : 'admin';
    sessionStorage.removeItem(_skey('lg_session', _failRole));
    localStorage.removeItem(_skey('lg_xsession', _failRole));
    await _minDelay;
    show('screen-landing');
    document.documentElement.style.visibility = '';
  }
}

function _autoLogin(role, code, token, school) {
  // Admin/director auto-login redirects to /admin/ (a full page navigation) on
  // success. If that dashboard ever bounces back to '/' right after (stale
  // token, a failed data fetch, whatever the cause), the remembered session
  // here would otherwise retrigger this same auto-login on every reload —
  // an infinite '/' <-> '/admin/' loop. This guard breaks that loop after
  // one retry instead of hammering the login endpoint forever.
  if (role !== 'student') {
    const guardKey = 'lg_admin_autologin_ts';
    const last = parseInt(sessionStorage.getItem(guardKey) || '0', 10);
    if (Date.now() - last < 8000) {
      sessionStorage.removeItem(guardKey);
      try { localStorage.removeItem(_skey('lg_remember', role)); } catch(_) {}
      show('screen-landing');
      document.documentElement.style.visibility = '';
      showToast('تعذّر الدخول التلقائي — الرجاء تسجيل الدخول يدويًا');
      return;
    }
    sessionStorage.setItem(guardKey, String(Date.now()));
  }
  showLoadingScreen('جارٍ تسجيل الدخول…');
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
    const _bail = () => { sessionStorage.removeItem(_skey('lg_session', role)); localStorage.removeItem(_skey('lg_xsession', role)); show('screen-landing'); document.documentElement.style.visibility = ''; };
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
  // An account-access link ("?t=") owns the screen entirely — skip session
  // restore/auto-login so it can't get overridden mid-flight. Checked via the
  // parse-time IS_ACCESS_LINK_FLOW flag, never by re-reading location.search:
  // the access-link handler above runs first and its show() call has already
  // replaceState'd the "?t=..." out of the address bar by the time this fires,
  // so reading the URL here always came back empty and this guard never held —
  // which is why the landing screen kept stomping the access-token screen.
  if (IS_ACCESS_LINK_FLOW) return;
  ActivityLog.info(`🌐 تحميل الصفحة — ${new Date().toLocaleString('ar-SA')} — ${navigator.userAgent.split(' ').slice(-2).join(' ')}`);
  const btn = document.getElementById('selfdiag-submit');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  DB.loadQuestions().catch(() => {});

  // Helper: check if a session has a valid, unexpired token
  const _canFastRestore = (s) =>
    s.token && s.expiry && Date.now() < s.expiry &&
    (s.role !== 'student' || s.id); // student needs stored id

  // Student and admin/director sessions live in separate, role-namespaced keys (see
  // _skey above), so each of the 3 restore tiers below must check both namespaces —
  // in the priority order given by lg_active_role — instead of a single hardcoded key.
  const _nsOrder = _roleNSOrder();

  // 1) Same-tab refresh
  for (const _ns of _nsOrder) {
    try {
      const _k = _skey('lg_session', _ns);
      const raw = sessionStorage.getItem(_k);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.role && s.code) {
          if (_canFastRestore(s)) { _quickRestoreSession(s); return; }
          _autoLogin(s.role, s.code, s.token, s.school); return;
        }
      }
    } catch (e) { sessionStorage.removeItem(_skey('lg_session', _ns)); }
  }

  // 2) Cross-tab session (new tab from lesson/quiz pages, 4h expiry)
  for (const _ns of _nsOrder) {
    try {
      const _k = _skey('lg_xsession', _ns);
      const raw = localStorage.getItem(_k);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.expiry && Date.now() > s.expiry) { localStorage.removeItem(_k); }
        else if (s.role && s.code) {
          if (_canFastRestore(s)) { _quickRestoreSession(s); return; }
          _autoLogin(s.role, s.code, s.token, s.school); return;
        }
      }
    } catch (e) { localStorage.removeItem(_skey('lg_xsession', _ns)); }
  }

  // 3) Long-term remember-me (2 days, no JWT — must re-auth but show loading screen)
  for (const _ns of _nsOrder) {
    try {
      const _k = _skey('lg_remember', _ns);
      const raw = localStorage.getItem(_k);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.expiry && Date.now() > s.expiry) { localStorage.removeItem(_k); }
        else if (s.role && s.code) { _autoLogin(s.role, s.code, null, s.school); return; }
      }
    } catch (e) { localStorage.removeItem(_skey('lg_remember', _ns)); }
  }

  if (location.pathname === '/mock-tests') {
    App.openGeneralTests();
    document.documentElement.style.visibility = '';
  } else if (location.pathname === '/about') {
    show('screen-about');
    document.documentElement.style.visibility = '';
  } else if (location.pathname === '/faq') {
    App.openFaq();
    document.documentElement.style.visibility = '';
  } else if (location.pathname === '/support') {
    show('screen-landing');
    App.openGuestSupport();
    document.documentElement.style.visibility = '';
  } else {
    show('screen-landing');
    document.documentElement.style.visibility = '';
  }
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

