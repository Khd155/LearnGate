// Cloudflare Pages Function — /api/* handler
// D1 binding: DB | Dev key env var: DEV_KEY

const ALLOWED_ORIGINS = ['https://learngate.khormi.site', 'https://learngate.pages.dev', 'http://localhost:8788'];
function getCORS(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Dev-Key',
    'Vary': 'Origin',
  };
}


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
  return env.DEV_KEY; // REMOVED fallback — must be set in Cloudflare env vars
}

function authDev(request, env) {
  const key = request.headers.get('X-Dev-Key') || '';
  return key === getDevKey(env);
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

async function verifyToken(request, env) {
  const token = getToken(request);
  if (!token) return null;
  return jwtVerify(token, env.JWT_SECRET || 'lg-jwt-fallback-2026');
}

// ── Rate Limiting (D1-based, 1-minute windows) ────────────────────────────
async function rateLimit(DB, ip, action, maxPerMin) {
  try {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER DEFAULT 0, window INTEGER DEFAULT 0
    )`).run();
    const window = Math.floor(Date.now() / 60000);
    const key = `${action}:${ip}`;
    const row = await DB.prepare('SELECT count, window FROM rate_limits WHERE key = ?').bind(key).first();
    if (!row || row.window !== window) {
      await DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window) VALUES (?, 1, ?)').bind(key, window).run();
      return true;
    }
    if (row.count >= maxPerMin) return false;
    await DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
    return true;
  } catch { return true; }
}

export async function onRequest({ request, env }) {
  const CORS = getCORS(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url      = new URL(request.url);
  const parts    = url.pathname.split('/').filter(Boolean);
  const resource = parts[1];   // e.g. 'students', 'plans', 'dev'
  const sub      = parts[2];   // e.g. student id, 'admins'
  const subsub   = parts[3];   // e.g. admin id
  const method   = request.method;
  const DB       = env.DB;
  const school   = url.searchParams.get('school') || '';

  try {

    // ── AUTH ─────────────────────────────────────────────────────────────────
    if (resource === 'auth') {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

      // POST /api/auth/student-login
      if (sub === 'student-login' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'student-login', 10)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        const body = await request.json();
        const { code, school: bodySchool } = body;
        if (!code || !/^\d{10}$/.test(code)) return err('رمز غير صالح', 400, CORS);
        const sc = bodySchool || school;
        const student = await DB.prepare('SELECT id, code, name, school FROM students WHERE code = ? AND school = ?').bind(code, sc).first();
        if (!student) {
          try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'warn','login',`محاولة دخول طالب فاشلة: ${code}`,'','student',sc,ip,new Date().toISOString()).run(); } catch {}
          return err('السجل المدني غير مسجّل', 404, CORS);
        }
        const secret = env.JWT_SECRET || 'lg-jwt-fallback-2026';
        const token = await jwtSign({ sub: student.id, role: 'student', name: student.name, school: student.school, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, secret);
        try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'success','login',`تسجيل دخول طالب: ${student.name}`,student.name,'student',student.school||'',ip,new Date().toISOString()).run(); } catch {}
        return ok({ token, student: { id: student.id, name: student.name, school: student.school } }, 200, CORS);
      }

      // POST /api/auth/admin-login
      if (sub === 'admin-login' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'admin-login', 5)) return err('طلبات كثيرة', 429, CORS);
        const { code: adminCode, school: bodySchool } = await request.json();
        if (!adminCode || !/^\d{10}$/.test(adminCode)) return err('رمز غير صالح', 400, CORS);
        const admin = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(adminCode).first();
        const sc = bodySchool || school;
        if (!admin) {
          try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'warn','login',`محاولة دخول مشرف فاشلة: ${adminCode}`,'','admin',sc,ip,new Date().toISOString()).run(); } catch {}
          return err('السجل المدني غير مسجّل', 404, CORS);
        }
        if (admin.school !== '*' && sc && admin.school !== sc) return err('غير مصرح', 403, CORS);
        const secret = env.JWT_SECRET || 'lg-jwt-fallback-2026';
        const adminName = admin.admin_name || admin.name || '';
        // Normalize role: only 'director' keeps its value, everything else becomes 'admin'
        const adminRole = admin.role === 'director' ? 'director' : 'admin';
        const token = await jwtSign({ sub: admin.id, role: adminRole, name: adminName, school: admin.school, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, secret);
        try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'success','login',`تسجيل دخول ${adminRole==='director'?'مدير':'مشرف'}: ${adminName}`,adminName,adminRole,admin.school||'',ip,new Date().toISOString()).run(); } catch {}
        return ok({ token, admin: { id: admin.id, name: adminName, school: admin.school, role: adminRole } }, 200, CORS);
      }

      // POST /api/auth/dev
      if (sub === 'dev' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'dev-login', 5)) return err('طلبات كثيرة', 429, CORS);
        const { key } = await request.json();
        const devKey = env.DEV_KEY;
        if (!devKey || key !== devKey) return err('غير مصرح', 401, CORS);
        const secret = env.JWT_SECRET || 'lg-jwt-fallback-2026';
        const token = await jwtSign({ role: 'dev', exp: Math.floor(Date.now() / 1000) + 4 * 3600 }, secret);
        return ok({ token }, 200, CORS);
      }

      // GET /api/auth/ping — JWT self-test (no auth required, safe diagnostics only)
      if (sub === 'ping' && method === 'GET') {
        const secret = env.JWT_SECRET || 'lg-jwt-fallback-2026';
        const hasCustomSecret = !!env.JWT_SECRET;
        const testPayload = { role: 'admin', sub: 'test', exp: Math.floor(Date.now() / 1000) + 60 };
        let selfTest = false, selfTestErr = null;
        try {
          const testToken = await jwtSign(testPayload, secret);
          const verified  = await jwtVerify(testToken, secret);
          selfTest = verified && verified.role === 'admin';
          if (!selfTest) selfTestErr = 'verify returned: ' + JSON.stringify(verified);
        } catch (e) { selfTestErr = e.message; }
        // Also try to verify the caller's token if provided
        let callerClaims = null, callerErr = null;
        const callerToken = getToken(request);
        if (callerToken) {
          try { callerClaims = await jwtVerify(callerToken, secret); }
          catch (e) { callerErr = e.message; }
        }
        return ok({
          jwtSelfTest: selfTest,
          jwtSelfTestErr: selfTestErr,
          hasCustomJwtSecret: hasCustomSecret,
          callerTokenProvided: !!callerToken,
          callerTokenValid: !!callerClaims,
          callerRole: callerClaims?.role || null,
          callerTokenErr: callerErr,
        }, 200, CORS);
      }
    }

    // ── SCHOOLS ─────────────────────────────────────────────────────────────
    if (resource === 'schools' && method === 'GET') {
      const { results } = await DB.prepare('SELECT * FROM schools ORDER BY name ASC').all();
      return ok({ schools: results }, 200, CORS);
    }

    // ── STUDENTS ─────────────────────────────────────────────────────────────
    if (resource === 'students') {

      if (method === 'GET') {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        let q = 'SELECT * FROM students';
        const params = [];
        // Non-director admins: always filter by their own school from JWT
        const effectiveSchool = (claims.role === 'admin' && claims.school) ? claims.school : school;
        if (effectiveSchool) { q += ' WHERE school = ?'; params.push(effectiveSchool); }
        q += ' ORDER BY created_at ASC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ students: results }, 200, CORS);
      }

      if (method === 'POST') {
        const body = await request.json();

        if (Array.isArray(body)) {
          const now = new Date().toISOString();
          const valid = body.filter(r => r.name && r.code);

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
            const stmts = toAdd.map(({ name, code, school: s }) =>
              DB.prepare('INSERT OR IGNORE INTO students (id, code, name, school, created_at) VALUES (?, ?, ?, ?, ?)')
                .bind(crypto.randomUUID(), code, name, s || school, now)
            );
            const results = await DB.batch(stmts);
            added = results.filter(r => r.changes).length;
          }

          // Batch update existing students if upsert mode
          if (upsert && toUpdate.length) {
            const stmts = toUpdate.map(({ name, code, school: s }) =>
              DB.prepare('UPDATE students SET name = ?, school = ? WHERE code = ?')
                .bind(name, s || school, code)
            );
            const results = await DB.batch(stmts);
            updated = results.filter(r => r.changes).length;
          }

          return ok({ added, updated, skipped: valid.length - added - updated, total: valid.length }, 200, CORS);
        }

        const { name, code, school: bodySchool } = body;
        const sid = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await DB.prepare(
            'INSERT INTO students (id, code, name, school, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(sid, code, name, bodySchool || school, now).run();
        } catch (e) {
          if (e.message && e.message.includes('UNIQUE'))
            return err('السجل المدني مسجّل مسبقاً', 409, CORS);
          throw e;
        }
        return ok({ student: { id: sid, code, name, school: bodySchool || school, created_at: now } }, 201, CORS);
      }

      if (method === 'DELETE' && sub) {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        await DB.prepare('DELETE FROM students WHERE id = ?').bind(sub).run();
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── PLANS ────────────────────────────────────────────────────────────────
    if (resource === 'plans') {

      if (method === 'GET' && sub === 'history') {
        const claims = await verifyToken(request, env);
        if (!claims) return err('غير مصرح', 401, CORS);
        const studentId = url.searchParams.get('studentId');
        if (!studentId) return err('معرّف الطالب مطلوب', 400, CORS);
        // Students can only see their own plans
        if (claims.role === 'student' && claims.sub !== studentId) return err('غير مسموح', 403, CORS);
        let q = 'SELECT * FROM plans WHERE student_id = ?';
        const params = [studentId];
        if (school) { q += ' AND school = ?'; params.push(school); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      if (method === 'GET') {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        let q = 'SELECT * FROM plans';
        const params = [];
        if (school) { q += ' WHERE school = ?'; params.push(school); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      if (method === 'POST') {
        const claims = await verifyToken(request, env);
        if (!claims || !['student','admin','director'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const { studentId, studentName, status, gaps, adminNote, school: bodySchool } = await request.json();
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        const planSchool = bodySchool || school;
        await DB.prepare(
          `INSERT INTO plans (id, student_id, student_name, status, gaps, admin_note, school, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(pid, studentId, studentName, status, JSON.stringify(gaps), adminNote || '', planSchool, now).run();
        return ok({ plan: { id: pid, student_id: studentId, student_name: studentName, status, gaps, admin_note: adminNote || '', school: planSchool, created_at: now } }, 201, CORS);
      }

      if (method === 'PATCH' && sub) {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const { adminNote } = await request.json();
        const now = new Date().toISOString();
        await DB.prepare(
          'UPDATE plans SET status = ?, admin_note = ?, approved_at = ? WHERE id = ?'
        ).bind('active', adminNote || '', now, sub).run();
        const p = await DB.prepare('SELECT * FROM plans WHERE id = ?').bind(sub).first();
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
          created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        )`).run();
      } catch {}

      // POST /api/test-results — student saves their own result
      if (method === 'POST') {
        const claims = await verifyToken(request, env);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        const { subject, testType, score, correct, total, answers } = await request.json();
        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          `INSERT INTO test_results (id, student_id, student_name, school, subject, test_type, score, correct, total, answers, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(rid, claims.sub, claims.name, claims.school || '', subject || 'biology-g1', testType, score, correct, total, JSON.stringify(answers || []), now).run();
        return ok({ id: rid, created_at: now }, 201, CORS);
      }

      // GET /api/test-results — student sees own, admin/director sees by school or studentId
      if (method === 'GET') {
        const claims = await verifyToken(request, env);
        if (!claims) return err('غير مصرح', 401, CORS);

        if (claims.role === 'student') {
          const { results } = await DB.prepare(
            'SELECT id, subject, test_type, score, correct, total, answers, created_at FROM test_results WHERE student_id = ? ORDER BY created_at DESC'
          ).bind(claims.sub).all();
          return ok({ results: results.map(r => {
            let ans = [];
            try { ans = JSON.parse(r.answers || '[]'); } catch(e) {}
            return { ...r, answers: ans };
          }) }, 200, CORS);
        }

        if (!['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const studentId = url.searchParams.get('studentId');
        if (studentId) {
          const { results } = await DB.prepare(
            'SELECT * FROM test_results WHERE student_id = ? ORDER BY created_at DESC'
          ).bind(studentId).all();
          return ok({ results: results.map(r => {
            let ans = [];
            try { ans = JSON.parse(r.answers || '[]'); } catch(e) {}
            return { ...r, answers: ans };
          }) }, 200, CORS);
        }
        let q = 'SELECT id, student_id, student_name, school, subject, test_type, score, correct, total, created_at FROM test_results';
        const params = [];
        if (school) { q += ' WHERE school = ?'; params.push(school); }
        q += ' ORDER BY created_at DESC LIMIT 1000';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ results }, 200, CORS);
      }
    }

    // ── QUESTIONS ────────────────────────────────────────────────────────────
    if (resource === 'questions') {

      if (method === 'GET') {
        const claims = await verifyToken(request, env);
        const isPrivileged = claims && (claims.role === 'admin' || claims.role === 'director' || claims.role === 'dev');
        const { results } = await DB.prepare('SELECT * FROM questions ORDER BY qnum ASC').all();
        return ok({ questions: results.map(r => {
          if (isPrivileged) return r;
          const { ans, ...safe } = r; // strip answer for students
          return safe;
        }) }, 200, CORS);
      }

      if (method === 'POST') {
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
        return ok({ added: fresh.length, skipped: rows.length - fresh.length }, 200, CORS);
      }
    }

    // ── QUIZ GRADING (server-side, requires student JWT) ─────────────────────
    if (resource === 'quiz' && sub === 'grade' && method === 'POST') {
      const claims = await verifyToken(request, env);
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

    // ── ADMINS ───────────────────────────────────────────────────────────────

    // GET /api/admins?school=X — public list (name+id only, no codes)
    if (resource === 'admins' && !sub && method === 'GET' && school) {
      const { results } = await DB.prepare(
        "SELECT id, name FROM admins WHERE school = ? AND school != '' ORDER BY name ASC"
      ).bind(school).all();
      return ok({ admins: results }, 200, CORS);
    }

    if (resource === 'admins' && sub && method === 'GET') {
      // sub = admin code, school = selected school
      const admin = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(sub).first();
      if (!admin) return ok({ admin: null }, 404, CORS);
      // school='*' means superadmin, can access any school
      if (admin.school !== '*' && school && admin.school !== school) {
        return ok({ admin: null }, 404, CORS);
      }
      return ok({ admin }, 200, CORS);
    }

    // ── DEV ENDPOINTS ────────────────────────────────────────────────────────
    if (resource === 'dev') {

      if (!authDev(request, env)) return err('غير مصرح', 401, CORS);

      // GET /api/dev/stats — stats per school
      if (sub === 'stats' && method === 'GET') {
        const { results: schools } = await DB.prepare('SELECT name FROM schools ORDER BY name').all();
        const stats = [];
        for (const { name } of schools) {
          const s = await DB.prepare('SELECT COUNT(*) as c FROM students WHERE school = ?').bind(name).first();
          const pp = await DB.prepare("SELECT COUNT(*) as c FROM plans WHERE school = ? AND status='pending'").bind(name).first();
          const ap = await DB.prepare("SELECT COUNT(*) as c FROM plans WHERE school = ? AND status='active'").bind(name).first();
          stats.push({ school: name, students: s.c, pending: pp.c, active: ap.c });
        }
        const tot_s = await DB.prepare('SELECT COUNT(*) as c FROM students').first();
        const tot_a = await DB.prepare('SELECT COUNT(*) as c FROM admins').first();
        const tot_q = await DB.prepare('SELECT COUNT(*) as c FROM questions').first();
        return ok({ stats, totals: { students: tot_s.c, admins: tot_a.c, questions: tot_q.c, schools: schools.length } }, 200, CORS);
      }

      // GET /api/dev/admins — all admins
      if (sub === 'admins' && method === 'GET') {
        try { await DB.prepare('ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT "admin"').run(); } catch {}
        const { results } = await DB.prepare('SELECT * FROM admins ORDER BY school, name').all();
        return ok({ admins: results }, 200, CORS);
      }

      // POST /api/dev/admins — add admin
      if (sub === 'admins' && method === 'POST') {
        const { name, code, school: adminSchool, role: adminRole } = await request.json();
        if (!name || !code) return err('الاسم والرمز مطلوبان', 400, CORS);
        // Ensure role column exists (idempotent migration)
        try { await DB.prepare('ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT "admin"').run(); } catch {}
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

      // GET /api/dev/students — all students (optional ?school=X filter)
      if (sub === 'students' && method === 'GET') {
        const filterSchool = url.searchParams.get('school');
        try {
          let q = `SELECT s.id, s.code, s.name, s.school, s.created_at,
                          p.status as plan_status
                   FROM students s
                   LEFT JOIN plans p ON p.student_id = s.id`;
          const params = [];
          if (filterSchool) { q += ' WHERE s.school = ?'; params.push(filterSchool); }
          q += ' ORDER BY s.school, s.name ASC';
          const { results } = await DB.prepare(q).bind(...params).all();
          return ok({ students: results }, 200, CORS);
        } catch (e) {
          // Fallback if school column not yet added (migration not run)
          if (e.message && e.message.includes('no such column')) {
            const { results } = await DB.prepare(
              'SELECT s.id, s.code, s.name, s.created_at, p.status as plan_status FROM students s LEFT JOIN plans p ON p.student_id = s.id ORDER BY s.name ASC'
            ).all();
            return ok({ students: results.map(r => ({ ...r, school: '' })) }, 200, CORS);
          }
          throw e;
        }
      }

      // POST /api/dev/students — add single student from dev panel
      if (sub === 'students' && method === 'POST') {
        const { name, code, school: bodySchool } = await request.json();
        if (!name || !code) return err('الاسم والرمز مطلوبان', 400, CORS);
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
        await DB.prepare('DELETE FROM students WHERE id = ?').bind(subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/dev/students?school=X — clear all students of a school
      // DELETE /api/dev/students?noschool=1 — delete students with empty school
      if (sub === 'students' && !subsub && method === 'DELETE') {
        const noSchool = url.searchParams.get('noschool') === '1';
        if (noSchool) {
          await DB.prepare("DELETE FROM students WHERE school = '' OR school IS NULL").run();
          return ok({ ok: true }, 200, CORS);
        }
        const targetSchool = url.searchParams.get('school');
        if (!targetSchool) return err('رمز المدرسة مطلوب', 400, CORS);
        await DB.prepare('DELETE FROM students WHERE school = ?').bind(targetSchool).run();
        return ok({ ok: true }, 200, CORS);
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
      // DELETE /api/dev/questions — clear all questions
      if (sub === 'questions' && method === 'DELETE') {
        await DB.prepare('DELETE FROM questions').run();
        return ok({ ok: true }, 200, CORS);
      }

      // GET /api/dev/logs — get activity logs
      if (sub === 'logs' && method === 'GET') {
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, level TEXT NOT NULL DEFAULT 'info', category TEXT NOT NULL DEFAULT 'system', message TEXT NOT NULL, user_name TEXT DEFAULT '', user_role TEXT DEFAULT '', school TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TEXT NOT NULL)`).run(); } catch {}
        const level    = url.searchParams.get('level') || '';
        const category = url.searchParams.get('category') || '';
        const limitN   = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
        let q = 'SELECT * FROM logs';
        const params = [];
        const conds = [];
        if (level)    { conds.push('level = ?');    params.push(level); }
        if (category) { conds.push('category = ?'); params.push(category); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limitN);
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ logs: results }, 200, CORS);
      }

      // POST /api/dev/logs — write a log entry (also accepts JWT)
      if (sub === 'logs' && method === 'POST') {
        try { await DB.prepare(`CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, level TEXT NOT NULL DEFAULT 'info', category TEXT NOT NULL DEFAULT 'system', message TEXT NOT NULL, user_name TEXT DEFAULT '', user_role TEXT DEFAULT '', school TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TEXT NOT NULL)`).run(); } catch {}
        const body = await request.json();
        const lid = crypto.randomUUID();
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
        const now = new Date().toISOString();
        await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .bind(lid, body.level||'info', body.category||'system', String(body.message||'').slice(0,500), body.user_name||'', body.user_role||'', body.school||'', ip, now).run();
        return ok({ ok: true }, 201, CORS);
      }

      // DELETE /api/dev/logs — clear all logs
      if (sub === 'logs' && method === 'DELETE') {
        try { await DB.prepare('DELETE FROM logs').run(); } catch {}
        return ok({ ok: true }, 200, CORS);
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
        try { await DB.prepare('ALTER TABLE messages ADD COLUMN recipient_admin_id TEXT DEFAULT ""').run(); } catch {}
        // Add role column to admins if not exists
        try { await DB.prepare('ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT "admin"').run(); } catch {}
        return ok({ ok: true, tables: ['messages', 'tickets', 'ticket_replies'] }, 200, CORS);
      }
    }

    // ── DIRECTOR ENDPOINTS ───────────────────────────────────────────────────
    if (resource === 'director') {

      // Helper: verify director auth
      async function authDirector(code, targetSchool) {
        if (!code) return null;
        const a = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(code).first();
        if (!a || a.role !== 'director') return null;
        if (a.school !== '*' && targetSchool && a.school !== targetSchool) return null;
        return a;
      }

      // GET /api/director/admins?school=X&director_code=Y
      if (sub === 'admins' && method === 'GET') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const { results } = await DB.prepare(
          "SELECT id, name, code, role FROM admins WHERE school = ? ORDER BY name ASC"
        ).bind(school).all();
        return ok({ admins: results }, 200, CORS);
      }

      // POST /api/director/admins — add supervisor
      if (sub === 'admins' && method === 'POST') {
        const { name, code: newCode, director_code } = await request.json();
        const dir = await authDirector(director_code, school);
        if (!dir) return err('غير مصرح', 401, CORS);
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
        return ok({ admin: { id: aid, name, code: newCode, school: adminSchool, role: 'admin', created_at: now } }, 201, CORS);
      }

      // DELETE /api/director/admins/:id?school=X&director_code=Y
      if (sub === 'admins' && subsub && method === 'DELETE') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const target = await DB.prepare('SELECT * FROM admins WHERE id = ?').bind(subsub).first();
        if (!target) return err('المشرف غير موجود', 404, CORS);
        if (target.role === 'director') return err('لا يمكن حذف مدير', 403, CORS);
        await DB.prepare('DELETE FROM admins WHERE id = ?').bind(subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/director/seed-questions — upsert hardcoded questions (director auth)
      if (sub === 'seed-questions' && method === 'POST') {
        const body = await request.json();
        const dir = await authDirector(body.director_code, school);
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

      // PATCH /api/director/questions/:id?director_code=Y&school=X — edit one question
      if (sub === 'questions' && subsub && method === 'PATCH') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('غير مصرح', 401, CORS);
        const { qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans } = await request.json();
        await DB.prepare(
          'UPDATE questions SET qnum=?,type=?,skill_id=?,text=?,opt1=?,opt2=?,opt3=?,opt4=?,ans=? WHERE id=?'
        ).bind(qnum, type, skill_id, text, opt1, opt2, opt3, opt4, ans, subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/director/questions/:id?director_code=Y&school=X — delete one question
      if (sub === 'questions' && subsub && method === 'DELETE') {
        const dir = await authDirector(url.searchParams.get('director_code'), school);
        if (!dir) return err('غير مصرح', 401, CORS);
        await DB.prepare('DELETE FROM questions WHERE id = ?').bind(subsub).run();
        return ok({ ok: true }, 200, CORS);
      }

      // POST /api/director/questions — import questions (director auth)
      if (sub === 'questions' && method === 'POST') {
        const body = await request.json();
        const dir = await authDirector(body.director_code, school);
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
        return ok({ added: fresh.length, skipped: rows.length - fresh.length }, 200, CORS);
      }
    }

    // ── MESSAGES ─────────────────────────────────────────────────────────────
    if (resource === 'messages') {
      const msgClaims = await verifyToken(request, env);
      if (!msgClaims) return err('غير مصرح', 401, CORS);
      const isPrivileged = ['admin','director','dev','support'].includes(msgClaims.role);

      // GET /api/messages/unread-student — student checks unread messages from admin
      if (sub === 'unread-student' && method === 'GET') {
        if (msgClaims.role !== 'student') return err('غير مسموح', 403, CORS);
        const studentId = msgClaims.sub;
        const row = await DB.prepare(
          "SELECT COUNT(*) as count FROM messages WHERE student_id=? AND sender_type='admin' AND is_read=0"
        ).bind(studentId).first();
        return ok({ count: row?.count || 0 }, 200, CORS);
      }

      // GET /api/messages/unread — admin/director/dev only
      if (sub === 'unread' && method === 'GET') {
        if (!isPrivileged) return err('غير مسموح', 403, CORS);
        const adminId = url.searchParams.get('adminId') || '';
        let q, params;
        if (adminId) {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0 AND school=? AND recipient_admin_id=?
               GROUP BY student_id`;
          params = [school, adminId];
        } else if (school) {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0 AND school=?
               GROUP BY student_id`;
          params = [school];
        } else {
          q = `SELECT student_id, student_name, school, COUNT(*) as cnt FROM messages
               WHERE sender_type='student' AND is_read=0
               GROUP BY student_id`;
          params = [];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ counts: results }, 200, CORS);
      }

      // GET /api/messages — students see only their own
      if (method === 'GET') {
        const studentId = url.searchParams.get('studentId');
        const adminId   = url.searchParams.get('adminId') || '';
        if (!studentId) return err('معرّف الطالب مطلوب', 400, CORS);
        if (msgClaims.role === 'student' && msgClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
        let q, params;
        if (adminId) {
          q = 'SELECT * FROM messages WHERE student_id=? AND recipient_admin_id=? ORDER BY created_at ASC';
          params = [studentId, adminId];
        } else {
          q = 'SELECT * FROM messages WHERE student_id=? ORDER BY created_at ASC';
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
          // Admin sending to a student's conversation — studentId identifies the conversation
          if (!targetStudentId) return err('معرّف الطالب مطلوب', 400, CORS);
          studentId = targetStudentId;
          studentName = '';
          senderType = 'admin';
        } else {
          studentId = msgClaims.sub;
          studentName = msgClaims.name || '';
          senderType = 'student';
        }
        const effectiveSchool = msgClaims.school || school || bodySchool || '';
        const id  = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO messages (id, student_id, student_name, school, sender_type, body, is_read, recipient_admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
        ).bind(id, studentId, studentName, effectiveSchool, senderType, msgBody, recipientAdminId || '', now).run();
        return ok({ message: { id, student_id: studentId, student_name: studentName, school: effectiveSchool, sender_type: senderType, body: msgBody, is_read: 0, recipient_admin_id: recipientAdminId || '', created_at: now } }, 201, CORS);
      }

      // PATCH /api/messages/read
      if (sub === 'read' && method === 'PATCH') {
        const { studentId, readerType } = await request.json();
        if (msgClaims.role === 'student' && msgClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
        const senderType = readerType === 'admin' ? 'student' : 'admin';
        await DB.prepare(
          'UPDATE messages SET is_read=1 WHERE student_id=? AND sender_type=? AND is_read=0'
        ).bind(studentId, senderType).run();
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── TICKETS ──────────────────────────────────────────────────────────────
    if (resource === 'tickets') {
      const tkClaims = await verifyToken(request, env);
      if (!tkClaims) return err('غير مصرح', 401, CORS);
      const tkPrivileged = ['admin','director','dev','support'].includes(tkClaims.role);

      // Idempotent schema migrations
      try { await DB.prepare('ALTER TABLE tickets ADD COLUMN category TEXT NOT NULL DEFAULT "أخرى"').run(); } catch {}
      try { await DB.prepare('ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT "متوسطة"').run(); } catch {}
      try { await DB.prepare('ALTER TABLE tickets ADD COLUMN ticket_num TEXT NOT NULL DEFAULT ""').run(); } catch {}
      try { await DB.prepare('ALTER TABLE tickets ADD COLUMN rating INTEGER DEFAULT 0').run(); } catch {}
      try { await DB.prepare('ALTER TABLE ticket_replies ADD COLUMN is_read INTEGER DEFAULT 0').run(); } catch {}

      // GET /api/tickets/stats — admin only
      if (method === 'GET' && sub === 'stats') {
        if (!tkPrivileged) return err('غير مسموح', 403, CORS);
        const [total, openC, progC, resolvedC, urgentC] = await Promise.all([
          DB.prepare('SELECT COUNT(*) as c FROM tickets').first(),
          DB.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='open'").first(),
          DB.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='in_progress'").first(),
          DB.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='resolved'").first(),
          DB.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority='عالية' AND status!='resolved'").first(),
        ]);
        const today = new Date().toISOString().split('T')[0];
        const todayC = await DB.prepare("SELECT COUNT(*) as c FROM tickets WHERE created_at LIKE ?").bind(today + '%').first();
        const { results: topCats } = await DB.prepare("SELECT category, COUNT(*) as cnt FROM tickets GROUP BY category ORDER BY cnt DESC LIMIT 3").all();
        return ok({ total: total?.c||0, open: openC?.c||0, inProgress: progC?.c||0, resolved: resolvedC?.c||0, urgent: urgentC?.c||0, today: todayC?.c||0, topCategories: topCats }, 200, CORS);
      }

      // GET /api/tickets/unread — students see only their own
      if (method === 'GET' && sub === 'unread') {
        const studentId = url.searchParams.get('studentId');
        if (!studentId) return err('معرّف الطالب مفقود', 400, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
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
          q = school
            ? 'SELECT * FROM tickets WHERE school=? ORDER BY created_at DESC'
            : 'SELECT * FROM tickets ORDER BY created_at DESC';
          params = school ? [school] : [];
        }
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ tickets: results }, 200, CORS);
      }

      // GET /api/tickets/:id — students can only see their own
      if (method === 'GET' && sub && !subsub) {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('غير موجود', 404, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== ticket.student_id) return err('غير مسموح', 403, CORS);
        const { results: replies } = await DB.prepare(
          'SELECT * FROM ticket_replies WHERE ticket_id=? ORDER BY created_at ASC'
        ).bind(sub).all();
        return ok({ ticket, replies }, 200, CORS);
      }

      // POST /api/tickets — use JWT claims for student identity
      if (method === 'POST' && !sub) {
        const { subject, body: tkBody, school: bodySchool, category, priority } = await request.json();
        if (!subject || !tkBody) return err('حقول مفقودة', 400, CORS);
        if (tkBody.length > 3000) return err('النص طويل جداً', 400, CORS);
        const studentId = tkClaims.sub;
        const studentName = tkClaims.name || '';
        const effectiveSchool = tkClaims.school || school || bodySchool || '';
        const countRow = await DB.prepare('SELECT COUNT(*) as c FROM tickets').first();
        const ticketNum = 'T-' + String(((countRow?.c) || 0) + 1).padStart(5, '0');
        const tid = crypto.randomUUID();
        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          'INSERT INTO tickets (id, student_id, student_name, school, subject, status, category, priority, ticket_num, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(tid, studentId, studentName, effectiveSchool, subject, 'open', category||'أخرى', priority||'متوسطة', ticketNum, now).run();
        await DB.prepare(
          'INSERT INTO ticket_replies (id, ticket_id, sender_type, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(rid, tid, 'student', tkBody, 1, now).run();
        return ok({ ticket: { id: tid, subject, status: 'open', category: category||'أخرى', priority: priority||'متوسطة', ticket_num: ticketNum, created_at: now } }, 201, CORS);
      }

      // POST /api/tickets/:id/read
      if (method === 'POST' && sub && subsub === 'read') {
        const ticket = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        if (!ticket) return err('غير موجود', 404, CORS);
        if (tkClaims.role === 'student' && tkClaims.sub !== ticket.student_id) return err('غير مسموح', 403, CORS);
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
        const { status } = body;
        if (!['open','in_progress','resolved','rejected'].includes(status)) return err('حالة غير صالحة', 400, CORS);
        await DB.prepare('UPDATE tickets SET status=? WHERE id=?').bind(status, sub).run();
        const t = await DB.prepare('SELECT * FROM tickets WHERE id=?').bind(sub).first();
        return ok({ ticket: t }, 200, CORS);
      }
    }

    return err('غير موجود', 404, CORS);

  } catch (e) {
    console.error('[API Error]', e);
    return err('خطأ في الخادم', 500, getCORS(request));
  }
}
