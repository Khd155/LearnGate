// /api/* request handler — shared by server.js (CranL) and any Pages-style host
// PostgreSQL (via postgres.js) | Dev key env var: DEV_KEY
import { getDB } from '../_lib/db.js';
import { listTestResults, deleteSingleTestResult, resetStudentTestResults, resetSchoolTestResults, grantRetakeForSchool } from '../_lib/test-management.js';
import {
  DEFAULT_QUIZ_PASS_RATIO, resolveQuizPassRatio, computeQuizPass, daysSince, computeHealthScore,
  buildQuizTree, computeJourney, classifyProgress, PROGRESS_BUCKET_LABELS_AR, PROGRESS_BUCKET_ORDER,
  summarizePlanAttempts, computeCooldownUntil, isRetakeOverride, classifyFollowUp,
} from '../_lib/journey.js';

const _extraOrigin = (typeof process !== 'undefined' && process.env && process.env.EXTRA_ALLOWED_ORIGIN) || '';
const ALLOWED_ORIGINS = ['https://learngate.khormi.site', 'http://localhost:8788', 'http://localhost:3000', ...(_extraOrigin ? [_extraOrigin] : [])];
// Requests whose Origin matches the host actually being requested are same-origin
// (e.g. CranL's auto-generated preview subdomains, which change on every deploy)
// and are always safe to allow, regardless of the static whitelist above.
function isAllowedOrigin(origin, request) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try { return origin === new URL(request.url).origin; } catch { return false; }
}
function getCORS(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = isAllowedOrigin(origin, request) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Dev-Key',
    'Vary': 'Origin',
  };
}


// Biology G1 — Unit 1 question bank (pre-test = readiness diagnostic, post-test = mastery check)
// ans is the correct option index (0-3). Stripped before being sent to students; only revealed in
// the post-grading breakdown returned by POST /api/bio/submit.
const BIO_QUESTIONS = [
  // ── PRE (10 questions) ──────────────────────────────────────────────────
  {testType:'pre',qnum:0,sec:null,skill:'فهم هوية علم الأحياء',text:'ما الفكرة الأساسية التي يدرسها علم الأحياء؟',opt1:'دراسة الصخور والمعادن فقط',opt2:'دراسة المخلوقات الحية وخصائصها وتفاعلاتها',opt3:'دراسة حركة الأجسام فقط',opt4:'دراسة الطقس والمناخ',ans:1,exp:'علم الأحياء يدرس المخلوقات الحية بمجملها — خصائصها وتفاعلاتها ومستوياتها التنظيمية، وليس مجالاً واحداً كالصخور أو الطقس.'},
  {testType:'pre',qnum:1,sec:null,skill:'تمييز خصائص المخلوقات الحية',text:'أي مما يلي يُعدّ من خصائص المخلوقات الحية؟',opt1:'لها لون محدد',opt2:'تستطيع النمو والتكاثر والاستجابة للمؤثرات',opt3:'تكون دائماً كبيرة الحجم',opt4:'تتحرك من مكان إلى آخر',ans:1,exp:'خصائص الحياة مجموعة صفات مجتمعة — النمو والتكاثر والاستجابة للمؤثرات — وليست صفة شكلية واحدة كاللون أو الحجم.'},
  {testType:'pre',qnum:2,sec:null,skill:'مستويات التنظيم الحيوي',text:'أي ترتيب صحيح لمستويات التنظيم من الأصغر إلى الأكبر؟',opt1:'جهاز ← عضو ← نسيج ← خلية',opt2:'خلية ← نسيج ← عضو ← جهاز',opt3:'نسيج ← خلية ← جهاز ← عضو',opt4:'عضو ← جهاز ← خلية ← نسيج',ans:1,exp:'الترتيب يبدأ من الأصغر: الخلية تتجمع لتكوّن نسيجاً، والأنسجة تكوّن عضواً، والأعضاء تعمل معاً ضمن جهاز.'},
  {testType:'pre',qnum:3,sec:null,skill:'مفهوم الخلية',text:'أي عبارة صحيحة عن الخلية؟',opt1:'هي أكبر مستوى في التنظيم الحيوي',opt2:'هي الوحدة الأساسية في بناء المخلوقات الحية',opt3:'توجد فقط في النباتات',opt4:'لا تحتوي على تراكيب داخلية',ans:1,exp:'الخلية هي الوحدة الأساسية للحياة — أصغر وحدة قادرة على أداء وظائف الحياة، وتوجد في جميع المخلوقات الحية.'},
  {testType:'pre',qnum:4,sec:null,skill:'خطوات المنهج العلمي',text:'باحث لاحظ أن نباتاً ينمو بشكل أفضل عند تعرضه لكمية معينة من الضوء. ما الخطوة العلمية التالية الأكثر مناسبة؟',opt1:'وضع تفسير قابل للاختبار',opt2:'كتابة النتيجة النهائية مباشرة',opt3:'تغيير جميع الظروف مرة واحدة',opt4:'تجاهل الملاحظة',ans:0,exp:'بعد الملاحظة تأتي الفرضية — وضع تفسير أو توقع قابل للاختبار. لا نكتب نتيجة قبل إجراء التجربة الفعلية.'},
  {testType:'pre',qnum:5,sec:null,skill:'صياغة الأسئلة العلمية',text:'أي مما يلي يمثل سؤالاً علمياً قابلاً للاختبار؟',opt1:'ما أجمل لون للنبات؟',opt2:'هل تؤثر كمية الماء في نمو النبات؟',opt3:'لماذا الطبيعة جميلة؟',opt4:'ما أفضل كائن حي؟',ans:1,exp:'السؤال العلمي يجب أن يكون قابلاً للقياس والاختبار. أسئلة الرأي والجمال لا يمكن قياسها، بينما تأثير الماء يمكن دراسته بتجربة.'},
  {testType:'pre',qnum:6,sec:null,skill:'فهم طبيعة المعرفة العلمية',text:'النظرية العلمية تعني:',opt1:'رأياً شخصياً',opt2:'فكرة غير مدعومة',opt3:'تفسيراً مدعوماً بأدلة كثيرة',opt4:'تخميناً عشوائياً',ans:2,exp:'النظرية العلمية ليست تخميناً ولا رأياً — بل هي تفسير موثوق مدعوم بأدلة وتجارب متعددة ومتكررة.'},
  {testType:'pre',qnum:7,sec:null,skill:'أهمية التصنيف',text:'لماذا يصنّف العلماء المخلوقات الحية؟',opt1:'لأن جميعها متشابهة تماماً',opt2:'لتنظيم المعلومات وفهم العلاقات بينها',opt3:'لتغيير صفاتها',opt4:'لمعرفة حجمها فقط',ans:1,exp:'التصنيف يساعد العلماء على تنظيم التنوع الحيوي الضخم وفهم أوجه الشبه والاختلاف والعلاقات بين الكائنات الحية.'},
  {testType:'pre',qnum:8,sec:null,skill:'الربط بين مستويات التنظيم',text:'أي علاقة صحيحة؟',opt1:'الجهاز يتكون من خلايا فقط دون أعضاء',opt2:'العضو يتكون من أنسجة',opt3:'الخلية تتكون من أجهزة',opt4:'النسيج أكبر من الجهاز',ans:1,exp:'العضو يتكون من مجموعة أنسجة تعمل معاً لأداء وظيفة محددة — هذا هو الربط الصحيح بين مستوى النسيج ومستوى العضو.'},
  {testType:'pre',qnum:9,sec:null,skill:'مهارات التفكير العلمي',text:'إذا حصل طالب على معلومة علمية جديدة، فما السؤال الأفضل الذي يسأله؟',opt1:'هل أحفظها فقط؟',opt2:'كيف ترتبط بما أعرفه سابقاً؟',opt3:'هل هي طويلة؟',opt4:'هل هي في الاختبار فقط؟',ans:1,exp:'التفكير العلمي يعني ربط المعلومات الجديدة بالسابقة وفهم كيف تترابط مع بعضها — وليس مجرد حفظها.'},
  // ── POST (20 questions, 4 sections × 5) ─────────────────────────────────
  {testType:'post',qnum:0,sec:0,skill:null,text:'ما العبارة التي تصف علم الأحياء بصورة صحيحة؟',opt1:'علم يدرس الصخور والمعادن فقط',opt2:'علم يدرس المخلوقات الحية وخصائصها وتفاعلاتها',opt3:'علم يدرس حركة الأجسام والقوى',opt4:'علم يدرس الطقس والمناخ فقط',ans:1,exp:'لأن علم الأحياء هو العلم الذي يدرس المخلوقات الحية وخصائصها وتفاعلاتها وتنظيمها، وليس فرعاً يختص بمجال واحد فقط.'},
  {testType:'post',qnum:1,sec:0,skill:null,text:'أي مما يلي يُعدّ من خصائص المخلوقات الحية؟',opt1:'امتلاك لون محدد',opt2:'القدرة على النمو والتكاثر والاستجابة للمؤثرات',opt3:'وجودها في مكان معين فقط',opt4:'قدرتها على الحركة فقط',ans:1,exp:'لأن المخلوقات الحية تتميز بمجموعة خصائص مثل النمو والتكاثر والاستجابة للمؤثرات، أما الصفات الشكلية أو الحركة وحدها فلا تكفي.'},
  {testType:'post',qnum:2,sec:0,skill:null,text:'أي مما يلي يمثل أصغر مستوى من مستويات التنظيم الحيوي؟',opt1:'الجهاز',opt2:'العضو',opt3:'الخلية',opt4:'النسيج',ans:2,exp:'لأن الخلية هي أصغر مستوى من مستويات التنظيم الحيوي، ومنها تبدأ بقية المستويات الأكبر.'},
  {testType:'post',qnum:3,sec:0,skill:null,text:'لماذا تُعدّ الخلية الوحدة الأساسية للحياة؟',opt1:'لأنها أكبر جزء في المخلوق الحي',opt2:'لأنها موجودة في النباتات فقط',opt3:'لأن جميع المخلوقات الحية تتكون من خلية أو أكثر',opt4:'لأنها لا تحتوي على تراكيب داخلية',ans:2,exp:'لأن جميع المخلوقات الحية تتكون من خلية واحدة أو أكثر، ولذلك تُعدّ الخلية الوحدة الأساسية للحياة.'},
  {testType:'post',qnum:4,sec:0,skill:null,text:'أي عبارة صحيحة عن الاتزان الداخلي؟',opt1:'قدرة المخلوق الحي على المحافظة على ظروف داخلية مستقرة',opt2:'قدرة الكائن على الانتقال من مكان لآخر',opt3:'قدرة الكائن على تغيير نوعه',opt4:'قدرة الكائن على زيادة حجمه فقط',ans:0,exp:'لأن الاتزان الداخلي يعني قدرة المخلوق الحي على المحافظة على ظروف داخلية مستقرة تساعده على البقاء.'},
  {testType:'post',qnum:5,sec:1,skill:null,text:'أي ترتيب يمثل مستويات التنظيم الحيوي من الأصغر إلى الأكبر؟',opt1:'خلية ← نسيج ← عضو ← جهاز ← مخلوق حي',opt2:'عضو ← خلية ← نسيج ← جهاز',opt3:'جهاز ← عضو ← نسيج ← خلية',opt4:'نسيج ← جهاز ← خلية ← عضو',ans:0,exp:'لأن الخلايا تتجمع لتكوين أنسجة، والأنسجة تكوّن أعضاء، والأعضاء تعمل معاً في أجهزة داخل المخلوق الحي.'},
  {testType:'post',qnum:6,sec:1,skill:null,text:'العلاقة الصحيحة بين النسيج والعضو هي:',opt1:'النسيج يتكون من أجهزة',opt2:'العضو يتكون من مجموعة أنسجة تعمل معاً',opt3:'الجهاز يتكون من خلية واحدة',opt4:'العضو أصغر من الخلية',ans:1,exp:'لأن العضو يتكون من مجموعة أنسجة تعمل معاً لأداء وظيفة محددة.'},
  {testType:'post',qnum:7,sec:1,skill:null,text:'لماذا يحتاج العلماء إلى تصنيف المخلوقات الحية؟',opt1:'لمعرفة لون كل مخلوق فقط',opt2:'لتنظيم التنوع الحيوي وفهم العلاقات بين المخلوقات',opt3:'لتغيير صفات الكائنات',opt4:'لإثبات أن جميع الكائنات متشابهة',ans:1,exp:'لأن التصنيف يساعد العلماء على تنظيم التنوع الحيوي وفهم أوجه التشابه والعلاقات بين المخلوقات الحية.'},
  {testType:'post',qnum:8,sec:1,skill:null,text:'إذا وجد العلماء تشابهاً كبيراً بين مخلوقين حيين فهذا يساعدهم على:',opt1:'فهم العلاقات بينهما',opt2:'اعتبارهما مخلوقاً واحداً',opt3:'إلغاء التصنيف',opt4:'معرفة عمرهما فقط',ans:0,exp:'لأن التشابه بين المخلوقات يعطي العلماء معلومات تساعدهم على دراسة العلاقات بينها وتصنيفها.'},
  {testType:'post',qnum:9,sec:1,skill:null,text:'أي علاقة توضح بناء المخلوق الحي؟',opt1:'أجهزة ← أعضاء ← أنسجة ← خلايا',opt2:'خلايا ← أنسجة ← أعضاء ← أجهزة',opt3:'أعضاء ← خلايا ← أجهزة ← أنسجة',opt4:'خلايا ← أعضاء ← أنسجة ← أجهزة',ans:1,exp:'لأن بناء المخلوق الحي يبدأ من الخلية ثم تتجمع الخلايا لتكوين أنسجة ثم أعضاء ثم أجهزة.'},
  {testType:'post',qnum:10,sec:2,skill:null,text:'شاهد طالب شيئاً يتحرك، فقال: "إذن هو مخلوق حي". ما التقييم الصحيح؟',opt1:'صحيح دائماً',opt2:'خطأ لأن الحركة وحدها لا تكفي لإثبات الحياة',opt3:'صحيح إذا كان سريعاً',opt4:'صحيح إذا كان كبيراً',ans:1,exp:'لأن الحركة ليست دليلاً كافياً على الحياة؛ فبعض الأشياء غير الحية تتحرك، بينما الحياة تعتمد على مجموعة خصائص مترابطة.'},
  {testType:'post',qnum:11,sec:2,skill:null,text:'لاحظ باحث أن نباتاً معيناً ينمو أكثر عند زيادة الماء. ما السؤال العلمي المناسب؟',opt1:'هل النبات جميل؟',opt2:'هل كمية الماء تؤثر في نمو النبات؟',opt3:'لماذا الطبيعة رائعة؟',opt4:'ما أفضل نبات؟',ans:1,exp:'لأن السؤال العلمي يجب أن يكون قابلاً للاختبار والقياس، وتأثير كمية الماء في النمو يمكن دراسته بتجربة.'},
  {testType:'post',qnum:12,sec:2,skill:null,text:'إذا أراد الباحث اختبار تأثير الضوء في نمو النبات، فما الذي يجب تغييره؟',opt1:'كمية الضوء',opt2:'جميع العوامل معاً',opt3:'نوع النبات والماء والضوء معاً',opt4:'لا يغير شيئاً',ans:0,exp:'لأن اختبار أثر عامل معين يتطلب تغيير متغير واحد فقط مع تثبيت بقية العوامل لمعرفة السبب الحقيقي للنتيجة.'},
  {testType:'post',qnum:13,sec:2,skill:null,text:'أي موقف يمثل فرضية علمية؟',opt1:'النبات جميل',opt2:'أعتقد أن زيادة الضوء قد تزيد نمو النبات',opt3:'شاهدت النبات ينمو',opt4:'سجلت النتيجة النهائية',ans:1,exp:'لأن الفرضية هي تفسير أو توقع يمكن اختباره، وليست مجرد ملاحظة أو رأياً عاماً.'},
  {testType:'post',qnum:14,sec:2,skill:null,text:'بعد إجراء تجربة وجمع البيانات، فإن الخطوة التالية هي:',opt1:'تحليل النتائج واستخلاص الاستنتاج',opt2:'حذف البيانات',opt3:'تغيير الفرضية دون دراسة',opt4:'تجاهل النتائج',ans:0,exp:'لأن تحليل النتائج بعد جمع البيانات يساعد العالم على الوصول إلى استنتاج حول صحة الفرضية.'},
  {testType:'post',qnum:15,sec:3,skill:null,text:'ما الفرق بين النظرية العلمية والرأي الشخصي؟',opt1:'لا يوجد فرق',opt2:'النظرية العلمية تعتمد على الأدلة والتجارب',opt3:'الرأي أكثر دقة دائماً',opt4:'النظرية مجرد تخمين',ans:1,exp:'لأن النظرية العلمية تفسير مدعوم بأدلة وتجارب كثيرة، وليست رأياً شخصياً أو تخميناً.'},
  {testType:'post',qnum:16,sec:3,skill:null,text:'أي سؤال يُعدّ سؤالاً علمياً؟',opt1:'ما أجمل مخلوق حي؟',opt2:'هل تؤثر درجة الحرارة في نمو النبات؟',opt3:'ما أفضل لون؟',opt4:'ما الحيوان المفضل؟',ans:1,exp:'لأن السؤال العلمي هو الذي يمكن الإجابة عنه بالملاحظة أو التجربة والقياس.'},
  {testType:'post',qnum:17,sec:3,skill:null,text:'عندما يكرر العلماء التجربة أكثر من مرة فإن الهدف:',opt1:'زيادة الثقة في النتائج',opt2:'تغيير الحقيقة',opt3:'تقليل المعلومات',opt4:'إلغاء الفرضية',ans:0,exp:'لأن تكرار التجربة يزيد من موثوقية النتائج ويقلل احتمال أن تكون النتيجة بسبب الصدفة.'},
  {testType:'post',qnum:18,sec:3,skill:null,text:'إذا حصل العلماء على نتائج لا توافق الفرضية، فماذا يفعلون؟',opt1:'يخفون النتائج',opt2:'يراجعون الفرضية أو التجربة',opt3:'يغيرون البيانات',opt4:'يتوقفون عن البحث',ans:1,exp:'لأن النتائج غير المتوافقة مع الفرضية تدفع العلماء إلى مراجعة الفرضية أو طريقة التجربة، وليس تغيير البيانات.'},
  {testType:'post',qnum:19,sec:3,skill:null,text:'ما أفضل وصف للتعلم العلمي؟',opt1:'حفظ المعلومات فقط',opt2:'فهم الأفكار وربطها واستخدامها في تفسير الظواهر',opt3:'قراءة الكتاب مرة واحدة',opt4:'معرفة المصطلحات دون فهمها',ans:1,exp:'لأن التعلم العلمي الحقيقي يعتمد على فهم الأفكار وربطها واستخدامها في تفسير الظواهر، وليس حفظ المعلومات فقط.'},
];
const BIO_SECTIONS = ['فهم المفاهيم الأساسية','ربط المفاهيم','تطبيق المعرفة','التفكير العلمي والتحليل'];

const SEED_QUESTIONS = [
  {qnum:1,type:'verbal',skill_id:'v4',text:'نطفة : علقة — كـ —',opt1:'غصن : شجرة',opt2:'طائرة : مطار',opt3:'زحف : مشي',opt4:'يوم : أسبوع',ans:2},
  {qnum:2,type:'verbal',skill_id:'v4',text:'شبكة : صيد — كـ —',opt1:'قلم : كتابة',opt2:'سيارة : وقود',opt3:'بحر : سمك',opt4:'مفتاح : قفل',ans:0},
  {qnum:3,type:'verbal',skill_id:'v4',text:'عجين : خبز — كـ —',opt1:'نجم : سماء',opt2:'دقيق : قمح',opt3:'ثوب : خيط',opt4:'خشب : باب',ans:3},
  {qnum:4,type:'verbal',skill_id:'v4',text:'إطار : صورة — كـ —',opt1:'جدار : غرفة',opt2:'سور : حديقة',opt3:'غلاف : ورقة',opt4:'عمامة : رأس',ans:1},
  {qnum:5,type:'verbal',skill_id:'v4',text:'ذكاء : غباء — كـ —',opt1:'كرم : بخل',opt2:'علم : معرفة',opt3:'شجاعة : إقدام',opt4:'طويل : ممتد',ans:0},
  {qnum:6,type:'verbal',skill_id:'v4',text:'غليان : تبخر — كـ —',opt1:'قراءة : كتاب',opt2:'شمس : ضياء',opt3:'ركض : تعب',opt4:'ليل : ظلام',ans:2},
  {qnum:7,type:'verbal',skill_id:'v3',text:'اختر الكلمة الشاذة: السيف — الرمح — الدرع — الحسام',opt1:'السيف',opt2:'الرمح',opt3:'الدرع',opt4:'الحسام',ans:2},
  {qnum:8,type:'verbal',skill_id:'v5',text:'حسن ...... يستر كثيراً من ...... كما أن سوء الخلق يغطي كثيراً من المحاسن.',opt1:'الكلام - الصعاب',opt2:'العمل - الأخطاء',opt3:'المظهر - المزايا',opt4:'الخلق - العيوب',ans:3},
  {qnum:9,type:'verbal',skill_id:'v5',text:'عدم التخطيط يجعلك عرضة لـ ...... الآخرين، ويحيل جهودك المنظمة إلى ...... عشوائية.',opt1:'لنجاح - أفكار',opt2:'لنقد - نجاحات',opt3:'لأهداف - فوضى',opt4:'لمساعدة - تصرفات',ans:2},
  {qnum:10,type:'verbal',skill_id:'v5',text:'الإعلام المعاصر لم يعد مجرد ناقل للأخبار، بل أصبح ...... للرأي العام و...... للتوجهات الفكرية.',opt1:'صانعاً - موجهاً',opt2:'متابعاً - ناقداً',opt3:'ناقلاً - معارضاً',opt4:'مشاهداً - مسجلاً',ans:0},
  {qnum:11,type:'verbal',skill_id:'v5',text:'يعد الالتزام بالأنظمة ...... صمام أمان للمجتمعات، إذ يحول دون انتشار ...... التي تقوض بنيان الاستقرار.',opt1:'الصارمة - الفوضى',opt2:'المرنة - القوانين',opt3:'القديمة - العدالة',opt4:'الدولية - التنمية',ans:0},
  {qnum:12,type:'verbal',skill_id:'v5',text:'كثرة الوعود دون ...... تفقد المرء ...... الآخرين وتجعل كلامه بلا قيمة.',opt1:'تأخير - احترام',opt2:'شروط - مودة',opt3:'تفكير - تقدير',opt4:'تنفيذ - ثقة',ans:3},
  {qnum:13,type:'verbal',skill_id:'v3',text:'اختر الكلمة الشاذة: الإحباط — القنوط — اليأس — الزهد',opt1:'الإحباط',opt2:'القنوط',opt3:'اليأس',opt4:'الزهد',ans:3},
  {qnum:14,type:'verbal',skill_id:'v3',text:'اختر الكلمة الشاذة: العسجد — النضار — التبر — اللجين',opt1:'العسجد',opt2:'النضار',opt3:'التبر',opt4:'اللجين',ans:3},
  {qnum:15,type:'verbal',skill_id:'v2',text:'حدّد الكلمة التي تُخلّ بسياق الجملة: "المدن الجامعية ليست مجرد مؤسسات لتعليم الطلاب، بل هي واحات علمية لبناء العقول وتدمير القيم."',opt1:'مؤسسات',opt2:'وتدمير',opt3:'علمية',opt4:'العقول',ans:1},
  {qnum:16,type:'verbal',skill_id:'v2',text:'حدّد الكلمة التي تُخلّ بسياق الجملة: "عظمة عَقلك تخلق لك الحُسّاد، وعظمة قَلبك تخلق لك الأعداء."',opt1:'عظمة',opt2:'الحساد',opt3:'قلبك',opt4:'الأعداء',ans:3},
  {qnum:17,type:'verbal',skill_id:'v2',text:'حدّد الكلمة التي تُخلّ بسياق الجملة: "إن التهور في مواجهة الأزمات بحكمة يساعد على تقليل الخسائر، بينما التهور في اتخاذ القرارات يعجل بالFشل."',opt1:'التهور (الأولى)',opt2:'مواجهة',opt3:'بحكمة',opt4:'تقليل',ans:0},
  {qnum:18,type:'verbal',skill_id:'v2',text:'حدّد الكلمة التي تُخلّ بسياق الجملة: "من أخص صفات العالِم التواضع، فكلما زاد علمه أحسّ بوفرة معرفته، وضآلة ما جَهِل."',opt1:'التواضع',opt2:'زاد',opt3:'بوفرة',opt4:'وضآلة',ans:2},
  {qnum:19,type:'verbal',skill_id:'v1',text:'اقرأ: "يُعتبر الأمن المائي من الركائز الأساسية لاستقرار المجتمعات وتنميتها المستدامة في القرن الحادي والعشرين. وتواجه دول المنطقة العربية تحديات جسيمة في هذا المجال نظراً لوقوع معظم أراضيها في مناطق جافة وشبه جافة، حيث لا تتجاوز حصتها من المياه المتجددة 1% من الإجمالي العالمي، في حين أنها تضم نحو 5% من سكان العالم. ويتفاقم هذا الوضع مع النمو السكاني المتسارع والتغيرات المناخية التي تؤدي إلى تذبذب معدلات الأمطار وزيادة موجات الجفاف." — ماذا يُمثّل امتلاك المنطقة العربية 1% من المياه مع 5% من سكان العالم؟',opt1:'توازناً دقيقاً بين الموارد والسكان',opt2:'فجوة كبيرة بين الاحتياج والوفرة',opt3:'فائضاً مائياً يخدم التنمية المستدامة',opt4:'انخفاضاً طفيفاً لا يشكل خطورة مستقبليّة',ans:1},
  {qnum:20,type:'verbal',skill_id:'v1',text:'وفقاً للفقرة السابقة (الأمن المائي العربي)، ما العامل الطبيعي الخارجي الذي يُفاقم أزمة المياه؟',opt1:'النمو السكاني المتسارع في المنطقة',opt2:'زيادة الاستهلاك في القطاعات الاقتصادية',opt3:'عدم إعادة تدوير مياه الصرف الصحي',opt4:'التغيرات المناخية وتذبذب معدلات الأمطار',ans:3},
  {qnum:21,type:'verbal',skill_id:'v1',text:'اقرأ: "إن مواجهة هذه الأزمة تتطلب التحول من الإدارة التقليدية للموارد المائية القائمة على زيادة الإمدادات، إلى إدارة متكاملة تركز على ترشيد الاستهلاك، وتطوير تقنيات تحلية مياه البحر باستخدام الطاقة المتجددة، فضلاً عن إعادة تدوير مياه الصرف المعالجة لاستخدامها في الزراعة المقيدة. كما أن نشر الوعي البيئي بين أفراد المجتمع يُعد الاستثمار الأطول أثراً لضمان ديمومة هذه الموارد للأجيال القادمة." — الفكرة الرئيسية لهذه الفقرة:',opt1:'الحلول والاستراتيجيات المقترحة لمواجهة الأزمة المائية',opt2:'أهمية زيادة إمدادات المياه عبر الوسائل التقليدية',opt3:'دور التغيرات المناخية في جفاف المنطقة العربية',opt4:'التوزيع الديموغرافي والنمو السكاني لسكان الوطن العربي',ans:0},
  {qnum:22,type:'verbal',skill_id:'v1',text:'وفقاً للفقرة السابقة (الحلول المائية)، كلمة "المقيدة" في سياق الزراعة تعني:',opt1:'المستحيلة والممنوعة رسمياً',opt2:'المفتوحة والحرّة دون شروط',opt3:'المشروطة بضوابط بيئية وصحية محددة',opt4:'التقليدية القديمة المعتمدة على الأمطار',ans:2},
  {qnum:23,type:'verbal',skill_id:'v1',text:'وفقاً للفقرة السابقة (الحلول المائية)، التحول المطلوب في إدارة الموارد المائية يتطلب أساساً:',opt1:'زيادة الإمدادات التقليدية وحفر الآبار الارتوازية فقط',opt2:'التركيز على ترشيد الاستهلاك والاستدامة للموارد المتاحة',opt3:'إلغاء المشاريع الزراعية بالكامل لتقنين الهدر',opt4:'الاعتماد الكلي على مياه الأمطار كمصدر وحيد',ans:1},
  {qnum:24,type:'verbal',skill_id:'v1',text:'في فقرة الأمن المائي، علاقة جملة "نظراً لوقوع معظم أراضيها في مناطق جافة" بما قبلها هي:',opt1:'نتيجة مترتبة عليها',opt2:'تضاد وتعارض في المعنى',opt3:'تفصيل بعد إجمال',opt4:'تعليل وبيان للسبب',ans:3},
  {qnum:25,type:'verbal',skill_id:'v1',text:'نص عن الأمن المائي العربي يستعرض شُحّ المياه (1% من العالمية) وتحديات النمو السكاني والمناخ، ثم يقترح الترشيد وتحلية المياه وإعادة تدوير الصرف ونشر الوعي البيئي. أنسب عنوان لهذا النص:',opt1:'الأمن المائي العربي: التحديات والحلول الاستراتيجية',opt2:'التوزيع السكاني والديموغرافي في الوطن العربي',opt3:'تقنيات تحلية مياه البحر بالطاقة الشمسية الحديثة',opt4:'تاريخ الجفاف في العصور الجيولوجية الحديثة',ans:0},
  {qnum:26,type:'quantitative',skill_id:'q1',text:'اشترى شخص جهازاً بـ2500 ريال وحصل على خصم 20%. كم ريالاً دفع بعد الخصم؟',opt1:'1800 ريال',opt2:'2000 ريال',opt3:'2200 ريال',opt4:'2300 ريال',ans:1},
  {qnum:27,type:'quantitative',skill_id:'q1',text:'نسبة الرجال إلى النساء في قاعة 3:5، وعدد النساء 40. ما إجمالي عدد الحاضرين؟',opt1:'54 حاضراً',opt2:'60 حاضراً',opt3:'64 حاضراً',opt4:'70 حاضراً',ans:2},
  {qnum:28,type:'quantitative',skill_id:'q1',text:'ثلث راتب خالد للإيجار وربعه للمصاريف، وتبقى معه 2500 ريال. كم راتبه الإجمالي؟',opt1:'6000 ريال',opt2:'5500 ريال',opt3:'5000 ريال',opt4:'4500 ريال',ans:0},
  {qnum:29,type:'quantitative',skill_id:'q1',text:'ما قيمة: √(2⁶ × 5²) ؟',opt1:'30',opt2:'40',opt3:'80',opt4:'160',ans:1},
  {qnum:30,type:'quantitative',skill_id:'q5',text:'متوسط درجات 5 طلاب 85، بعد انضمام طالب سادس أصبح المتوسط 86. ما درجة الطالب السادس؟',opt1:'86 درجة',opt2:'89 درجة',opt3:'90 درجة',opt4:'91 درجة',ans:3},
  {qnum:31,type:'quantitative',skill_id:'q5',text:'مدرسة بها 40 طالباً، 25 منهم يفضلون كرة القدم، و20 يفضلون كرة السلة، و10 يفضلون اللعبتين معاً. إذا اختير طالب عشوائياً، فما احتمال أن يكون ممن لا يفضلون أي من اللعبتين؟',opt1:'١/٤',opt2:'١/٥',opt3:'١/٨',opt4:'٣/٨',ans:2},
  {qnum:32,type:'quantitative',skill_id:'q1',text:'6 عمال ينجزون جداراً في 8 أيام. كم يحتاج 4 عمال بنفس الكفاءة لإنجاز نفس الجدار؟',opt1:'10 أيام',opt2:'11 يوماً',opt3:'12 يوماً',opt4:'14 يوماً',ans:2},
  {qnum:33,type:'quantitative',skill_id:'q1',text:'اشترى تاجر بضاعة بـ4000 ريال، تلف 10% منها، وباع الباقي بربح صافٍ 20% من التكلفة الأصلية. كم قبض ثمناً للبضاعة السليمة؟',opt1:'4400 ريال',opt2:'4600 ريال',opt3:'4700 ريال',opt4:'4800 ريال',ans:3},
  {qnum:34,type:'quantitative',skill_id:'q1',text:'عدد إذا قُسم على 5 الباقي 4، وإذا قُسم على 4 الباقي 3. ما هذا العدد؟',opt1:'14',opt2:'19',opt3:'24',opt4:'29',ans:1},
  {qnum:35,type:'quantitative',skill_id:'q5',text:'صافح 5 أشخاص بعضهم البعض مرة واحدة فقط. كم عدد المصافحات الكلية؟',opt1:'10 مصافحات',opt2:'15 مصافحة',opt3:'20 مصافحة',opt4:'25 مصافحة',ans:0},
  {qnum:36,type:'quantitative',skill_id:'q3',text:'سلك طوله 40 سم شُكّل منه مستطيل عرضه 8 سم. كم طوله؟',opt1:'10 سم',opt2:'12 سم',opt3:'14 سم',opt4:'16 سم',ans:1},
  {qnum:37,type:'quantitative',skill_id:'q3',text:'مثلث قائم الزاوية وتره 10 سم وأحد ضلعيه 6 سم. ما مساحته؟',opt1:'24 سم²',opt2:'30 سم²',opt3:'48 سم²',opt4:'60 سم²',ans:0},
  {qnum:38,type:'quantitative',skill_id:'q3',text:'في مثلث زاويتان قياسهما 55° و65°. ما قياس الزاوية الثالثة؟',opt1:'50°',opt2:'55°',opt3:'60°',opt4:'70°',ans:2},
  {qnum:39,type:'quantitative',skill_id:'q3',text:'مربع مساحته 36 سم²، رُسمت داخله دائرة تمس أضلاعه الأربعة. ما مساحة الدائرة؟',opt1:'6π سم²',opt2:'9π سم²',opt3:'12π سم²',opt4:'36π سم²',ans:1},
  {qnum:40,type:'quantitative',skill_id:'q3',text:'خزان مُلئ ثلثه ثم أُضيف 12 لتراً فأصبح نصفه ممتلئاً. كم سعة الخزان؟',opt1:'36 لتراً',opt2:'48 لتراً',opt3:'60 لتراً',opt4:'72 لتراً',ans:3},
  {qnum:41,type:'quantitative',skill_id:'q3',text:'تقاطع مستقيمان وتشكلت زاويتان متقابلتان؛ الأولى (2س + 10)° والثانية 70°. ما قيمة س؟',opt1:'25',opt2:'30',opt3:'35',opt4:'40',ans:1},
  {qnum:42,type:'quantitative',skill_id:'q2',text:'إذا كانت: س/4 + س/3 = 14، فما قيمة س؟',opt1:'12',opt2:'18',opt3:'20',opt4:'24',ans:3},
  {qnum:43,type:'quantitative',skill_id:'q2',text:'إذا كان س - ص = 5، وس² - ص² = 35، فما قيمة س + ص؟',opt1:'5',opt2:'7',opt3:'12',opt4:'30',ans:1},
  {qnum:44,type:'quantitative',skill_id:'q2',text:'أوجد الحد التالي في المتتابعة الحسابية: 3، 7، 11، 15، ......',opt1:'17',opt2:'18',opt3:'19',opt4:'20',ans:2},
  {qnum:45,type:'quantitative',skill_id:'q2',text:'أوجد الحد التالي في المتتابعة الهندسية: 3، 6، 12، 24، ......',opt1:'36',opt2:'40',opt3:'44',opt4:'48',ans:3},
  {qnum:46,type:'quantitative',skill_id:'q4',text:'قارن بين: (القيمة الأولى) 3⁴⁴ — (القيمة الثانية) 9²²',opt1:'القيمة الأولى أكبر',opt2:'القيمة الثانية أكبر',opt3:'القيمتان متساويتان',opt4:'المعطيات غير كافية',ans:2},
  {qnum:47,type:'quantitative',skill_id:'q4',text:'إذا كان س + ص = 5 و س × ص = 6؛ قارن بين: (القيمة الأولى) س² + ص² — (القيمة الثانية) 13',opt1:'القيمة الأولى أكبر',opt2:'القيمة الثانية أكبر',opt3:'القيمتان متساويتان',opt4:'المعطيات غير كافية',ans:2},
  {qnum:48,type:'quantitative',skill_id:'q4',text:'قارن بين: (القيمة الأولى) سدس السُّبع — (القيمة الثانية) سُبع السُّدس',opt1:'القيمة الأولى أكبر',opt2:'القيمة الثانية أكبر',opt3:'القيمتان متساويتان',opt4:'المعطيات غير كافية',ans:2},
  {qnum:49,type:'quantitative',skill_id:'q4',text:'محمد اشترى 5 أقلام و4 دفاتر، وخالد اشترى 4 أقلام و5 دفاتر، ودفع كلاهما نفس المبلغ. قارن بين: (القيمة الأولى) سعر القلم — (القيمة الثانية) سعر الدفتر',opt1:'القيمة الأولى أكبر',opt2:'القيمة الثانية أكبر',opt3:'القيمتان متساويتان',opt4:'المعطيات غير كافية',ans:0},
  {qnum:50,type:'quantitative',skill_id:'q4',text:'سيارتان تقطعان نفس المسافة؛ الأولى بـ90 كم/س والثانية بـ110 كم/س. قارن بين: (القيمة الأولى) زمن السيارة الأولى — (القيمة الثانية) زمن السيارة الثانية',opt1:'القيمة الأولى أكبر',opt2:'القيمة الثانية أكبر',opt3:'القيمتان متساويتان',opt4:'المعطيات غير كافية',ans:0}
];

const ok  = (d, s = 200, h = CORS) => new Response(JSON.stringify(d), { status: s, headers: h });
const err = (m, s = 400, h = CORS) => new Response(JSON.stringify({ error: m }), { status: s, headers: h });

function getDevKey(env) {
  return env.DEV_KEY; // must be set as an env var on the host
}

function authDev(request, env) {
  const key = request.headers.get('X-Dev-Key') || '';
  return key === getDevKey(env);
}

// ── Core tables self-provisioning ───────────────────────────────────────
// schools/students/admins/plans/questions are the five foundational tables
// every other feature in this file assumes already exist — unlike
// test_results/logs/messages/etc (each ensures its own table lazily right
// before first use), these never had a CREATE TABLE anywhere in the
// codebase; a brand-new database only works today because someone created
// them by hand out-of-band. Ensured once per warm instance (same flag
// pattern as _messagesSchemaEnsured below), at the top of onRequest() —
// this file runs both as a genuine server boot (server.js, Node) and as a
// Cloudflare Pages Function with no boot phase at all, so "once per warm
// instance" is the closest thing to "on startup" that works on both.
// Column shapes match exactly what every existing INSERT/ALTER in this
// file already reads/writes (see e.g. the schools/students/admins/plans
// handlers under /api/dev/*, and POST /api/questions) — this only ever
// creates the table if it's missing, never alters an existing one, so it
// changes nothing for a database that already has these tables.
let _coreTablesEnsured = false;
async function ensureCoreTables(DB) {
  if (_coreTablesEnsured) return;
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS schools (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      code       TEXT UNIQUE,
      created_at TEXT NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS students (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      school     TEXT NOT NULL DEFAULT '',
      phone      TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admins (
      id          TEXT PRIMARY KEY,
      code        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      school      TEXT NOT NULL DEFAULT '',
      role        TEXT NOT NULL DEFAULT 'admin',
      permissions TEXT DEFAULT '[]',
      phone       TEXT DEFAULT '',
      created_at  TEXT NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS plans (
      id           TEXT PRIMARY KEY,
      student_id   TEXT NOT NULL,
      student_name TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      gaps         TEXT NOT NULL DEFAULT '[]',
      admin_note   TEXT DEFAULT '',
      school       TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL,
      approved_at  TEXT
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS questions (
      id         TEXT PRIMARY KEY,
      qnum       INTEGER NOT NULL UNIQUE,
      type       TEXT NOT NULL,
      skill_id   TEXT NOT NULL,
      text       TEXT NOT NULL,
      opt1       TEXT, opt2 TEXT, opt3 TEXT, opt4 TEXT,
      ans        TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
  ]);
  // CREATE TABLE IF NOT EXISTS is a total no-op against a `schools` table
  // that already existed before this function did (true of every real
  // deployment today) — it never checks or adds columns on an existing
  // table. `code` (the 2-digit auto-generated-login-code prefix, see
  // getOrAssignSchoolCode below) is genuinely new, so it needs its own
  // migration here, same idempotent try/catch ALTER pattern used
  // throughout this file for every other post-launch column.
  try { await DB.prepare('ALTER TABLE schools ADD COLUMN code TEXT UNIQUE').run(); } catch {}
  try { await DB.prepare("ALTER TABLE students ADD COLUMN grade_level TEXT DEFAULT ''").run(); } catch {}
  try { await DB.prepare("ALTER TABLE students ADD COLUMN batch_id TEXT DEFAULT ''").run(); } catch {}
  // One-time backfill: every student that predates the grade_level column
  // (grade_level IS NULL or '') is assumed ثالث ثانوي — the only stage the
  // platform served before this column existed. Rows imported afterwards
  // always carry their own grade_level, so this WHERE clause only ever
  // matches the pre-existing legacy rows, once.
  try { await DB.prepare("UPDATE students SET grade_level = 'ثالث ثانوي' WHERE grade_level IS NULL OR grade_level = ''").run(); } catch {}
  try { await DB.prepare(`CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY, school TEXT NOT NULL DEFAULT '', grade_level TEXT DEFAULT '',
    student_count INTEGER NOT NULL DEFAULT 0, created_by TEXT DEFAULT '', created_at TEXT NOT NULL
  )`).run(); } catch {}
  _coreTablesEnsured = true;
}

const GRADE_LEVELS = ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي'];
const DEFAULT_STUDENT_ID_PREFIX = '11';

// Every school gets a stable 2-digit numeric prefix, assigned once (lowest
// unused 01-98) the first time anything needs it and persisted on its
// `schools` row from then on — not derived from the name, since two schools
// can share a prefix of their name but never their assigned code. Creates
// the school's row if it doesn't exist yet (schools are otherwise only
// created explicitly via POST /api/dev/schools, but nothing here should
// depend on that having happened first). Capped at 98, not 99 — "99" is
// reserved for company-wide ('*') admin/director accounts, see
// COMPANY_WIDE_CODE_PREFIX below.
async function getOrAssignSchoolCode(DB, schoolName) {
  let row = await DB.prepare('SELECT id, code FROM schools WHERE name = ?').bind(schoolName).first();
  if (!row) {
    const sid = 'school-' + crypto.randomUUID().slice(0, 8);
    await DB.prepare('INSERT INTO schools (id, name, created_at) VALUES (?, ?, ?)')
      .bind(sid, schoolName, new Date().toISOString()).run();
    row = { id: sid, code: null };
  }
  if (row.code) return row.code;
  const { results } = await DB.prepare('SELECT code FROM schools WHERE code IS NOT NULL').all();
  const used = new Set(results.map(r => r.code));
  let next = 1;
  while (next <= 98 && used.has(String(next).padStart(2, '0'))) next++;
  if (next > 98) throw new Error('تجاوز الحد الأقصى لعدد المدارس المدعومة (98) في نظام الترقيم التلقائي');
  const newCode = String(next).padStart(2, '0');
  await DB.prepare('UPDATE schools SET code = ? WHERE id = ?').bind(newCode, row.id).run();
  return newCode;
}

// 10-digit student login code = the school's 2-digit prefix + 8 random
// digits, regenerated on a collision against an existing student code
// (checked against the real UNIQUE constraint, not just a race-prone
// read — a genuinely-colliding INSERT still fails cleanly with the
// existing 409 handling in POST /api/dev/students either way).
async function generateStudentCode(DB, schoolName) {
  const prefix = await getOrAssignSchoolCode(DB, schoolName);
  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const candidate = prefix + suffix;
    const exists = await DB.prepare('SELECT 1 FROM students WHERE code = ?').bind(candidate).first();
    if (!exists) return candidate;
  }
  throw new Error('تعذّر توليد كود فريد بعد عدة محاولات — حاول مرة أخرى');
}

// Smart-import student codes use a configurable global prefix (app_settings
// key 'student_id_prefix', default '11') instead of the per-school 2-digit
// prefix generateStudentCode() above assigns — the import batch feature
// needs one fixed, admin-editable prefix regardless of which school is
// importing, not the auto-incrementing per-school scheme used elsewhere.
async function generateBatchStudentCode(DB, prefix) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const candidate = prefix + suffix;
    const exists = await DB.prepare('SELECT 1 FROM students WHERE code = ?').bind(candidate).first();
    if (!exists) return candidate;
  }
  throw new Error('تعذّر توليد كود فريد بعد عدة محاولات — حاول مرة أخرى');
}

// Admin/director codes follow the same "prefix + 8 random digits" shape as
// students, checked against the `admins` table instead. A company-wide
// ('*') account has no real school to derive a prefix from, so it gets the
// fixed reserved prefix below rather than colliding with — or squatting a
// slot that could otherwise go to — a real school.
const COMPANY_WIDE_CODE_PREFIX = '99';
async function generateAdminCode(DB, schoolName) {
  const prefix = (schoolName && schoolName !== '*')
    ? await getOrAssignSchoolCode(DB, schoolName)
    : COMPANY_WIDE_CODE_PREFIX;
  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const candidate = prefix + suffix;
    const exists = await DB.prepare('SELECT 1 FROM admins WHERE code = ?').bind(candidate).first();
    if (!exists) return candidate;
  }
  throw new Error('تعذّر توليد كود فريد بعد عدة محاولات — حاول مرة أخرى');
}

// ── SendPulse WhatsApp helpers ─────────────────────────────────────────
// Schema-migration DDL (CREATE TABLE/ALTER TABLE) is idempotent but still a
// full DB round-trip — running it on every single request to a hot polling
// endpoint (e.g. /messages/unread, /tickets/unread, called every 30s per
// open tab) wastes a query per call for no benefit once the schema already
// exists. These flags make it run at most once per warm instance.
let _messagesSchemaEnsured = false;
let _ticketsSchemaEnsured = false;

let _spToken = null, _spTokenExp = 0;
async function getSendPulseToken(env) {
  if (_spToken && Date.now() < _spTokenExp) return _spToken;
  // Fails loudly and specifically here rather than letting a blank
  // client_id/client_secret reach SendPulse and come back as an opaque
  // "SendPulse auth failed: 401" — which reads exactly like a real,
  // just-expired credential instead of a deployment that never set these.
  if (!env.SENDPULSE_ID || !env.SENDPULSE_SECRET) {
    throw new Error('SendPulse غير مُهيّأ — تحقق من متغيرات SENDPULSE_ID و SENDPULSE_SECRET في بيئة التشغيل');
  }
  const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.SENDPULSE_ID, client_secret: env.SENDPULSE_SECRET }),
  });
  if (!res.ok) throw new Error('SendPulse auth failed: ' + res.status);
  const data = await res.json();
  _spToken = data.access_token;
  _spTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return _spToken;
}

function normalizeSaudiPhone(phone) {
  let p = String(phone).trim().replace(/[\s-]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('966')) return '+' + p;
  if (p.startsWith('05')) return '+966' + p.slice(1);
  if (p.startsWith('5')) return '+966' + p;
  return '+966' + p.replace(/^0/, '');
}

// The inverse of normalizeSaudiPhone — converts any incoming form
// (+9665XXXXXXXX, 9665XXXXXXXX, 5XXXXXXXX, 05XXXXXXXX) back to the
// 05XXXXXXXX form the students table stores, so a WhatsApp contact's raw
// phone number can be matched against it directly.
function toLocalSaudiPhone(phone) {
  let p = String(phone || '').trim().replace(/[\s-]/g, '').replace(/^\+/, '');
  if (p.startsWith('966')) p = '0' + p.slice(3);
  else if (/^5\d{8}$/.test(p)) p = '0' + p;
  return p;
}

function sanitizeWaComponents(components) {
  return (components || []).map(c => ({
    ...c,
    parameters: (c.parameters || []).map(p => (
      p.type === 'text' ? { ...p, text: String(p.text).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim() } : p
    )),
  }));
}

async function spRequest(env, method, path, body) {
  const token = await getSendPulseToken(env);
  const res = await fetch('https://api.sendpulse.com' + path, {
    method,
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text }; }
}

// Staff phone that receives a WhatsApp ping for every new support ticket.
const SUPPORT_NOTIFY_PHONE = '966560521057';

// Fires the "new_support_ticket_notify" WhatsApp template at SUPPORT_NOTIFY_PHONE
// whenever a ticket is created. Mints a fresh opaque ticket-link token per send
// (see POST/GET /api/dev/ticket-link above) instead of embedding the raw ticket
// id, so the deep link can't be used to enumerate/guess other tickets.
async function notifyNewTicket(env, DB, { ticketId, studentName, school, subject, description }) {
  try {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_link_tokens (token TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, created_at TEXT NOT NULL)`).run();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const randBytes = crypto.getRandomValues(new Uint8Array(14));
    const token = Array.from(randBytes, b => alphabet[b % alphabet.length]).join('');
    await DB.prepare('INSERT INTO ticket_link_tokens (token, ticket_id, created_at) VALUES (?, ?, ?)').bind(token, ticketId, new Date().toISOString()).run();

    const components = sanitizeWaComponents([
      { type: 'body', parameters: [
        { type: 'text', text: studentName || 'غير معروف' },
        { type: 'text', text: school || '—' },
        { type: 'text', text: subject || '—' },
        { type: 'text', text: (description || '—').slice(0, 300) },
      ] },
    ]);
    components.push({ type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: token }] });

    const result = await spRequest(env, 'POST', '/whatsapp/contacts/sendTemplateByPhone', {
      bot_id: env.SENDPULSE_BOT_ID,
      phone: normalizeSaudiPhone(SUPPORT_NOTIFY_PHONE),
      template: { name: 'new_support_ticket_notify', language: { code: 'ar', policy: 'deterministic' }, components },
    });
    await logEvent(DB, {
      level: (result?.success === false || result?.error || result?.errors) ? 'error' : 'success',
      category: 'whatsapp',
      message: `إشعار تذكرة دعم جديدة عبر واتساب — ticket=${ticketId} | received=${JSON.stringify(result)}`,
    });
  } catch (e) {
    await logEvent(DB, { level: 'error', category: 'whatsapp', message: `فشل إرسال إشعار تذكرة دعم عبر واتساب: ${e?.message || e}` });
  }
}

// Rough device classification from the requester's own User-Agent header —
// good enough to tell "جوال" from "كمبيوتر" in the activity log, not meant
// to be bulletproof (UA strings can be spoofed/blank).
function detectDevice(userAgent) {
  if (!userAgent) return '';
  if (/iPad|Tablet(?!.*Mobile)/i.test(userAgent)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

async function logEvent(DB, { level = 'info', category = 'system', message, user_name = '', user_role = '', school = '', ip = '', device = '', student_id = '' }) {
  try {
    await DB.prepare(
      'INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,device,student_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(), level, category, message, user_name, user_role, school, ip, device, student_id, new Date().toISOString()).run();
  } catch {}
}

// Best-effort real-time push. On the Node/CranL host (server.js), lib/ws.js
// wires globalThis.__wsBroadcastStudent / __wsBroadcastAdmins to the actual
// WebSocket rooms; on platforms without a persistent process (Cloudflare
// Pages Functions) those globals never exist, so this silently no-ops and
// clients simply keep relying on polling — no behavior change there.
// `school` scopes the admin push to that school's own connected admins (plus
// any company-wide '*' director/dev) — see lib/ws.js's per-school rooms.
// Omit it only for an event with no single-school owner.
function wsNotify({ studentId, admins, school, event }) {
  try {
    if (studentId && typeof globalThis.__wsBroadcastStudent === 'function') {
      globalThis.__wsBroadcastStudent(studentId, event);
    }
    if (admins && typeof globalThis.__wsBroadcastAdmins === 'function') {
      globalThis.__wsBroadcastAdmins(event, school);
    }
  } catch {}
}

// There are no FK CASCADE constraints in this schema, so deleting a student
// without this would leave their messages/tickets/plans/etc. as orphaned rows —
// e.g. a leftover message thread that 403s forever because the by-id school
// lookup it relies on can never find the (deleted) student again.
async function cascadeDeleteStudent(DB, studentId) {
  try { await DB.prepare('DELETE FROM messages WHERE student_id = ?').bind(studentId).run(); } catch {}
  try { await DB.prepare('DELETE FROM ticket_replies WHERE ticket_id IN (SELECT id FROM tickets WHERE student_id = ?)').bind(studentId).run(); } catch {}
  try { await DB.prepare('DELETE FROM tickets WHERE student_id = ?').bind(studentId).run(); } catch {}
  try { await DB.prepare('DELETE FROM plans WHERE student_id = ?').bind(studentId).run(); } catch {}
  try { await DB.prepare('DELETE FROM test_results WHERE student_id = ?').bind(studentId).run(); } catch {}
  try { await DB.prepare('DELETE FROM broadcast_dismissals WHERE student_id = ?').bind(studentId).run(); } catch {}
  try { await DB.prepare('DELETE FROM broadcast_targets WHERE student_id = ?').bind(studentId).run(); } catch {}
}

// ── JWT (HS256 via WebCrypto) ─────────────────────────────────────────────
const _jwtAlg = { name: 'HMAC', hash: 'SHA-256' };
const _b64u = s => {
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
};
// Decode base64url to a UTF-8 string (for header/payload — text only)
const _b64uDec = s => {
  const str = s.replace(/-/g,'+').replace(/_/g,'/');
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
// Decode base64url to raw bytes (for binary data like HMAC signatures)
const _b64uDecBin = s => {
  const str = s.replace(/-/g,'+').replace(/_/g,'/');
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function jwtSign(payload, secret) {
  const h = _b64u({ alg:'HS256', typ:'JWT' });
  const b = _b64u(payload);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), _jwtAlg, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${h}.${b}`));
  const s = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${h}.${b}.${s}`;
}

async function jwtVerify(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), _jwtAlg, false, ['verify']);
    // Use _b64uDecBin for the signature — raw binary must NOT go through TextDecoder
    const sig = _b64uDecBin(s);
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${b}`));
    if (!valid) return null;
    const payload = JSON.parse(_b64uDec(b));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Idempotent — only runs its CREATE TABLE once per warm instance, same
// pattern as the other _*SchemaEnsured flags in this file.
let _revokedTokensSchemaEnsured = false;
async function _ensureRevokedTokensTable(DB) {
  if (_revokedTokensSchemaEnsured) return;
  try {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
    )`).run();
  } catch {}
  _revokedTokensSchemaEnsured = true;
}

// A stolen/leaked JWT is otherwise valid until its natural expiry (up to 8h)
// even after the user explicitly logs out. DB is optional so existing call
// sites that only need auth (not logout enforcement) don't all have to
// change — but every login-issued token now carries a `jti`, so passing DB
// lets a caller actually honor an explicit logout.
async function verifyToken(request, env, DB) {
  const token = getToken(request);
  if (!token) return null;
  if (!env.JWT_SECRET) return null;
  const payload = await jwtVerify(token, env.JWT_SECRET);
  if (!payload) return null;
  if (DB && payload.jti) {
    try {
      await _ensureRevokedTokensTable(DB);
      const revoked = await DB.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').bind(payload.jti).first();
      if (revoked) return null;
    } catch {}
  }
  return payload;
}

// ── Rate Limiting (D1-based, 1-minute windows) ────────────────────────────
async function rateLimit(DB, ip, action, maxPerMin) {
  try {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER DEFAULT 0, win INTEGER DEFAULT 0
    )`).run();
    const window = Math.floor(Date.now() / 60000);
    const key = `${action}:${ip}`;
    const row = await DB.prepare('SELECT count, win FROM rate_limits WHERE key = ?').bind(key).first();
    if (!row || row.win !== window) {
      await DB.prepare('INSERT INTO rate_limits (key, count, win) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, win = EXCLUDED.win').bind(key, window).run();
      return true;
    }
    if (row.count >= maxPerMin) {
      _recordSecurityEvent('rate_limit', { action, ip });
      return false;
    }
    await DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
    return true;
  } catch { return false; }
}

// Same globalThis-hook pattern as wsNotify() — only ever wired up on the
// Node/CranL host (server.js -> lib/monitoring.js), a no-op everywhere else
// (Cloudflare Pages Functions has no persistent process to hold this state).
function _recordSecurityEvent(type, details) {
  try {
    if (typeof globalThis.__recordSecurityEvent === 'function') globalThis.__recordSecurityEvent(type, details);
  } catch {}
}

// ── Failed Login Lockout (D1-based, 15-minute lockout after 5 failures) ──
// `accountKey` (e.g. the login code itself) is optional; when given, a
// second lockout counter is tracked per-account alongside the per-IP one,
// so rotating IPs can't be used to brute-force a single known account.
async function recordFailedAttempt(DB, ip, action, accountKey) {
  _recordSecurityEvent('failed_login', { action, ip, accountKey: accountKey || '' });
  try {
    const lockKey   = `lock:${action}:${ip}`;
    const lockUntil = Math.floor(Date.now() / 1000) + 900; // 15 min from now
    const row = await DB.prepare('SELECT count, win FROM rate_limits WHERE key = ?').bind(lockKey).first();
    const count = (row && row.win > Math.floor(Date.now() / 1000)) ? (row.count + 1) : 1;
    if (count >= 5) {
      await DB.prepare('INSERT INTO rate_limits (key, count, win) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, win = EXCLUDED.win').bind(lockKey, count, lockUntil).run();
    } else {
      await DB.prepare('INSERT INTO rate_limits (key, count, win) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, win = EXCLUDED.win').bind(lockKey, count, Math.floor(Date.now() / 1000) + 900).run();
    }
    if (accountKey) {
      const acctKey = `lock:${action}:acct:${accountKey}`;
      const acctRow = await DB.prepare('SELECT count, win FROM rate_limits WHERE key = ?').bind(acctKey).first();
      const acctCount = (acctRow && acctRow.win > Math.floor(Date.now() / 1000)) ? (acctRow.count + 1) : 1;
      if (acctCount >= 5) {
        await DB.prepare('INSERT INTO rate_limits (key, count, win) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, win = EXCLUDED.win').bind(acctKey, acctCount, lockUntil).run();
      } else {
        await DB.prepare('INSERT INTO rate_limits (key, count, win) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, win = EXCLUDED.win').bind(acctKey, acctCount, Math.floor(Date.now() / 1000) + 900).run();
      }
    }
  } catch {}
}

async function isLockedOut(DB, ip, action, accountKey) {
  try {
    const lockKey = `lock:${action}:${ip}`;
    const row = await DB.prepare('SELECT count, win FROM rate_limits WHERE key = ?').bind(lockKey).first();
    if (row && row.count >= 5 && row.win > Math.floor(Date.now() / 1000)) return true;
    if (accountKey) {
      const acctKey = `lock:${action}:acct:${accountKey}`;
      const acctRow = await DB.prepare('SELECT count, win FROM rate_limits WHERE key = ?').bind(acctKey).first();
      if (acctRow && acctRow.count >= 5 && acctRow.win > Math.floor(Date.now() / 1000)) return true;
    }
    return false;
  } catch { return false; }
}

async function clearFailedAttempts(DB, ip, action, accountKey) {
  try {
    const lockKey = `lock:${action}:${ip}`;
    await DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(lockKey).run();
    if (accountKey) {
      await DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(`lock:${action}:acct:${accountKey}`).run();
    }
  } catch {}
}

export async function onRequest({ request, env }) {
  const CORS = getCORS(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ── Origin check: reject cross-origin requests from unknown origins ──────
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request)) {
    return new Response(JSON.stringify({ error: 'غير مسموح' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Content-Type validation for write methods ────────────────────────────
  const method = request.method;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const ct = request.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type يجب أن يكون application/json' }), { status: 415, headers: { ...CORS } });
    }
  }

  const url      = new URL(request.url);
  const parts    = url.pathname.split('/').filter(Boolean);
  const resource = parts[1];   // e.g. 'students', 'plans', 'dev'
  const sub      = parts[2];   // e.g. student id, 'admins'
  const subsub   = parts[3];   // e.g. admin id
  const subsub2  = parts[4];   // e.g. import batch id under /api/admin/students/export-batch/:batchId
  const DB       = getDB(env);
  const school   = url.searchParams.get('school') || '';

  try {
    await ensureCoreTables(DB);

    // ── Shared quiz-skills schema/tree helpers ──────────────────────────────
    // Used by GET /api/quiz-structure, the quiz-skills submit handler, and the
    // new GET /api/journey — one place owns the DDL/seed and the section→level
    // →skill tree shape instead of hand-maintained copies in each endpoint.
    let _quizSkillsSchemaEnsured = false;
    async function _ensureQuizSkillsSchema() {
      if (_quizSkillsSchemaEnsured) return;
      await DB.prepare(`CREATE TABLE IF NOT EXISTS quiz_skills (
        id TEXT PRIMARY KEY, section TEXT NOT NULL, level TEXT NOT NULL,
        skill_id TEXT NOT NULL, skill_name TEXT NOT NULL, order_idx INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`).run();
      await DB.prepare(`CREATE TABLE IF NOT EXISTS quiz_skill_questions (
        id TEXT PRIMARY KEY, quiz_skill_id TEXT NOT NULL, qnum INTEGER NOT NULL,
        text TEXT NOT NULL, opt1 TEXT NOT NULL, opt2 TEXT NOT NULL, opt3 TEXT NOT NULL, opt4 TEXT NOT NULL,
        ans INTEGER NOT NULL, created_at TEXT NOT NULL
      )`).run();
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_qsq_skill ON quiz_skill_questions(quiz_skill_id, qnum)`).run(); } catch {}
      // Optional educational-feedback fields (Smart Feedback & Tiered Hinting
      // Engine) — nullable, so skills without this content still work exactly
      // as before. Populated only via POST .../import for now.
      for (const col of ['relation', 'explanation', 'golden_rule', 'smart_hint']) {
        try { await DB.prepare(`ALTER TABLE quiz_skill_questions ADD COLUMN IF NOT EXISTS ${col} TEXT`).run(); } catch {}
      }
      await DB.prepare(`CREATE TABLE IF NOT EXISTS skill_progress (
        id TEXT PRIMARY KEY, student_id TEXT NOT NULL, quiz_skill_id TEXT NOT NULL,
        section TEXT NOT NULL, level TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started',
        best_correct INTEGER NOT NULL DEFAULT 0, best_total INTEGER NOT NULL DEFAULT 5,
        attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT, created_at TEXT NOT NULL,
        UNIQUE(student_id, quiz_skill_id)
      )`).run();
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sp_student ON skill_progress(student_id, section, level)`).run(); } catch {}

      // Seed the 2 sections × 3 levels × 5 skills = 30 rows once, matching data.js SKILLS.
      const QS_SKILLS = {
        verbal:       [['v1','الاستيعاب القرائي'], ['v2','الخطأ السياقي'], ['v3','المفردة الشاذة'], ['v4','التناظر اللفظي'], ['v5','إكمال الجمل']],
        quantitative: [['q1','الحساب'], ['q2','الجبر'], ['q3','الهندسة والقياس'], ['q4','المقارنات الكمية'], ['q5','الإحصاء والاحتمالات']],
      };
      const QS_LEVELS = ['easy', 'medium', 'advanced'];
      const qsCountRow = await DB.prepare('SELECT COUNT(*) as c FROM quiz_skills').first();
      if (!qsCountRow || Number(qsCountRow.c) === 0) {
        const seedNow = new Date().toISOString();
        const seedStmt = DB.prepare(
          `INSERT INTO quiz_skills (id, section, level, skill_id, skill_name, order_idx, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`
        );
        for (const [section, skills] of Object.entries(QS_SKILLS)) {
          for (const level of QS_LEVELS) {
            for (let i = 0; i < skills.length; i++) {
              const [skillId, skillName] = skills[i];
              await seedStmt.bind(`${section}-${level}-${skillId}`, section, level, skillId, skillName, i, seedNow).run();
            }
          }
        }
      }
      _quizSkillsSchemaEnsured = true;
    }

    async function _fetchQuizTree(studentId) {
      await _ensureQuizSkillsSchema();
      const { results: skills } = await DB.prepare('SELECT * FROM quiz_skills ORDER BY section, level, order_idx').all();
      const { results: progressRows } = await DB.prepare('SELECT * FROM skill_progress WHERE student_id = ?').bind(studentId).all();
      const { results: qCounts } = await DB.prepare('SELECT quiz_skill_id, COUNT(*) as c FROM quiz_skill_questions GROUP BY quiz_skill_id').all();
      const qCountMap = Object.fromEntries(qCounts.map(r => [r.quiz_skill_id, Number(r.c)]));
      return buildQuizTree({ skills, progressRows, qCountMap });
    }

    // Resolves an admin/director/dev-requested ?studentId= against the caller's
    // school scope (director/dev with school='*' may target any student) —
    // shared by GET /api/quiz-structure and GET /api/journey.
    async function _resolveTargetStudentId(claims) {
      if (claims.role === 'student') return claims.sub;
      if (!['admin', 'director', 'dev'].includes(claims.role)) return null;
      const targetStudentId = url.searchParams.get('studentId') || '';
      if (!targetStudentId) return null;
      if (claims.role !== 'dev' && claims.school && claims.school !== '*') {
        const targetSt = await DB.prepare('SELECT school FROM students WHERE id = ?').bind(targetStudentId).first();
        if (!targetSt || (targetSt.school || '').trim() !== claims.school.trim()) return 'FORBIDDEN';
      }
      return targetStudentId;
    }

    // ── Shared app_settings (small key/value config store) ─────────────────
    // Generic on purpose — the only key used today is the quiz-skills passing
    // ratio (see below), but this avoids a one-off table per future setting.
    let _appSettingsSchemaEnsured = false;
    async function _ensureAppSettingsSchema() {
      if (_appSettingsSchemaEnsured) return;
      await DB.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
      )`).run();
      _appSettingsSchemaEnsured = true;
    }
    async function _getSetting(key) {
      await _ensureAppSettingsSchema();
      const row = await DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first();
      return row ? row.value : null;
    }
    async function _getQuizPassRatio() {
      return resolveQuizPassRatio(await _getSetting('quiz_pass_ratio'));
    }

    // Shared building block: given a list of student ids, returns a
    // Map<studentId, { lastActive, cooldownUntil }> — lastActive from the
    // same three sources analytics uses (login, diagnostic attempt,
    // general-test attempt), cooldownUntil from that student's LATEST
    // diagnostic plan's gaps (null once the admin OVERRIDE bypass applies,
    // same convention as app.js's grantRetake()). One IN(...) query per
    // source, no N+1 regardless of how many ids are passed.
    async function _computeActivityCooldown(studentIds) {
      const map = new Map();
      if (!studentIds.length) return map;
      const placeholders = studentIds.map(() => '?').join(',');
      const [loginRows, planRows, gtrRows] = await Promise.all([
        DB.prepare(`SELECT student_id, MAX(created_at) as last FROM logs WHERE category = 'login' AND student_id IN (${placeholders}) GROUP BY student_id`).bind(...studentIds).all(),
        DB.prepare(`SELECT student_id, gaps, admin_note, created_at FROM plans WHERE student_id IN (${placeholders}) ORDER BY student_id, created_at ASC`).bind(...studentIds).all(),
        DB.prepare(`SELECT student_id, MAX(created_at) as last FROM general_test_results WHERE student_id IN (${placeholders}) GROUP BY student_id`).bind(...studentIds).all(),
      ]);
      const lastLoginByStudent = new Map((loginRows?.results || []).map(r => [r.student_id, r.last]));
      const lastGtrByStudent = new Map((gtrRows?.results || []).map(r => [r.student_id, r.last]));
      // Rows arrive ordered ascending by created_at per student, so the last
      // write into these maps for a given student_id is naturally their
      // latest plan — no separate MAX() query needed.
      const latestPlanByStudent = new Map();
      const lastPlanAtByStudent = new Map();
      for (const row of (planRows?.results || [])) {
        latestPlanByStudent.set(row.student_id, row);
        lastPlanAtByStudent.set(row.student_id, row.created_at);
      }
      for (const id of studentIds) {
        const candidates = [lastLoginByStudent.get(id), lastPlanAtByStudent.get(id), lastGtrByStudent.get(id)].filter(Boolean);
        const lastActive = candidates.length ? candidates.sort().at(-1) : null;
        const latestPlan = latestPlanByStudent.get(id) || null;
        let cooldownUntil = null;
        if (latestPlan && !isRetakeOverride(latestPlan.admin_note)) {
          let gaps = [];
          try { gaps = JSON.parse(latestPlan.gaps || '[]'); } catch {}
          cooldownUntil = computeCooldownUntil(gaps, latestPlan.created_at);
        }
        map.set(id, { lastActive, cooldownUntil });
      }
      return map;
    }

    // ── AUTH ─────────────────────────────────────────────────────────────────
    if (resource === 'auth') {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

      // POST /api/auth/logout — revokes the current JWT immediately instead
      // of leaving it valid until its natural expiry (up to 8h) after an
      // explicit logout. Requires no role — any valid token can revoke itself.
      if (sub === 'logout' && method === 'POST') {
        const token = getToken(request);
        if (!token || !env.JWT_SECRET) return ok({ ok: true }, 200, CORS);
        const payload = await jwtVerify(token, env.JWT_SECRET);
        if (payload?.jti && payload?.exp) {
          await _ensureRevokedTokensTable(DB);
          try {
            await DB.prepare('INSERT INTO revoked_tokens (jti, expires_at) VALUES (?, ?) ON CONFLICT (jti) DO NOTHING').bind(payload.jti, payload.exp).run();
            // Opportunistic cleanup — logout is infrequent enough that doing
            // this here (rather than a cron) keeps the table from growing
            // unbounded without adding a scheduled job just for this.
            await DB.prepare('DELETE FROM revoked_tokens WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run();
          } catch {}
        }
        return ok({ ok: true }, 200, CORS);
      }

      // GET /api/auth/access-token?t=... — public, single-use, no time expiry.
      // Redeems a dev-minted token once; a second attempt (or an unknown
      // token) reports it as already used so the link can never be replayed.
      if (sub === 'access-token' && method === 'GET') {
        if (!await rateLimit(DB, ip, 'access-token', 20)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        const t = url.searchParams.get('t') || '';
        if (!t) return err('الرابط غير صالح', 400, CORS);
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS access_tokens (token TEXT PRIMARY KEY, student_id TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)`).run(); } catch {}
        const row = await DB.prepare('SELECT token, student_id, used_at FROM access_tokens WHERE token = ?').bind(t).first();
        if (!row || row.used_at) return err('انتهت صلاحية هذا الرابط — تواصل مع الدعم الفني', 410, CORS);
        const student = await DB.prepare('SELECT name, code, school FROM students WHERE id = ?').bind(row.student_id).first();
        if (!student) return err('انتهت صلاحية هذا الرابط — تواصل مع الدعم الفني', 410, CORS);
        await DB.prepare('UPDATE access_tokens SET used_at = ? WHERE token = ?').bind(new Date().toISOString(), t).run();
        return ok({ name: student.name, code: student.code, school: student.school || '' }, 200, CORS);
      }

      // GET /api/auth/recover-link?phone=... — public, self-service login-code
      // recovery for the WhatsApp bot flow: given the phone number of the
      // WhatsApp conversation itself (so only the account's real owner can
      // trigger it), mints a single-use access-token link the same way the
      // dev panel does and hands it back for the bot to show as a button.
      // Rate-limited per phone (not just per IP) since SendPulse's own IP is
      // shared across every user of the bot.
      if (sub === 'recover-link' && method === 'GET') {
        const rawPhone = url.searchParams.get('phone') || '';
        if (!await rateLimit(DB, ip, 'recover-link', 20)) {
          await logEvent(DB, { level: 'warn', category: 'recover-link', message: `طلب مرفوض (تجاوز الحد) — الرقم المُرسَل: "${rawPhone}"`, ip });
          return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        }
        const localPhone = toLocalSaudiPhone(rawPhone);
        if (!await rateLimit(DB, 'phone:' + localPhone, 'recover-link-phone', 5)) {
          await logEvent(DB, { level: 'warn', category: 'recover-link', message: `طلب مرفوض (تكرار على نفس الرقم) — الرقم المُرسَل: "${rawPhone}"`, ip });
          return err('طلبات كثيرة — أعد المحاولة لاحقًا', 429, CORS);
        }
        if (!/^05\d{8}$/.test(localPhone)) {
          await logEvent(DB, { level: 'warn', category: 'recover-link', message: `صيغة رقم غير صالحة — الرقم المُرسَل: "${rawPhone}"`, ip });
          return err('رقم جوال غير صالح', 400, CORS);
        }
        const student = await DB.prepare('SELECT id, name FROM students WHERE phone = ?').bind(localPhone).first();
        if (!student) {
          await logEvent(DB, { level: 'warn', category: 'recover-link', message: `لا يوجد حساب لهذا الرقم — الرقم المُرسَل: "${rawPhone}" (بعد التطبيع: ${localPhone})`, ip });
          return err('لا يوجد حساب مرتبط بهذا الرقم', 404, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS access_tokens (token TEXT PRIMARY KEY, student_id TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)`).run(); } catch {}
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const randBytes = crypto.getRandomValues(new Uint8Array(14));
        const token = Array.from(randBytes, b => alphabet[b % alphabet.length]).join('');
        await DB.prepare('INSERT INTO access_tokens (token, student_id, created_at) VALUES (?, ?, ?)').bind(token, student.id, new Date().toISOString()).run();
        const link = `${new URL(request.url).origin}/?t=${token}`;
        await logEvent(DB, { level: 'success', category: 'recover-link', message: `تم إرسال رابط الدخول — ${student.name} — الرقم المُرسَل: "${rawPhone}"`, user_name: student.name, user_role: 'student', ip });
        return ok({ link, name: student.name }, 200, CORS);
      }

      // POST /api/auth/recover/request { phone } — OTP-based login-code
      // recovery, initiated from the student login screen itself (distinct
      // from GET recover-link above, which is the WhatsApp-bot-only flow).
      // Anti-enumeration: a code is generated and stored for ANY well-formed
      // phone number, whether or not it belongs to a student (student_id is
      // NULL when it doesn't) — this endpoint always answers {ok:true} and
      // never reveals registration status itself. WhatsApp delivery (and the
      // local-dev devCode passthrough) only happens when a student actually
      // matches, so a non-account phone's code is real but never delivered
      // to anyone — it can't practically be guessed (4 digits, 5 attempts).
      // /verify only checks registration AFTER the code itself matches, so
      // guessing wrong never leaks whether the phone has an account; only
      // proving you received the real code does.
      if (sub === 'recover' && subsub === 'request' && method === 'POST') {
        const { phone: rawPhone } = await request.json().catch(() => ({}));
        if (!await rateLimit(DB, ip, 'recover-otp-request', 10)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        const localPhone = toLocalSaudiPhone(rawPhone || '');
        if (!/^05\d{8}$/.test(localPhone)) return err('رقم جوال غير صالح', 400, CORS);
        if (!await rateLimit(DB, 'phone:' + localPhone, 'recover-otp-request-phone', 5)) {
          return err('طلبات كثيرة على هذا الرقم — أعد المحاولة لاحقًا', 429, CORS);
        }
        const student = await DB.prepare('SELECT id, name, phone FROM students WHERE phone = ?').bind(localPhone).first();
        if (!student) {
          await logEvent(DB, { level: 'warn', category: 'recover-otp', message: `طلب OTP لرقم غير مسجّل — الرقم المُرسَل: "${rawPhone}"`, ip });
        }

        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS otp_codes (
          id TEXT PRIMARY KEY, phone TEXT NOT NULL, code TEXT NOT NULL, student_id TEXT,
          attempts INTEGER NOT NULL DEFAULT 0, used_at TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        )`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE otp_codes ALTER COLUMN student_id DROP NOT NULL`).run(); } catch {}
        try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone)`).run(); } catch {}
        // Invalidate any still-live code for this phone first — only the
        // most recent request should ever be verifiable.
        await DB.prepare('DELETE FROM otp_codes WHERE phone = ? AND used_at IS NULL').bind(localPhone).run();

        const code = String(Math.floor(1000 + Math.random() * 9000)); // 4 digits, never leading-zero-ambiguous
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
        await DB.prepare(
          'INSERT INTO otp_codes (id, phone, code, student_id, attempts, used_at, expires_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)'
        ).bind(crypto.randomUUID(), localPhone, code, student?.id || null, expiresAt, now.toISOString()).run();

        // Local/dev environments have no SendPulse credentials configured —
        // production always does, so this branch never fires there. Skip the
        // real WhatsApp send and hand the code back in the response so the
        // whole flow (including the "correct code, no account" 404 case
        // below in /verify) can be exercised without a live WhatsApp bot,
        // whether or not this phone matches a student.
        if (!env.SENDPULSE_ID || !env.SENDPULSE_SECRET) {
          await logEvent(DB, { level: 'warn', category: 'recover-otp', message: `[DEV] SendPulse غير مُهيّأ — تم تخطي الإرسال الفعلي، الرمز: ${code} — ${student ? student.name : '(رقم غير مسجّل)'}`, user_name: student?.name || '', user_role: 'student', ip });
          return ok({ ok: true, devCode: code }, 200, CORS);
        }

        if (!student) return ok({ ok: true }, 200, CORS);

        try {
          const result = await spRequest(env, 'POST', '/whatsapp/contacts/sendTemplateByPhone', {
            bot_id: env.SENDPULSE_BOT_ID,
            phone: normalizeSaudiPhone(localPhone),
            template: {
              name: 'student_otp_recovery',
              language: { code: 'ar', policy: 'deterministic' },
              components: sanitizeWaComponents([{ type: 'body', parameters: [{ type: 'text', text: code }] }]),
            },
          });
          const spError = result?.results?.[0]?.error || result?.error || result?.errors;
          if (result?.results?.[0]?.success === false || spError) {
            // Still answer ok:true — an error response here (vs the silent
            // 200 an unregistered number gets above) would itself leak that
            // this phone IS registered, just that WhatsApp delivery failed.
            await logEvent(DB, { level: 'error', category: 'recover-otp', message: `فشل إرسال OTP عبر واتساب — ${student.name} | ${JSON.stringify(spError || result)}`, ip });
            return ok({ ok: true }, 200, CORS);
          }
        } catch (e) {
          await logEvent(DB, { level: 'error', category: 'recover-otp', message: `فشل إرسال OTP عبر واتساب: ${e?.message || e}`, ip });
          return ok({ ok: true }, 200, CORS);
        }
        await logEvent(DB, { level: 'success', category: 'recover-otp', message: `تم إرسال رمز OTP — ${student.name}`, user_name: student.name, user_role: 'student', ip });
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/auth/recover/verify { phone, code } — returns the
      // student's login code (access_code) once the OTP matches. Whether the
      // phone belongs to an account is only checked AFTER the code itself
      // matches — see the anti-enumeration note on /request above.
      if (sub === 'recover' && subsub === 'verify' && method === 'POST') {
        const { phone: rawPhone, code: submittedCode } = await request.json().catch(() => ({}));
        if (!await rateLimit(DB, ip, 'recover-otp-verify', 15)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        const localPhone = toLocalSaudiPhone(rawPhone || '');
        if (!/^05\d{8}$/.test(localPhone) || !/^\d{4}$/.test(String(submittedCode || ''))) {
          return err('بيانات غير صالحة', 400, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS otp_codes (
          id TEXT PRIMARY KEY, phone TEXT NOT NULL, code TEXT NOT NULL, student_id TEXT,
          attempts INTEGER NOT NULL DEFAULT 0, used_at TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        )`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE otp_codes ALTER COLUMN student_id DROP NOT NULL`).run(); } catch {}
        const row = await DB.prepare(
          'SELECT * FROM otp_codes WHERE phone = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1'
        ).bind(localPhone).first();
        if (!row || new Date(row.expires_at).getTime() < Date.now()) {
          return err('انتهت صلاحية رمز التحقق — اطلب رمزًا جديدًا', 410, CORS);
        }
        if (row.attempts >= 5) {
          return err('تجاوزت عدد المحاولات المسموح — اطلب رمزًا جديدًا', 429, CORS);
        }
        if (String(submittedCode) !== row.code) {
          await DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
          return err('رمز التحقق غير صحيح', 401, CORS);
        }
        await DB.prepare('UPDATE otp_codes SET used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
        const student = row.student_id ? await DB.prepare('SELECT code, name FROM students WHERE id = ?').bind(row.student_id).first() : null;
        if (!student) return err('لا يوجد حساب مرتبط برقم الجوال هذا', 404, CORS);
        await logEvent(DB, { level: 'success', category: 'recover-otp', message: `تم كشف رقم الدخول عبر OTP — ${student.name}`, user_name: student.name, user_role: 'student', ip });
        return ok({ access_code: student.code, name: student.name }, 200, CORS);
      }

      // POST /api/auth/student-login
      if (sub === 'student-login' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'student-login', 10)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        if (await isLockedOut(DB, ip, 'student-login')) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        const rawBody = await request.json();
        // Mass assignment guard: only accept known fields
        const { code, school: bodySchool } = rawBody;
        if (Object.keys(rawBody).some(k => !['code','school'].includes(k))) return err('حقول غير مسموحة', 400, CORS);
        if (!code || !/^\d{10}$/.test(code)) return err('رمز غير صالح', 400, CORS);
        // Account-level lockout (by code) in addition to the IP-level check
        // above, so rotating IPs can't be used to brute-force one account.
        if (await isLockedOut(DB, ip, 'student-login', code)) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        const sc = bodySchool || school;
        const student = sc
          ? await DB.prepare('SELECT id, code, name, school, phone FROM students WHERE code = ? AND school = ?').bind(code, sc).first()
          : await DB.prepare('SELECT id, code, name, school, phone FROM students WHERE code = ?').bind(code).first();
        if (!student) {
          await recordFailedAttempt(DB, ip, 'student-login', code);
          await logEvent(DB, { level: 'warn', category: 'login', message: 'محاولة دخول طالب فاشلة — بيانات غير صحيحة أو الحساب غير موجود', user_role: 'student', school: sc, ip });
          return err('بيانات الدخول غير صحيحة', 401, CORS);
        }
        await clearFailedAttempts(DB, ip, 'student-login', code);
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const token = await jwtSign({ jti: crypto.randomUUID(), sub: student.id, role: 'student', name: student.name, school: student.school, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, env.JWT_SECRET);
        await logEvent(DB, { level: 'success', category: 'login', message: 'تسجيل دخول طالب', user_name: student.name, user_role: 'student', school: student.school || '', ip, student_id: student.id });
        return ok({ token, student: { id: student.id, name: student.name, school: student.school, phone: student.phone || '' } }, 200, CORS);
      }

      // POST /api/auth/admin-login
      if (sub === 'admin-login' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'admin-login', 5)) return err('طلبات كثيرة', 429, CORS);
        if (await isLockedOut(DB, ip, 'admin-login')) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        const rawAdminBody = await request.json();
        if (Object.keys(rawAdminBody).some(k => !['code','school'].includes(k))) return err('حقول غير مسموحة', 400, CORS);
        const { code: adminCode, school: bodySchool } = rawAdminBody;
        if (!adminCode || !/^\d{10}$/.test(adminCode)) return err('رمز غير صالح', 400, CORS);
        // Account-level lockout (by code) in addition to the IP-level check
        // above, so rotating IPs can't be used to brute-force one account.
        if (await isLockedOut(DB, ip, 'admin-login', adminCode)) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN permissions TEXT DEFAULT '[]'").run(); } catch {}
        const admin = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(adminCode).first();
        const sc = bodySchool || school;
        if (!admin || (admin.school !== '*' && sc && admin.school !== sc)) {
          await recordFailedAttempt(DB, ip, 'admin-login', adminCode);
          await logEvent(DB, { level: 'warn', category: 'login', message: 'محاولة دخول مشرف فاشلة — بيانات غير صحيحة أو الحساب غير موجود', user_role: 'admin', school: sc, ip });
          return err('بيانات الدخول غير صحيحة', 401, CORS);
        }
        await clearFailedAttempts(DB, ip, 'admin-login', adminCode);
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const adminName = admin.admin_name || admin.name || '';
        // Normalize role: only 'director' keeps its value, everything else becomes 'admin'
        const adminRole = admin.role === 'director' ? 'director' : 'admin';
        let permissions = [];
        try { permissions = JSON.parse(admin.permissions || '[]'); } catch {}
        const token = await jwtSign({ jti: crypto.randomUUID(), sub: admin.id, role: adminRole, name: adminName, school: admin.school, permissions, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, env.JWT_SECRET);
        await logEvent(DB, { level: 'success', category: 'login', message: `تسجيل دخول ${adminRole==='director'?'مدير':'مشرف'}`, user_name: adminName, user_role: adminRole, school: admin.school || '', ip });
        return ok({ token, admin: { id: admin.id, name: adminName, school: admin.school, role: adminRole, permissions } }, 200, CORS);
      }

      // POST /api/auth/dev
      if (sub === 'dev' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'dev-login', 5)) return err('طلبات كثيرة', 429, CORS);
        if (await isLockedOut(DB, ip, 'dev-login')) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        const { key } = await request.json();
        const devKey = env.DEV_KEY;
        if (!devKey || key !== devKey) {
          await recordFailedAttempt(DB, ip, 'dev-login');
          return err('غير مصرح', 401, CORS);
        }
        await clearFailedAttempts(DB, ip, 'dev-login');
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const token = await jwtSign({ jti: crypto.randomUUID(), role: 'dev', exp: Math.floor(Date.now() / 1000) + 4 * 3600 }, env.JWT_SECRET);
        return ok({ token }, 200, CORS);
      }

      // GET /api/auth/profile — returns current admin's profile (including phone after migration)
      if (sub === 'profile' && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN phone TEXT DEFAULT ''").run(); } catch {}
        const admin = await DB.prepare('SELECT id, name, school, role, phone FROM admins WHERE id = ?').bind(claims.sub).first();
        if (!admin) return err('لم يتم العثور على الحساب', 404, CORS);
        return ok({ admin }, 200, CORS);
      }

      // PATCH /api/auth/profile — update admin's own phone number
      if (sub === 'profile' && method === 'PATCH') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN phone TEXT DEFAULT ''").run(); } catch {}
        const body = await request.json();
        const phone = (body.phone || '').trim();
        if (phone && !/^\d{10}$/.test(phone)) return err('رقم الجوال يجب أن يكون ١٠ أرقام', 400, CORS);
        await DB.prepare('UPDATE admins SET phone = ? WHERE id = ?').bind(phone, claims.sub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/auth/impersonate — admin/director mints a synthetic trial-student JWT so
      // they can preview the student experience ("عرض كطالب") without a real student account.
      // Attempts taken under this token are flagged is_trial=1 in general_test_results.
      if (sub === 'impersonate' && method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const trialId     = 'trial-' + crypto.randomUUID();
        const trialName   = 'زائر تجريبي';
        const trialSchool = claims.school && claims.school !== '*' ? claims.school : (school || '');
        const token = await jwtSign({
          jti: crypto.randomUUID(), sub: trialId, role: 'student', name: trialName, school: trialSchool,
          trial: true, adminSub: claims.sub, adminName: claims.name || '',
          exp: Math.floor(Date.now() / 1000) + 30 * 60,
        }, env.JWT_SECRET);
        await logEvent(DB, { level: 'info', category: 'login', message: `بدء وضع "عرض كطالب" — ${claims.role === 'director' ? 'مدير' : 'مشرف'}: ${claims.name || ''}`, user_name: claims.name || '', user_role: claims.role, school: claims.school || '', ip });
        return ok({ token, student: { id: trialId, name: trialName, school: trialSchool }, trial: true }, 200, CORS);
      }
    }

    // ── SCHOOLS ─────────────────────────────────────────────────────────────
    if (resource === 'schools' && method === 'GET') {
      const { results } = await DB.prepare('SELECT * FROM schools ORDER BY name ASC').all();
      return ok({ schools: results }, 200, CORS);
    }

    // ── STUDENTS ─────────────────────────────────────────────────────────────
    if (resource === 'students') {
      try { await DB.prepare("ALTER TABLE students ADD COLUMN phone TEXT DEFAULT ''").run(); } catch {}

      // GET /api/students/generate-code — JWT-authenticated equivalent of
      // /api/dev/generate-student-code, for the real admin dashboard's own
      // "Add Student" modal (which only ever holds an admin/director JWT,
      // never the dev key). A school-scoped admin/director is always forced
      // to their own JWT school, same rule as everywhere else in this file;
      // only dev or a '*' director may pass ?school= to generate for a
      // school they're not personally scoped to. MUST be checked before the
      // plain `method === 'GET'` list handler below, which never looks at
      // `sub` and would otherwise swallow this request as "list students"
      // before this block ever ran.
      if (sub === 'generate-code' && method === 'GET') {
        const gcClaims = await verifyToken(request, env, DB);
        if (!gcClaims || !['admin','director','dev'].includes(gcClaims.role)) return err('غير مصرح', 401, CORS);
        const gcSchool = (gcClaims.role !== 'dev' && gcClaims.school && gcClaims.school !== '*')
          ? gcClaims.school : school;
        if (!gcSchool) return err('المدرسة مطلوبة', 400, CORS);
        try {
          // Every new student — whether added one at a time here or through
          // the smart-import batch flow — gets the same configurable global
          // prefix (app_settings 'student_id_prefix', default '11'), not the
          // legacy per-school 2-digit scheme generateStudentCode() used to
          // assign here; that scheme still backs existing student codes and
          // admin/director logins, but new student IDs going forward all
          // follow the one admin-editable prefix.
          const prefix = (await _getSetting('student_id_prefix')) || DEFAULT_STUDENT_ID_PREFIX;
          const code = await generateBatchStudentCode(DB, prefix);
          return ok({ code }, 200, CORS);
        } catch (e) {
          return err(e.message || 'تعذّر توليد الكود', 500, CORS);
        }
      }

      if (method === 'GET' && !sub) {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        let q = 'SELECT * FROM students';
        const params = [];
        // Admins are always limited to their own school from JWT — never from URL param
        // Directors/dev may filter by optional ?school= param
        let effectiveSchool;
        if (claims.role === 'admin') {
          effectiveSchool = claims.school || '';
          if (!effectiveSchool) return ok({ students: [] }, 200, CORS);
        } else {
          effectiveSchool = school || null; // director/dev may filter or get all
        }
        if (effectiveSchool) { q += ' WHERE school = ?'; params.push(effectiveSchool); }
        q += ' ORDER BY created_at ASC';
        const { results } = await DB.prepare(q).bind(...params).all();
        // last_active/cooldown_until — same signals/formula as the analytics
        // "at-risk" aggregate, exposed here too so the students table and
        // student profile header can show "آخر نشاط" without a second
        // school-wide round-trip through /api/analytics/*.
        const activityMap = await _computeActivityCooldown(results.map(r => r.id));
        const withActivity = results.map(r => {
          const a = activityMap.get(r.id);
          return { ...r, last_active: a?.lastActive ?? null, cooldown_until: a?.cooldownUntil ?? null };
        });
        return ok({ students: withActivity }, 200, CORS);
      }

      // POST /api/students/:id/reset-test — admin/director (own school) or dev: let a
      // student take the test again by lifting the cooldown on their latest plan
      // (the same OVERRIDE convention app.js's grantRetake() uses). Previous test
      // results and plan history are kept intact — nothing is deleted here.
      if (method === 'POST' && sub && subsub === 'reset-test') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const resetTarget = await DB.prepare('SELECT name, school FROM students WHERE id = ?').bind(sub).first();
        if (!resetTarget) return err('الطالب غير موجود', 404, CORS);
        if (claims.role !== 'dev') {
          const effectiveSchool = claims.school && claims.school !== '*' ? claims.school : school;
          if (!effectiveSchool || resetTarget.school !== effectiveSchool) return err('غير مصرح', 401, CORS);
        }
        const updated = await grantRetakeForSchool(DB, { studentId: sub });
        await logEvent(DB, { level: 'success', category: 'test-management', message: `منح إعادة اختبار للطالب: ${resetTarget.name}`, user_name: claims.name || '', user_role: claims.role, school: claims.school || resetTarget.school || '' });
        return ok({ ok: true, updated }, 200, CORS);
      }

      if (method === 'POST' && !sub) {
        const postClaims = await verifyToken(request, env, DB);
        if (!postClaims || !['admin','director','dev'].includes(postClaims.role)) return err('غير مصرح', 401, CORS);
        const body = await request.json();

        if (Array.isArray(body)) {
          const now = new Date().toISOString();
          // Non-dev admins/directors scoped to a specific school can't use a
          // row's own `school` (or ?school=) to plant students in another school.
          const effectiveSchool = postClaims.school && postClaims.school !== '*' ? postClaims.school : null;
          const valid = body.filter(r => r.name && r.code && typeof r.name === 'string' && /^\d{10}$/.test(r.code) && r.name.length <= 100);

          // Fetch existing codes in one query
          const { results: existing } = await DB.prepare('SELECT code FROM students').all();
          const existingCodes = new Set(existing.map(r => r.code));

          const toAdd    = valid.filter(r => !existingCodes.has(r.code));
          const toUpdate = valid.filter(r =>  existingCodes.has(r.code));

          // Check if caller wants upsert (update existing names)
          const upsert = url.searchParams.get('upsert') === '1';

          let added = 0, updated = 0;

          // Batch insert new students
          if (toAdd.length) {
            const stmts = toAdd.map(({ name, code, school: s, phone }) =>
              DB.prepare('INSERT INTO students (id, code, name, school, phone, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (code) DO NOTHING')
                .bind(crypto.randomUUID(), code, name, effectiveSchool || s || school, phone || '', now)
            );
            const results = await DB.batch(stmts);
            added = results.filter(r => r.changes).length;
          }

          // Batch update existing students if upsert mode
          if (upsert && toUpdate.length) {
            const stmts = toUpdate.map(({ name, code, school: s, phone }) =>
              DB.prepare('UPDATE students SET name = ?, school = ?, phone = COALESCE(?, phone) WHERE code = ?')
                .bind(name, effectiveSchool || s || school, phone || null, code)
            );
            const results = await DB.batch(stmts);
            updated = results.filter(r => r.changes).length;
          }

          await logEvent(DB, { level: 'info', category: 'student', message: `استيراد طلاب جماعي — ${added} مضاف، ${updated} معدّل`, user_name: postClaims.name || '', user_role: postClaims.role, school: effectiveSchool || school || '' });
          return ok({ added, updated, skipped: valid.length - added - updated, total: valid.length }, 200, CORS);
        }

        const { name, code, school: bodySchool, phone, gradeLevel } = body;
        // Same field constraints already enforced on the bulk-import path above.
        if (!code || !/^\d{10}$/.test(code)) return err('رمز غير صالح', 400, CORS);
        if (!name || typeof name !== 'string' || name.length > 100) return err('اسم غير صالح', 400, CORS);
        // Optional for backward compatibility with older callers of this
        // endpoint (e.g. the bulk-array branch above never sends it) — but
        // whatever is sent must be one of the real stages, never freeform.
        if (gradeLevel && !GRADE_LEVELS.includes(gradeLevel)) return err('مرحلة دراسية غير صالحة', 400, CORS);
        // Non-dev admins/directors scoped to a specific school can't override
        // it via body/query — only dev or a school='*' director may pick freely.
        const effectiveSchool = postClaims.school && postClaims.school !== '*' ? postClaims.school : (bodySchool || school);
        const sid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO students (id, code, name, school, phone, grade_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(sid, code, name, effectiveSchool, phone || '', gradeLevel || '', now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE'))
            return err('السجل المدني مسجّل مسبقاً', 409, CORS);
          throw e;
        }
        await logEvent(DB, { level: 'info', category: 'student', message: `إضافة طالب جديد: ${name}`, user_name: postClaims.name || '', user_role: postClaims.role, school: effectiveSchool || '' });
        return ok({ student: { id: sid, code, name, school: effectiveSchool, phone: phone || '', grade_level: gradeLevel || '', created_at: now } }, 201, CORS);
      }

      if (method === 'PATCH' && sub) {
        const claims = await verifyToken(request, env, DB);
        // Allow students to update their own phone number only
        if (claims?.role === 'student' && claims.sub === sub) {
          const body = await request.json();
          const phone = (body.phone || '').trim();
          if (!phone || !/^\d{10}$/.test(phone)) return err('رقم الجوال غير صحيح', 400, CORS);
          await DB.prepare('UPDATE students SET phone = ? WHERE id = ?').bind(phone, sub).run();
          return ok({ ok: true }, 200, CORS);
        }
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const target = await DB.prepare('SELECT name, school FROM students WHERE id = ?').bind(sub).first();
        if (!target) return err('الطالب غير موجود', 404, CORS);
        if (claims.role !== 'dev') {
          const effectiveSchool = claims.school && claims.school !== '*' ? claims.school : school;
          if (!effectiveSchool || target.school !== effectiveSchool) return err('غير مصرح', 401, CORS);
        }
        const body = await request.json();
        const sets = [];
        const vals = [];
        if ('phone' in body) { sets.push('phone = ?'); vals.push(body.phone || ''); }
        if ('name' in body) {
          const name = (body.name || '').trim();
          if (!name) return err('اسم الطالب مطلوب', 400, CORS);
          sets.push('name = ?'); vals.push(name);
        }
        if ('code' in body) {
          // Only dev can change the national ID/code — admin & director are
          // restricted to name/phone so the identity used for student login
          // can't be altered from the school-level admin dashboard.
          if (claims.role !== 'dev') return err('غير مسموح بتعديل رقم الهوية', 403, CORS);
          const code = (body.code || '').trim();
          if (!code) return err('رقم الهوية مطلوب', 400, CORS);
          sets.push('code = ?'); vals.push(code);
        }
        if (!sets.length) return err('لا توجد بيانات للتحديث', 400, CORS);
        try {
          await DB.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, sub).run();
        } catch (e) {
          if (String(e?.message || '').includes('UNIQUE')) return err('السجل المدني مسجّل مسبقاً', 409, CORS);
          throw e;
        }
        await logEvent(DB, { level: 'info', category: 'student', message: `تحديث بيانات الطالب: ${target.name}`, user_name: claims.name || '', user_role: claims.role, school: claims.school || target.school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      if (method === 'DELETE' && sub) {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const delTarget = await DB.prepare('SELECT name, school FROM students WHERE id = ?').bind(sub).first();
        await cascadeDeleteStudent(DB, sub);
        if (claims.role === 'dev') {
          await DB.prepare('DELETE FROM students WHERE id = ?').bind(sub).run();
        } else {
          // Non-dev admins can only delete students from their own school
          const effectiveSchool = claims.school && claims.school !== '*' ? claims.school : school;
          if (!effectiveSchool) return err('المدرسة مطلوبة', 400, CORS);
          await DB.prepare('DELETE FROM students WHERE id = ? AND school = ?').bind(sub, effectiveSchool).run();
        }
        await logEvent(DB, { level: 'warn', category: 'student', message: `حذف طالب: ${delTarget?.name || sub}`, user_name: claims.name || '', user_role: claims.role, school: claims.school || delTarget?.school || school || '' });
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── SMART STUDENT IMPORT (column-mapped batches, batch export/dispatch) ──
    if (resource === 'admin' && sub === 'students') {
      const _isDevSI = authDev(request, env);
      const _claimsSI = _isDevSI ? null : await verifyToken(request, env, DB);
      const roleSI = _isDevSI ? 'dev' : _claimsSI?.role;
      if (!['admin', 'director', 'dev'].includes(roleSI || '')) return err('غير مصرح', 401, CORS);
      const effSchoolSI = (roleSI !== 'dev' && _claimsSI?.school && _claimsSI.school !== '*')
        ? _claimsSI.school : (school || '');

      // POST /api/admin/students/import-preview — server-side normalization,
      // column-value validation and duplicate detection for rows the browser
      // already parsed out of the uploaded Excel file (this app has no
      // server-side Excel parser; the client's `xlsx` package handles that,
      // see admin-app's SmartImportModal). Returns a preview row per input
      // row with its computed status, but commits nothing.
      if (subsub === 'import-preview' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!effSchoolSI && !body.school) return err('المدرسة مطلوبة', 400, CORS);
        const targetSchool = effSchoolSI || body.school;

        const { results: existingPhones } = await DB.prepare('SELECT phone FROM students WHERE phone <> \'\'').all();
        const existingPhoneSet = new Set(existingPhones.map(r => r.phone));
        const seenPhonesInFile = new Set();
        const seenNamesAndPhones = new Set();

        const preview = rows.map((r, index) => {
          const name = String(r.name || '').trim().slice(0, 100);
          // Excel frequently stores a phone column as a number, which drops
          // the leading zero (e.g. "0560521057" -> 560521057) — normalize
          // through the same helper used for WhatsApp-sourced phone numbers
          // rather than a raw digit-count check, so that common case still
          // resolves to a valid 05XXXXXXXX number instead of being rejected.
          const phoneRaw = String(r.phone || '').trim();
          const phone = phoneRaw ? toLocalSaudiPhone(phoneRaw) : '';
          const gradeLevel = GRADE_LEVELS.includes(r.gradeLevel) ? r.gradeLevel : (body.uniformGradeLevel && GRADE_LEVELS.includes(body.uniformGradeLevel) ? body.uniformGradeLevel : '');

          let status = 'new';
          let error = '';
          if (!name) { status = 'invalid'; error = 'الاسم مطلوب'; }
          else if (!gradeLevel) { status = 'invalid'; error = 'المرحلة الدراسية مطلوبة'; }
          else if (phone && !/^05\d{8}$/.test(phone)) { status = 'invalid'; error = 'رقم الجوال غير صالح'; }
          else if (phone && seenPhonesInFile.has(phone)) { status = 'duplicate_in_file'; error = 'رقم الجوال مكرر في الملف'; }
          else if (phone && existingPhoneSet.has(phone)) { status = 'duplicate_existing'; error = 'رقم الجوال مسجّل مسبقاً'; }
          else if (!phone && seenNamesAndPhones.has(name)) { status = 'duplicate_in_file'; error = 'اسم مكرر في الملف بلا رقم جوال للتمييز'; }

          if (status === 'new') {
            if (phone) seenPhonesInFile.add(phone);
            else seenNamesAndPhones.add(name);
          }
          return { index, name, phone, gradeLevel, status, error };
        });

        const validCount = preview.filter(r => r.status === 'new').length;
        return ok({ school: targetSchool, total: preview.length, validCount, rows: preview }, 200, CORS);
      }

      // POST /api/admin/students/import-confirm — commits only rows the
      // caller marked valid in the preview step, generating each a fresh
      // login code under the configurable global prefix (not the per-school
      // scheme generateStudentCode() uses elsewhere in this file).
      if (subsub === 'import-confirm' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const targetSchool = effSchoolSI || body.school;
        if (!targetSchool) return err('المدرسة مطلوبة', 400, CORS);
        const valid = rows.filter(r => r.name && GRADE_LEVELS.includes(r.gradeLevel));
        if (!valid.length) return err('لا توجد صفوف صالحة للاستيراد', 400, CORS);

        const prefix = (await _getSetting('student_id_prefix')) || DEFAULT_STUDENT_ID_PREFIX;
        const batchId = crypto.randomUUID();
        const now = new Date().toISOString();
        const created = [];
        for (const r of valid) {
          const code = await generateBatchStudentCode(DB, prefix);
          const sid = crypto.randomUUID();
          const name = String(r.name).trim().slice(0, 100);
          const phone = /^05\d{8}$/.test(String(r.phone || '')) ? r.phone : '';
          await DB.prepare(
            'INSERT INTO students (id, code, name, school, phone, grade_level, batch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(sid, code, name, targetSchool, phone, r.gradeLevel, batchId, now).run();
          created.push({ id: sid, code, name, phone, gradeLevel: r.gradeLevel });
        }
        await DB.prepare(
          'INSERT INTO import_batches (id, school, grade_level, student_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(batchId, targetSchool, valid[0].gradeLevel, created.length, _claimsSI?.name || 'dev', now).run();
        await logEvent(DB, { level: 'success', category: 'student', message: `استيراد ذكي — دفعة جديدة (${created.length} طالب) — ${targetSchool}`, user_name: _claimsSI?.name || '', user_role: roleSI, school: targetSchool });
        return ok({ batchId, created, skipped: rows.length - created.length }, 201, CORS);
      }

      // GET /api/admin/students/export-batch/:batchId — students belonging
      // to one import batch only, for the completion screen's scoped export
      // (JSON here; the admin-app builds the actual downloadable .xls
      // client-side the same way it already does for the full student list
      // in lib/csv.ts — there's no server-side Excel writer in this app).
      if (subsub === 'export-batch' && subsub2 && method === 'GET') {
        const batch = await DB.prepare('SELECT * FROM import_batches WHERE id = ?').bind(subsub2).first();
        if (!batch) return err('الدفعة غير موجودة', 404, CORS);
        if (effSchoolSI && batch.school !== effSchoolSI) return err('غير مصرح', 401, CORS);
        const { results } = await DB.prepare(
          'SELECT id, code, name, phone, grade_level, school FROM students WHERE batch_id = ? ORDER BY created_at ASC'
        ).bind(subsub2).all();
        return ok({ batch, students: results }, 200, CORS);
      }

      // POST /api/admin/students/whatsapp-dispatch-batch/:batchId — sends
      // login credentials only to this batch's students, reusing the same
      // wa_template_logs table/batch_id-scoped shape as
      // POST /api/sendpulse/template-send above so GET dispatch-status below
      // can aggregate progress with one simple COUNT query.
      if (subsub === 'whatsapp-dispatch-batch' && subsub2 && method === 'POST') {
        if (roleSI !== 'dev' && !(Array.isArray(_claimsSI?.permissions) && _claimsSI.permissions.includes('send_whatsapp'))) {
          return err('لا تملك صلاحية إرسال الواتساب', 403, CORS);
        }
        const batch = await DB.prepare('SELECT * FROM import_batches WHERE id = ?').bind(subsub2).first();
        if (!batch) return err('الدفعة غير موجودة', 404, CORS);
        if (effSchoolSI && batch.school !== effSchoolSI) return err('غير مصرح', 401, CORS);
        const { results: targets } = await DB.prepare(
          'SELECT id, name, phone, code FROM students WHERE batch_id = ?'
        ).bind(subsub2).all();

        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS wa_template_logs (
          id TEXT PRIMARY KEY, batch_id TEXT, student_id TEXT, student_name TEXT, phone TEXT,
          template_name TEXT, variables TEXT, status TEXT, error_message TEXT, created_at TEXT NOT NULL
        )`).run(); } catch {}

        const templateName = 'student_credentials_dispatch';
        async function sendOne(student) {
          const now = () => new Date().toISOString();
          const variablesJson = JSON.stringify({ name: student.name, code: student.code });
          if (!student.phone) {
            await DB.prepare(
              'INSERT INTO wa_template_logs (id, batch_id, student_id, student_name, phone, template_name, variables, status, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
            ).bind(crypto.randomUUID(), subsub2, student.id, student.name, '', templateName, variablesJson, 'failed', 'رقم جوال غير صالح', now()).run();
            return;
          }
          const components = sanitizeWaComponents([{
            type: 'body',
            parameters: [{ type: 'text', text: student.name || 'الطالب' }, { type: 'text', text: student.code }],
          }]);
          let lastError = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const res = await spRequest(env, 'POST', '/whatsapp/contacts/sendTemplateByPhone', {
                bot_id: env.SENDPULSE_BOT_ID,
                phone: normalizeSaudiPhone(student.phone),
                template: { name: templateName, language: { code: 'ar', policy: 'deterministic' }, components },
              });
              const r0 = res?.results?.[0] ?? res;
              const spError = r0?.error || r0?.data?.error || r0?.errors;
              if (r0?.success === false || spError) throw new Error(JSON.stringify(spError || r0));
              await DB.prepare(
                'INSERT INTO wa_template_logs (id, batch_id, student_id, student_name, phone, template_name, variables, status, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
              ).bind(crypto.randomUUID(), subsub2, student.id, student.name, student.phone, templateName, variablesJson, 'sent', '', now()).run();
              return;
            } catch (e) {
              lastError = e?.message || String(e);
              if (attempt < 3) await new Promise(r => setTimeout(r, 300));
            }
          }
          await DB.prepare(
            'INSERT INTO wa_template_logs (id, batch_id, student_id, student_name, phone, template_name, variables, status, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
          ).bind(crypto.randomUUID(), subsub2, student.id, student.name, student.phone, templateName, variablesJson, 'failed', lastError, now()).run();
        }

        const CHUNK = 10;
        for (let i = 0; i < targets.length; i += CHUNK) {
          const chunk = targets.slice(i, i + CHUNK);
          await Promise.all(chunk.map(sendOne));
          if (i + CHUNK < targets.length) await new Promise(r => setTimeout(r, 1000));
        }

        const { results: finalLogs } = await DB.prepare(
          'SELECT status, COUNT(*) as c FROM wa_template_logs WHERE batch_id = ? GROUP BY status'
        ).bind(subsub2).all();
        const sentCount = finalLogs.find(r => r.status === 'sent')?.c || 0;
        const failedCount = finalLogs.find(r => r.status === 'failed')?.c || 0;
        await logEvent(DB, {
          level: failedCount > 0 ? 'warn' : 'success',
          category: 'whatsapp',
          message: `إرسال بيانات دخول لدفعة استيراد — نجح ${sentCount} / فشل ${failedCount} من ${targets.length}`,
          user_name: _claimsSI?.name || '', user_role: roleSI, school: batch.school,
        });
        return ok({ total: targets.length, sent: Number(sentCount), failed: Number(failedCount) }, 200, CORS);
      }

      // GET /api/admin/students/dispatch-status/:batchId — lightweight
      // progress poll for the completion screen's WhatsApp progress bar,
      // read concurrently with the POST above while it's still running.
      if (subsub === 'dispatch-status' && subsub2 && method === 'GET') {
        const { results } = await DB.prepare(
          'SELECT status, COUNT(*) as c FROM wa_template_logs WHERE batch_id = ? GROUP BY status'
        ).bind(subsub2).all();
        const sent = Number(results.find(r => r.status === 'sent')?.c || 0);
        const failed = Number(results.find(r => r.status === 'failed')?.c || 0);
        // Surfacing the actual per-student error alongside the count — a
        // blanket "X فشل" with no reason is unactionable (wrong template
        // name, missing SendPulse bot id, malformed phone, etc. all look
        // identical from the progress bar alone).
        const { results: failedRows } = await DB.prepare(
          'SELECT student_name, phone, error_message FROM wa_template_logs WHERE batch_id = ? AND status = \'failed\' ORDER BY created_at DESC LIMIT 20'
        ).bind(subsub2).all();
        return ok({ sent, failed, errors: failedRows }, 200, CORS);
      }
    }

    // ── PLANS ────────────────────────────────────────────────────────────────
    if (resource === 'plans') {

      if (method === 'GET' && sub === 'history') {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return err('غير مصرح', 401, CORS);
        const studentId = url.searchParams.get('studentId');
        if (!studentId) return err('معرّف الطالب مطلوب', 400, CORS);
        // Students can only see their own plans
        if (claims.role === 'student' && claims.sub !== studentId) return err('غير مسموح', 403, CORS);
        let q = 'SELECT * FROM plans WHERE student_id = ?';
        const params = [studentId];
        // Admins AND school-scoped directors (claims.school not '*') are always
        // forced to their own JWT school — only dev or a '*' (company-wide)
        // director may use the URL param. A school-scoped director used to be
        // treated the same as dev/'*' here, letting them pass ?school= to read
        // another school's plan history — same fix as the sibling GETs below.
        const historySchool = (claims.role !== 'dev' && claims.school && claims.school !== '*')
          ? claims.school : (school || null);
        if (historySchool) { q += ' AND school = ?'; params.push(historySchool); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      // DELETE /api/plans/:id — admin/director: delete a single plan (scoped to their school)
      if (method === 'DELETE' && sub && sub !== 'history') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const target = await DB.prepare('SELECT student_name, school FROM plans WHERE id = ?').bind(sub).first();
        if (!target) return err('الخطة غير موجودة', 404, CORS);
        if (claims.role !== 'dev') {
          const effectiveSchool = claims.school && claims.school !== '*' ? claims.school : school;
          if (!effectiveSchool || target.school !== effectiveSchool) return err('غير مصرح', 401, CORS);
        }
        await DB.prepare('DELETE FROM plans WHERE id = ?').bind(sub).run();
        await logEvent(DB, { level: 'warn', category: 'test-management', message: `حذف اختبار قدرات للطالب: ${target.student_name}`, user_name: claims.name || '', user_role: claims.role, school: target.school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      if (method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        let q = 'SELECT * FROM plans';
        const params = [];
        // Admins AND school-scoped directors are always forced to their own
        // JWT school — only dev or a '*' director may use the URL param.
        const plansSchool = (claims.role !== 'dev' && claims.school && claims.school !== '*')
          ? claims.school : (school || null);
        if (plansSchool) { q += ' WHERE school = ?'; params.push(plansSchool); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      if (method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['student','admin','director'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const body = await request.json();
        // Mass assignment guard: only accept allowed fields
        const { gaps: clientGaps, answers, selfDiag, school: bodySchool, skipDiagnostic, section } = body;
        let { studentId, studentName } = body;
        // Students can only create plans for themselves — never trust body studentId
        if (claims.role === 'student') {
          studentId   = claims.sub;
          studentName = claims.name || '';
        }

        // Cooldown was, until now, enforced ONLY client-side (App.startCapabilities()
        // checking daysRemaining() before ever showing the section-choice/pretest
        // screens) — nothing stopped a request straight to this endpoint from
        // succeeding regardless. Concretely reachable in the product today via
        // screen-level-analysis's "🔁 إعادة الاختبار" button (App.retakeDiagnostic()),
        // which jumps straight to screen-section-choice with no cooldown check of
        // its own. Only gates a STUDENT's own submission — admin/director-initiated
        // plan creation is a deliberate administrative action, same as the existing
        // "OVERRIDE:" admin_note convention that already lifts this for one student.
        if (claims.role === 'student') {
          const latestPlanRow = await DB.prepare(
            'SELECT gaps, admin_note, created_at FROM plans WHERE student_id = ? ORDER BY created_at DESC LIMIT 1'
          ).bind(studentId).first();
          if (latestPlanRow && !isRetakeOverride(latestPlanRow.admin_note)) {
            let prevGaps = [];
            try { prevGaps = JSON.parse(latestPlanRow.gaps || '[]'); } catch {}
            const cooldownUntilIso = computeCooldownUntil(prevGaps, latestPlanRow.created_at);
            if (cooldownUntilIso && Date.now() < new Date(cooldownUntilIso).getTime()) {
              return err('لا يمكنك بدء محاولة جديدة قبل انتهاء فترة الانتظار المحددة في خطتك الحالية', 403, CORS);
            }
          }
        }

        const SKILL_META = {
          v1: { name: 'الاستيعاب القرائي',   category: 'verbal' },
          v2: { name: 'الخطأ السياقي',        category: 'verbal' },
          v3: { name: 'المفردة الشاذة',       category: 'verbal' },
          v4: { name: 'التناظر اللفظي',       category: 'verbal' },
          v5: { name: 'إكمال الجمل',          category: 'verbal' },
          q1: { name: 'الحساب',               category: 'quantitative' },
          q2: { name: 'الجبر',                category: 'quantitative' },
          q3: { name: 'الهندسة والقياس',      category: 'quantitative' },
          q4: { name: 'المقارنات الكمية',     category: 'quantitative' },
          q5: { name: 'الإحصاء والاحتمالات',  category: 'quantitative' },
        };
        const validSection = ['verbal', 'quantitative', 'both'].includes(section) ? section : 'both';

        let gaps;
        if (skipDiagnostic && claims.role === 'student') {
          // Student opted out of the diagnostic entirely — trust the client's all-weak
          // gaps as-is (every skill forced to level:'low') without touching `answers`.
          gaps = Array.isArray(clientGaps) ? clientGaps : [];
        } else if (answers && typeof answers === 'object' && Object.keys(answers).length && claims.role === 'student') {
          // Grade server-side: the GET /questions endpoint strips `ans` from students,
          // so client-side scoring always produces 0%. We compute gaps here where we
          // have the full question bank including correct answers.
          const { results: questions } = await DB.prepare(
            'SELECT qnum, skill_id, ans FROM questions ORDER BY qnum ASC'
          ).all();
          const scores = {};
          for (const q of questions) {
            if (!scores[q.skill_id]) scores[q.skill_id] = { correct: 0, total: 0 };
            scores[q.skill_id].total++;
            const selected = answers[q.qnum];
            if (selected !== undefined && selected !== null && selected !== 'dk' && Number(selected) === Number(q.ans)) {
              scores[q.skill_id].correct++;
            }
          }
          const sd = (selfDiag && typeof selfDiag === 'object') ? selfDiag : {};
          // Include all skills in the chosen section (or all skills for 'both') — even if
          // no questions were answered for that skill in the bank.
          gaps = Object.entries(SKILL_META)
            .filter(([, meta]) => validSection === 'both' || meta.category === validSection)
            .map(([skillId, meta]) => {
              const s     = scores[skillId] || { correct: 0, total: 0 };
              const pct   = s.total ? Math.round((s.correct / s.total) * 100) : 0;
              const self  = sd[skillId] || 'need';
              const level = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
              const overconfident = self === 'mastered' && level === 'low';
              const rec = overconfident
                ? 'مهارة تحتاج مراجعة عاجلة — أجبت أنك متقن لها لكن أداءك كان ضعيفاً.'
                : level === 'low'  ? 'مهارة ضعيفة — تحتاج تدريباً مكثفاً وأساسيات.'
                : level === 'mid'  ? 'مهارة متوسطة — تحتاج تعزيزاً وتدريباً إضافياً.'
                : 'مهارة جيدة — الاستمرار في التطوير مستحسن.';
              return { skillId, skillName: meta.name, category: meta.category, pct, level, selfAssess: self, recommendation: rec, overconfident };
            }).sort((a, b) => a.pct - b.pct);
        } else {
          gaps = Array.isArray(clientGaps) ? clientGaps : [];
        }

        // Plans are auto-approved on creation — there is no admin review step.
        const status    = 'active';
        const adminNote = claims.role === 'student' ? '' : (body.adminNote || '');
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        // A student is always forced to their OWN session school — the same
        // rule as studentId/studentName just above, never trusting body/query
        // for it. Admins and school-scoped directors are likewise forced to
        // their own school. Only a '*' (company-wide) director may specify
        // bodySchool/school, same carve-out as everywhere else in this file.
        // This used to only force role==='admin', letting a student OR a
        // school-scoped director attribute a brand-new plan (with real
        // diagnostic gaps/student_name) to an arbitrary other school.
        const planSchool = claims.role === 'student'
          ? (claims.school || '')
          : (claims.school && claims.school !== '*' ? claims.school : (bodySchool || school || ''));
        await DB.prepare(
          `INSERT INTO plans (id, student_id, student_name, status, gaps, admin_note, school, created_at, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(pid, studentId, studentName, status, JSON.stringify(gaps), adminNote, planSchool, now, now).run();
        await logEvent(DB, { level: 'info', category: 'plan', message: `إنشاء خطة دراسية للطالب: ${studentName}`, user_name: claims.name || studentName, user_role: claims.role, school: planSchool });
        return ok({ plan: { id: pid, student_id: studentId, student_name: studentName, status, gaps, admin_note: adminNote, school: planSchool, created_at: now } }, 201, CORS);
      }

      if (method === 'PATCH' && sub) {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const { adminNote } = await request.json();
        const now = new Date().toISOString();
        if (claims.role !== 'dev' && claims.school && claims.school !== '*') {
          // Verify the plan belongs to this admin's school
          const existing = await DB.prepare('SELECT school FROM plans WHERE id = ?').bind(sub).first();
          if (!existing) return err('الخطة غير موجودة', 404, CORS);
          if (existing.school !== claims.school) return err('غير مصرح', 403, CORS);
        }
        await DB.prepare(
          'UPDATE plans SET status = ?, admin_note = ?, approved_at = ? WHERE id = ?'
        ).bind('active', adminNote || '', now, sub).run();
        const p = await DB.prepare('SELECT * FROM plans WHERE id = ?').bind(sub).first();
        await logEvent(DB, { level: 'success', category: 'plan', message: `اعتماد خطة دراسية للطالب: ${p.student_name || ''}`, user_name: claims.name || '', user_role: claims.role, school: p.school || '' });
        return ok({ plan: { ...p, gaps: JSON.parse(p.gaps || '[]') } }, 200, CORS);
      }
    }

    // ── TEST RESULTS ─────────────────────────────────────────────────────────
    if (resource === 'test-results') {

      // Auto-create table on first use
      try {
        await DB.prepare(`CREATE TABLE IF NOT EXISTS test_results (
          id           TEXT PRIMARY KEY,
          student_id   TEXT NOT NULL,
          student_name TEXT NOT NULL,
          school       TEXT NOT NULL DEFAULT '',
          subject      TEXT NOT NULL DEFAULT 'biology-g1',
          test_type    TEXT NOT NULL,
          score        INTEGER NOT NULL,
          correct      INTEGER NOT NULL,
          total        INTEGER NOT NULL,
          answers      TEXT NOT NULL DEFAULT '[]',
          created_at   TEXT NOT NULL DEFAULT (now()::text)
        )`).run();
      } catch {}
      // Migrate: add answers column if table existed before this column was introduced
      try { await DB.prepare("ALTER TABLE test_results ADD COLUMN answers TEXT NOT NULL DEFAULT '[]'").run(); } catch {}

      // NOTE: there is no POST here anymore — client-submitted scores are never trusted.
      // The only path that writes to test_results is POST /api/bio/submit, which grades
      // server-side against bio_questions before inserting.

      // GET /api/test-results — student sees own, admin/director sees by school or studentId
      if (method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return err('غير مصرح', 401, CORS);

        if (claims.role === 'student') {
          const { results } = await DB.prepare(
            'SELECT * FROM test_results WHERE student_id = ? ORDER BY created_at DESC'
          ).bind(claims.sub).all();
          return ok({ results: results.map(r => {
            let ans = [];
            try { ans = JSON.parse(r.answers || '[]'); } catch(e) {}
            return { ...r, answers: ans };
          }) }, 200, CORS);
        }

        if (!['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const studentId = url.searchParams.get('studentId');
        // Admins AND school-scoped directors are always forced to their own
        // JWT school — only dev or a '*' director may use the URL param.
        const trSchool = (claims.role !== 'dev' && claims.school && claims.school !== '*')
          ? claims.school : (school || null);
        if (studentId) {
          let q = 'SELECT * FROM test_results WHERE student_id = ?';
          const params = [studentId];
          if (trSchool) { q += ' AND school = ?'; params.push(trSchool); }
          q += ' ORDER BY created_at DESC';
          const { results } = await DB.prepare(q).bind(...params).all();
          return ok({ results: results.map(r => {
            let ans = [];
            try { ans = JSON.parse(r.answers || '[]'); } catch(e) {}
            return { ...r, answers: ans };
          }) }, 200, CORS);
        }
        const withAnswers = url.searchParams.get('withAnswers') === '1';
        const cols = withAnswers
          ? 'id, student_id, student_name, school, subject, test_type, score, correct, total, answers, created_at'
          : 'id, student_id, student_name, school, subject, test_type, score, correct, total, created_at';
        let q = `SELECT ${cols} FROM test_results`;
        const params = [];
        if (trSchool) { q += ' WHERE school = ?'; params.push(trSchool); }
        q += ' ORDER BY created_at DESC LIMIT 1000';
        const { results } = await DB.prepare(q).bind(...params).all();
        const mapped = withAnswers ? results.map(r => {
          let ans = [];
          try { ans = JSON.parse(r.answers || '[]'); } catch {}
          return { ...r, answers: ans };
        }) : results;
        return ok({ results: mapped }, 200, CORS);
      }
    }

    // ── ADMIN DASHBOARD STATS — aggregated cards/charts data for the admin panel ─
    if (resource === 'stats') {
      if (method === 'GET' && !sub) {
        const _devAuth = authDev(request, env);
        const stClaims = _devAuth ? { role: 'dev', sub: 'dev', school: '*' } : await verifyToken(request, env, DB);
        if (!stClaims) return err('غير مصرح', 401, CORS);
        if (!['admin', 'director', 'dev'].includes(stClaims.role)) return err('غير مسموح', 403, CORS);
        // Admins/directors (not super-director '*') are always scoped to their own school
        const stSchool = (['admin', 'director'].includes(stClaims.role) && stClaims.school && stClaims.school !== '*')
          ? stClaims.school : (school || null);
        const sCond  = stSchool ? ' AND school = ?' : '';
        const sWhere = stSchool ? ' WHERE school = ?' : '';
        const sArgs  = stSchool ? [stSchool] : [];

        const pct = (curr, prev) => {
          if (!prev) return curr > 0 ? 100 : 0;
          return Math.round(((curr - prev) / prev) * 100);
        };

        const now = new Date();
        const iso = (d) => d.toISOString();
        const since7  = iso(new Date(now.getTime() - 7  * 86400000));
        const since14 = iso(new Date(now.getTime() - 14 * 86400000));

        const [
          studentsTotal, studentsLast7, studentsPrev7,
          ticketsOpen, ticketsLast7, ticketsPrev7,
          plansActive, plansLast7, plansPrev7,
          scoreLast7, scorePrev7, scoreOverall,
          finishedRow, startedRow,
          logRows, planRows,
        ] = await Promise.all([
          DB.prepare(`SELECT COUNT(*) as c FROM students${sWhere}`).bind(...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM students WHERE created_at >= ?${sCond}`).bind(since7, ...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM students WHERE created_at >= ? AND created_at < ?${sCond}`).bind(since14, since7, ...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status = 'open'${sCond}`).bind(...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE created_at >= ?${sCond}`).bind(since7, ...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE created_at >= ? AND created_at < ?${sCond}`).bind(since14, since7, ...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM plans WHERE status = 'active'${sCond}`).bind(...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM plans WHERE created_at >= ?${sCond}`).bind(since7, ...sArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM plans WHERE created_at >= ? AND created_at < ?${sCond}`).bind(since14, since7, ...sArgs).first(),
          DB.prepare(`SELECT AVG(score) as a FROM test_results WHERE created_at >= ?${sCond}`).bind(since7, ...sArgs).first(),
          DB.prepare(`SELECT AVG(score) as a FROM test_results WHERE created_at >= ? AND created_at < ?${sCond}`).bind(since14, since7, ...sArgs).first(),
          DB.prepare(`SELECT AVG(score) as a FROM test_results${sWhere}`).bind(...sArgs).first(),
          DB.prepare(`SELECT COUNT(DISTINCT student_id) as c FROM test_results WHERE total > 0${sCond}`).bind(...sArgs).first(),
          DB.prepare(`SELECT COUNT(DISTINCT p.student_id) as c FROM plans p WHERE NOT EXISTS (SELECT 1 FROM test_results t WHERE t.student_id = p.student_id AND t.total > 0)${stSchool ? ' AND p.school = ?' : ''}`).bind(...sArgs).first(),
          DB.prepare(`SELECT substr(created_at, 1, 10) as day, category, COUNT(*) as c FROM logs WHERE created_at >= ?${sCond} GROUP BY day, category`).bind(since14, ...sArgs).all(),
          DB.prepare(`SELECT gaps FROM plans${sWhere} ORDER BY created_at DESC LIMIT 2000`).bind(...sArgs).all(),
        ]);

        // Daily activity — last 14 calendar days, filled in order even for days with no rows
        const dayBuckets = new Map();
        for (let i = 13; i >= 0; i--) {
          const day = iso(new Date(now.getTime() - i * 86400000)).slice(0, 10);
          dayBuckets.set(day, { date: day, logins: 0, tests: 0, tickets: 0 });
        }
        for (const r of (logRows?.results || [])) {
          const bucket = dayBuckets.get(r.day);
          if (!bucket) continue;
          if (r.category === 'login') bucket.logins += r.c;
          else if (r.category === 'test') bucket.tests += r.c;
          else if (r.category === 'ticket') bucket.tickets += r.c;
        }

        // Skill averages — from aptitude-test (plans.gaps) breakdowns
        const skillTotals = new Map();
        for (const row of (planRows?.results || [])) {
          let gaps = [];
          try { gaps = JSON.parse(row.gaps || '[]'); } catch {}
          for (const g of gaps) {
            const key = g.skillName || g.skillId || '';
            if (!key || typeof g.pct !== 'number') continue;
            const acc = skillTotals.get(key) || { sum: 0, count: 0 };
            acc.sum += g.pct;
            acc.count += 1;
            skillTotals.set(key, acc);
          }
        }
        const skillAverages = [...skillTotals.entries()]
          .map(([skill, { sum, count }]) => ({ skill, avgPct: Math.round(sum / count) }))
          .sort((a, b) => b.avgPct - a.avgPct);

        const finished = finishedRow?.c || 0;
        const started = startedRow?.c || 0;
        const totalStudents = studentsTotal?.c || 0;
        const notStarted = Math.max(0, totalStudents - finished - started);

        return ok({
          cards: {
            students:    { value: totalStudents, deltaPct: pct(studentsLast7?.c || 0, studentsPrev7?.c || 0) },
            ticketsOpen: { value: ticketsOpen?.c || 0, deltaPct: pct(ticketsLast7?.c || 0, ticketsPrev7?.c || 0) },
            plansActive: { value: plansActive?.c || 0, deltaPct: pct(plansLast7?.c || 0, plansPrev7?.c || 0) },
            avgScore:    { value: Math.round(scoreLast7?.a ?? scoreOverall?.a ?? 0), deltaPct: pct(Math.round(scoreLast7?.a || 0), Math.round(scorePrev7?.a || 0)) },
          },
          dailyActivity: [...dayBuckets.values()],
          skillAverages,
          statusDistribution: { finished, started, notStarted },
        }, 200, CORS);
      }
    }

    // ── ADVANCED ANALYTICS (admin dashboard → "الإحصائيات" tab only) ───────────
    // Every endpoint here follows the same auth + school-scoping rule as
    // /api/stats above: admin/director/dev only, and a non-super admin/director
    // (school !== '*') is always locked to their own school's students.
    if (resource === 'analytics') {
      const _devAuth = authDev(request, env);
      const anClaims = _devAuth ? { role: 'dev', sub: 'dev', school: '*' } : await verifyToken(request, env, DB);
      if (!anClaims) return err('غير مصرح', 401, CORS);
      if (!['admin', 'director', 'dev'].includes(anClaims.role)) return err('غير مسموح', 403, CORS);
      const anSchool = (['admin', 'director'].includes(anClaims.role) && anClaims.school && anClaims.school !== '*')
        ? anClaims.school : (school || null);
      const sCond  = anSchool ? ' AND school = ?' : '';
      const sWhere = anSchool ? ' WHERE school = ?' : '';
      const sArgs  = anSchool ? [anSchool] : [];

      try { await DB.prepare(`ALTER TABLE logs ADD COLUMN student_id TEXT DEFAULT ''`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_student ON logs(student_id)`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_plans_student ON plans(student_id)`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gtr_student ON general_test_results(student_id)`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gt_test_qnum ON general_tests(test_num, qnum)`).run(); } catch {}

      // Shared building block: students in scope + their per-attempt diagnostic
      // scores (one row per plans attempt, avg pct across that attempt's
      // skills) + their most recent activity timestamp from any of three
      // sources (login, diagnostic attempt, general-test attempt) in ONE pass
      // each — no N+1, three queries total regardless of student count.
      async function _loadStudentActivityAndScores() {
        const [studentsRows, planRows, loginRows, gtrRows, severeRows] = await Promise.all([
          DB.prepare(`SELECT id, name, school, created_at FROM students${sWhere}`).bind(...sArgs).all(),
          DB.prepare(`SELECT student_id, gaps, admin_note, created_at FROM plans${sWhere} ORDER BY student_id, created_at ASC`).bind(...sArgs).all(),
          DB.prepare(`SELECT student_id, MAX(created_at) as last FROM logs WHERE category = 'login' AND student_id != ''${sCond} GROUP BY student_id`).bind(...sArgs).all(),
          DB.prepare(`SELECT student_id, MAX(created_at) as last FROM general_test_results${sWhere} GROUP BY student_id`).bind(...sArgs).all(),
          // "Stuck" skill-quiz failures — failed a skill despite 3+ attempts
          // at it. Feeds classifyFollowUp()'s severeFailureCount trigger.
          // Tolerate skill_progress not existing yet on a fresh deployment.
          DB.prepare(
            `SELECT sp.student_id as student_id, COUNT(*) as c FROM skill_progress sp
             JOIN students s ON s.id = sp.student_id
             WHERE sp.status = 'failed' AND sp.attempts >= 3${sCond}
             GROUP BY sp.student_id`
          ).bind(...sArgs).all().catch(() => ({ results: [] })),
        ]);

        // Per-attempt average score, in chronological order per student
        const scoresByStudent = new Map();
        // Rows arrive ordered ascending by created_at per student, so the
        // last write here per student_id is naturally their latest plan.
        const latestPlanByStudent = new Map();
        for (const row of (planRows?.results || [])) {
          let gaps = [];
          try { gaps = JSON.parse(row.gaps || '[]'); } catch {}
          const nums = gaps.map(g => g.pct).filter(n => typeof n === 'number');
          if (nums.length) {
            const avg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
            const list = scoresByStudent.get(row.student_id) || [];
            list.push({ pct: avg, created_at: row.created_at });
            scoresByStudent.set(row.student_id, list);
          }
          latestPlanByStudent.set(row.student_id, { gaps, created_at: row.created_at, admin_note: row.admin_note });
        }

        const lastLoginByStudent = new Map((loginRows?.results || []).map(r => [r.student_id, r.last]));
        const lastGtrByStudent   = new Map((gtrRows?.results   || []).map(r => [r.student_id, r.last]));
        const severeFailureByStudent = new Map((severeRows?.results || []).map(r => [r.student_id, Number(r.c)]));

        const students = (studentsRows?.results || []).map(s => {
          const attempts = scoresByStudent.get(s.id) || [];
          const lastPlanAt  = attempts.length ? attempts[attempts.length - 1].created_at : null;
          const candidates = [lastLoginByStudent.get(s.id), lastPlanAt, lastGtrByStudent.get(s.id)].filter(Boolean);
          const lastActive = candidates.length ? candidates.sort().at(-1) : null;
          const firstScore = attempts.length ? attempts[0].pct : null;
          const lastScore  = attempts.length ? attempts[attempts.length - 1].pct : null;
          const improvementPct = (firstScore !== null && lastScore !== null) ? (lastScore - firstScore) : null;
          const latestPlan = latestPlanByStudent.get(s.id) || null;
          const cooldownUntil = (latestPlan && !isRetakeOverride(latestPlan.admin_note))
            ? computeCooldownUntil(latestPlan.gaps, latestPlan.created_at)
            : null;
          const severeFailureCount = severeFailureByStudent.get(s.id) || 0;
          return { id: s.id, name: s.name, school: s.school, attempts: attempts.length, firstScore, lastScore, improvementPct, lastActive, cooldownUntil, severeFailureCount };
        });
        return students;
      }

      // daysSince() is imported from functions/_lib/journey.js (was a local closure here before).

      // GET /api/analytics/at-risk — "حالات تستدعي المتابعة": cooldown-aware.
      // A student still inside their mandatory post-diagnostic waiting period
      // (classifyFollowUp() status 'cooldown') is never flagged — resting on
      // purpose isn't absence. Once that window closes (or never applied),
      // exactly 3 triggers can flag someone (see classifyFollowUp in
      // functions/_lib/journey.js): idle 5+ days right after cooldown ends,
      // stuck/repeated skill-quiz failures, or a 14+ day unexplained absence
      // with no cooldown involved. A student with lastActive === null
      // (never touched the account) is reported separately under
      // `neverStarted`, never under `students`; one currently cooling down
      // is reported under `cooldown`, also never under `students`.
      if (sub === 'at-risk' && method === 'GET') {
        const students = await _loadStudentActivityAndScores();
        const now = Date.now();
        const classified = students.map(s => ({
          ...s,
          classification: classifyFollowUp({
            lastActive: s.lastActive, cooldownUntil: s.cooldownUntil, now, severeFailureCount: s.severeFailureCount,
          }),
        }));

        const neverStarted = classified.filter(s => s.classification.status === 'idle');
        const cooldown = classified.filter(s => s.classification.status === 'cooldown');
        const flagged = classified
          .filter(s => s.classification.status === 'follow_up')
          .map(s => {
            const reason = s.classification.reason;
            const days = s.classification.idleDays;
            // Simple severity score to rank "top priority" first — good
            // enough for sorting, not shown to admins.
            const severity = (days === null ? 0 : Math.min(days, 30)) + (reason === 'severe_failure' ? 20 : 0);
            return { ...s, reason, daysSinceActive: days, severity };
          })
          .sort((a, b) => b.severity - a.severity);

        const LIMIT = Math.min(Number(url.searchParams.get('limit')) || 15, 50);
        // Population that ever engaged (logged in, or has a diagnostic/quiz
        // attempt — includes those currently cooling down) — the correct
        // denominator for "at-risk rate" and any other performance rate,
        // since a never-started account isn't at risk of anything, it just
        // hasn't begun.
        const startedCount = classified.filter(s => s.classification.status !== 'idle').length;

        return ok({
          total: flagged.length,
          shown: Math.min(flagged.length, LIMIT),
          startedCount,
          idle_after_cooldown_count: flagged.filter(s => s.reason === 'idle_after_cooldown').length,
          severe_failure_count: flagged.filter(s => s.reason === 'severe_failure').length,
          long_absence_count: flagged.filter(s => s.reason === 'long_absence').length,
          students: flagged.slice(0, LIMIT).map(s => ({
            id: s.id, name: s.name, school: s.school,
            lastActive: s.lastActive, daysSinceActive: s.daysSinceActive,
            lastScore: s.lastScore, improvementPct: s.improvementPct,
            reasons: [s.reason],
          })),
          neverStarted: {
            count: neverStarted.length,
            students: neverStarted.map(s => ({ id: s.id, name: s.name, school: s.school })),
          },
          cooldown: {
            count: cooldown.length,
            students: cooldown.map(s => ({ id: s.id, name: s.name, school: s.school, cooldownUntil: s.cooldownUntil })),
          },
        }, 200, CORS);
      }

      // GET /api/analytics/progress
      if (sub === 'progress' && method === 'GET') {
        const students = await _loadStudentActivityAndScores();
        const withScores = students.filter(s => s.firstScore !== null);
        const classify = (s) => {
          if (s.attempts < 2) return 'stable';
          if (s.improvementPct > 5) return 'improving';
          if (s.improvementPct < -5) return 'declining';
          return 'stable';
        };
        const result = withScores.map(s => ({
          id: s.id, name: s.name, school: s.school,
          firstScore: s.firstScore, lastScore: s.lastScore,
          improvementPct: s.improvementPct, attempts: s.attempts,
          classification: classify(s),
        }));
        return ok({
          total: result.length,
          improving: result.filter(s => s.classification === 'improving').length,
          stable:    result.filter(s => s.classification === 'stable').length,
          declining: result.filter(s => s.classification === 'declining').length,
          students: result,
        }, 200, CORS);
      }

      // GET /api/analytics/skills — per-skill average across all diagnostic
      // attempts in scope, weakest first (ties broken by more attempts = more reliable average)
      if (sub === 'skills' && method === 'GET') {
        const { results: planRows } = await DB.prepare(`SELECT gaps FROM plans${sWhere} ORDER BY created_at DESC LIMIT 5000`).bind(...sArgs).all();
        const totals = new Map();
        for (const row of planRows || []) {
          let gaps = [];
          try { gaps = JSON.parse(row.gaps || '[]'); } catch {}
          for (const g of gaps) {
            const key = g.skillId || g.skillName || '';
            if (!key || typeof g.pct !== 'number') continue;
            const acc = totals.get(key) || { skillId: g.skillId || '', skillName: g.skillName || key, sum: 0, count: 0 };
            acc.sum += g.pct; acc.count += 1;
            totals.set(key, acc);
          }
        }
        const skills = [...totals.values()]
          .map(t => ({ skillId: t.skillId, skillName: t.skillName, avgPct: Math.round(t.sum / t.count), sampleSize: t.count }))
          .sort((a, b) => a.avgPct - b.avgPct);
        return ok({ skills, weakest: skills.slice(0, 5) }, 200, CORS);
      }

      // GET /api/analytics/diagnostic-overview — score-tier distribution
      // (excellent/good/needs_support/below, from each student's LATEST
      // diagnostic attempt), weakest skills annotated with how many students
      // are weak in each (not just the average), and a "most needing
      // support" leaderboard (lowest score + their own current weakest
      // skill) — powers the redesigned "تشخيصي" tab in TestCenterTab.
      if (sub === 'diagnostic-overview' && method === 'GET') {
        const students = await _loadStudentActivityAndScores();
        const tested = students.filter(s => s.lastScore !== null);
        const notStartedCount = students.length - tested.length;

        const tierOf = (pct) => (pct >= 90 ? 'excellent' : pct >= 70 ? 'good' : pct >= 50 ? 'needs_support' : 'below');
        const tierCounts = { excellent: 0, good: 0, needs_support: 0, below: 0 };
        for (const s of tested) tierCounts[tierOf(s.lastScore)]++;
        const tierRate = (n) => (tested.length ? Math.round((n / tested.length) * 100) : 0);

        // Latest attempt's raw per-skill gaps per student — needed both for
        // per-skill "how many students are weak here" counts and for each
        // struggling student's own current weakest skill.
        const { results: planRows } = await DB.prepare(
          `SELECT student_id, gaps, created_at FROM plans${sWhere} ORDER BY student_id, created_at ASC`
        ).bind(...sArgs).all();
        const latestGapsByStudent = new Map();
        for (const row of planRows || []) {
          let gaps = [];
          try { gaps = JSON.parse(row.gaps || '[]'); } catch {}
          latestGapsByStudent.set(row.student_id, gaps); // ascending order -> ends up latest
        }
        const skillAgg = new Map();
        for (const gaps of latestGapsByStudent.values()) {
          for (const g of gaps) {
            if (typeof g.pct !== 'number') continue;
            const key = g.skillId || g.skillName || '';
            if (!key) continue;
            const acc = skillAgg.get(key) || { skillId: g.skillId || '', skillName: g.skillName || key, sum: 0, count: 0, weakCount: 0 };
            acc.sum += g.pct; acc.count++;
            if (g.pct < 50) acc.weakCount++;
            skillAgg.set(key, acc);
          }
        }
        const weakestSkills = [...skillAgg.values()]
          .map(a => ({ skillId: a.skillId, skillName: a.skillName, avgPct: Math.round(a.sum / a.count), sampleSize: a.count, weakCount: a.weakCount }))
          .sort((a, b) => a.avgPct - b.avgPct)
          .slice(0, 8);

        const mostNeedingSupport = [...tested]
          .sort((a, b) => a.lastScore - b.lastScore)
          .slice(0, 10)
          .map(s => {
            const gaps = (latestGapsByStudent.get(s.id) || []).filter(g => typeof g.pct === 'number');
            const weakest = gaps.length ? [...gaps].sort((a, b) => a.pct - b.pct)[0] : null;
            return {
              id: s.id, name: s.name, school: s.school, lastScore: s.lastScore,
              weakestSkillName: weakest?.skillName || null, weakestSkillPct: weakest?.pct ?? null,
            };
          });

        return ok({
          testedCount: tested.length,
          notStartedCount,
          tiers: {
            excellent: { count: tierCounts.excellent, pct: tierRate(tierCounts.excellent) },
            good: { count: tierCounts.good, pct: tierRate(tierCounts.good) },
            needs_support: { count: tierCounts.needs_support, pct: tierRate(tierCounts.needs_support) },
            below: { count: tierCounts.below, pct: tierRate(tierCounts.below) },
            not_started: { count: notStartedCount },
          },
          weakestSkills,
          mostNeedingSupport,
        }, 200, CORS);
      }

      // GET /api/analytics/errors — from general-test answers: which skills and
      // which specific questions get missed most often, in scope.
      if (sub === 'errors' && method === 'GET') {
        const [{ results: gtrRows }, { results: gtRows }] = await Promise.all([
          DB.prepare(`SELECT test_num, answers FROM general_test_results${sWhere}`).bind(...sArgs).all(),
          DB.prepare(`SELECT test_num, qnum, skill_id, text FROM general_tests`).all(),
        ]);
        const qMeta = new Map(gtRows.map(q => [`${q.test_num}:${q.qnum}`, q]));
        const skillWrong = new Map();   // skillId -> { wrong, total }
        const questionWrong = new Map(); // "test_num:qnum" -> { wrong, total, text, skillId }

        for (const row of gtrRows || []) {
          let answers = [];
          try { answers = JSON.parse(row.answers || '[]'); } catch {}
          for (const a of answers) {
            const key = `${row.test_num}:${a.q}`;
            const meta = qMeta.get(key);
            const skillId = meta?.skill_id || '';
            const isWrong = a.a !== a.corr;

            const sAcc = skillWrong.get(skillId) || { skillId, wrong: 0, total: 0 };
            sAcc.total++; if (isWrong) sAcc.wrong++;
            skillWrong.set(skillId, sAcc);

            const qAcc = questionWrong.get(key) || { testNum: row.test_num, qnum: a.q, text: meta?.text || '', skillId, wrong: 0, total: 0 };
            qAcc.total++; if (isWrong) qAcc.wrong++;
            questionWrong.set(key, qAcc);
          }
        }
        const topSkills = [...skillWrong.values()]
          .map(s => ({ ...s, wrongPct: s.total ? Math.round((s.wrong / s.total) * 100) : 0 }))
          .sort((a, b) => b.wrongPct - a.wrongPct)
          .slice(0, 10);
        const topQuestions = [...questionWrong.values()]
          .map(q => ({ ...q, wrongPct: q.total ? Math.round((q.wrong / q.total) * 100) : 0 }))
          .sort((a, b) => b.wrongPct - a.wrongPct)
          .slice(0, 20);
        return ok({ topSkills, topQuestions }, 200, CORS);
      }

      // GET /api/analytics/activity — active (0-1d) / medium (2-3d) / inactive (4+d)
      if (sub === 'activity' && method === 'GET') {
        const students = await _loadStudentActivityAndScores();
        const buckets = { active: [], medium: [], inactive: [] };
        for (const s of students) {
          const d = daysSince(s.lastActive);
          if (d <= 1) buckets.active.push(s);
          else if (d <= 3) buckets.medium.push(s);
          else buckets.inactive.push(s);
        }
        return ok({
          active:   { count: buckets.active.length,   students: buckets.active.map(s => ({ id: s.id, name: s.name, lastActive: s.lastActive })) },
          medium:   { count: buckets.medium.length,   students: buckets.medium.map(s => ({ id: s.id, name: s.name, lastActive: s.lastActive })) },
          inactive: { count: buckets.inactive.length, students: buckets.inactive.map(s => ({ id: s.id, name: s.name, lastActive: s.lastActive })) },
        }, 200, CORS);
      }

      // GET /api/analytics/quiz-engagement — "most engaged with short quizzes"
      // (round-3 admin dashboard ask). Genuinely new: no existing endpoint
      // aggregates `skill_progress` across a whole school roster — the only
      // prior reader of that table (GET /api/quiz-structure) is scoped to one
      // student at a time, and looping it across 100+ students would be an
      // N+1 fan-out. This is ONE grouped, school-scoped query instead —
      // same shape/cost as the other analytics/* aggregates above.
      if (sub === 'quiz-engagement' && method === 'GET') {
        // quiz_skills/skill_progress are only ever created lazily inside the
        // quiz-structure/quiz-skills resource block (see below) — on a fresh
        // deployment where no student has opened a short quiz yet, those
        // tables don't exist and this query 500s. Idempotent, cheap after
        // the first call.
        await DB.prepare(`CREATE TABLE IF NOT EXISTS quiz_skills (
          id TEXT PRIMARY KEY, section TEXT NOT NULL, level TEXT NOT NULL,
          skill_id TEXT NOT NULL, skill_name TEXT NOT NULL, order_idx INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS skill_progress (
          id TEXT PRIMARY KEY, student_id TEXT NOT NULL, quiz_skill_id TEXT NOT NULL,
          section TEXT NOT NULL, level TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started',
          best_correct INTEGER NOT NULL DEFAULT 0, best_total INTEGER NOT NULL DEFAULT 5,
          attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT, created_at TEXT NOT NULL,
          UNIQUE(student_id, quiz_skill_id)
        )`).run();
        const engCond = anSchool ? ' AND s.school = ?' : '';
        const { results: rows } = await DB.prepare(
          `SELECT sp.student_id as id, s.name as name, s.school as school,
                  COUNT(*) as "skillsTouched",
                  SUM(sp.attempts) as "totalAttempts",
                  SUM(CASE WHEN sp.status = 'passed' THEN 1 ELSE 0 END) as "passedCount",
                  MAX(sp.last_attempt_at) as "lastAttemptAt"
           FROM skill_progress sp
           JOIN students s ON s.id = sp.student_id
           WHERE sp.attempts > 0${engCond}
           GROUP BY sp.student_id, s.name, s.school
           ORDER BY "totalAttempts" DESC
           LIMIT 10`
        ).bind(...sArgs).all();

        const totalSkillsRow = await DB.prepare('SELECT COUNT(*) as c FROM quiz_skills').first();
        const totalSkills = Number(totalSkillsRow?.c || 30);
        const totalStudentsRow = await DB.prepare(`SELECT COUNT(*) as c FROM students${sWhere}`).bind(...sArgs).first();
        const totalStudents = Number(totalStudentsRow?.c || 0);
        const participantsRow = await DB.prepare(
          `SELECT COUNT(DISTINCT sp.student_id) as c FROM skill_progress sp JOIN students s ON s.id = sp.student_id WHERE sp.attempts > 0${engCond}`
        ).bind(...sArgs).first();
        const participants = Number(participantsRow?.c || 0);

        return ok({
          totalStudents,
          participants,
          participationRate: totalStudents ? Math.round((participants / totalStudents) * 100) : 0,
          totalSkills,
          topEngaged: rows.map(r => ({
            id: r.id, name: r.name, school: r.school,
            skillsTouched: Number(r.skillsTouched), totalAttempts: Number(r.totalAttempts),
            passedCount: Number(r.passedCount), lastAttemptAt: r.lastAttemptAt,
            coveragePct: totalSkills ? Math.round((Number(r.skillsTouched) / totalSkills) * 100) : 0,
          })),
        }, 200, CORS);
      }

      // GET /api/analytics/quiz-hub-overview — full quiz-skills dashboard data
      // for the redesigned "قصيرة" (short quizzes) tab: per-level pass rate +
      // reach/completion counts, the full 30-skill school-wide mastery
      // matrix (verbal + quantitative), and a leaderboard by skills mastered
      // (not by attempts — quiz-engagement above already covers that ranking).
      if (sub === 'quiz-hub-overview' && method === 'GET') {
        await _ensureQuizSkillsSchema();
        const engCond = anSchool ? ' AND s.school = ?' : '';

        const totalStudentsRow = await DB.prepare(`SELECT COUNT(*) as c FROM students${sWhere}`).bind(...sArgs).first();
        const totalStudents = Number(totalStudentsRow?.c || 0);

        const { results: allSkills } = await DB.prepare(
          'SELECT id, section, level, skill_id, skill_name, order_idx FROM quiz_skills ORDER BY section, level, order_idx'
        ).all();

        const { results: skillPassRows } = await DB.prepare(
          `SELECT sp.quiz_skill_id as id, COUNT(*) as passed
           FROM skill_progress sp JOIN students s ON s.id = sp.student_id
           WHERE sp.status = 'passed'${engCond}
           GROUP BY sp.quiz_skill_id`
        ).bind(...sArgs).all();
        const passedBySkill = new Map(skillPassRows.map(r => [r.id, Number(r.passed)]));

        const skillMatrix = allSkills.map(sk => {
          const masteredCount = passedBySkill.get(sk.id) || 0;
          return {
            id: sk.id, section: sk.section, level: sk.level, skillId: sk.skill_id, skillName: sk.skill_name,
            masteredCount, masteryPct: totalStudents ? Math.round((masteredCount / totalStudents) * 100) : 0,
          };
        });

        const LEVELS = ['easy', 'medium', 'advanced'];

        // Students who've touched (attempts > 0) at least one skill in a level.
        const { results: reachRows } = await DB.prepare(
          `SELECT sp.level as level, COUNT(DISTINCT sp.student_id) as c
           FROM skill_progress sp JOIN students s ON s.id = sp.student_id
           WHERE sp.attempts > 0${engCond}
           GROUP BY sp.level`
        ).bind(...sArgs).all();
        const reachByLevel = new Map(reachRows.map(r => [r.level, Number(r.c)]));

        // Students who've PASSED every skill in a level (both sections combined).
        const { results: passedCountRows } = await DB.prepare(
          `SELECT sp.student_id as student_id, sp.level as level, COUNT(*) as c
           FROM skill_progress sp JOIN students s ON s.id = sp.student_id
           WHERE sp.status = 'passed'${engCond}
           GROUP BY sp.student_id, sp.level`
        ).bind(...sArgs).all();
        const levelTotalSkills = Object.fromEntries(LEVELS.map(l => [l, skillMatrix.filter(s => s.level === l).length]));
        const completedCountByLevel = { easy: 0, medium: 0, advanced: 0 };
        for (const row of passedCountRows || []) {
          if (Number(row.c) >= (levelTotalSkills[row.level] || 10)) completedCountByLevel[row.level]++;
        }

        const levelStats = LEVELS.map(level => {
          const levelSkills = skillMatrix.filter(s => s.level === level);
          const passRate = levelSkills.length ? Math.round(levelSkills.reduce((a, s) => a + s.masteryPct, 0) / levelSkills.length) : 0;
          const reachedCount = reachByLevel.get(level) || 0;
          return { level, passRate, reachedCount, completedCount: completedCountByLevel[level] || 0, opened: reachedCount > 0 };
        });

        const { results: leaderRows } = await DB.prepare(
          `SELECT sp.student_id as id, s.name as name,
                  SUM(CASE WHEN sp.status = 'passed' THEN 1 ELSE 0 END) as mastered
           FROM skill_progress sp JOIN students s ON s.id = sp.student_id
           WHERE 1=1${engCond}
           GROUP BY sp.student_id, s.name
           HAVING SUM(CASE WHEN sp.status = 'passed' THEN 1 ELSE 0 END) > 0
           ORDER BY mastered DESC
           LIMIT 10`
        ).bind(...sArgs).all();

        return ok({
          totalStudents,
          totalSkills: skillMatrix.length,
          levelStats,
          skillMatrix,
          leaderboard: (leaderRows || []).map(r => ({ id: r.id, name: r.name, mastered: Number(r.mastered) })),
        }, 200, CORS);
      }

      // GET /api/analytics/health — health_score = 30% activity + 40% performance + 30% improvement
      // (formula lives in functions/_lib/journey.js — shared with GET /api/journey
      // so a student's own "مؤشر الجاهزية" and the admin view never disagree).
      // Never-active accounts (lastActive === null — no login, no diagnostic,
      // no quiz attempt) are excluded entirely: they'd otherwise drag the
      // school-wide average down toward the neutral 15/100 floor purely for
      // not having engaged yet, which isn't a performance signal — those
      // students belong in the separate "لم يبدأوا أبدًا" list instead.
      if (sub === 'health' && method === 'GET') {
        const students = (await _loadStudentActivityAndScores()).filter(s => s.lastActive !== null);
        const result = students.map(s => {
          const { healthScore, activityScore, performanceScore, improvementScore } = computeHealthScore(s);
          return { id: s.id, name: s.name, school: s.school, healthScore, activityScore, performanceScore, improvementScore };
        }).sort((a, b) => a.healthScore - b.healthScore);
        return ok({ students: result }, 200, CORS);
      }

      // GET /api/analytics/journey-overview — admin "توزيع الطلاب حسب التقدم" +
      // per-level completion + top-progressing leaderboard, all derived from the
      // exact same skill_progress/quiz_skills/plans/general_test_results data
      // (and the same overallProgressPct math) as a student's own GET /api/journey —
      // one grouped query per data source, JS aggregation, no N+1 across the roster.
      if (sub === 'journey-overview' && method === 'GET') {
        await _ensureQuizSkillsSchema();
        const [studentsRows, spRows, levelTotalsRows, planRows, gtrRows] = await Promise.all([
          DB.prepare(`SELECT id, name, school FROM students${sWhere}`).bind(...sArgs).all(),
          DB.prepare(
            `SELECT sp.student_id as student_id, qs.section as section, qs.level as level, sp.status as status
             FROM skill_progress sp
             JOIN quiz_skills qs ON qs.id = sp.quiz_skill_id
             JOIN students s ON s.id = sp.student_id
             ${anSchool ? 'WHERE s.school = ?' : ''}`
          ).bind(...sArgs).all(),
          DB.prepare('SELECT section, level, COUNT(*) as c FROM quiz_skills GROUP BY section, level').all(),
          DB.prepare(`SELECT DISTINCT student_id FROM plans${sWhere}`).bind(...sArgs).all(),
          DB.prepare(
            `SELECT student_id, MAX(score) as best_score, COUNT(*) as attempts FROM general_test_results
             WHERE test_num = 1 AND is_trial = 0${sCond} GROUP BY student_id`
          ).bind(...sArgs).all(),
        ]);

        const totalNodesRow = await DB.prepare('SELECT COUNT(*) as c FROM quiz_skills').first();
        const totalNodes = Number(totalNodesRow?.c || 0);

        const levelTotals = {};
        for (const r of (levelTotalsRows?.results || [])) levelTotals[`${r.section}|${r.level}`] = Number(r.c);

        const diagnosticSet = new Set((planRows?.results || []).map(r => r.student_id));
        const anyAttemptSet = new Set();
        const passedByStudent = new Map();
        const levelPassedByStudent = new Map(); // student_id -> Map(levelKey -> passedCount)
        for (const row of (spRows?.results || [])) {
          anyAttemptSet.add(row.student_id);
          if (row.status !== 'passed') continue;
          passedByStudent.set(row.student_id, (passedByStudent.get(row.student_id) || 0) + 1);
          const key = `${row.section}|${row.level}`;
          const m = levelPassedByStudent.get(row.student_id) || new Map();
          m.set(key, (m.get(key) || 0) + 1);
          levelPassedByStudent.set(row.student_id, m);
        }
        const gtrByStudent = new Map((gtrRows?.results || []).map(r => [r.student_id, { attempts: Number(r.attempts), bestScore: Number(r.best_score) }]));

        const levelCompletionCounts = {};
        for (const key of Object.keys(levelTotals)) levelCompletionCounts[key] = 0;
        for (const m of levelPassedByStudent.values()) {
          for (const [key, passedCount] of m) {
            if (passedCount >= (levelTotals[key] || Infinity)) levelCompletionCounts[key] = (levelCompletionCounts[key] || 0) + 1;
          }
        }

        const students = (studentsRows?.results || []).map(s => {
          const passedNodes = passedByStudent.get(s.id) || 0;
          const overallProgressPct = totalNodes ? Math.round((passedNodes / totalNodes) * 100) : 0;
          const started = diagnosticSet.has(s.id) || anyAttemptSet.has(s.id);
          const bucket = classifyProgress({ overallProgressPct, started });
          return { id: s.id, name: s.name, school: s.school, passedNodes, overallProgressPct, started, bucket };
        });

        return ok({
          totalStudents: students.length,
          totalNodes,
          diagnosticCompleted: diagnosticSet.size,
          finalMockAttempted: gtrByStudent.size,
          buckets: PROGRESS_BUCKET_ORDER.map(code => ({
            code, label: PROGRESS_BUCKET_LABELS_AR[code],
            count: students.filter(s => s.bucket === code).length,
          })),
          levelCompletion: Object.entries(levelTotals).map(([key, total]) => {
            const [sectionKey, levelKey] = key.split('|');
            const completed = levelCompletionCounts[key] || 0;
            return {
              section: sectionKey, level: levelKey, totalSkills: total,
              studentsCompleted: completed,
              completionRate: students.length ? Math.round((completed / students.length) * 100) : 0,
            };
          }),
          topProgressing: [...students]
            .filter(s => s.passedNodes > 0)
            .sort((a, b) => b.passedNodes - a.passedNodes || b.overallProgressPct - a.overallProgressPct)
            .slice(0, 10)
            .map(s => ({ id: s.id, name: s.name, school: s.school, passedNodes: s.passedNodes, totalNodes, overallProgressPct: s.overallProgressPct })),
        }, 200, CORS);
      }

      // GET /api/analytics/student-logs?studentId=X — per-student activity
      // timeline for the admin Student Profile page (replaces the old
      // "no API exists for this" placeholder note). Reuses the exact same
      // school-scoped authorization as GET /api/journey and GET
      // /api/quiz-structure — an admin/director can only reach a student in
      // their own school; dev/director with school='*' can reach any.
      if (sub === 'student-logs' && method === 'GET') {
        const targetStudentId = await _resolveTargetStudentId(anClaims);
        if (targetStudentId === 'FORBIDDEN') return err('غير مسموح', 403, CORS);
        if (!targetStudentId) return err('معرّف الطالب مطلوب', 400, CORS);
        let logs = [];
        try {
          const { results } = await DB.prepare(
            'SELECT id, level, category, message, created_at FROM logs WHERE student_id = ? ORDER BY created_at DESC LIMIT 100'
          ).bind(targetStudentId).all();
          logs = results;
        } catch { logs = []; } // `logs` table may not exist yet on a fresh deployment
        return ok({ logs }, 200, CORS);
      }

      return err('غير موجود', 404, CORS);
    }

    // ── STUDENT PROGRESS (lesson/summary/quiz completion tracking) ─────────────
    if (resource === 'progress') {
      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS student_progress (
        id           TEXT PRIMARY KEY,
        student_id   TEXT NOT NULL,
        lesson_id    TEXT NOT NULL,
        type         TEXT NOT NULL DEFAULT 'video',
        completed    INTEGER NOT NULL DEFAULT 1,
        completed_at TEXT NOT NULL
      )`).run(); } catch {}
      try { await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique ON student_progress(student_id, lesson_id, type)`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_progress_student ON student_progress(student_id)`).run(); } catch {}

      // POST /api/progress/complete { studentId, lessonId, type }
      if (!sub && method === 'POST') {
        const prClaims = await verifyToken(request, env, DB);
        if (!prClaims) return err('غير مصرح', 401, CORS);
        const { studentId, lessonId, type } = await request.json();
        const sid = prClaims.role === 'student' ? prClaims.sub : studentId;
        if (!sid || !lessonId) return err('حقول مفقودة', 400, CORS);
        const t = ['video', 'summary', 'quiz'].includes(type) ? type : 'video';
        await DB.prepare(
          `INSERT INTO student_progress (id, student_id, lesson_id, type, completed, completed_at)
           VALUES (?, ?, ?, ?, 1, ?)
           ON CONFLICT (student_id, lesson_id, type) DO UPDATE SET completed = 1, completed_at = EXCLUDED.completed_at`
        ).bind(crypto.randomUUID(), sid, lessonId, t, new Date().toISOString()).run();
        return ok({ ok: true }, 201, CORS);
      }

      // GET /api/progress/:studentId
      if (sub && method === 'GET') {
        const prClaims = await verifyToken(request, env, DB);
        if (!prClaims) return err('غير مصرح', 401, CORS);
        if (prClaims.role === 'student' && prClaims.sub !== sub) return err('غير مسموح', 403, CORS);
        const { results } = await DB.prepare(
          `SELECT lesson_id, type, completed_at FROM student_progress WHERE student_id = ? ORDER BY completed_at DESC`
        ).bind(sub).all();
        return ok({
          total: results.length,
          byType: { video: results.filter(r => r.type === 'video').length, summary: results.filter(r => r.type === 'summary').length, quiz: results.filter(r => r.type === 'quiz').length },
          items: results,
        }, 200, CORS);
      }

      return err('غير موجود', 404, CORS);
    }

    // ── BIOLOGY G1 — scoring / behavior analytics / anti-cheating ──────────────
    // Strict layer separation:
    //   1) CORE SCORING   — final_score = correct/total*100, nothing else feeds it
    //   2) BEHAVIOR        — timing/switching analytics, stored separately, never read by scoring
    //   3) ANTI-CHEATING   — pattern detection over behavior data only, flags for dev review
    if (resource === 'bio') {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS bio_questions (
        id        TEXT PRIMARY KEY,
        test_type TEXT NOT NULL,
        qnum      INTEGER NOT NULL,
        sec       INTEGER,
        skill     TEXT,
        text      TEXT NOT NULL,
        opt1      TEXT NOT NULL, opt2 TEXT NOT NULL, opt3 TEXT NOT NULL, opt4 TEXT NOT NULL,
        ans       INTEGER NOT NULL,
        exp       TEXT NOT NULL DEFAULT ''
      )`).run(); } catch {}
      // Per-question breakdown, queryable (e.g. "how many students missed question N") —
      // kept separate from the JSON answers blob on test_results for that reason.
      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS test_answers (
        id             TEXT PRIMARY KEY,
        result_id      TEXT NOT NULL REFERENCES test_results(id),
        qnum           INTEGER NOT NULL,
        student_answer TEXT,
        correct_answer INTEGER NOT NULL,
        is_correct     INTEGER NOT NULL,
        created_at     TEXT NOT NULL
      )`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_test_answers_result ON test_answers(result_id)`).run(); } catch {}
      try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_test_answers_qnum ON test_answers(qnum)`).run(); } catch {}
      // Behavior analytics (speed/guessing/switching tracking) was removed entirely per product
      // decision — only the official score (test_results) and direct cheat-flagging are kept.
      // behavior_logs / attempt_logs are dropped once via POST /api/dev/migrate, not recreated here.

      // Seed the question bank once (idempotent — skipped once rows exist)
      const seedCheck = await DB.prepare('SELECT COUNT(*) as c FROM bio_questions').first();
      if (!seedCheck || seedCheck.c === 0) {
        const stmt = DB.prepare(
          `INSERT INTO bio_questions (id, test_type, qnum, sec, skill, text, opt1, opt2, opt3, opt4, ans, exp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const q of BIO_QUESTIONS) {
          await stmt.bind(crypto.randomUUID(), q.testType, q.qnum, q.sec, q.skill, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, q.exp).run();
        }
      }

      // GET /api/bio/questions?type=pre|post — sanitized for taking the live quiz (no answer key)
      if (sub === 'questions' && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return err('غير مصرح', 401, CORS);
        const testType = url.searchParams.get('type');
        if (testType !== 'pre' && testType !== 'post') return err('نوع الاختبار غير صالح', 400, CORS);
        const { results } = await DB.prepare(
          'SELECT qnum, sec, skill, text, opt1, opt2, opt3, opt4 FROM bio_questions WHERE test_type = ? ORDER BY qnum ASC'
        ).bind(testType).all();
        return ok({ questions: results.map(r => ({
          qnum: r.qnum, sec: r.sec, skill: r.skill, text: r.text, opts: [r.opt1, r.opt2, r.opt3, r.opt4],
        })) }, 200, CORS);
      }

      // POST /api/bio/submit — server grades + records behavior analytics (3 layers, fully separated)
      if (sub === 'submit' && method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        const { testType, answers } = await request.json();
        if (testType !== 'pre' && testType !== 'post') return err('نوع الاختبار غير صالح', 400, CORS);
        if (!Array.isArray(answers) || answers.length === 0) return err('إجابات مطلوبة', 400, CORS);

        const { results: bank } = await DB.prepare(
          'SELECT qnum, sec, skill, text, opt1, opt2, opt3, opt4, ans, exp FROM bio_questions WHERE test_type = ? ORDER BY qnum ASC'
        ).bind(testType).all();
        if (!bank.length) return err('بنك الأسئلة غير موجود', 500, CORS);
        const qmap = Object.fromEntries(bank.map(q => [q.qnum, q]));

        // ── CORE SCORING — correct/total only, nothing else may influence this ──
        const total = bank.length;
        let correct = 0;
        const breakdown = [];
        const storedAnswers = [];
        const times = [];
        let switchingCount = 0;

        for (const q of bank) {
          const a = answers.find(x => Number(x.qnum) === q.qnum) || {};
          const selected = a.selected === 'dk' ? 'dk' : (Number.isInteger(Number(a.selected)) && a.selected !== null && a.selected !== undefined ? Number(a.selected) : null);
          const isCorrect = selected === q.ans;
          if (isCorrect) correct++;
          const timeSpent = Math.max(0, Number(a.timeSpent) || 0);
          const switches = Math.max(0, Number(a.switches) || 0);
          times.push(timeSpent);
          switchingCount += switches;
          breakdown.push({ qnum: q.qnum, sec: q.sec, skill: q.skill, text: q.text, opts: [q.opt1, q.opt2, q.opt3, q.opt4], ans: q.ans, exp: q.exp, selected, correct: isCorrect });
          storedAnswers.push({ q: q.qnum, a: selected, corr: q.ans });
        }
        const finalScore = Math.round((correct / total) * 100);

        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        // `answers` JSON kept temporarily for backward compatibility with older readers;
        // test_answers is the queryable source going forward. Written atomically via batch().
        const writeStmts = [
          DB.prepare(
            `INSERT INTO test_results (id, student_id, student_name, school, subject, test_type, score, correct, total, answers, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(rid, claims.sub, claims.name, claims.school || '', 'biology-g1', testType, finalScore, correct, total, JSON.stringify(storedAnswers), now),
          ...storedAnswers.map(a =>
            DB.prepare(
              `INSERT INTO test_answers (id, result_id, qnum, student_answer, correct_answer, is_correct, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), rid, a.q, String(a.a), a.corr, a.a === a.corr ? 1 : 0, now)
          ),
        ];
        await DB.batch(writeStmts);

        // ── ANTI-CHEATING — checked in-memory only, never stored, never affects the score above ──
        const avgTime     = times.reduce((s, t) => s + t, 0) / times.length;
        const fastestTime = Math.min(...times);
        const slowestTime = Math.max(...times);
        const fastRatio   = times.filter(t => t > 0 && t < 3000).length / total;

        const suspiciousReasons = [];
        if (avgTime > 0 && avgTime < 2000) suspiciousReasons.push('سرعة استجابة غير منطقية على كل الأسئلة');
        if (switchingCount > total * 2) suspiciousReasons.push('تغيير مفرط للإجابات');
        if (fastRatio > 0.8) suspiciousReasons.push('نمط تخمين سريع متكرر');
        if (slowestTime - fastestTime < 200 && total > 3) suspiciousReasons.push('توقيتات متطابقة بشكل غير طبيعي بين الأسئلة');
        const suspiciousFlag = suspiciousReasons.length > 0;

        if (suspiciousFlag) {
          await logEvent(DB, { level: 'warn', category: 'suspicious', message: `سلوك مشبوه في اختبار الأحياء (${testType}): ${suspiciousReasons.join('، ')}`, user_name: claims.name || '', user_role: 'student', school: claims.school || '', ip });
        }
        await logEvent(DB, { level: 'info', category: 'test', message: `إنهاء اختبار الأحياء (${testType === 'pre' ? 'قبلي' : 'بعدي'}) — النتيجة ${finalScore}% (${correct}/${total})`, user_name: claims.name || '', user_role: 'student', school: claims.school || '', ip });

        // FOR STUDENT: final_score only + the breakdown needed to review answers — no behavior data
        return ok({ id: rid, created_at: now, score: finalScore, correct, total, breakdown }, 201, CORS);
      }
    }

    // ── QUESTIONS ────────────────────────────────────────────────────────────
    if (resource === 'questions') {

      if (method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        const isPrivileged = (claims && (claims.role === 'admin' || claims.role === 'director' || claims.role === 'dev')) || authDev(request, env);
        const { results } = await DB.prepare('SELECT * FROM questions ORDER BY qnum ASC').all();
        return ok({ questions: results.map(r => {
          if (isPrivileged) return r;
          const { ans, ...safe } = r; // strip answer for students
          return safe;
        }) }, 200, CORS);
      }

      if (method === 'POST') {
        const qClaims = await verifyToken(request, env, DB);
        const qCanEdit = qClaims && (qClaims.role === 'director' || qClaims.role === 'dev' ||
          (qClaims.role === 'admin' && Array.isArray(qClaims.permissions) && qClaims.permissions.includes('edit_questions')));
        if (!qCanEdit) return err('غير مصرح', 401, CORS);
        const { action = 'append', questions: rows } = await request.json();
        if (action === 'replace') await DB.prepare('DELETE FROM questions').run();
        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        const fresh = rows.filter(r => !existingNums.has(r.qnum));
        const stmt = DB.prepare(
          `INSERT INTO questions (id, qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const q of fresh) {
          await stmt.bind(crypto.randomUUID(), q.qnum, q.type, q.skillId, q.text,
            q.opts[0], q.opts[1], q.opts[2], q.opts[3], q.ans, new Date().toISOString()).run();
        }
        await logEvent(DB, { level: 'info', category: 'questions', message: `استيراد أسئلة (${action === 'replace' ? 'استبدال' : 'إضافة'}) — ${fresh.length} مضافة`, user_name: qClaims.name || '', user_role: qClaims.role, school: qClaims.school || '' });
        return ok({ added: fresh.length, skipped: rows.length - fresh.length }, 200, CORS);
      }

      // PATCH /api/questions/:id — edit a single question (director/dev, or admin with edit_questions permission)
      if (sub && method === 'PATCH') {
        const claims = await verifyToken(request, env, DB);
        const canEdit = claims && (claims.role === 'director' || claims.role === 'dev' ||
          (claims.role === 'admin' && Array.isArray(claims.permissions) && claims.permissions.includes('edit_questions')));
        if (!canEdit) return err('غير مصرح', 401, CORS);
        const { qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans } = await request.json();
        await DB.prepare(
          'UPDATE questions SET qnum=?,type=?,skill_id=?,text=?,opt1=?,opt2=?,opt3=?,opt4=?,ans=? WHERE id=?'
        ).bind(qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, sub).run();
        await logEvent(DB, { level: 'info', category: 'questions', message: `تعديل سؤال رقم ${qnum}`, user_name: claims.name || '', user_role: claims.role, school: claims.school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/questions/:id — delete a single question (director/dev, or admin with edit_questions permission)
      if (sub && method === 'DELETE') {
        const claims = await verifyToken(request, env, DB);
        const canEdit = claims && (claims.role === 'director' || claims.role === 'dev' ||
          (claims.role === 'admin' && Array.isArray(claims.permissions) && claims.permissions.includes('edit_questions')));
        if (!canEdit) return err('غير مصرح', 401, CORS);
        await DB.prepare('DELETE FROM questions WHERE id = ?').bind(sub).run();
        await logEvent(DB, { level: 'warn', category: 'questions', message: `حذف سؤال`, user_name: claims.name || '', user_role: claims.role, school: claims.school || '' });
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── QUIZ GRADING (server-side, requires student JWT) ─────────────────────
    if (resource === 'quiz' && sub === 'grade' && method === 'POST') {
      const claims = await verifyToken(request, env, DB);
      if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
      const { answers } = await request.json(); // [{qnum, ans}, ...]
      if (!Array.isArray(answers) || answers.length === 0) return err('إجابات مطلوبة', 400, CORS);
      const qnums = answers.map(a => Number(a.qnum)).filter(n => !isNaN(n));
      if (qnums.length === 0) return err('أرقام أسئلة غير صالحة', 400, CORS);
      const placeholders = qnums.map(() => '?').join(',');
      const { results } = await DB.prepare(
        `SELECT qnum, skill_id, ans FROM questions WHERE qnum IN (${placeholders})`
      ).bind(...qnums).all();
      const qmap = Object.fromEntries(results.map(r => [r.qnum, r]));
      const graded = answers.map(a => {
        const q = qmap[Number(a.qnum)];
        return { qnum: Number(a.qnum), skill_id: q?.skill_id || null, correct: q ? Number(a.ans) === Number(q.ans) : false };
      });
      return ok({ results: graded }, 200, CORS);
    }

    // ── QUIZ SKILLS (hierarchical short-tests: section → level → skill) ───────
    // Runs alongside the older flat `general-tests` system without replacing it.
    if (resource === 'quiz-structure' || resource === 'quiz-skills') {
      await _ensureQuizSkillsSchema();

      // GET /api/quiz-structure — full tree + a student's progress + level lock flags.
      // Normally the caller's own progress (role==='student'); admin/director/dev may
      // instead pass ?studentId= to view a specific student's tree — used by the admin
      // dashboard's per-student quiz-skills view, school-scoped like every other
      // admin-facing student lookup in this file.
      if (resource === 'quiz-structure' && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return err('غير مصرح', 401, CORS);
        const targetStudentId = await _resolveTargetStudentId(claims);
        if (targetStudentId === 'FORBIDDEN') return err('غير مسموح', 403, CORS);
        if (!targetStudentId) return err(claims.role === 'student' ? 'غير مصرح' : 'معرّف الطالب مطلوب', claims.role === 'student' ? 401 : 400, CORS);
        const tree = await _fetchQuizTree(targetStudentId);
        return ok({ tree }, 200, CORS);
      }

      // GET /api/quiz-skills/:quizSkillId/questions — sanitized (no `ans`); 403 if level locked
      if (resource === 'quiz-skills' && sub && subsub === 'questions' && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        const skillRow = await DB.prepare('SELECT * FROM quiz_skills WHERE id = ?').bind(sub).first();
        if (!skillRow) return err('المهارة غير موجودة', 404, CORS);
        if (skillRow.level !== 'easy') {
          const prevLevel = skillRow.level === 'advanced' ? 'medium' : 'easy';
          const { results: prevSkills } = await DB.prepare(
            'SELECT id FROM quiz_skills WHERE section = ? AND level = ?'
          ).bind(skillRow.section, prevLevel).all();
          const { results: prevProgress } = await DB.prepare(
            `SELECT quiz_skill_id, status FROM skill_progress WHERE student_id = ? AND quiz_skill_id IN (${prevSkills.map(() => '?').join(',') || "''"})`
          ).bind(claims.sub, ...prevSkills.map(s => s.id)).all();
          const passedSet = new Set(prevProgress.filter(p => p.status === 'passed').map(p => p.quiz_skill_id));
          const unlocked = prevSkills.length > 0 && prevSkills.every(s => passedSet.has(s.id));
          if (!unlocked) return err('هذا المستوى مقفل حتى تكمل المستوى السابق', 403, CORS);
        }
        const { results: questions } = await DB.prepare(
          'SELECT id, qnum, text, opt1, opt2, opt3, opt4 FROM quiz_skill_questions WHERE quiz_skill_id = ? ORDER BY qnum ASC'
        ).bind(sub).all();
        return ok({ skill: { id: skillRow.id, section: skillRow.section, level: skillRow.level, skillName: skillRow.skill_name }, questions }, 200, CORS);
      }

      // POST /api/quiz-skills/:quizSkillId/import — admin/dev upload
      // {action:'replace'|'append', questions:[{text,opt1..4,ans,relation?,explanation?,golden_rule?,smart_hint?}]}
      // The 4 educational-feedback fields are optional — omitting them keeps
      // a skill's questions working exactly as before (no review content).
      if (resource === 'quiz-skills' && sub && subsub === 'import' && method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        const isDev = claims?.role === 'dev' || authDev(request, env);
        if (!isDev && (!claims || !['admin', 'director'].includes(claims.role))) return err('غير مصرح', 401, CORS);
        const skillRow = await DB.prepare('SELECT * FROM quiz_skills WHERE id = ?').bind(sub).first();
        if (!skillRow) return err('المهارة غير موجودة', 404, CORS);
        const { action = 'append', questions: rows } = await request.json();
        if (!Array.isArray(rows) || !rows.length) return err('أسئلة مطلوبة', 400, CORS);
        if (action === 'replace') await DB.prepare('DELETE FROM quiz_skill_questions WHERE quiz_skill_id = ?').bind(sub).run();
        const { results: existing } = await DB.prepare('SELECT qnum FROM quiz_skill_questions WHERE quiz_skill_id = ?').bind(sub).all();
        const existingNums = new Set(existing.map(r => r.qnum));
        const now = new Date().toISOString();
        const stmt = DB.prepare(
          `INSERT INTO quiz_skill_questions (id, quiz_skill_id, qnum, text, opt1, opt2, opt3, opt4, ans, relation, explanation, golden_rule, smart_hint, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        let added = 0;
        for (const q of rows) {
          if (existingNums.has(q.qnum)) continue;
          await stmt.bind(
            crypto.randomUUID(), sub, q.qnum, q.text, q.opts[0], q.opts[1], q.opts[2], q.opts[3], q.ans,
            q.relation || null, q.explanation || null, q.golden_rule || null, q.smart_hint || null, now
          ).run();
          added++;
        }
        await logEvent(DB, { level: 'info', category: 'quiz-skills', message: `استيراد أسئلة المهارة ${skillRow.skill_name} (${skillRow.section}/${skillRow.level}) — ${added} مضافة`, user_name: claims?.name || '', user_role: claims?.role || 'dev', school: claims?.school || '' });
        return ok({ added, skipped: rows.length - added }, 200, CORS);
      }

      // POST /api/quiz-skills/:quizSkillId/submit — grade (pure correct-count, no timing/anti-cheat)
      if (resource === 'quiz-skills' && sub && subsub === 'submit' && method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        const skillRow = await DB.prepare('SELECT * FROM quiz_skills WHERE id = ?').bind(sub).first();
        if (!skillRow) return err('المهارة غير موجودة', 404, CORS);
        const { answers: submitted } = await request.json();
        if (!Array.isArray(submitted)) return err('إجابات مطلوبة', 400, CORS);
        const { results: questions } = await DB.prepare(
          'SELECT qnum, text, opt1, opt2, opt3, opt4, ans, relation, explanation, golden_rule, smart_hint FROM quiz_skill_questions WHERE quiz_skill_id = ?'
        ).bind(sub).all();
        const ansMap = Object.fromEntries(submitted.map(a => [Number(a.qnum), a.selected]));
        let correct = 0;
        for (const q of questions) {
          const selected = ansMap[q.qnum];
          if (selected !== undefined && selected !== null && selected !== 'dk' && Number(selected) === Number(q.ans)) correct++;
        }
        const total = questions.length;
        // Passing ratio is admin-configurable (GET/PATCH /api/settings, key
        // 'quiz_pass_ratio') — defaults to 0.8, i.e. the original hardcoded
        // "correct >= 4 of 5" rule, unchanged unless a director/dev sets it.
        const passRatio = await _getQuizPassRatio();
        const { pass } = computeQuizPass(correct, total, passRatio);
        const now = new Date().toISOString();
        const existing = await DB.prepare('SELECT * FROM skill_progress WHERE student_id = ? AND quiz_skill_id = ?').bind(claims.sub, sub).first();
        const bestCorrect = Math.max(correct, existing?.best_correct || 0);
        const attempts = (existing?.attempts || 0) + 1;
        const status = pass ? 'passed' : 'failed';
        if (existing) {
          await DB.prepare(
            'UPDATE skill_progress SET status = ?, best_correct = ?, best_total = ?, attempts = ?, last_attempt_at = ? WHERE id = ?'
          ).bind(status, bestCorrect, total, attempts, now, existing.id).run();
        } else {
          await DB.prepare(
            `INSERT INTO skill_progress (id, student_id, quiz_skill_id, section, level, status, best_correct, best_total, attempts, last_attempt_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), claims.sub, sub, skillRow.section, skillRow.level, status, bestCorrect, total, attempts, now, now).run();
        }

        // Smart Feedback & Tiered Hinting Engine — review content, built only
        // AFTER grading (never exposed while the student is still solving).
        // Easy/medium: full explanation always included for every question.
        // Advanced: on this student's FIRST failed attempt at a given wrong
        // question, only the smart_hint is sent (no correct answer, no
        // explanation) so a retry is meaningful; the full explanation is
        // only revealed once attempts >= 2. A skill with no explanation data
        // imported yet just yields nulls, which the client renders as
        // "no review content" (no different from before this feature).
        const review = questions.map(q => {
          const selectedRaw = ansMap[q.qnum];
          const selected = (selectedRaw === undefined || selectedRaw === null || selectedRaw === 'dk') ? null : Number(selectedRaw);
          const isCorrect = selected !== null && selected === Number(q.ans);
          const withholdAnswer = skillRow.level === 'advanced' && !isCorrect && attempts === 1;
          return {
            qnum: q.qnum,
            text: q.text,
            opts: [q.opt1, q.opt2, q.opt3, q.opt4],
            selected,
            isCorrect,
            correctIndex: withholdAnswer ? null : Number(q.ans),
            relation: withholdAnswer ? null : (q.relation || null),
            explanation: withholdAnswer ? null : (q.explanation || null),
            goldenRule: withholdAnswer ? null : (q.golden_rule || null),
            smartHint: withholdAnswer ? (q.smart_hint || null) : null,
          };
        });

        return ok({ correct, total, pass, level: skillRow.level, section: skillRow.section, attempts, review }, 200, CORS);
      }
    }

    // ── SETTINGS (small admin-configurable key/value store) ────────────────
    if (resource === 'settings') {
      // GET /api/settings — admin/director/dev; returns whitelisted keys the
      // admin UI knows about, each with its resolved (validated) value.
      if (!sub && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin', 'director', 'dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const ratio = await _getQuizPassRatio();
        const idPrefix = (await _getSetting('student_id_prefix')) || DEFAULT_STUDENT_ID_PREFIX;
        return ok({
          settings: {
            quiz_pass_ratio: { value: ratio, default: DEFAULT_QUIZ_PASS_RATIO, label: 'نسبة النجاح في الاختبارات القصيرة' },
            student_id_prefix: { value: idPrefix, default: DEFAULT_STUDENT_ID_PREFIX, label: 'بادئة معرفات الطلاب الجدد (الاستيراد الذكي)' },
          },
        }, 200, CORS);
      }

      // PATCH /api/settings { key, value } — director/dev only: this is a
      // single global setting affecting grading across every school, so it
      // stays out of reach of a single-school admin.
      if (!sub && method === 'PATCH') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['director', 'dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const { key, value } = await request.json();
        const ALLOWED_KEYS = new Set(['quiz_pass_ratio', 'student_id_prefix']);
        if (!ALLOWED_KEYS.has(key)) return err('إعداد غير معروف', 400, CORS);
        if (key === 'quiz_pass_ratio') {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0.5 || n > 1) return err('القيمة يجب أن تكون بين 0.5 و1', 400, CORS);
        }
        if (key === 'student_id_prefix' && !/^\d{1,4}$/.test(String(value))) {
          return err('البادئة يجب أن تكون من 1 إلى 4 أرقام', 400, CORS);
        }
        await _ensureAppSettingsSchema();
        await DB.prepare(
          `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`
        ).bind(key, String(value), new Date().toISOString()).run();
        await logEvent(DB, { level: 'info', category: 'settings', message: `تحديث إعداد ${key} إلى ${value}`, user_name: claims.name || '', user_role: claims.role, school: claims.school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      return err('غير موجود', 404, CORS);
    }

    // ── JOURNEY (مسار الإنجاز) ───────────────────────────────────────────────
    // Aggregates the diagnostic (plans), the quiz-skills tree (skill_progress),
    // and the final-mock general-test into ONE server-computed state — the
    // single source of truth both the student's own home screen and the
    // admin's per-student profile render from (computeJourney() in
    // functions/_lib/journey.js). No new tables beyond app_settings above;
    // everything here is derived live from data these endpoints already write.
    if (resource === 'journey') {
      if (method !== 'GET') return err('غير موجود', 404, CORS);
      const claims = await verifyToken(request, env, DB);
      if (!claims) return err('غير مصرح', 401, CORS);
      const targetStudentId = await _resolveTargetStudentId(claims);
      if (targetStudentId === 'FORBIDDEN') return err('غير مسموح', 403, CORS);
      if (!targetStudentId) return err(claims.role === 'student' ? 'غير مصرح' : 'معرّف الطالب مطلوب', claims.role === 'student' ? 401 : 400, CORS);

      const tree = await _fetchQuizTree(targetStudentId);

      const { results: planRowsAsc } = await DB.prepare(
        'SELECT gaps, admin_note, created_at FROM plans WHERE student_id = ? ORDER BY created_at ASC'
      ).bind(targetStudentId).all();
      const latestPlanRow = planRowsAsc.length ? planRowsAsc[planRowsAsc.length - 1] : null;
      let plan = null;
      let cooldownUntil = null;
      if (latestPlanRow) {
        let gaps = [];
        try { gaps = JSON.parse(latestPlanRow.gaps || '[]'); } catch {}
        plan = { gaps, created_at: latestPlanRow.created_at };
        if (!isRetakeOverride(latestPlanRow.admin_note)) {
          cooldownUntil = computeCooldownUntil(gaps, latestPlanRow.created_at);
        }
      }

      // Final-mock capstone (general-tests test_num=1) — tolerate that table
      // not existing yet on a completely fresh deployment (it's created lazily
      // by the general-tests resource handler, not here).
      let finalMock = null;
      try {
        const meta = await DB.prepare('SELECT title FROM general_test_meta WHERE test_num = 1').first();
        const qCountRow = await DB.prepare('SELECT COUNT(*) as c FROM general_tests WHERE test_num = 1').first();
        const available = !!meta && Number(qCountRow?.c || 0) > 0;
        if (available) {
          const attemptRow = await DB.prepare(
            'SELECT MAX(score) as best_score, COUNT(*) as attempts FROM general_test_results WHERE student_id = ? AND test_num = 1 AND is_trial = 0'
          ).bind(targetStudentId).first();
          const attempts = Number(attemptRow?.attempts || 0);
          finalMock = {
            available: true, title: meta.title || 'اختبار المحاكاة الشامل',
            attempted: attempts > 0, attempts, bestScore: attempts > 0 ? Number(attemptRow.best_score) : null,
          };
        } else {
          finalMock = { available: false, attempted: false };
        }
      } catch { finalMock = null; }

      // Lightweight single-student activity signals for the health/readiness
      // score — same three sources and formula as GET /api/analytics/health
      // (login, diagnostic attempt, general-test attempt), scoped to one
      // student instead of a whole school (a few single-row lookups, no N+1).
      let health = null;
      try {
        const [lastLoginRow, lastGtrRow] = await Promise.all([
          DB.prepare(`SELECT MAX(created_at) as last FROM logs WHERE category = 'login' AND student_id = ?`).bind(targetStudentId).first(),
          DB.prepare('SELECT MAX(created_at) as last FROM general_test_results WHERE student_id = ?').bind(targetStudentId).first(),
        ]);
        const { firstScore, lastScore, improvementPct, lastAttemptAt } = summarizePlanAttempts(planRowsAsc);
        const candidates = [lastLoginRow?.last, lastAttemptAt, lastGtrRow?.last].filter(Boolean);
        const lastActive = candidates.length ? candidates.sort().at(-1) : null;
        health = { ...computeHealthScore({ lastActive, lastScore, improvementPct }), lastActive };
      } catch { health = null; }

      const journey = computeJourney({ tree, plan, finalMock, health });
      // `tree` is attached alongside (not inside computeJourney's pure output)
      // so the student/admin UI can render the full section→level→skill
      // breakdown without a second GET /api/quiz-structure round-trip.
      // `cooldownUntil` — non-null only while the student's mandatory
      // post-diagnostic waiting period is still running (null once it ends,
      // or immediately if an admin granted an OVERRIDE retake) — powers the
      // "⏳ فترة استراحة حتى" status badge on the admin's student profile.
      return ok({ journey: { ...journey, tree, cooldownUntil } }, 200, CORS);
    }

    // ── ADMINS ───────────────────────────────────────────────────────────────

    // GET /api/admins?school=X — list supervisors for chat (requires JWT)
    if (resource === 'admins' && !sub && method === 'GET' && school) {
      const admClaims = await verifyToken(request, env, DB);
      if (!admClaims) return err('غير مصرح', 401, CORS);
      // Admins can only see admins in their own school; students use JWT school too
      const targetSchool = (admClaims.role === 'dev') ? school
        : (admClaims.school && admClaims.school !== '*') ? admClaims.school
        : school; // director can pass ?school=
      if (!targetSchool) return ok({ admins: [] }, 200, CORS);
      const { results } = await DB.prepare(
        "SELECT id, name FROM admins WHERE school = ? AND school != '' ORDER BY name ASC"
      ).bind(targetSchool).all();
      return ok({ admins: results }, 200, CORS);
    }

    if (resource === 'admins' && sub && method === 'GET') {
      // Requires valid JWT — used by chat to look up admin info
      const admClaims = await verifyToken(request, env, DB);
      if (!admClaims) return err('غير مصرح', 401, CORS);
      // sub = admin code, school = selected school
      const admin = await DB.prepare('SELECT id, name, school, role FROM admins WHERE code = ?').bind(sub).first();
      if (!admin) return ok({ admin: null }, 404, CORS);
      // school='*' means superadmin, can access any school
      if (admin.school !== '*' && school && admin.school !== school) {
        return ok({ admin: null }, 404, CORS);
      }
      return ok({ admin }, 200, CORS);
    }

    // ── DEV ENDPOINTS ────────────────────────────────────────────────────────
    if (resource === 'dev') {

      // POST /api/dev/logs is reachable by any authenticated user (JWT), not just the dev key —
      // the frontend's serverLog() helper uses a JWT bearer token and must never receive DEV_KEY.
      if (sub === 'logs' && method === 'POST') {
        const isDevKey = authDev(request, env);
        const logClaims = isDevKey ? null : await verifyToken(request, env, DB);
        if (!isDevKey && !logClaims) return err('غير مصرح', 401, CORS);
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, level TEXT NOT NULL DEFAULT 'info', category TEXT NOT NULL DEFAULT 'system', message TEXT NOT NULL, user_name TEXT DEFAULT '', user_role TEXT DEFAULT '', school TEXT DEFAULT '', ip TEXT DEFAULT '', device TEXT DEFAULT '', created_at TEXT NOT NULL)`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE logs ADD COLUMN device TEXT DEFAULT ''`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE logs ADD COLUMN student_id TEXT DEFAULT ''`).run(); } catch {}
        try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)`).run(); } catch {}
        try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)`).run(); } catch {}
        const body = await request.json();
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
        const device = detectDevice(request.headers.get('User-Agent') || '');
        await logEvent(DB, {
          level: body.level || 'info',
          category: body.category || 'system',
          message: String(body.message || '').slice(0, 500),
          user_name: body.user_name || logClaims?.name || '',
          user_role: body.user_role || logClaims?.role || '',
          school: body.school || logClaims?.school || '',
          ip,
          device,
        });
        return ok({ ok: true }, 201, CORS);
      }

      // GET /api/dev/logs is also reachable with a 'dev'-role JWT (issued via POST /api/auth/dev) —
      // the support-admin panel only ever holds that JWT, never the raw X-Dev-Key.
      if (sub === 'logs' && method === 'GET') {
        const isDevKey = authDev(request, env);
        if (!isDevKey) {
          const logClaims = await verifyToken(request, env, DB);
          if (!logClaims || logClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, level TEXT NOT NULL DEFAULT 'info', category TEXT NOT NULL DEFAULT 'system', message TEXT NOT NULL, user_name TEXT DEFAULT '', user_role TEXT DEFAULT '', school TEXT DEFAULT '', ip TEXT DEFAULT '', device TEXT DEFAULT '', created_at TEXT NOT NULL)`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE logs ADD COLUMN device TEXT DEFAULT ''`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE logs ADD COLUMN student_id TEXT DEFAULT ''`).run(); } catch {}
        try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)`).run(); } catch {}
        try { await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)`).run(); } catch {}
        const level    = url.searchParams.get('level') || '';
        const category = url.searchParams.get('category') || '';
        const limitN   = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 500);
        const offsetN  = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
        let q = 'SELECT * FROM logs';
        const params = [];
        const conds = [];
        if (level)    { conds.push('level = ?');    params.push(level); }
        if (category) { conds.push('category = ?'); params.push(category); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limitN, offsetN);
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ logs: results, hasMore: results.length === limitN }, 200, CORS);
      }

      // POST /api/dev/access-tokens { studentId } — dev-only test tool: mints a
      // single-use, no-expiry token for the account-access link. Reachable by
      // DEV_KEY or a dev-role JWT, same as /dev/logs.
      if (sub === 'access-tokens' && method === 'POST') {
        const isDevKey = authDev(request, env);
        if (!isDevKey) {
          const atClaims = await verifyToken(request, env, DB);
          if (!atClaims || atClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS access_tokens (token TEXT PRIMARY KEY, student_id TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)`).run(); } catch {}
        try { await DB.prepare(`ALTER TABLE access_tokens ADD COLUMN wa_send_id TEXT`).run(); } catch {}
        const atBody = await request.json();
        const studentId = String(atBody.studentId || '');
        if (!studentId) return err('studentId مطلوب', 400, CORS);
        const student = await DB.prepare('SELECT id FROM students WHERE id = ?').bind(studentId).first();
        if (!student) return err('الطالب غير موجود', 404, CORS);
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const randBytes = crypto.getRandomValues(new Uint8Array(14));
        const token = Array.from(randBytes, b => alphabet[b % alphabet.length]).join('');
        // waSendId (optional): links this token to a bulk "إرسال جماعي" batch
        // (see resource === 'dev' && sub === 'wa-sends' below) so dev.html can
        // show aggregate sent/opened stats per batch. Individual one-off sends
        // (generateTestAccessLink/sendAccountLinkWhatsApp) omit it, same as before.
        const waSendId = atBody.waSendId ? String(atBody.waSendId) : null;
        await DB.prepare('INSERT INTO access_tokens (token, student_id, created_at, wa_send_id) VALUES (?, ?, ?, ?)').bind(token, studentId, new Date().toISOString(), waSendId).run();
        return ok({ token }, 201, CORS);
      }

      // GET /api/dev/access-tokens?studentId=... — link-open tracking: every
      // token sent to this student, and whether/when they actually opened it.
      if (sub === 'access-tokens' && method === 'GET') {
        const isDevKeyRead = authDev(request, env);
        if (!isDevKeyRead) {
          const atReadClaims = await verifyToken(request, env, DB);
          if (!atReadClaims || atReadClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        const studentId = url.searchParams.get('studentId') || '';
        if (!studentId) return err('studentId مطلوب', 400, CORS);
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS access_tokens (token TEXT PRIMARY KEY, student_id TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)`).run(); } catch {}
        const { results } = await DB.prepare(
          'SELECT token, used_at, created_at FROM access_tokens WHERE student_id = ? ORDER BY created_at DESC'
        ).bind(studentId).all();
        return ok({ tokens: results }, 200, CORS);
      }

      // POST /api/dev/wa-sends { label, school, template_name, total_targeted }
      // — creates one row per bulk "إرسال جماعي" run (e.g. sendWelcomeToAll),
      // so the access_tokens minted during that run can be grouped and their
      // aggregate open rate shown in the dev panel.
      if (sub === 'wa-sends' && !subsub && method === 'POST') {
        const isDevKeyWs = authDev(request, env);
        let wsClaims = null;
        if (!isDevKeyWs) {
          wsClaims = await verifyToken(request, env, DB);
          if (!wsClaims || wsClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS wa_sends (id TEXT PRIMARY KEY, label TEXT NOT NULL, school TEXT, template_name TEXT, admin_name TEXT, total_targeted INTEGER DEFAULT 0, created_at TEXT NOT NULL)`).run(); } catch {}
        const wsBody = await request.json();
        const label = String(wsBody.label || '').trim();
        if (!label) return err('label مطلوب', 400, CORS);
        const wsId = crypto.randomUUID();
        await DB.prepare(
          'INSERT INTO wa_sends (id, label, school, template_name, admin_name, total_targeted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(wsId, label, wsBody.school || '', wsBody.template_name || '', wsClaims?.name || '', Number(wsBody.total_targeted) || 0, new Date().toISOString()).run();
        return ok({ id: wsId }, 201, CORS);
      }

      // GET /api/dev/wa-sends?school=... — lists past bulk WhatsApp send
      // batches with aggregate sent/opened counts (opened = access_tokens
      // whose link was actually redeemed, i.e. used_at is set).
      if (sub === 'wa-sends' && !subsub && method === 'GET') {
        const isDevKeyWsList = authDev(request, env);
        if (!isDevKeyWsList) {
          const wsListClaims = await verifyToken(request, env, DB);
          if (!wsListClaims || wsListClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS wa_sends (id TEXT PRIMARY KEY, label TEXT NOT NULL, school TEXT, template_name TEXT, admin_name TEXT, total_targeted INTEGER DEFAULT 0, created_at TEXT NOT NULL)`).run(); } catch {}
        // access_tokens may predate the wa_send_id column (added for this
        // feature) — ensure it exists before the correlated subqueries below
        // reference it, same as the access-tokens POST/GET handlers do.
        try { await DB.prepare(`ALTER TABLE access_tokens ADD COLUMN wa_send_id TEXT`).run(); } catch {}
        const wsSchool = url.searchParams.get('school') || '';
        const wsCond = wsSchool ? ' WHERE school = ?' : '';
        const wsArgs = wsSchool ? [wsSchool] : [];
        const { results } = await DB.prepare(
          `SELECT ws.*,
            (SELECT COUNT(*) FROM access_tokens WHERE wa_send_id = ws.id) as sent_count,
            (SELECT COUNT(*) FROM access_tokens WHERE wa_send_id = ws.id AND used_at IS NOT NULL) as opened_count,
            (SELECT COUNT(DISTINCT at2.student_id) FROM access_tokens at2
               WHERE at2.wa_send_id = ws.id AND EXISTS (
                 SELECT 1 FROM logs l WHERE l.student_id = at2.student_id
                   AND l.category = 'login' AND l.level = 'success' AND l.created_at >= ws.created_at
               )) as entered_count
          FROM wa_sends ws${wsCond} ORDER BY created_at DESC`
        ).bind(...wsArgs).all();
        return ok({ sends: results }, 200, CORS);
      }

      // GET /api/dev/wa-sends/:id — per-student open status for one batch.
      // (The router only parses resource/sub/subsub — 3 segments — so this
      // stays at /dev/wa-sends/:id rather than a deeper /:id/recipients path.)
      if (sub === 'wa-sends' && subsub && method === 'GET') {
        const isDevKeyWsR = authDev(request, env);
        if (!isDevKeyWsR) {
          const wsRClaims = await verifyToken(request, env, DB);
          if (!wsRClaims || wsRClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`ALTER TABLE access_tokens ADD COLUMN wa_send_id TEXT`).run(); } catch {}
        const waSendRow = await DB.prepare('SELECT created_at FROM wa_sends WHERE id = ?').bind(subsub).first();
        if (!waSendRow) return err('الدفعة غير موجودة', 404, CORS);
        const waSendCreatedAt = waSendRow.created_at;
        const { results } = await DB.prepare(
          `SELECT s.id, s.name, at.used_at, at.created_at,
             (SELECT MIN(l.created_at) FROM logs l WHERE l.student_id = s.id
                AND l.category = 'login' AND l.level = 'success' AND l.created_at >= ?) as entered_at
           FROM access_tokens at JOIN students s ON s.id = at.student_id
           WHERE at.wa_send_id = ? ORDER BY at.used_at DESC NULLS LAST, at.created_at DESC`
        ).bind(waSendCreatedAt, subsub).all();
        return ok({ recipients: results }, 200, CORS);
      }

      // POST /api/dev/ticket-link { ticketId } — mints a random opaque token for
      // the support-ticket WhatsApp notification button, instead of putting the
      // guessable ticket_num/id directly in the link (dev-only auth still gates
      // the resolved page, so this only prevents ID-guessing/enumeration).
      if (sub === 'ticket-link' && method === 'POST') {
        const isDevKeyTL = authDev(request, env);
        if (!isDevKeyTL) {
          const tlClaims = await verifyToken(request, env, DB);
          if (!tlClaims || tlClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_link_tokens (token TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, created_at TEXT NOT NULL)`).run(); } catch {}
        const tlBody = await request.json();
        const ticketId = String(tlBody.ticketId || '');
        if (!ticketId) return err('ticketId مطلوب', 400, CORS);
        const ticket = await DB.prepare('SELECT id FROM tickets WHERE id = ?').bind(ticketId).first();
        if (!ticket) return err('الطلب غير موجود', 404, CORS);
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const randBytes = crypto.getRandomValues(new Uint8Array(14));
        const token = Array.from(randBytes, b => alphabet[b % alphabet.length]).join('');
        await DB.prepare('INSERT INTO ticket_link_tokens (token, ticket_id, created_at) VALUES (?, ?, ?)').bind(token, ticketId, new Date().toISOString()).run();
        return ok({ token }, 201, CORS);
      }

      // GET /api/dev/ticket-link/:token — resolve the token to a ticket_id.
      // Requires the same dev auth as everything else here; the token alone
      // never bypasses login, it only tells the panel which ticket to open.
      if (sub === 'ticket-link' && subsub && method === 'GET') {
        const isDevKeyTLR = authDev(request, env);
        if (!isDevKeyTLR) {
          const tlrClaims = await verifyToken(request, env, DB);
          if (!tlrClaims || tlrClaims.role !== 'dev') return err('غير مصرح', 401, CORS);
        }
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_link_tokens (token TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, created_at TEXT NOT NULL)`).run(); } catch {}
        const row = await DB.prepare('SELECT ticket_id FROM ticket_link_tokens WHERE token = ?').bind(subsub).first();
        if (!row) return err('الرابط غير صالح', 404, CORS);
        return ok({ ticketId: row.ticket_id }, 200, CORS);
      }

      if (!authDev(request, env)) return err('غير مصرح', 401, CORS);

      // GET /api/dev/backup — full-site data dump (all tables) for manual download
      if (sub === 'backup' && method === 'GET') {
        const BACKUP_TABLES = [
          'students', 'plans', 'questions', 'admins', 'schools',
          'test_results', 'bio_questions', 'test_answers', 'logs',
          'messages', 'tickets', 'ticket_replies', 'broadcasts', 'broadcast_dismissals',
        ];
        const tables = {};
        for (const t of BACKUP_TABLES) {
          try {
            const { results } = await DB.prepare(`SELECT * FROM ${t}`).all();
            tables[t] = results;
          } catch { tables[t] = []; }
        }
        return ok({ generated_at: new Date().toISOString(), tables }, 200, CORS);
      }

      // GET /api/dev/test-grading — simulate grading with all-correct answers to verify scoring logic
      if (sub === 'test-grading' && method === 'GET') {
        const tgDev = authDev(request, env);
        const tgClaims = tgDev ? { role: 'dev' } : await verifyToken(request, env, DB);
        if (!tgClaims || !['admin','director','dev'].includes(tgClaims.role)) return err('غير مصرح', 401, CORS);
        const { results: questions } = await DB.prepare('SELECT qnum, skill_id, ans FROM questions ORDER BY qnum ASC').all();
        if (!questions.length) return ok({ error: 'لا توجد أسئلة في قاعدة البيانات' }, 200, CORS);
        // Build all-correct answers
        const allCorrect = {};
        const allWrong   = {};
        for (const q of questions) {
          allCorrect[q.qnum] = Number(q.ans);
          allWrong[q.qnum]   = (Number(q.ans) + 1) % 4;
        }
        // Grade both sets
        const grade = (answers) => {
          const scores = {};
          for (const q of questions) {
            if (!scores[q.skill_id]) scores[q.skill_id] = { correct: 0, total: 0 };
            scores[q.skill_id].total++;
            const selected = answers[q.qnum];
            if (selected !== undefined && selected !== null && Number(selected) === Number(q.ans)) {
              scores[q.skill_id].correct++;
            }
          }
          return Object.entries(scores).map(([skillId, s]) => ({
            skillId, correct: s.correct, total: s.total,
            pct: s.total ? Math.round((s.correct / s.total) * 100) : 0,
          }));
        };
        return ok({
          questions_count: questions.length,
          skills_found: [...new Set(questions.map(q => q.skill_id))],
          all_correct_result: grade(allCorrect),
          all_wrong_result:   grade(allWrong),
          sample_question: questions[0],
        }, 200, CORS);
      }

      // GET /api/dev/stats — stats per school
      if (sub === 'stats' && method === 'GET') {
        const { results: schools } = await DB.prepare('SELECT name FROM schools ORDER BY name').all();
        const stats = [];
        for (const { name } of schools) {
          const s   = await DB.prepare('SELECT COUNT(*) as c FROM students WHERE school = ?').bind(name).first();
          const t   = await DB.prepare('SELECT COUNT(DISTINCT student_id) as c FROM plans WHERE school = ?').bind(name).first();
          const avg = await DB.prepare("SELECT AVG(CAST(SUBSTR(gaps,0,4) AS INTEGER)) as v FROM plans WHERE school = ? AND gaps != '[]'").bind(name).first().catch(() => ({ v: null }));
          stats.push({ school: name, students: s.c, tested: t.c, avg: avg?.v ? Math.round(avg.v) : null });
        }
        const tot_s = await DB.prepare('SELECT COUNT(*) as c FROM students').first();
        const tot_a = await DB.prepare('SELECT COUNT(*) as c FROM admins').first();
        const tot_q = await DB.prepare('SELECT COUNT(*) as c FROM questions').first();
        const tot_t = await DB.prepare('SELECT COUNT(DISTINCT student_id) as c FROM plans').first();
        return ok({ stats, totals: { students: tot_s.c, admins: tot_a.c, questions: tot_q.c, schools: schools.length, tested: tot_t.c } }, 200, CORS);
      }

      // GET /api/dev/admins — all admins
      if (sub === 'admins' && method === 'GET') {
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'").run(); } catch {}
        const { results } = await DB.prepare('SELECT * FROM admins ORDER BY school, name').all();
        return ok({ admins: results }, 200, CORS);
      }

      // GET /api/dev/generate-admin-code?school=X — same idea as
      // generate-student-code below, checked against `admins` instead.
      // `school` may be a real school name or the literal '*' (super admin).
      if (sub === 'generate-admin-code' && method === 'GET') {
        const genAdminSchool = (url.searchParams.get('school') || '').trim();
        if (!genAdminSchool) return err('المدرسة مطلوبة', 400, CORS);
        try {
          const code = await generateAdminCode(DB, genAdminSchool);
          return ok({ code }, 200, CORS);
        } catch (e) {
          return err(e.message || 'تعذّر توليد الكود', 500, CORS);
        }
      }

      // POST /api/dev/admins — add admin
      if (sub === 'admins' && method === 'POST') {
        const { name, code, school: adminSchool, role: adminRole } = await request.json();
        if (!name || !code) return err('الاسم والرمز مطلوبان', 400, CORS);
        if (!/^\d{10}$/.test(code)) return err('رمز الدخول يجب أن يكون 10 أرقام', 400, CORS);
        // Ensure role column exists (idempotent migration)
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'").run(); } catch {}
        const aid = crypto.randomUUID();
        const now = new Date().toISOString();
        const role = adminRole === 'director' ? 'director' : 'admin';
        try {
          await DB.prepare(
            'INSERT INTO admins (id, name, code, school, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(aid, name, code, adminSchool || '', role, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('السجل المدني مسجّل مسبقاً', 409, CORS);
          throw e;
        }
        return ok({ admin: { id: aid, name, code, school: adminSchool || '', role, created_at: now } }, 201, CORS);
      }

      // DELETE /api/dev/admins/:id
      if (sub === 'admins' && subsub && method === 'DELETE') {
        await DB.prepare('DELETE FROM admins WHERE id = ?').bind(subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // PATCH /api/dev/admins/:id — update permissions and/or role (dev only).
      // Body may include either or both of { permissions, role }.
      // `permissions` is validated against a fixed allow-list — junk values
      // are silently dropped rather than stored, so the permissions table
      // can never end up with a typo'd key nothing checks for.
      // NOTE: 'director' role is granted edit_questions/view_diff
      // automatically by 3 role checks elsewhere in this file regardless of
      // these flags — toggling those two off for a director is metadata
      // only; change the role itself to actually restrict a director.
      if (sub === 'admins' && subsub && method === 'PATCH') {
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN permissions TEXT DEFAULT '[]'").run(); } catch {}
        const ALLOWED_PERMISSIONS = new Set([
          'edit_questions', 'view_diff', 'send_whatsapp',
          'manage_students', 'export_students', 'send_broadcast', 'reply_tickets',
        ]);
        const body = await request.json();
        const updates = [];
        const binds = [];
        if (body.permissions !== undefined) {
          if (!Array.isArray(body.permissions)) return err('صلاحيات غير صالحة', 400, CORS);
          const cleaned = Array.from(new Set(body.permissions.filter(p => ALLOWED_PERMISSIONS.has(p))));
          updates.push('permissions = ?');
          binds.push(JSON.stringify(cleaned));
        }
        if (body.role !== undefined) {
          if (!['admin', 'director'].includes(body.role)) return err('دور غير صالح', 400, CORS);
          updates.push('role = ?');
          binds.push(body.role);
        }
        if (!updates.length) return err('لا يوجد شيء لتحديثه', 400, CORS);
        binds.push(subsub);
        await DB.prepare(`UPDATE admins SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
        await logEvent(DB, { level: 'info', category: 'admin', message: `تعديل صلاحيات/دور مشرف`, user_role: 'dev' });
        return ok({ ok: true }, 200, CORS);
      }

      // GET /api/dev/schools
      if (sub === 'schools' && method === 'GET') {
        const { results } = await DB.prepare('SELECT * FROM schools ORDER BY name').all();
        return ok({ schools: results }, 200, CORS);
      }

      // POST /api/dev/schools — add school
      if (sub === 'schools' && method === 'POST') {
        const { name } = await request.json();
        if (!name) return err('الاسم مطلوب', 400, CORS);
        const sid = 'school-' + crypto.randomUUID().slice(0, 8);
        const now = new Date().toISOString();
        try {
          await DB.prepare('INSERT INTO schools (id, name, created_at) VALUES (?, ?, ?)').bind(sid, name, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('المدرسة موجودة مسبقاً', 409, CORS);
          throw e;
        }
        return ok({ school: { id: sid, name, created_at: now } }, 201, CORS);
      }

      // DELETE /api/dev/schools/:id
      if (sub === 'schools' && subsub && method === 'DELETE') {
        await DB.prepare('DELETE FROM schools WHERE id = ?').bind(subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // PATCH /api/dev/schools/:id — rename school (cascades to students/admins/plans)
      if (sub === 'schools' && subsub && method === 'PATCH') {
        let body;
        try { body = await request.json(); } catch { return err('بيانات غير صالحة', 400, CORS); }
        const rawName = typeof body?.name === 'string' ? body.name : '';
        const newName = rawName.replace(/[ -]/g, '').trim();
        if (!newName) return err('الاسم مطلوب', 400, CORS);
        if (newName.length > 120) return err('اسم المدرسة طويل جداً (الحد الأقصى 120 حرفاً)', 400, CORS);

        const school = await DB.prepare('SELECT * FROM schools WHERE id = ?').bind(subsub).first();
        if (!school) return err('المدرسة غير موجودة', 404, CORS);
        const oldName = school.name;

        if (newName === oldName) return ok({ school: { id: subsub, name: newName }, unchanged: true }, 200, CORS);

        try {
          await DB.batch([
            DB.prepare('UPDATE schools SET name = ? WHERE id = ?').bind(newName, subsub),
            DB.prepare('UPDATE students SET school = ? WHERE school = ?').bind(newName, oldName),
            DB.prepare('UPDATE admins SET school = ? WHERE school = ?').bind(newName, oldName),
            DB.prepare('UPDATE plans SET school = ? WHERE school = ?').bind(newName, oldName),
          ]);
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('يوجد مدرسة أخرى بهذا الاسم', 409, CORS);
          throw e;
        }
        return ok({ school: { id: subsub, name: newName } }, 200, CORS);
      }

      // GET /api/dev/students — all students (optional ?school=X filter)
      if (sub === 'students' && method === 'GET') {
        const filterSchool = url.searchParams.get('school');
        try {
          let q = `SELECT s.id, s.code, s.name, s.school, s.phone, s.created_at,
                     (SELECT COUNT(*) FROM plans p WHERE p.student_id = s.id) AS plan_count,
                     (SELECT status FROM plans p WHERE p.student_id = s.id ORDER BY p.created_at DESC LIMIT 1) AS plan_status
                   FROM students s`;
          const params = [];
          if (filterSchool) { q += ' WHERE s.school = ?'; params.push(filterSchool); }
          q += ' ORDER BY s.school, s.name ASC';
          const { results } = await DB.prepare(q).bind(...params).all();
          return ok({ students: results }, 200, CORS);
        } catch (e) {
          if (e.message && e.message.includes('no such column')) {
            const { results } = await DB.prepare(
              'SELECT s.id, s.code, s.name, s.created_at FROM students s ORDER BY s.name ASC'
            ).all();
            return ok({ students: results.map(r => ({ ...r, school: '', phone: '', plan_count: 0, plan_status: null })) }, 200, CORS);
          }
          throw e;
        }
      }

      // GET /api/dev/generate-student-code?school=X — suggests a fresh,
      // collision-free 10-digit login code for the "Add Student" form.
      // Purely a suggestion: it doesn't reserve or insert anything, so the
      // operator can still overwrite the field by hand (e.g. to enter the
      // student's actual national ID instead) before submitting.
      if (sub === 'generate-student-code' && method === 'GET') {
        const genSchool = (url.searchParams.get('school') || '').trim();
        if (!genSchool) return err('المدرسة مطلوبة', 400, CORS);
        try {
          const code = await generateStudentCode(DB, genSchool);
          return ok({ code }, 200, CORS);
        } catch (e) {
          return err(e.message || 'تعذّر توليد الكود', 500, CORS);
        }
      }

      // POST /api/dev/students — add single student from dev panel
      if (sub === 'students' && method === 'POST') {
        const { name, code, school: bodySchool } = await request.json();
        if (!name || !code) return err('الاسم والرمز مطلوبان', 400, CORS);
        if (!/^\d{10}$/.test(code)) return err('رمز الدخول يجب أن يكون 10 أرقام', 400, CORS);
        const sid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO students (id, code, name, school, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(sid, code, name, bodySchool || '', now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('السجل المدني مسجّل مسبقاً', 409, CORS);
          throw e;
        }
        return ok({ student: { id: sid, code, name, school: bodySchool || '', created_at: now } }, 201, CORS);
      }

      // DELETE /api/dev/students/:id — delete single student
      if (sub === 'students' && subsub && method === 'DELETE') {
        await cascadeDeleteStudent(DB, subsub);
        await DB.prepare('DELETE FROM students WHERE id = ?').bind(subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/dev/students?school=X — clear all students of a school
      // DELETE /api/dev/students?noschool=1 — delete students with empty school
      if (sub === 'students' && !subsub && method === 'DELETE') {
        const noSchool = url.searchParams.get('noschool') === '1';
        if (noSchool) {
          const { results: toDelete } = await DB.prepare("SELECT id FROM students WHERE school = '' OR school IS NULL").all();
          for (const s of toDelete) await cascadeDeleteStudent(DB, s.id);
          await DB.prepare("DELETE FROM students WHERE school = '' OR school IS NULL").run();
          return ok({ ok: true }, 200, CORS);
        }
        const targetSchool = url.searchParams.get('school');
        if (!targetSchool) return err('رمز المدرسة مطلوب', 400, CORS);
        const { results: toDelete } = await DB.prepare('SELECT id FROM students WHERE school = ?').bind(targetSchool).all();
        for (const s of toDelete) await cascadeDeleteStudent(DB, s.id);
        await DB.prepare('DELETE FROM students WHERE school = ?').bind(targetSchool).run();
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/dev/approve-pending-plans — fix old plans stuck in 'pending' status
      if (sub === 'approve-pending-plans' && method === 'POST') {
        const now = new Date().toISOString();
        const { changes } = await DB.prepare(
          "UPDATE plans SET status = 'active', approved_at = ? WHERE status = 'pending'"
        ).bind(now).run();
        return ok({ fixed: changes ?? 0 }, 200, CORS);
      }

      // POST /api/dev/seed-questions — upsert hardcoded 50 questions
      if (sub === 'seed-questions' && method === 'POST') {
        const SEED = SEED_QUESTIONS;
        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        let added = 0, updated = 0;
        for (const q of SEED) {
          if (existingNums.has(q.qnum)) {
            await DB.prepare(
              'UPDATE questions SET type=?,skill_id=?,text=?,opt1=?,opt2=?,opt3=?,opt4=?,ans=? WHERE qnum=?'
            ).bind(q.type, q.skill_id, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, q.qnum).run();
            updated++;
          } else {
            await DB.prepare(
              'INSERT INTO questions (id,qnum,type,skill_id,text,opt1,opt2,opt3,opt4,ans,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            ).bind(crypto.randomUUID(), q.qnum, q.type, q.skill_id, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, new Date().toISOString()).run();
            added++;
          }
        }
        return ok({ added, updated }, 200, CORS);
      }
      // PATCH /api/dev/questions/:id — edit a question (dev only)
      if (sub === 'questions' && subsub && method === 'PATCH') {
        const body = await request.json();
        const fields = [];
        const vals   = [];
        if (body.text     !== undefined) { fields.push('text = ?');     vals.push(body.text); }
        if (body.ans      !== undefined) { fields.push('ans = ?');      vals.push(String(body.ans)); }
        if (body.type     !== undefined) { fields.push('type = ?');     vals.push(body.type); }
        if (body.skill_id !== undefined) { fields.push('skill_id = ?'); vals.push(body.skill_id); }
        if (body.opt1     !== undefined) { fields.push('opt1 = ?');     vals.push(body.opt1); }
        if (body.opt2     !== undefined) { fields.push('opt2 = ?');     vals.push(body.opt2); }
        if (body.opt3     !== undefined) { fields.push('opt3 = ?');     vals.push(body.opt3); }
        if (body.opt4     !== undefined) { fields.push('opt4 = ?');     vals.push(body.opt4); }
        if (!fields.length) return err('لا يوجد شيء للتعديل', 400, CORS);
        vals.push(subsub);
        await DB.prepare(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/dev/questions — clear all questions
      if (sub === 'questions' && method === 'DELETE') {
        await DB.prepare('DELETE FROM questions').run();
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/dev/logs?confirm=ERASE_ALL_LOGS — clear all logs
      // Requires an explicit confirm param so a bare DELETE call (e.g. from a script
      // or curl during testing) can't silently wipe the whole history by mistake.
      if (sub === 'logs' && method === 'DELETE') {
        if (url.searchParams.get('confirm') !== 'ERASE_ALL_LOGS') {
          return err('يتطلب تأكيد صريح لمسح كل السجلات', 400, CORS);
        }
        try { await DB.prepare('DELETE FROM logs').run(); } catch {}
        return ok({ ok: true }, 200, CORS);
      }

      // ── TEST MANAGEMENT (dev-only) ──────────────────────────────────────────
      // Lets the dev reset/reissue bio-quiz attempts and study-plan retakes without
      // touching the admin panel at all — these actions are intentionally not exposed
      // to admin/director roles.

      // GET /api/dev/test-results — list bio quiz attempts (optional ?school=X&studentId=X)
      if (sub === 'test-results' && !subsub && method === 'GET') {
        const results = await listTestResults(DB, {
          school: url.searchParams.get('school'),
          studentId: url.searchParams.get('studentId'),
        });
        return ok({ results }, 200, CORS);
      }

      // DELETE /api/dev/test-results/:id — delete a single attempt + its per-question answers
      if (sub === 'test-results' && subsub && method === 'DELETE') {
        await deleteSingleTestResult(DB, subsub);
        await logEvent(DB, { level: 'warn', category: 'test-management', message: `حذف نتيجة اختبار: ${subsub}`, user_role: 'dev' });
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/dev/test-results?studentId=X — reset (delete) all attempts for one student
      // DELETE /api/dev/test-results?school=X&confirm=RESET_SCHOOL_TESTS — reset whole school's attempts
      if (sub === 'test-results' && !subsub && method === 'DELETE') {
        const targetStudent = url.searchParams.get('studentId');
        const targetSchool = url.searchParams.get('school');
        if (targetStudent) {
          const deleted = await resetStudentTestResults(DB, targetStudent);
          await logEvent(DB, { level: 'warn', category: 'test-management', message: `إعادة تعيين نتائج اختبارات الطالب: ${targetStudent}`, user_role: 'dev' });
          return ok({ ok: true, deleted }, 200, CORS);
        }
        if (targetSchool) {
          if (url.searchParams.get('confirm') !== 'RESET_SCHOOL_TESTS') {
            return err('يتطلب تأكيد صريح لإعادة تعيين اختبارات المدرسة كاملة', 400, CORS);
          }
          const deleted = await resetSchoolTestResults(DB, targetSchool);
          await logEvent(DB, { level: 'warn', category: 'test-management', message: `إعادة تعيين اختبارات مدرسة كاملة: ${targetSchool}`, user_role: 'dev', school: targetSchool });
          return ok({ ok: true, deleted }, 200, CORS);
        }
        return err('يلزم تحديد studentId أو school', 400, CORS);
      }

      // POST /api/dev/reset-student-quizzes — wipe a student's short-quiz-hub
      // progress (skill_progress: the 30 verbal+quantitative skill quizzes
      // reachable at /skills) and lesson/skill completion tracking
      // (student_progress: video/summary/quiz-watched flags per lesson), so
      // their account looks exactly like they never touched either — used
      // to give a student a clean slate on the practice-quiz side without
      // touching their diagnostic test, study plan, or the separate biology
      // quiz history (test_results/test_answers), each of which already has
      // its own reset path and is deliberately out of scope here. Both
      // deletes tolerate the table not existing yet on a fresh deployment,
      // same as the "Tolerate skill_progress not existing yet" comment
      // elsewhere in this file.
      if (sub === 'reset-student-quizzes' && method === 'POST') {
        const rsqBody = await request.json();
        let rsqStudentId = rsqBody.student_id;
        if (!rsqStudentId && rsqBody.student_code) {
          const byCode = await DB.prepare('SELECT id FROM students WHERE code = ?').bind(rsqBody.student_code).first();
          if (!byCode) return err('الطالب غير موجود', 404, CORS);
          rsqStudentId = byCode.id;
        }
        if (!rsqStudentId) return err('student_id أو student_code مطلوب', 400, CORS);
        const rsqStudent = await DB.prepare('SELECT id, name, school FROM students WHERE id = ?').bind(rsqStudentId).first();
        if (!rsqStudent) return err('الطالب غير موجود', 404, CORS);

        let skillsCleared = 0, lessonsCleared = 0;
        try {
          const r = await DB.prepare('DELETE FROM skill_progress WHERE student_id = ?').bind(rsqStudentId).run();
          skillsCleared = r.changes || 0;
        } catch {}
        try {
          const r = await DB.prepare('DELETE FROM student_progress WHERE student_id = ?').bind(rsqStudentId).run();
          lessonsCleared = r.changes || 0;
        } catch {}

        await logEvent(DB, {
          level: 'warn', category: 'test-management',
          message: `إعادة تعيين الاختبارات القصيرة للطالب: ${rsqStudent.name} — حُذف ${skillsCleared} تقدم مهارة و${lessonsCleared} سجل تقدم دروس`,
          user_name: 'dev', user_role: 'dev', school: rsqStudent.school || '', student_id: rsqStudentId,
        });
        return ok({ ok: true, studentId: rsqStudentId, skillsCleared, lessonsCleared }, 200, CORS);
      }

      // PATCH /api/dev/plans/grant-retake?school=X (or ?studentId=X) — bulk-grant a
      // retake by tagging each student's most recent plan with the existing
      // OVERRIDE: admin_note convention (see app.js cooldownUntil()/grantRetake()) —
      // reuses the cooldown-bypass mechanism the admin panel already understands,
      // just applied in bulk from the dev panel instead of one student at a time.
      if (sub === 'plans' && subsub === 'grant-retake' && method === 'PATCH') {
        const targetSchool = url.searchParams.get('school');
        const targetStudent = url.searchParams.get('studentId');
        if (!targetSchool && !targetStudent) return err('يلزم تحديد studentId أو school', 400, CORS);
        const updated = await grantRetakeForSchool(DB, { school: targetSchool, studentId: targetStudent });
        await logEvent(DB, {
          level: 'success', category: 'test-management',
          message: targetStudent ? `منح إعادة اختبار للطالب: ${targetStudent}` : `منح إعادة اختبار لكل مدرسة: ${targetSchool}`,
          user_role: 'dev', school: targetSchool || '',
        });
        return ok({ ok: true, updated }, 200, CORS);
      }

      // GET /api/dev/plans — list aptitude-test (اختبار القدرات) plans (optional ?school=X&studentId=X)
      if (sub === 'plans' && !subsub && method === 'GET') {
        const filterSchool = url.searchParams.get('school');
        const filterStudent = url.searchParams.get('studentId');
        let q = 'SELECT * FROM plans';
        const conds = [];
        const params = [];
        if (filterSchool) { conds.push('school = ?'); params.push(filterSchool); }
        if (filterStudent) { conds.push('student_id = ?'); params.push(filterStudent); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      // DELETE /api/dev/plans/:id — delete a single aptitude-test plan
      if (sub === 'plans' && subsub && subsub !== 'grant-retake' && method === 'DELETE') {
        const target = await DB.prepare('SELECT student_name, school FROM plans WHERE id = ?').bind(subsub).first();
        await DB.prepare('DELETE FROM plans WHERE id = ?').bind(subsub).run();
        await logEvent(DB, { level: 'warn', category: 'test-management', message: `حذف اختبار قدرات: ${target?.student_name || subsub}`, user_role: 'dev', school: target?.school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/dev/plans?studentId=X — delete all aptitude-test plans for one student
      // DELETE /api/dev/plans?school=X&confirm=RESET_SCHOOL_PLANS — delete all plans for a whole school
      if (sub === 'plans' && !subsub && method === 'DELETE') {
        const targetStudent = url.searchParams.get('studentId');
        const targetSchool = url.searchParams.get('school');
        if (targetStudent) {
          const { meta } = await DB.prepare('DELETE FROM plans WHERE student_id = ?').bind(targetStudent).run();
          await logEvent(DB, { level: 'warn', category: 'test-management', message: `حذف كل اختبارات القدرات للطالب: ${targetStudent}`, user_role: 'dev' });
          return ok({ ok: true, deleted: meta?.changes || 0 }, 200, CORS);
        }
        if (targetSchool) {
          if (url.searchParams.get('confirm') !== 'RESET_SCHOOL_PLANS') {
            return err('يتطلب تأكيد صريح لإعادة تعيين اختبارات القدرات للمدرسة كاملة', 400, CORS);
          }
          const { meta } = await DB.prepare('DELETE FROM plans WHERE school = ?').bind(targetSchool).run();
          await logEvent(DB, { level: 'warn', category: 'test-management', message: `حذف كل اختبارات القدرات لمدرسة: ${targetSchool}`, user_role: 'dev', school: targetSchool });
          return ok({ ok: true, deleted: meta?.changes || 0 }, 200, CORS);
        }
        return err('يلزم تحديد studentId أو school', 400, CORS);
      }

      // GET /api/dev/analytics — behavior analytics overview for the dashboard
      // Behavior analytics (speed/guessing/switching) was removed — this now only reports the
      // official score totals plus direct cheat-flag logs (no behavior_logs table anymore).
      if (sub === 'analytics' && method === 'GET') {
        const totals = await DB.prepare(
          `SELECT COUNT(*) as cnt, AVG(score) as avgScore FROM test_results WHERE subject = 'biology-g1'`
        ).first().catch(() => ({ cnt: 0, avgScore: null }));

        const suspiciousCount = await DB.prepare(
          `SELECT COUNT(*) as cnt FROM logs WHERE category = 'suspicious'`
        ).first().catch(() => ({ cnt: 0 }));

        const errorLogs = await DB.prepare(
          `SELECT * FROM logs WHERE level = 'error' ORDER BY created_at DESC LIMIT 50`
        ).all().catch(() => ({ results: [] }));

        const suspiciousLogs = await DB.prepare(
          `SELECT * FROM logs WHERE category = 'suspicious' ORDER BY created_at DESC LIMIT 50`
        ).all().catch(() => ({ results: [] }));

        return ok({
          totals: { testsTaken: totals?.cnt || 0, avgScore: totals?.avgScore ? Math.round(totals.avgScore) : null },
          suspiciousCount: suspiciousCount?.cnt || 0,
          errorLogs: errorLogs.results || [],
          suspiciousLogs: suspiciousLogs.results || [],
        }, 200, CORS);
      }

      // POST /api/dev/migrate — create chat & ticket tables
      if (sub === 'migrate' && method === 'POST') {
        await DB.prepare(`CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          school TEXT NOT NULL DEFAULT '',
          sender_type TEXT NOT NULL,
          body TEXT NOT NULL,
          is_read INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          school TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL,
          status TEXT DEFAULT 'open',
          created_at TEXT NOT NULL
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_replies (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          sender_type TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`).run();
        // Add recipient_admin_id column if not exists (idempotent)
        try { await DB.prepare("ALTER TABLE messages ADD COLUMN recipient_admin_id TEXT DEFAULT ''").run(); } catch {}
        // Add role column to admins if not exists
        try { await DB.prepare("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'").run(); } catch {}
        // One-time cleanup: behavior analytics (speed/guessing/switching) removed entirely
        try { await DB.prepare('DROP TABLE IF EXISTS attempt_logs').run(); } catch {}
        try { await DB.prepare('DROP TABLE IF EXISTS behavior_logs').run(); } catch {}
        return ok({ ok: true, tables: ['messages', 'tickets', 'ticket_replies'] }, 200, CORS);
      }
    }

    // ── DIRECTOR ENDPOINTS ───────────────────────────────────────────────────
    if (resource === 'director') {

      // Verify director via JWT — no sensitive code in URLs
      async function authDirector(targetSchool) {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return null;
        if (!['director','dev'].includes(claims.role)) return null;
        if (claims.role === 'dev') return claims;
        if (claims.school !== '*' && targetSchool && claims.school !== targetSchool) return null;
        return claims;
      }

      // GET /api/director/admins?school=X
      if (sub === 'admins' && method === 'GET') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const { results } = await DB.prepare(
          "SELECT id, name, code, role FROM admins WHERE school = ? ORDER BY name ASC"
        ).bind(school).all();
        return ok({ admins: results }, 200, CORS);
      }

      // POST /api/director/admins — add supervisor
      if (sub === 'admins' && method === 'POST') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const { name, code: newCode } = await request.json();
        if (!name || !newCode) return err('الاسم والرمز مطلوبان', 400, CORS);
        if (!/^\d{10}$/.test(newCode)) return err('الرمز يجب أن يكون 10 أرقام', 400, CORS);
        const adminSchool = dir.school === '*' ? school : dir.school;
        const aid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO admins (id, name, code, school, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(aid, name, newCode, adminSchool, 'admin', now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE')) return err('الرمز مسجّل مسبقاً', 409, CORS);
          throw e;
        }
        await logEvent(DB, { level: 'info', category: 'admin', message: `إضافة مشرف جديد: ${name}`, user_name: dir.name || '', user_role: dir.role, school: adminSchool });
        return ok({ admin: { id: aid, name, code: newCode, school: adminSchool, role: 'admin', created_at: now } }, 201, CORS);
      }

      // DELETE /api/director/admins/:id?school=X
      if (sub === 'admins' && subsub && method === 'DELETE') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const target = await DB.prepare('SELECT * FROM admins WHERE id = ?').bind(subsub).first();
        if (!target) return err('المشرف غير موجود', 404, CORS);
        if (target.role === 'director') return err('لا يمكن حذف مدير', 403, CORS);
        await DB.prepare('DELETE FROM admins WHERE id = ?').bind(subsub).run();
        await logEvent(DB, { level: 'warn', category: 'admin', message: `حذف مشرف: ${target.name}`, user_name: dir.name || '', user_role: dir.role, school: target.school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/director/seed-questions — upsert hardcoded questions (director auth)
      if (sub === 'seed-questions' && method === 'POST') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        let added = 0, updated = 0;
        for (const q of SEED_QUESTIONS) {
          if (existingNums.has(q.qnum)) {
            await DB.prepare(
              'UPDATE questions SET type=?,skill_id=?,text=?,opt1=?,opt2=?,opt3=?,opt4=?,ans=? WHERE qnum=?'
            ).bind(q.type, q.skill_id, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, q.qnum).run();
            updated++;
          } else {
            await DB.prepare(
              'INSERT INTO questions (id,qnum,type,skill_id,text,opt1,opt2,opt3,opt4,ans,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            ).bind(crypto.randomUUID(), q.qnum, q.type, q.skill_id, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, new Date().toISOString()).run();
            added++;
          }
        }
        return ok({ added, updated }, 200, CORS);
      }

      // PATCH /api/director/questions/:id?school=X — edit one question
      if (sub === 'questions' && subsub && method === 'PATCH') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const { qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans } = await request.json();
        await DB.prepare(
          'UPDATE questions SET qnum=?,type=?,skill_id=?,text=?,opt1=?,opt2=?,opt3=?,opt4=?,ans=? WHERE id=?'
        ).bind(qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, subsub).run();
        await logEvent(DB, { level: 'info', category: 'questions', message: `تعديل سؤال رقم ${qnum}`, user_name: dir.name || '', user_role: dir.role, school: school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/director/questions/:id?school=X — delete one question
      if (sub === 'questions' && subsub && method === 'DELETE') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        await DB.prepare('DELETE FROM questions WHERE id = ?').bind(subsub).run();
        await logEvent(DB, { level: 'warn', category: 'questions', message: `حذف سؤال`, user_name: dir.name || '', user_role: dir.role, school: school || '' });
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/director/questions — import questions (director auth)
      if (sub === 'questions' && method === 'POST') {
        const dir = await authDirector(school);
        const body = await request.json();
        if (!dir) return err('غير مصرح', 401, CORS);
        const { action = 'append', questions: rows } = body;
        if (!Array.isArray(rows) || !rows.length) return err('لا توجد أسئلة', 400, CORS);
        if (action === 'replace') await DB.prepare('DELETE FROM questions').run();
        const { results: existing } = await DB.prepare('SELECT qnum FROM questions').all();
        const existingNums = new Set(existing.map(r => r.qnum));
        const fresh = rows.filter(r => !existingNums.has(r.qnum));
        for (const q of fresh) {
          const qid = crypto.randomUUID();
          const now = new Date().toISOString();
          await DB.prepare(
            'INSERT INTO questions (id,qnum,type,skill_id,text,opt1,opt2,opt3,opt4,ans,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
          ).bind(qid, q.qnum, q.type, q.skillId, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, now).run();
        }
        await logEvent(DB, { level: 'info', category: 'questions', message: `استيراد أسئلة (${action === 'replace' ? 'استبدال' : 'إضافة'}) — ${fresh.length} مضافة`, user_name: dir.name || '', user_role: dir.role, school: school || '' });
        return ok({ added: fresh.length, skipped: rows.length - fresh.length }, 200, CORS);
      }
    }

    // ── MESSAGES ─────────────────────────────────────────────────────────────
    if (resource === 'messages') {
      // Defensive create — previously this table only existed if POST /api/dev/migrate
      // had been run once; on a deployment where that never happened, every query here
      // threw "no such table" and the support-admin messages panel looked permanently blank.
      // Only runs once per warm instance (see _messagesSchemaEnsured) — this resource
      // is polled every 30s per open tab, so re-running idempotent DDL on every call
      // was a wasted DB round-trip each time.
      if (!_messagesSchemaEnsured) {
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          school TEXT NOT NULL DEFAULT '',
          sender_type TEXT NOT NULL,
          body TEXT NOT NULL,
          is_read INTEGER DEFAULT 0,
          recipient_admin_id TEXT DEFAULT '',
          created_at TEXT NOT NULL
        )`).run(); } catch {}
        _messagesSchemaEnsured = true;
      }
      const isDevKeyMsg = authDev(request, env);
      const msgClaims = isDevKeyMsg ? null : await verifyToken(request, env, DB);
      if (!isDevKeyMsg && !msgClaims) return err('غير مصرح', 401, CORS);
      const isPrivileged = isDevKeyMsg || ['admin','director','dev','support'].includes(msgClaims.role);
      const msgIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

      // GET /api/messages/unread-student — student checks unread messages from admin
      if (sub === 'unread-student' && method === 'GET') {
        if (msgClaims?.role !== 'student') return err('غير مسموح', 403, CORS);
        if (!await rateLimit(DB, msgIp, 'msgs-unread', 30)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        const studentId = msgClaims.sub;
        const row = await DB.prepare(
          "SELECT COUNT(*) as count FROM messages WHERE student_id=? AND sender_type='admin' AND is_read=0"
        ).bind(studentId).first();
        return ok({ count: row?.count || 0 }, 200, CORS);
      }

      // GET /api/messages/unread — admin/director/dev only
      if (sub === 'unread' && method === 'GET') {
        if (!isPrivileged) return err('غير مسموح', 403, CORS);
        if (!await rateLimit(DB, msgIp, 'msgs-unread', 30)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        // Admins (not dev/super-director) are always scoped to their own school from JWT — never from URL param
        const scopedSchool = (msgClaims?.role !== 'dev' && msgClaims?.school && msgClaims.school !== '*')
          ? msgClaims.school : school;
        const adminId = url.searchParams.get('adminId') || '';
        let q, params;
        // EXISTS guard hides threads left behind by deleted students (no FK cascade in this schema)
        if (adminId) {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0 AND school=? AND recipient_admin_id=?
               AND EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school`;
          params = [scopedSchool, adminId];
        } else if (scopedSchool) {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0 AND school=?
               AND EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school`;
          params = [scopedSchool];
        } else {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0
               AND EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school`;
          params = [];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ counts: results }, 200, CORS);
      }

      // GET /api/messages/threads — admin: list students with conversations FOR THIS admin
      if (sub === 'threads' && method === 'GET') {
        if (!isPrivileged) return err('غير مسموح', 403, CORS);
        // Admins (not dev/super-director) are always scoped to their own school from JWT — never from URL param
        const scopedSchool = (msgClaims?.role !== 'dev' && msgClaims?.school && msgClaims.school !== '*')
          ? msgClaims.school : school;
        const adminId = url.searchParams.get('adminId') || '';
        let q, params;
        // EXISTS guard hides threads left behind by deleted students (no FK cascade in this schema)
        if (adminId && scopedSchool) {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id AND m2.recipient_admin_id=? ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages WHERE recipient_admin_id=? AND school=?
               AND EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school ORDER BY last_at DESC`;
          params = [adminId, adminId, scopedSchool];
        } else if (adminId) {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id AND m2.recipient_admin_id=? ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages WHERE recipient_admin_id=?
               AND EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school ORDER BY last_at DESC`;
          params = [adminId, adminId];
        } else if (scopedSchool) {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages WHERE school=?
               AND EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school ORDER BY last_at DESC`;
          params = [scopedSchool];
        } else {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages
               WHERE EXISTS (SELECT 1 FROM students s WHERE s.id = messages.student_id)
               GROUP BY student_id, student_name, school ORDER BY last_at DESC`;
          params = [];
        }
        const { results: threads } = await DB.prepare(q).bind(...params).all();
        return ok({ threads }, 200, CORS);
      }

      // GET /api/messages — students see only their own; admins scoped to their school
      if (method === 'GET') {
        const studentId = url.searchParams.get('studentId');
        const adminId   = url.searchParams.get('adminId') || '';
        if (!studentId) return err('معرّف الطالب مطلوب', 400, CORS);
        if (msgClaims?.role === 'student' && msgClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
        // Admins verify the student belongs to their school
        if (isPrivileged && msgClaims?.role !== 'dev' && msgClaims?.school && msgClaims.school !== '*') {
          const msgStudent = await DB.prepare('SELECT school FROM students WHERE id = ?').bind(studentId).first();
          if (!msgStudent || (msgStudent.school || '').trim() !== msgClaims.school.trim()) return err('غير مسموح', 403, CORS);
        }
        let q, params;
        if (adminId) {
          q = 'SELECT m.*, a.name as admin_name FROM messages m LEFT JOIN admins a ON m.recipient_admin_id = a.id WHERE m.student_id=? AND m.recipient_admin_id=? ORDER BY m.created_at ASC';
          params = [studentId, adminId];
        } else {
          q = 'SELECT m.*, a.name as admin_name FROM messages m LEFT JOIN admins a ON m.recipient_admin_id = a.id WHERE m.student_id=? ORDER BY m.created_at ASC';
          params = [studentId];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ messages: results }, 200, CORS);
      }

      // POST /api/messages — senderType derived from JWT; studentId trusted from JWT for students
      if (method === 'POST') {
        const { body: msgBody, school: bodySchool, recipientAdminId, studentId: targetStudentId } = await request.json();
        if (!msgBody) return err('حقول مفقودة', 400, CORS);
        if (msgBody.length > 2000) return err('الرسالة طويلة جداً', 400, CORS);
        let studentId, studentName, senderType;
        if (isPrivileged) {
          if (!targetStudentId) return err('معرّف الطالب مطلوب', 400, CORS);
          // Verify the target student belongs to this admin's school
          if (msgClaims?.role !== 'dev' && msgClaims?.school && msgClaims.school !== '*') {
            const targetSt = await DB.prepare('SELECT school, name FROM students WHERE id = ?').bind(targetStudentId).first();
            if (!targetSt || (targetSt.school || '').trim() !== msgClaims.school.trim()) return err('غير مسموح', 403, CORS);
            studentName = targetSt.name || '';
          } else {
            const targetSt = await DB.prepare('SELECT name FROM students WHERE id = ?').bind(targetStudentId).first();
            studentName = targetSt?.name || '';
          }
          studentId  = targetStudentId;
          senderType = 'admin';
        } else {
          studentId   = msgClaims.sub;
          studentName = msgClaims.name || '';
          senderType  = 'student';
        }
        // School always from JWT for known roles; never from user body
        const effectiveSchool = (msgClaims?.school && msgClaims.school !== '*') ? msgClaims.school : (school || bodySchool || '');
        const id  = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO messages (id, student_id, student_name, school, sender_type, body, is_read, recipient_admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
        ).bind(id, studentId, studentName, effectiveSchool, senderType, msgBody, recipientAdminId || '', now).run();
        await logEvent(DB, { level: 'info', category: 'message', message: senderType === 'admin' ? `رد المشرف على الطالب: ${studentName}` : `رسالة جديدة من الطالب: ${studentName}`, user_name: senderType === 'admin' ? (msgClaims?.name || '') : studentName, user_role: msgClaims?.role || 'dev', school: effectiveSchool });
        wsNotify(senderType === 'admin'
          ? { studentId, event: { type: 'new_message', from: 'admin' } }
          : { admins: true, school: effectiveSchool, event: { type: 'new_message', from: 'student', studentId, studentName, school: effectiveSchool } });
        return ok({ message: { id, student_id: studentId, student_name: studentName, school: effectiveSchool, sender_type: senderType, body: msgBody, is_read: 0, recipient_admin_id: recipientAdminId || '', created_at: now } }, 201, CORS);
      }

      // PATCH /api/messages/read
      if (sub === 'read' && method === 'PATCH') {
        const { studentId, readerType } = await request.json();
        if (msgClaims?.role === 'student' && msgClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
        // Admins can only mark messages read for students in their own school
        if (isPrivileged && msgClaims?.role !== 'dev' && msgClaims?.school && msgClaims.school !== '*') {
          const readSt = await DB.prepare('SELECT school FROM students WHERE id = ?').bind(studentId).first();
          if (!readSt || (readSt.school || '').trim() !== msgClaims.school.trim()) return err('غير مسموح', 403, CORS);
        }
        const senderType = readerType === 'admin' ? 'student' : 'admin';
        await DB.prepare(
          'UPDATE messages SET is_read=1 WHERE student_id=? AND sender_type=? AND is_read=0'
        ).bind(studentId, senderType).run();
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/messages/:id — staff-only (fixing an accidental send, etc.)
      if (sub && method === 'DELETE') {
        if (!isPrivileged) return err('غير مسموح', 403, CORS);
        const target = await DB.prepare('SELECT * FROM messages WHERE id = ?').bind(sub).first();
        if (!target) return err('غير موجود', 404, CORS);
        if (isPrivileged && msgClaims?.role !== 'dev' && msgClaims?.school && msgClaims.school !== '*') {
          if ((target.school || '').trim() !== msgClaims.school.trim()) return err('غير مسموح', 403, CORS);
        }
        await DB.prepare('DELETE FROM messages WHERE id = ?').bind(sub).run();
        await logEvent(DB, { level: 'warn', category: 'message', message: `حذف رسالة (${sub}) — الطالب: ${target.student_name}`, user_name: msgClaims?.name || 'dev', user_role: msgClaims?.role || 'dev', school: target.school || '' });
        wsNotify(target.sender_type === 'admin'
          ? { studentId: target.student_id, event: { type: 'message_deleted', id: sub } }
          : { admins: true, event: { type: 'message_deleted', id: sub, studentId: target.student_id } });
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── TICKETS ──────────────────────────────────────────────────────────────
    if (resource === 'tickets') {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
      // POST /api/tickets/guest — unauthenticated: lets someone without an
      // account (or who can't log into theirs) reach support directly from
      // the login screen, since the normal POST /api/tickets requires a JWT.
      if (sub === 'guest' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'ticket-guest', 5)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        try { await DB.prepare("ALTER TABLE tickets ADD COLUMN phone TEXT DEFAULT ''").run(); } catch {}
        const { name, phone, school: guestSchool, category, body: tkBody } = await request.json().catch(() => ({}));
        if (!name || !phone || !guestSchool || !tkBody) return err('حقول مفقودة', 400, CORS);
        if (tkBody.length > 3000) return err('النص طويل جداً', 400, CORS);
        // Same length caps already enforced client-side on the guest form.
        if (name.length > 100) return err('الاسم طويل جداً', 400, CORS);
        if (phone.length > 15) return err('رقم الجوال طويل جداً', 400, CORS);
        if (guestSchool.length > 120) return err('اسم المدرسة طويل جداً', 400, CORS);
        const studentId = 'guest-' + crypto.randomUUID();
        const countRow = await DB.prepare('SELECT COUNT(*) as c FROM tickets').first();
        const ticketNum = 'T-' + String(((countRow?.c) || 0) + 1).padStart(5, '0');
        const tid = crypto.randomUUID();
        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        const effectiveCat = category || 'مشكلة تسجيل دخول';
        const subject = `بدون حساب: ${effectiveCat}`;
        await DB.prepare(
          'INSERT INTO tickets (id, student_id, student_name, school, subject, status, category, priority, ticket_num, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, studentId, name, guestSchool, subject, 'open', effectiveCat, 'عالية', ticketNum, phone, now).run();
        await DB.prepare(
          'INSERT INTO ticket_replies (id, ticket_id, sender_type, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(rid, tid, 'student', tkBody, 1, now).run();
        await logEvent(DB, { level: 'info', category: 'ticket', message: `تذكرة دعم بدون حساب (${ticketNum})`, user_name: name, user_role: 'guest', school: guestSchool });
        notifyNewTicket(env, DB, { ticketId: tid, studentName: name, school: guestSchool, subject, description: tkBody });
        wsNotify({ admins: true, school: guestSchool, event: { type: 'new_ticket', ticketId: tid, studentName: name, school: guestSchool, subject } });
        return ok({ ticket: { id: tid, ticket_num: ticketNum } }, 201, CORS);
      }

      // Accept either JWT or X-Dev-Key (for dev panel)
      const _devAuth = authDev(request, env);
      const tkClaims = _devAuth ? { role: 'dev', sub: 'dev' } : await verifyToken(request, env, DB);
      if (!tkClaims) return err('غير مصرح', 401, CORS);
      const tkPrivileged = ['admin','director','dev','support'].includes(tkClaims.role);
      // Admins and directors (not dev/support, not super-director '*') are always scoped to their own school
      const tkSchoolScope = (['admin','director'].includes(tkClaims.role) && tkClaims.school && tkClaims.school !== '*')
        ? tkClaims.school : null;

      // Idempotent schema migrations — only run once per warm instance (see
      // _ticketsSchemaEnsured); this resource includes /tickets/unread, polled
      // every 30s per open tab, so re-running 6 ALTERs on every call wasted
      // 6 DB round-trips per poll for no benefit once the columns already exist.
      if (!_ticketsSchemaEnsured) {
        try { await DB.prepare("ALTER TABLE tickets ADD COLUMN category TEXT NOT NULL DEFAULT 'أخرى'").run(); } catch {}
        try { await DB.prepare("ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'متوسطة'").run(); } catch {}
        try { await DB.prepare("ALTER TABLE tickets ADD COLUMN ticket_num TEXT NOT NULL DEFAULT ''").run(); } catch {}
        try { await DB.prepare("ALTER TABLE tickets ADD COLUMN phone TEXT DEFAULT ''").run(); } catch {}
        try { await DB.prepare('ALTER TABLE tickets ADD COLUMN rating INTEGER DEFAULT 0').run(); } catch {}
        try { await DB.prepare('ALTER TABLE ticket_replies ADD COLUMN is_read INTEGER DEFAULT 0').run(); } catch {}
        _ticketsSchemaEnsured = true;
      }
      try { await DB.prepare('ALTER TABLE ticket_replies ADD COLUMN is_read INTEGER DEFAULT 0').run(); } catch {}

      // GET /api/tickets/stats — admin only
      if (method === 'GET' && sub === 'stats') {
        if (!tkPrivileged) return err('غير مسموح', 403, CORS);
        const schoolCond = tkSchoolScope ? ' AND school=?' : '';
        const schoolArgs = tkSchoolScope ? [tkSchoolScope] : [];
        const [total, openC, progC, resolvedC, urgentC] = await Promise.all([
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE 1=1${schoolCond}`).bind(...schoolArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status='open'${schoolCond}`).bind(...schoolArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status='in_progress'${schoolCond}`).bind(...schoolArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status='resolved'${schoolCond}`).bind(...schoolArgs).first(),
          DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE priority='عالية' AND status!='resolved'${schoolCond}`).bind(...schoolArgs).first(),
        ]);
        const today = new Date().toISOString().split('T')[0];
        const todayC = await DB.prepare(`SELECT COUNT(*) as c FROM tickets WHERE created_at LIKE ?${schoolCond}`).bind(today + '%', ...schoolArgs).first();
        const { results: topCats } = await DB.prepare(`SELECT category, COUNT(*) as cnt FROM tickets WHERE 1=1${schoolCond} GROUP BY category ORDER BY cnt DESC LIMIT 3`).bind(...schoolArgs).all();
        return ok({ total: total?.c||0, open: openC?.c||0, inProgress: progC?.c||0, resolved: resolvedC?.c||0, urgent: urgentC?.c||0, today: todayC?.c||0, topCategories: topCats }, 200, CORS);
      }

      // GET /api/tickets/unread — students see only their own
      if (method === 'GET' && sub === 'unread') {
        const studentId = url.searchParams.get('studentId');
        if (!studentId) return err('معرّف الطالب مفقود', 400, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
        if (!await rateLimit(DB, ip, 'tickets-unread', 30)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        const row = await DB.prepare(
          "SELECT COUNT(*) as count FROM ticket_replies tr JOIN tickets t ON tr.ticket_id=t.id WHERE t.student_id=? AND tr.sender_type='admin' AND tr.is_read=0"
        ).bind(studentId).first();
        return ok({ count: row?.count || 0 }, 200, CORS);
      }

      // GET /api/tickets — students see only their own
      if (method === 'GET' && !sub) {
        const studentId = url.searchParams.get('studentId');
        let q, params;
        if (studentId) {
          if (tkClaims.role === 'student' && tkClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
          q = `SELECT t.*,
            (SELECT COUNT(*) FROM ticket_replies tr WHERE tr.ticket_id=t.id AND tr.sender_type='admin' AND tr.is_read=0) as unread_count
            FROM tickets t WHERE t.student_id=? ORDER BY t.created_at DESC`;
          params = [studentId];
        } else {
          if (!tkPrivileged) return err('غير مسموح', 403, CORS);
          // Admins/directors always scoped to their school; dev/support may filter by ?school=
          const tkSchool = tkSchoolScope || school || null;
          q = tkSchool
            ? 'SELECT * FROM tickets WHERE school=? ORDER BY created_at DESC'
            : 'SELECT * FROM tickets ORDER BY created_at DESC';
          params = tkSchool ? [tkSchool] : [];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ tickets: results }, 200, CORS);
      }

      // GET /api/tickets/:id — students can only see their own; admins scoped to school
      if (method === 'GET' && sub && !subsub) {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('غير موجود', 404, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== ticket.student_id) return err('غير مسموح', 403, CORS);
        if (tkSchoolScope && ticket.school !== tkSchoolScope) return err('غير مسموح', 403, CORS);
        const { results: replies } = await DB.prepare(
          'SELECT * FROM ticket_replies WHERE ticket_id=? ORDER BY created_at ASC'
        ).bind(sub).all();
        return ok({ ticket, replies }, 200, CORS);
      }

      // POST /api/tickets — use JWT claims for student identity
      if (method === 'POST' && !sub) {
        const { subject, body: tkBody, school: bodySchool, category, priority, phone: bodyPhone } = await request.json();
        if (!subject || !tkBody) return err('حقول مفقودة', 400, CORS);
        if (tkBody.length > 3000) return err('النص طويل جداً', 400, CORS);
        // Same length cap already enforced client-side on the ticket subject field.
        if (subject.length > 120) return err('الموضوع طويل جداً', 400, CORS);
        const studentId = tkClaims.sub;
        const studentName = tkClaims.name || '';
        const effectiveSchool = tkClaims.school || school || bodySchool || '';

        // A student with no phone on file must register one before they can
        // raise a support ticket — otherwise support has no way to reach them
        // outside the platform if their account access itself is the problem.
        let phone = '';
        if (tkClaims.role === 'student') {
          const stu = await DB.prepare('SELECT phone FROM students WHERE id = ?').bind(studentId).first();
          phone = stu?.phone || '';
          if (!phone) {
            const candidate = String(bodyPhone || '').trim();
            if (!/^05\d{8}$/.test(candidate)) return err('يجب تسجيل رقم جوالك أولاً (05XXXXXXXX) قبل رفع طلب دعم', 400, CORS);
            phone = candidate;
            await DB.prepare('UPDATE students SET phone = ? WHERE id = ?').bind(phone, studentId).run();
          }
        }

        const countRow = await DB.prepare('SELECT COUNT(*) as c FROM tickets').first();
        const ticketNum = 'T-' + String(((countRow?.c) || 0) + 1).padStart(5, '0');
        const tid = crypto.randomUUID();
        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO tickets (id, student_id, student_name, school, subject, status, category, priority, ticket_num, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, studentId, studentName, effectiveSchool, subject, 'open', category||'أخرى', priority||'متوسطة', ticketNum, phone, now).run();
        await DB.prepare(
          'INSERT INTO ticket_replies (id, ticket_id, sender_type, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(rid, tid, 'student', tkBody, 1, now).run();
        await logEvent(DB, { level: 'info', category: 'ticket', message: `تذكرة دعم جديدة (${ticketNum}): ${subject}`, user_name: studentName, user_role: 'student', school: effectiveSchool });
        notifyNewTicket(env, DB, { ticketId: tid, studentName, school: effectiveSchool, subject, description: tkBody });
        wsNotify({ admins: true, school: effectiveSchool, event: { type: 'new_ticket', ticketId: tid, studentName, school: effectiveSchool, subject } });
        return ok({ ticket: { id: tid, subject, status: 'open', category: category||'أخرى', priority: priority||'متوسطة', ticket_num: ticketNum, created_at: now } }, 201, CORS);
      }

      // POST /api/tickets/:id/read
      if (method === 'POST' && sub && subsub === 'read') {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('غير موجود', 404, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== ticket.student_id) return err('غير مسموح', 403, CORS);
        if (tkSchoolScope && ticket.school !== tkSchoolScope) return err('غير مسموح', 403, CORS);
        const { readerType } = await request.json();
        const markSender = readerType === 'student' ? 'admin' : 'student';
        await DB.prepare("UPDATE ticket_replies SET is_read=1 WHERE ticket_id=? AND sender_type=?").bind(sub, markSender).run();
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/tickets/:id/reply
      if (method === 'POST' && sub && subsub === 'reply') {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('غير موجود', 404, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== ticket.student_id) return err('غير مسموح', 403, CORS);
        if (tkSchoolScope && ticket.school !== tkSchoolScope) return err('غير مسموح', 403, CORS);
        const { body: replyBody } = await request.json();
        if (!replyBody) return err('حقول مفقودة', 400, CORS);
        if (replyBody.length > 3000) return err('النص طويل جداً', 400, CORS);
        const senderType = tkPrivileged ? 'admin' : 'student';
        const id  = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO ticket_replies (id, ticket_id, sender_type, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(id, sub, senderType, replyBody, senderType === 'admin' ? 0 : 1, now).run();
        if (senderType === 'admin') {
          await DB.prepare("UPDATE tickets SET status='in_progress' WHERE id=? AND status='open'").bind(sub).run();
        }
        await logEvent(DB, { level: 'info', category: 'ticket', message: `رد جديد على تذكرة (${ticket.ticket_num || sub}) من ${senderType === 'admin' ? 'المشرف' : 'الطالب'}`, user_name: tkClaims.name || '', user_role: tkClaims.role, school: ticket.school || '' });
        wsNotify(senderType === 'admin'
          ? { studentId: ticket.student_id, event: { type: 'ticket_reply', from: 'admin', ticketId: sub } }
          : { admins: true, school: ticket.school, event: { type: 'ticket_reply', from: 'student', ticketId: sub, studentName: ticket.student_name, school: ticket.school } });
        return ok({ reply: { id, ticket_id: sub, sender_type: senderType, body: replyBody, created_at: now } }, 201, CORS);
      }

      // PATCH /api/tickets/:id — status/rating
      if (method === 'PATCH' && sub && !subsub) {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('غير موجود', 404, CORS);
        const body = await request.json();
        if (body.rating !== undefined) {
          if (tkClaims.role === 'student' && tkClaims.sub !== ticket.student_id) return err('غير مسموح', 403, CORS);
          await DB.prepare('UPDATE tickets SET rating=? WHERE id=?').bind(body.rating, sub).run();
          const t = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
          return ok({ ticket: t }, 200, CORS);
        }
        if (!tkPrivileged) return err('غير مسموح', 403, CORS);
        if (tkSchoolScope && ticket.school !== tkSchoolScope) return err('غير مسموح', 403, CORS);
        const { status } = body;
        if (!['open','in_progress','resolved','rejected'].includes(status)) return err('حالة غير صالحة', 400, CORS);
        await DB.prepare('UPDATE tickets SET status=? WHERE id=?').bind(status, sub).run();
        const t = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        return ok({ ticket: t }, 200, CORS);
      }
    }

    // ── BROADCASTS ───────────────────────────────────────────────────────────
    if (resource === 'broadcasts') {
      try {
        await DB.prepare(`CREATE TABLE IF NOT EXISTS broadcasts (
          id TEXT PRIMARY KEY, school TEXT NOT NULL, admin_id TEXT NOT NULL,
          admin_name TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS broadcast_dismissals (
          broadcast_id TEXT NOT NULL, student_id TEXT NOT NULL,
          PRIMARY KEY (broadcast_id, student_id)
        )`).run();
        await DB.prepare(`CREATE TABLE IF NOT EXISTS broadcast_targets (
          broadcast_id TEXT NOT NULL, student_id TEXT NOT NULL,
          PRIMARY KEY (broadcast_id, student_id)
        )`).run();
      } catch {}

      // GET /api/broadcasts/all — dev only: all broadcasts across schools with stats
      if (sub === 'all' && method === 'GET') {
        if (!authDev(request, env)) return err('غير مصرح', 401, CORS);
        const sc = school || '';
        const { results } = sc
          ? await DB.prepare(`SELECT b.*,
              (SELECT COUNT(*) FROM broadcast_dismissals d WHERE d.broadcast_id = b.id) AS seen_count,
              (SELECT COUNT(*) FROM students s WHERE s.school = b.school) AS total_students
            FROM broadcasts b WHERE b.school = ? ORDER BY b.created_at DESC LIMIT 100`).bind(sc).all()
          : await DB.prepare(`SELECT b.*,
              (SELECT COUNT(*) FROM broadcast_dismissals d WHERE d.broadcast_id = b.id) AS seen_count,
              (SELECT COUNT(*) FROM students s WHERE s.school = b.school) AS total_students
            FROM broadcasts b ORDER BY b.created_at DESC LIMIT 100`).all();
        return ok({ broadcasts: results }, 200, CORS);
      }

      // POST /api/broadcasts — admin creates broadcast. Optional studentIds: when
      // present, the broadcast is only visible to those students (still school-scoped);
      // omitted/empty means visible to the whole school as before.
      if (!sub && method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const { message, studentIds } = await request.json();
        if (!message || message.trim().length < 3) return err('الرسالة قصيرة جداً', 400, CORS);
        if (message.length > 500) return err('الرسالة طويلة جداً (الحد 500 حرف)', 400, CORS);
        const broadcastSchool = (claims.school && claims.school !== '*') ? claims.school : school;
        if (!broadcastSchool) return err('المدرسة مطلوبة', 400, CORS);
        const targetIds = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
        if (targetIds.length) {
          const placeholders = targetIds.map(() => '?').join(',');
          const { results: validTargets } = await DB.prepare(
            `SELECT id FROM students WHERE id IN (${placeholders}) AND school = ?`
          ).bind(...targetIds, broadcastSchool).all();
          if (validTargets.length !== targetIds.length) return err('بعض الطلاب المحددين غير صالحين', 400, CORS);
        }
        const bid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare('INSERT INTO broadcasts (id, school, admin_id, admin_name, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(bid, broadcastSchool, claims.sub || '', claims.name || 'المشرف', message.trim(), now).run();
        for (const stId of targetIds) {
          await DB.prepare('INSERT INTO broadcast_targets (broadcast_id, student_id) VALUES (?, ?)').bind(bid, stId).run();
        }
        await logEvent(DB, { level: 'info', category: 'broadcast', message: `رسالة جماعية جديدة${targetIds.length ? ` (${targetIds.length} طالب محدد)` : ''}: ${message.trim().slice(0, 80)}`, user_name: claims.name || '', user_role: claims.role, school: broadcastSchool });
        return ok({ broadcast: { id: bid, admin_name: claims.name, message: message.trim(), created_at: now, targetCount: targetIds.length } }, 201, CORS);
      }

      // GET /api/broadcasts/active?school=X — student gets unseen broadcasts
      if (sub === 'active' && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return err('غير مصرح', 401, CORS);
        if (claims.role === 'student') {
          // Students: always use their own school from JWT — never trust URL param
          const sc = claims.school || '';
          if (!sc) return ok({ broadcasts: [] }, 200, CORS);
          const { results } = await DB.prepare(`
            SELECT b.* FROM broadcasts b
            WHERE b.school = ? AND NOT EXISTS (
              SELECT 1 FROM broadcast_dismissals d WHERE d.broadcast_id = b.id AND d.student_id = ?
            ) AND (
              NOT EXISTS (SELECT 1 FROM broadcast_targets t WHERE t.broadcast_id = b.id)
              OR EXISTS (SELECT 1 FROM broadcast_targets t WHERE t.broadcast_id = b.id AND t.student_id = ?)
            )
            ORDER BY b.created_at DESC LIMIT 5
          `).bind(sc, claims.sub, claims.sub).all();
          return ok({ broadcasts: results }, 200, CORS);
        } else {
          // Admins/directors: scoped to their own school (dev can pass school param)
          const sc = (claims.school && claims.school !== '*') ? claims.school : (school || '');
          if (!sc) return ok({ broadcasts: [] }, 200, CORS);
          const { results } = await DB.prepare(`
            SELECT b.*,
              (SELECT COUNT(*) FROM broadcast_dismissals d WHERE d.broadcast_id = b.id) AS seen_count,
              (SELECT COUNT(*) FROM students s WHERE s.school = b.school) AS total_students
            FROM broadcasts b
            WHERE b.school = ?
            ORDER BY b.created_at DESC LIMIT 30
          `).bind(sc).all();
          return ok({ broadcasts: results }, 200, CORS);
        }
      }

      // GET /api/broadcasts/:id/viewers — admin: list students who saw this broadcast
      if (sub && subsub === 'viewers' && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const bc = await DB.prepare('SELECT school FROM broadcasts WHERE id = ?').bind(sub).first();
        if (!bc) return err('الرسالة غير موجودة', 404, CORS);
        if (claims.role !== 'dev') {
          const effectiveSchool = claims.school && claims.school !== '*' ? claims.school : school;
          if (!effectiveSchool || bc.school !== effectiveSchool) return err('غير مصرح', 401, CORS);
        }
        const { results: viewers } = await DB.prepare(`
          SELECT s.name, s.code, d.created_at AS seen_at
          FROM broadcast_dismissals d
          JOIN students s ON s.id = d.student_id
          WHERE d.broadcast_id = ?
          ORDER BY d.created_at DESC
        `).bind(sub).all();
        return ok({ viewers }, 200, CORS);
      }

      // POST /api/broadcasts/:id/dismiss — student dismisses broadcast
      if (sub && subsub === 'dismiss' && method === 'POST') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        try { await DB.prepare('INSERT INTO broadcast_dismissals (broadcast_id, student_id) VALUES (?, ?) ON CONFLICT (broadcast_id, student_id) DO NOTHING').bind(sub, claims.sub).run(); } catch {}
        return ok({ ok: true }, 200, CORS);
      }

      // PATCH /api/broadcasts/:id — edit message text (dev key or scoped admin JWT)
      if (sub && !subsub && method === 'PATCH') {
        const isDevKey = authDev(request, env);
        const claims = isDevKey ? null : await verifyToken(request, env, DB);
        if (!isDevKey && (!claims || !['admin','director'].includes(claims.role))) return err('غير مصرح', 401, CORS);
        const body = await request.json();
        const message = (body.message || '').trim();
        if (!message) return err('النص مطلوب', 400, CORS);
        if (isDevKey) {
          const res = await DB.prepare('UPDATE broadcasts SET message = ? WHERE id = ?').bind(message, sub).run();
          if (!res.meta?.changes) return err('الرسالة غير موجودة', 404, CORS);
        } else {
          const res = await DB.prepare('UPDATE broadcasts SET message = ? WHERE id = ? AND school = ?').bind(message, sub, claims.school).run();
          if (!res.meta?.changes) return err('غير موجود أو غير مصرح', 404, CORS);
        }
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/broadcasts/:id — admin deletes broadcast (scoped to own school)
      if (sub && !subsub && method === 'DELETE') {
        const claims = await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        if (claims.role === 'dev') {
          await DB.prepare('DELETE FROM broadcasts WHERE id = ?').bind(sub).run();
        } else {
          // Admin/director can only delete broadcasts from their own school
          const res = await DB.prepare('DELETE FROM broadcasts WHERE id = ? AND school = ?').bind(sub, claims.school).run();
          if (!res.meta?.changes) return err('غير موجود أو غير مصرح', 404, CORS);
        }
        await logEvent(DB, { level: 'warn', category: 'broadcast', message: 'حذف رسالة جماعية', user_name: claims.name || '', user_role: claims.role, school: claims.school || '' });
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── GENERAL TESTS (6 stand-alone skill tests, taken from the support-plan screen) ──
    if (resource === 'general-tests') {
      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS general_test_meta (
        test_num   INTEGER PRIMARY KEY,
        skill_id   TEXT NOT NULL DEFAULT '',
        skill_name TEXT NOT NULL DEFAULT '',
        title      TEXT NOT NULL DEFAULT ''
      )`).run(); } catch {}
      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS general_tests (
        id         TEXT PRIMARY KEY,
        test_num   INTEGER NOT NULL,
        qnum       INTEGER NOT NULL,
        text       TEXT NOT NULL,
        opt1       TEXT NOT NULL, opt2 TEXT NOT NULL, opt3 TEXT NOT NULL, opt4 TEXT NOT NULL,
        ans        INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (now()::text)
      )`).run(); } catch {}
      try { await DB.prepare("ALTER TABLE general_tests ADD COLUMN img_url TEXT DEFAULT ''").run(); } catch {}
      try { await DB.prepare("ALTER TABLE general_tests ADD COLUMN skill_id TEXT DEFAULT ''").run(); } catch {}
      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS general_test_results (
        id           TEXT PRIMARY KEY,
        student_id   TEXT NOT NULL,
        student_name TEXT NOT NULL,
        school       TEXT NOT NULL DEFAULT '',
        test_num     INTEGER NOT NULL,
        score        INTEGER NOT NULL,
        correct      INTEGER NOT NULL,
        total        INTEGER NOT NULL,
        is_trial     INTEGER NOT NULL DEFAULT 0,
        answers      TEXT NOT NULL DEFAULT '[]',
        created_at   TEXT NOT NULL DEFAULT (now()::text)
      )`).run(); } catch {}

      // Seed the 6 placeholder test slots once — real skill linkage/title/questions are
      // filled in later via PATCH .../:num and POST .../:num/questions.
      const gtMetaCheck = await DB.prepare('SELECT COUNT(*) as c FROM general_test_meta').first();
      if (!gtMetaCheck || Number(gtMetaCheck.c) === 0) {
        const seedStmt = DB.prepare('INSERT INTO general_test_meta (test_num, skill_id, skill_name, title) VALUES (?, ?, ?, ?) ON CONFLICT (test_num) DO NOTHING');
        for (let n = 1; n <= 6; n++) await seedStmt.bind(n, '', '', `اختبار عام رقم ${n}`).run();
      }

      // Content for test #1 — approved question bank (R-01), quantitative section.
      // The verbal section is pending and will be appended once authored; each
      // question carries skill_id (q1-q5) matching SKILL_META above.
      await DB.prepare(
        "UPDATE general_test_meta SET skill_id = 'mix1', skill_name = 'لفظي وكمي', title = 'اختبار محاكي رقم 1' WHERE test_num = 1"
      ).run();
      const gt1Check = await DB.prepare('SELECT COUNT(*) as c FROM general_tests WHERE test_num = 1').first();
      if (!gt1Check || Number(gt1Check.c) !== 50) {
        await DB.prepare('DELETE FROM general_tests WHERE test_num = 1').run();
        // Verbal section (v1-v5, restored from the prior trial set) + approved
        // quantitative bank (R-01, Question_ID kept in comments for traceability).
        const GT1_SEED = [
          // ── v4: التناظر اللفظي ──
          {qnum:1,skill:'v4',text:'الكعبة : المطاف',opt1:'الحجر الأسود : المقام',opt2:'الملابس : القماش',opt3:'البيت : السور',opt4:'الوردة : البستان',ans:2},
          {qnum:2,skill:'v4',text:'ضجيج : محرك',opt1:'مصباح : ضوء',opt2:'ماء : سراب',opt3:'سراب : صحراء',opt4:'مطر : سحاب',ans:0},
          {qnum:3,skill:'v4',text:'مال : بنون',opt1:'إقليم : مكان',opt2:'كحل : حناء',opt3:'قيادة : قانون',opt4:'فجر : ظلام',ans:1},
          {qnum:4,skill:'v4',text:'شرى : باع',opt1:'رطب : تمر',opt2:'غاب : حضر',opt3:'فرح : سرور',opt4:'قدم : ذهب',ans:1},
          {qnum:5,skill:'v4',text:'جريمة : سرقة',opt1:'تمساح : برمائي',opt2:'دودة : حشرة',opt3:'كلمة : فعل',opt4:'غصن : شجرة',ans:0},
          // ── v5: إكمال الجمل ──
          {qnum:6,skill:'v5',text:'إن الله إذا أراد بقوم ....... جعل فيهم الجدل ومنع عنهم .......',opt1:'سوءاً - العمل',opt2:'خيراً - العمل',opt3:'حباً - التفاؤل',opt4:'كرهاً - الغبن',ans:0},
          {qnum:7,skill:'v5',text:'عثرة ....... أسلم من زلة .......',opt1:'العلم - العقل',opt2:'القدم - اللسان',opt3:'الماضي - الحاضر',opt4:'الصديق - العدو',ans:1},
          {qnum:8,skill:'v5',text:'إياك وفضول الكلام فإنه يظهر من عيوبك ما ....... ويحرك عليك من أعدائك ما .......',opt1:'بطن - سكن',opt2:'ظهر - وقع',opt3:'خفي - علم',opt4:'شهد - وضح',ans:2},
          {qnum:9,skill:'v5',text:'إن طول ....... في أي مهنة يقتل روح المبادرة ويرسخ .......',opt1:'العمل - الموهبة',opt2:'الموضوع - التكرار',opt3:'الممارسة - النمطية',opt4:'المسافة - التبعية',ans:2},
          {qnum:10,skill:'v5',text:'إذا أردت أن ....... المودة عليك أن ....... الطرف عن الزلات',opt1:'تستمر - تحفظ',opt2:'تدوم - تغض',opt3:'تتزايد - تترك',opt4:'تبقى - تبعد',ans:1},
          // ── v1: الاستيعاب القرائي ──
          {qnum:11,skill:'v1',text:'اقرأ: "ما يميز القائد الفذ إلهام الآخرين لعمل الأفضل وللوصول إلى الأحلام والآمال ومساعدتهم على فعل ذلك، لذلك تراه يتحلى بالشجاعة والإقدام حينما يجبن الآخرون." يمكن أن نستبدل كلمة "الفذ" بكل الكلمات ما عدا:',opt1:'المميز',opt2:'الملهم',opt3:'الخامل',opt4:'الفريد',ans:2},
          {qnum:12,skill:'v1',text:'من النص السابق (القائد الفذ)، يمكن أن نبدأ النص ب:',opt1:'لكن',opt2:'لعل',opt3:'حيث',opt4:'ليت',ans:2},
          {qnum:13,skill:'v1',text:'اقرأ: "يوم العدل على الظالم أشد من يوم الجور على المظلوم." من النص السابق، ما فائدة التضاد بين الظالم والمظلوم؟',opt1:'تفسير المعنى',opt2:'تحليل المعنى',opt3:'بيان المعنى',opt4:'تقوية المعنى',ans:3},
          {qnum:14,skill:'v1',text:'من النص السابق (العدل والظلم)، يميل النص إلى:',opt1:'المقارنة',opt2:'المصارحة',opt3:'التكرار',opt4:'التحليل',ans:0},
          {qnum:15,skill:'v1',text:'اقرأ: "إن معرفة صقل المواهب يحتاج إلى أن نعرف أكثر عن مجالاتها وإجراء التجارب والاستعانة بأهل الخبرة والدراية واستشارتهم لتقويم التجربة وتحسين الموهبة." الترتيب الصحيح لتنمية الموهبة:',opt1:'معرفة / تجربة / استعانة (تقويم) / تحسين',opt2:'تجربة / استعانة / تحسين / معرفة',opt3:'استعانة / معرفة / تحسين / اطلاع',opt4:'تحسين / معرفة / تجربة / استعانة',ans:0},
          // ── v2: الخطأ السياقي ──
          {qnum:16,skill:'v2',text:'العواصف الرخوة تحطم الأشجار الضخمة لكنها لا تؤثر في العيدان الخضراء التي تنحني لها',opt1:'الرخوة',opt2:'الأشجار',opt3:'تؤثر',opt4:'العيدان',ans:0},
          {qnum:17,skill:'v2',text:'إياك أن تكثر الطلبات الشخصية من أصدقائك فيكرهون غيابك',opt1:'تكثر',opt2:'فيكرهون',opt3:'الشخصية',opt4:'غيابك',ans:3},
          {qnum:18,skill:'v2',text:'من عوّد نفسه على البذل زاد شغفه للمال وقلّ إحسانه للناس',opt1:'البذل',opt2:'زاد',opt3:'قلّ',opt4:'إحسانه',ans:1},
          {qnum:19,skill:'v2',text:'إن كنت تريد النجاح فاذهب مع من يحبون الفوز، وإن لم تستطع فاذهب مع من يرغبون الهزيمة',opt1:'النجاح',opt2:'يحبون',opt3:'الفوز',opt4:'يرغبون',ans:3},
          {qnum:20,skill:'v2',text:'الجمال الحقيقي هو الذي لا يرى ولكن يظهر في تقاسيم الوجه وفلتات اللسان وما تخفيه تصرفاتك',opt1:'الحقيقي',opt2:'الوجه',opt3:'اللسان',opt4:'تخفيه',ans:3},
          // ── v3: المفردة الشاذة ──
          {qnum:21,skill:'v3',text:'حدد المفردة الشاذة في الكلمات التالية:',opt1:'ترح',opt2:'سرور',opt3:'حبور',opt4:'سعادة',ans:0},
          {qnum:22,skill:'v3',text:'حدد المفردة الشاذة في الكلمات التالية:',opt1:'الغيبة',opt2:'النميمة',opt3:'الخذلان',opt4:'البهتان',ans:2},
          {qnum:23,skill:'v3',text:'حدد المفردة الشاذة في الكلمات التالية:',opt1:'قراءة',opt2:'نسخ',opt3:'كتابة',opt4:'رسم',ans:0},
          {qnum:24,skill:'v3',text:'حدد المفردة الشاذة في الكلمات التالية:',opt1:'تلفاز',opt2:'جوال',opt3:'كاميرا',opt4:'حاسوب',ans:2},
          {qnum:25,skill:'v3',text:'حدد المفردة الشاذة في الكلمات التالية:',opt1:'سكر',opt2:'نعناع',opt3:'جرجير',opt4:'زنجبيل',ans:0},
          // ── q1: الحساب ──
          {qnum:26,skill:'q1',text:'اشترى تاجر بضاعة بمبلغ 800 ريال، ثم باعها بربح مقداره 15% من سعر الشراء. فما سعر البيع؟',opt1:'900',opt2:'920',opt3:'940',opt4:'960',ans:1}, // QB-AR-001
          {qnum:27,skill:'q1',text:'متوسط أربعة أعداد هو 18. إذا كانت ثلاثة منها هي: 12، 20، 22، فما العدد الرابع؟',opt1:'16',opt2:'18',opt3:'20',opt4:'24',ans:1}, // QB-AR-002
          {qnum:28,skill:'q1',text:'إذا كان (3/5) مبلغ يساوي 240 ريالًا، فما قيمة المبلغ كاملًا؟',opt1:'360',opt2:'380',opt3:'400',opt4:'420',ans:2}, // QB-AR-003
          {qnum:29,skill:'q1',text:'قطع سائق مسافة 180 كم خلال 3 ساعات بسرعة ثابتة. فإذا حافظ على السرعة نفسها، فكم يقطع خلال ساعتين ونصف؟',opt1:'120',opt2:'140',opt3:'150',opt4:'160',ans:2}, // QB-AR-004
          {qnum:30,skill:'q1',text:'إذا كان العامل (أ) ينجز عملاً في 12 يومًا، والعامل (ب) ينجزه في 18 يومًا، فكم يومًا يحتاجان إذا عملا معًا بالمعدل نفسه؟',opt1:'6.2',opt2:'7.2',opt3:'8',opt4:'9',ans:1}, // QB-AR-005
          // ── q2: الجبر ──
          {qnum:31,skill:'q2',text:'إذا كان 5س − 15 = 35، فإن قيمة س تساوي:',opt1:'8',opt2:'9',opt3:'10',opt4:'11',ans:2}, // QB-AL-001
          {qnum:32,skill:'q2',text:'قيمة 3(2س + 4) − 2(س − 1) تساوي:',opt1:'4س + 10',opt2:'5س + 12',opt3:'4س + 14',opt4:'6س + 10',ans:2}, // QB-AL-002
          {qnum:33,skill:'q2',text:'إذا كان س : ص = 4 : 7 وكان س = 20، فإن قيمة ص هي:',opt1:'28',opt2:'30',opt3:'35',opt4:'40',ans:2}, // QB-AL-003
          {qnum:34,skill:'q2',text:'إذا كان 2^5 ÷ 2^2 فإن الناتج يساوي:',opt1:'4',opt2:'6',opt3:'8',opt4:'16',ans:2}, // QB-AL-004
          {qnum:35,skill:'q2',text:'يزيد عمر أحمد على عمر أخيه بـ 6 سنوات، ومجموع عمريهما 34 سنة. كم عمر أحمد؟',opt1:'14',opt2:'18',opt3:'20',opt4:'22',ans:2}, // QB-AL-005
          // ── q3: الهندسة ──
          {qnum:36,skill:'q3',text:'مستطيل طوله 14 سم وعرضه 9 سم. فما مساحته؟',opt1:'46',opt2:'92',opt3:'126',opt4:'138',ans:2}, // QB-GE-001
          {qnum:37,skill:'q3',text:'مثلث أطوال أضلاعه 8 سم، 11 سم، 13 سم. فما محيطه؟',opt1:'30',opt2:'31',opt3:'32',opt4:'33',ans:2}, // QB-GE-002
          {qnum:38,skill:'q3',text:'دائرة نصف قطرها 7 سم. إذا اعتُمد π = (22/7)، فما مساحة الدائرة؟',opt1:'144',opt2:'154',opt3:'164',opt4:'176',ans:1}, // QB-GE-003
          {qnum:39,skill:'q3',text:'مثلث قائم الزاوية طولا ضلعيه القائمين 9 سم و12 سم. فما طول الوتر؟',opt1:'13',opt2:'14',opt3:'15',opt4:'16',ans:2}, // QB-GE-004
          {qnum:40,skill:'q3',text:'مثلثان متشابهان، معامل التشابه بينهما (3/5). إذا كان طول ضلع في المثلث الأكبر يساوي 30 سم، فما طول الضلع المناظر له في المثلث الأصغر؟',opt1:'16',opt2:'18',opt3:'20',opt4:'24',ans:1}, // QB-GE-005
          // ── q4: المقارنات الكمية ──
          {qnum:41,skill:'q4',text:'الكمية (أ): 18 × 4 — الكمية (ب): 24 × 3',opt1:'الكمية (أ) أكبر',opt2:'الكمية (ب) أكبر',opt3:'الكميتان متساويتان',opt4:'لا يمكن تحديد العلاقة',ans:2}, // QB-QC-001
          {qnum:42,skill:'q4',text:'الكمية (أ): (5/8) — الكمية (ب): (3/4)',opt1:'الكمية (أ) أكبر',opt2:'الكمية (ب) أكبر',opt3:'الكميتان متساويتان',opt4:'لا يمكن تحديد العلاقة',ans:1}, // QB-QC-002
          {qnum:43,skill:'q4',text:'الكمية (أ): √144 — الكمية (ب): 11',opt1:'الكمية (أ) أكبر',opt2:'الكمية (ب) أكبر',opt3:'الكميتان متساويتان',opt4:'لا يمكن تحديد العلاقة',ans:0}, // QB-QC-003
          {qnum:44,skill:'q4',text:'إذا كان س > 0، فقارن بين: الكمية (أ): س^2 ، والكمية (ب): س',opt1:'الكمية (أ) أكبر',opt2:'الكمية (ب) أكبر',opt3:'الكميتان متساويتان',opt4:'لا يمكن تحديد العلاقة',ans:3}, // QB-QC-004
          {qnum:45,skill:'q4',text:'الكمية (أ): مساحة مربع طول ضلعه 10 سم. الكمية (ب): مساحة مستطيل طوله 20 سم وعرضه 5 سم.',opt1:'الكمية (أ) أكبر',opt2:'الكمية (ب) أكبر',opt3:'الكميتان متساويتان',opt4:'لا يمكن تحديد العلاقة',ans:2}, // QB-QC-005
          // ── q5: الإحصاء والاحتمالات ──
          {qnum:46,skill:'q5',text:'سجّل خمسة طلاب الدرجات التالية: 12، 15، 18، 20، 25. فما المتوسط الحسابي لهذه الدرجات؟',opt1:'17',opt2:'18',opt3:'18.5',opt4:'19',ans:1}, // QB-ST-001
          {qnum:47,skill:'q5',text:'رتب القيم التالية تصاعديًا ثم حدد الوسيط: 14، 9، 18، 12، 10.',opt1:'10',opt2:'11',opt3:'12',opt4:'14',ans:2}, // QB-ST-002
          {qnum:48,skill:'q5',text:'في البيانات التالية: 7، 5، 9، 7، 6، 5، 7، 8. ما المنوال؟',opt1:'5',opt2:'6',opt3:'7',opt4:'8',ans:2}, // QB-ST-003
          {qnum:49,skill:'q5',text:'يحتوي صندوق على 5 كرات حمراء و3 كرات زرقاء، وتُسحب كرة واحدة عشوائيًا. ما احتمال أن تكون الكرة المسحوبة زرقاء؟',opt1:'(3/8)',opt2:'(5/8)',opt3:'(1/2)',opt4:'(3/5)',ans:0}, // QB-ST-004
          {qnum:50,skill:'q5',text:'لدى متجر 4 ألوان من القمصان و3 مقاسات لكل لون. إذا اختار شخص قميصًا واحدًا، فكم عدد الاختيارات المختلفة الممكنة؟',opt1:'7',opt2:'10',opt3:'12',opt4:'16',ans:2}, // QB-ST-005
        ];
        const gt1Stmt = DB.prepare(
          `INSERT INTO general_tests (id, test_num, qnum, text, opt1, opt2, opt3, opt4, ans, img_url, skill_id, created_at)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const gt1Now = new Date().toISOString();
        for (const q of GT1_SEED) {
          await gt1Stmt.bind(crypto.randomUUID(), q.qnum, q.text, q.opt1, q.opt2, q.opt3, q.opt4, q.ans, q.img || '', q.skill || '', gt1Now).run();
        }
      }

      // GET /api/general-tests — list of the 6 tests (+ student's latest result per test)
      if (!sub && method === 'GET') {
        const claims = await verifyToken(request, env, DB);
        if (!claims) return err('غير مصرح', 401, CORS);
        const { results: metas }  = await DB.prepare('SELECT * FROM general_test_meta ORDER BY test_num ASC').all();
        const { results: counts } = await DB.prepare('SELECT test_num, COUNT(*) as c FROM general_tests GROUP BY test_num').all();
        const countMap = Object.fromEntries(counts.map(r => [r.test_num, Number(r.c)]));
        const myLatest = {};
        if (claims.role === 'student') {
          const { results: rows } = await DB.prepare(
            'SELECT test_num, score, correct, total, created_at FROM general_test_results WHERE student_id = ? ORDER BY created_at DESC'
          ).bind(claims.sub).all();
          for (const r of rows) { if (!(r.test_num in myLatest)) myLatest[r.test_num] = r; }
        }
        return ok({ tests: metas.map(m => ({
          test_num: m.test_num, title: m.title, skill_id: m.skill_id, skill_name: m.skill_name,
          question_count: countMap[m.test_num] || 0,
          my_result: myLatest[m.test_num] || null,
        })) }, 200, CORS);
      }

      // GET /api/general-tests/results?studentId=...&testNum=N — admin/dev: per-student or all results
      if (sub === 'results' && method === 'GET') {
        const isDevKey = authDev(request, env);
        const claims = isDevKey ? { role: 'dev' } : await verifyToken(request, env, DB);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const studentId = url.searchParams.get('studentId');
        const filterTest = url.searchParams.get('testNum');
        let query = 'SELECT * FROM general_test_results WHERE is_trial = 0';
        const params = [];
        if (studentId) { query += ' AND student_id = ?'; params.push(studentId); }
        if (filterTest) { query += ' AND test_num = ?'; params.push(Number(filterTest)); }
        query += ' ORDER BY created_at DESC LIMIT 2000';
        const stmt = DB.prepare(query);
        const bound = params.length ? stmt.bind(...params) : stmt;
        const { results } = await bound.all();
        return ok({ results: results.map(r => {
          let ans = []; try { ans = JSON.parse(r.answers || '[]'); } catch (e) {}
          return { ...r, answers: ans };
        }) }, 200, CORS);
      }

      const testNum = Number(sub);
      if (sub && Number.isInteger(testNum) && testNum >= 1 && testNum <= 6) {

        // GET /api/general-tests/:num/questions — sanitized (no answer key)
        if (subsub === 'questions' && method === 'GET') {
          const claims = await verifyToken(request, env, DB);
          if (!claims) return err('غير مصرح', 401, CORS);
          const { results } = await DB.prepare(
            'SELECT qnum, text, opt1, opt2, opt3, opt4, img_url FROM general_tests WHERE test_num = ? ORDER BY qnum ASC'
          ).bind(testNum).all();
          if (!results.length) return err('الاختبار غير متوفر بعد', 404, CORS);
          return ok({ questions: results.map(r => ({ qnum: r.qnum, text: r.text, opts: [r.opt1, r.opt2, r.opt3, r.opt4], img: r.img_url || null })) }, 200, CORS);
        }

        // POST /api/general-tests/:num/questions — admin upload {action:'replace'|'append', questions:[...]}
        if (subsub === 'questions' && method === 'POST') {
          const claims = await verifyToken(request, env, DB);
          if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
          const { action = 'append', questions: rows } = await request.json();
          if (action === 'replace') await DB.prepare('DELETE FROM general_tests WHERE test_num = ?').bind(testNum).run();
          const { results: existing } = await DB.prepare('SELECT qnum FROM general_tests WHERE test_num = ?').bind(testNum).all();
          const existingNums = new Set(existing.map(r => r.qnum));
          const fresh = (rows || []).filter(r => !existingNums.has(r.qnum));
          const stmt = DB.prepare(
            `INSERT INTO general_tests (id, test_num, qnum, text, opt1, opt2, opt3, opt4, ans, img_url, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const q of fresh) {
            await stmt.bind(crypto.randomUUID(), testNum, q.qnum, q.text, q.opts[0], q.opts[1], q.opts[2], q.opts[3], q.ans, q.img || '', new Date().toISOString()).run();
          }
          await logEvent(DB, { level: 'info', category: 'general-tests', message: `استيراد أسئلة الاختبار العام رقم ${testNum} (${action === 'replace' ? 'استبدال' : 'إضافة'}) — ${fresh.length} مضافة`, user_name: claims.name || '', user_role: claims.role, school: claims.school || '' });
          return ok({ added: fresh.length, skipped: (rows || []).length - fresh.length }, 200, CORS);
        }

        // PATCH /api/general-tests/:num — admin edits meta (skill linkage / display title)
        if (!subsub && method === 'PATCH') {
          const claims = await verifyToken(request, env, DB);
          if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
          const body = await request.json();
          const sets = [], vals = [];
          if ('skill_id'   in body) { sets.push('skill_id = ?');   vals.push(body.skill_id   || ''); }
          if ('skill_name' in body) { sets.push('skill_name = ?'); vals.push(body.skill_name || ''); }
          if ('title'      in body) { sets.push('title = ?');      vals.push(body.title      || ''); }
          if (!sets.length) return err('لا توجد بيانات للتحديث', 400, CORS);
          await DB.prepare(`UPDATE general_test_meta SET ${sets.join(', ')} WHERE test_num = ?`).bind(...vals, testNum).run();
          return ok({ ok: true }, 200, CORS);
        }

        // POST /api/general-tests/:num/submit — server-side grading (student/trial-student only)
        if (subsub === 'submit' && method === 'POST') {
          const claims = await verifyToken(request, env, DB);
          if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
          const { answers } = await request.json();
          if (!Array.isArray(answers) || !answers.length) return err('إجابات مطلوبة', 400, CORS);

          const { results: bank } = await DB.prepare(
            'SELECT qnum, ans, skill_id FROM general_tests WHERE test_num = ? ORDER BY qnum ASC'
          ).bind(testNum).all();
          if (!bank.length) return err('بنك الأسئلة غير موجود', 500, CORS);

          const GT_SKILL_NAMES = {
            v1: 'الاستيعاب القرائي', v2: 'الخطأ السياقي', v3: 'المفردة الشاذة',
            v4: 'التناظر اللفظي',   v5: 'إكمال الجمل',
            q1: 'الحساب', q2: 'الجبر', q3: 'الهندسة',
            q4: 'المقارنات الكمية', q5: 'الإحصاء والاحتمالات',
          };
          const total = bank.length;
          let correct = 0;
          const storedAnswers = [];
          const skillStats = {};
          for (const q of bank) {
            const a = answers.find(x => Number(x.qnum) === q.qnum) || {};
            const selected = Number.isInteger(Number(a.selected)) && a.selected !== null && a.selected !== undefined ? Number(a.selected) : null;
            const isCorrect = selected === q.ans;
            if (isCorrect) correct++;
            storedAnswers.push({ q: q.qnum, a: selected, corr: q.ans });
            if (q.skill_id) {
              if (!skillStats[q.skill_id]) skillStats[q.skill_id] = { correct: 0, total: 0 };
              skillStats[q.skill_id].total++;
              if (isCorrect) skillStats[q.skill_id].correct++;
            }
          }
          const finalScore = Math.round((correct / total) * 100);
          const skillBreakdown = Object.entries(skillStats).map(([skillId, s]) => ({
            skillId, skillName: GT_SKILL_NAMES[skillId] || skillId,
            correct: s.correct, total: s.total, pct: Math.round((s.correct / s.total) * 100),
          }));
          const rid = crypto.randomUUID();
          const now = new Date().toISOString();
          const isTrial = claims.trial ? 1 : 0;

          await DB.prepare(
            `INSERT INTO general_test_results (id, student_id, student_name, school, test_num, score, correct, total, is_trial, answers, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(rid, claims.sub, claims.name, claims.school || '', testNum, finalScore, correct, total, isTrial, JSON.stringify(storedAnswers), now).run();

          await logEvent(DB, { level: 'info', category: 'test', message: `إنهاء الاختبار العام رقم ${testNum}${isTrial ? ' (تجريبي)' : ''} — النتيجة ${finalScore}% (${correct}/${total})`, user_name: claims.name || '', user_role: 'student', school: claims.school || '' });
          return ok({ id: rid, created_at: now, score: finalScore, correct, total, detail: storedAnswers, skillBreakdown }, 201, CORS);
        }
      }
    }

    // ── SendPulse WhatsApp ──────────────────────────────────────────────
    if (resource === 'sendpulse') {
      // POST /api/sendpulse/send — also accepts admin/director JWT (not just dev key)
      if (sub === 'send' && method === 'POST') {
        const _isDevSend = authDev(request, env);
        const _claimsSend = _isDevSend ? null : await verifyToken(request, env, DB);
        if (!_isDevSend && (!_claimsSend || !['admin','director'].includes(_claimsSend.role))) return err('غير مصرح', 401, CORS);
        if (!_isDevSend && _claimsSend.role !== 'dev' && !(Array.isArray(_claimsSend.permissions) && _claimsSend.permissions.includes('send_whatsapp'))) {
          return err('لا تملك صلاحية إرسال الواتساب', 403, CORS);
        }
        const body = await request.json();
        const { phones, template_name, language_code = 'ar', components = [] } = body;
        if (!phones?.length) return err('phones مطلوب', 400, CORS);
        if (!template_name) return err('template_name مطلوب', 400, CORS);
        const botId = env.SENDPULSE_BOT_ID;
        const cleanComponents = sanitizeWaComponents(components);
        const sentPayloads = phones.map(phone => ({
          bot_id: botId,
          phone: normalizeSaudiPhone(phone),
          template: { name: template_name, language: { code: language_code, policy: 'deterministic' }, components: cleanComponents },
        }));
        const results = await Promise.all(sentPayloads.map(p => spRequest(env, 'POST', '/whatsapp/contacts/sendTemplateByPhone', p)));
        await logEvent(DB, {
          level: results.some(r => r?.success === false || r?.error || r?.errors) ? 'error' : 'success',
          category: 'whatsapp',
          message: `SendPulse send — template=${template_name} | sent=${JSON.stringify(sentPayloads)} | received=${JSON.stringify(results)}`,
        });
        return ok({ sent_to: phones.length, results }, 200, CORS);
      }

      // POST /api/sendpulse/template-send — bulk-send the fixed
      // 'student_issue_notification' template to a list of students.
      // {{1}} (name) is always filled server-side from the students table —
      // the caller never supplies it, only {{2}}..{{5}}.
      if (sub === 'template-send' && method === 'POST') {
        const _isDevTpl = authDev(request, env);
        const _claimsTpl = _isDevTpl ? null : await verifyToken(request, env, DB);
        if (!_isDevTpl && (!_claimsTpl || !['admin','director'].includes(_claimsTpl.role))) return err('غير مصرح', 401, CORS);
        if (!_isDevTpl && _claimsTpl.role !== 'dev' && !(Array.isArray(_claimsTpl.permissions) && _claimsTpl.permissions.includes('send_whatsapp'))) {
          return err('لا تملك صلاحية إرسال الواتساب', 403, CORS);
        }
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
        if (!await rateLimit(DB, ip, 'wa-template-send', 5)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);

        const tplBody = await request.json();
        const studentIds = Array.isArray(tplBody.studentIds) ? [...new Set(tplBody.studentIds)] : [];
        const vars = tplBody.vars || {};
        const { issueType, issueDetails, action: issueAction, note } = vars;
        if (!studentIds.length) return err('studentIds مطلوب', 400, CORS);
        if (![issueType, issueDetails, issueAction, note].every(v => typeof v === 'string' && v.trim())) {
          return err('كل متغيرات القالب (2-5) مطلوبة', 400, CORS);
        }

        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS wa_template_logs (
          id TEXT PRIMARY KEY, batch_id TEXT, student_id TEXT, student_name TEXT, phone TEXT,
          template_name TEXT, variables TEXT, status TEXT, error_message TEXT, created_at TEXT NOT NULL
        )`).run(); } catch {}

        const placeholders = studentIds.map(() => '?').join(',');
        const { results: rawStudents } = await DB.prepare(
          `SELECT id, name, phone, school FROM students WHERE id IN (${placeholders})`
        ).bind(...studentIds).all();
        // Non-dev admins/directors scoped to one school can only message their own students.
        const scopedSchool = (_claimsTpl && _claimsTpl.role !== 'dev' && _claimsTpl.school && _claimsTpl.school !== '*')
          ? _claimsTpl.school : null;
        const targets = scopedSchool ? rawStudents.filter(s => s.school === scopedSchool) : rawStudents;

        const botId = env.SENDPULSE_BOT_ID;
        const templateName = 'student_issue_notification';
        const variablesJson = JSON.stringify({ issueType, issueDetails, action: issueAction, note });
        const batchId = crypto.randomUUID();
        const results = [];

        async function sendOne(student) {
          const now = () => new Date().toISOString();
          if (!student.phone) {
            await DB.prepare(
              'INSERT INTO wa_template_logs (id, batch_id, student_id, student_name, phone, template_name, variables, status, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
            ).bind(crypto.randomUUID(), batchId, student.id, student.name, '', templateName, variablesJson, 'failed', 'رقم جوال غير صالح', now()).run();
            results.push({ studentId: student.id, name: student.name, status: 'failed', error: 'رقم جوال غير صالح' });
            return;
          }
          const components = sanitizeWaComponents([{
            type: 'body',
            parameters: [
              { type: 'text', text: student.name || 'الطالب' },
              { type: 'text', text: issueType },
              { type: 'text', text: issueDetails },
              { type: 'text', text: issueAction },
              { type: 'text', text: note },
            ],
          }]);
          const payload = {
            bot_id: botId,
            phone: normalizeSaudiPhone(student.phone),
            template: { name: templateName, language: { code: 'ar', policy: 'deterministic' }, components },
          };
          let lastError = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const res = await spRequest(env, 'POST', '/whatsapp/contacts/sendTemplateByPhone', payload);
              const r0 = res?.results?.[0] ?? res;
              const spError = r0?.error || r0?.data?.error || r0?.errors;
              if (r0?.success === false || spError) throw new Error(JSON.stringify(spError || r0));
              await DB.prepare(
                'INSERT INTO wa_template_logs (id, batch_id, student_id, student_name, phone, template_name, variables, status, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
              ).bind(crypto.randomUUID(), batchId, student.id, student.name, student.phone, templateName, variablesJson, 'sent', '', now()).run();
              results.push({ studentId: student.id, name: student.name, status: 'sent' });
              return;
            } catch (e) {
              lastError = e?.message || String(e);
              if (attempt < 3) await new Promise(r => setTimeout(r, 300));
            }
          }
          await DB.prepare(
            'INSERT INTO wa_template_logs (id, batch_id, student_id, student_name, phone, template_name, variables, status, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
          ).bind(crypto.randomUUID(), batchId, student.id, student.name, student.phone, templateName, variablesJson, 'failed', lastError, now()).run();
          results.push({ studentId: student.id, name: student.name, status: 'failed', error: lastError });
        }

        // ~10 messages/sec: chunks of 10 sent in parallel, short pause between chunks.
        const CHUNK = 10;
        for (let i = 0; i < targets.length; i += CHUNK) {
          const chunk = targets.slice(i, i + CHUNK);
          await Promise.all(chunk.map(sendOne));
          if (i + CHUNK < targets.length) await new Promise(r => setTimeout(r, 1000));
        }

        const sentCount = results.filter(r => r.status === 'sent').length;
        const failedCount = results.length - sentCount;
        await logEvent(DB, {
          level: failedCount > 0 ? 'warn' : 'success',
          category: 'whatsapp',
          message: `إرسال إشعار مشكلة جماعي — template=${templateName} | نجح ${sentCount} / فشل ${failedCount} من ${targets.length}`,
          user_name: _claimsTpl?.name || '', user_role: _claimsTpl?.role || 'dev', school: scopedSchool || '',
        });
        return ok({ total: targets.length, sent: sentCount, failed: failedCount, results }, 200, CORS);
      }

      if (!authDev(request, env)) return err('غير مصرح', 401, CORS);

      // GET /api/sendpulse/templates — list available WA templates
      if (sub === 'templates' && method === 'GET') {
        const botId = env.SENDPULSE_BOT_ID;
        const data = await spRequest(env, 'GET', `/whatsapp/templates?bot_id=${botId}`);
        return ok({ templates: data.data || data || [] }, 200, CORS);
      }

      // GET /api/sendpulse/bots — list bots (for debug)
      if (sub === 'bots' && method === 'GET') {
        const data = await spRequest(env, 'GET', '/whatsapp/bots');
        return ok(data, 200, CORS);
      }

      // POST /api/sendpulse/broadcast/:broadcastId — send broadcast msg to school students via WA
      if (sub === 'broadcast' && subsub && method === 'POST') {
        const body = await request.json();
        const { template_name, language_code = 'ar', components = [] } = body;
        if (!template_name) return err('template_name مطلوب', 400, CORS);
        const broadcast = await DB.prepare('SELECT * FROM broadcasts WHERE id = ?').bind(subsub).first();
        if (!broadcast) return err('الرسالة غير موجودة', 404, CORS);
        const { results: students } = await DB.prepare(
          'SELECT phone FROM students WHERE school = ? AND phone IS NOT NULL AND phone != \'\''
        ).bind(broadcast.school).all();
        if (!students.length) return err('لا يوجد طلاب برقم جوال', 400, CORS);
        const phones = students.map(s => normalizeSaudiPhone(s.phone));
        const botId = env.SENDPULSE_BOT_ID;
        const cleanComponents = sanitizeWaComponents(components);
        const results = await Promise.all(phones.map(phone => spRequest(env, 'POST', '/whatsapp/contacts/sendTemplateByPhone', {
          bot_id: botId,
          phone,
          template: { name: template_name, language: { code: language_code, policy: 'deterministic' }, components: cleanComponents },
        })));
        return ok({ sent_to: phones.length, results }, 200, CORS);
      }
    }

    return err('غير موجود', 404, CORS);

  } catch (e) {
    console.error('[API Error]', e);
    return err('خطأ في الخادم', 500, getCORS(request));
  }
}
