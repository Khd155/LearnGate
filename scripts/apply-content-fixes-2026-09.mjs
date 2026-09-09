// One-off content corrections requested in the "حزمة الإصلاحات الهندسية
// الشاملة" ticket:
//   1. المفردة الشاذة (verbal, medium level, question 3) — "الكويت" is both
//      a country and its own capital, making the "odd one out" ambiguous.
//      Replaced with "بغداد"; the correct answer stays "جدة" (index 3).
//   2. استيعاب المقروء (verbal, advanced level) — the shared reading
//      passage questions 16-18 (and any others built on it) are graded
//      against was never stored/shown, making the questions unanswerable.
//      Attaches it via the new PATCH /quiz-skills/:id/passage endpoint.
//
// Usage:
//   API_BASE=https://learngate.khormi.site/api DEV_KEY=xxxx node scripts/apply-content-fixes-2026-09.mjs
//
// Safe to re-run: step 1 uses action:'replace' scoped to exactly one skill
// (verbal-medium-v3) with the same 5 questions each time; step 2 overwrites
// the same passage text on every row of verbal-advanced-v1.

const API_BASE = process.env.API_BASE || 'http://localhost:8788/api';
const DEV_KEY = process.env.DEV_KEY;

if (!DEV_KEY) {
  console.error('Set DEV_KEY env var (the same DEV_KEY configured on the server).');
  process.exit(1);
}

const ODD_WORD_OUT_QUESTIONS = [
  { qnum: 1, text: 'حدد المفردة المختلفة من بين الكلمات التالية:', opts: ['الذهب', 'الفضة', 'النحاس', 'الماس'], ans: 3 },
  { qnum: 2, text: 'حدد المفردة المختلفة من بين الكلمات التالية:', opts: ['الأسد', 'النمر', 'الغزال', 'الفهد'], ans: 2 },
  // Fix: "الكويت" (index 1) is both a country and its own capital — the
  // question meant to isolate ONE non-capital city among capitals, and
  // "الكويت" answers to both categories at once. Replaced with "بغداد",
  // a plain capital like the other two. Correct answer unchanged: "جدة".
  { qnum: 3, text: 'حدد المفردة المختلفة من بين الكلمات التالية:', opts: ['الرياض', 'بغداد', 'المنامة', 'جدة'], ans: 3 },
  { qnum: 4, text: 'حدد المفردة المختلفة من بين الكلمات التالية:', opts: ['رئة', 'كبد', 'قلب', 'جلد'], ans: 3 },
  { qnum: 5, text: 'حدد المفردة المختلفة من بين الكلمات التالية:', opts: ['عالم', 'فاهم', 'معلوم', 'كاتب'], ans: 2 },
];

const READING_PASSAGE = `لم يعد التفوق الاقتصادي رهيناً بامتلاك الموارد الطبيعية بقدر ما بات مرهوناً بالقدرة على إنتاج المعرفة وتوظيفها. فالدول التي راهنت على النفط والمعادن وحدها، دون الاستثمار الموازي في رأس المال البشري والابتكار، وجدت نفسها عرضة للتذبذب كلما تقلبت أسعار السلع عالمياً. في المقابل، برهنت تجارب دول محدودة الموارد الطبيعية، حين وجهت مواردها المالية نحو التعليم والبحث العلمي، على أن الثروة الحقيقية تكمن في العقول لا في باطن الأرض. غير أن هذا التحول لا يخلو من مفارقة؛ فكلما تعمق اعتماد الاقتصادات على المعرفة، اتسعت الفجوة بين من يملكون أدوات إنتاجها ومن يقتصر دورهم على استهلاكها.`;

async function main() {
  const devRes = await fetch(`${API_BASE}/auth/dev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: DEV_KEY }),
  });
  if (!devRes.ok) throw new Error(`Dev auth failed: ${devRes.status} ${await devRes.text()}`);
  const { token } = await devRes.json();
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  console.log('1) Fixing verbal-medium-v3 (المفردة الشاذة) question 3 — replacing "الكويت" with "بغداد"...');
  const fixRes = await fetch(`${API_BASE}/quiz-skills/verbal-medium-v3/import`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ action: 'replace', questions: ODD_WORD_OUT_QUESTIONS }),
  });
  const fixData = await fixRes.json();
  if (!fixRes.ok) console.error(`   ✗ ${fixRes.status} ${JSON.stringify(fixData)}`);
  else console.log(`   ✓ added ${fixData.added}, skipped ${fixData.skipped}`);

  console.log('2) Attaching the reading passage to verbal-advanced-v1 (استيعاب المقروء)...');
  const passageRes = await fetch(`${API_BASE}/quiz-skills/verbal-advanced-v1/passage`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ passage: READING_PASSAGE }),
  });
  const passageData = await passageRes.json();
  if (!passageRes.ok) console.error(`   ✗ ${passageRes.status} ${JSON.stringify(passageData)}`);
  else console.log(`   ✓ updated ${passageData.updated} question row(s)`);

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
