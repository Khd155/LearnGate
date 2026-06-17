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
  if (!env.JWT_SECRET) return null;
  return jwtVerify(token, env.JWT_SECRET);
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
  } catch { return false; }
}

// ── Failed Login Lockout (D1-based, 15-minute lockout after 5 failures) ──
async function recordFailedAttempt(DB, ip, action) {
  try {
    const lockKey   = `lock:${action}:${ip}`;
    const lockUntil = Math.floor(Date.now() / 1000) + 900; // 15 min from now
    const row = await DB.prepare('SELECT count, window FROM rate_limits WHERE key = ?').bind(lockKey).first();
    const count = (row && row.window > Math.floor(Date.now() / 1000)) ? (row.count + 1) : 1;
    if (count >= 5) {
      await DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window) VALUES (?, ?, ?)').bind(lockKey, count, lockUntil).run();
    } else {
      await DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window) VALUES (?, ?, ?)').bind(lockKey, count, Math.floor(Date.now() / 1000) + 900).run();
    }
  } catch {}
}

async function isLockedOut(DB, ip, action) {
  try {
    const lockKey = `lock:${action}:${ip}`;
    const row = await DB.prepare('SELECT count, window FROM rate_limits WHERE key = ?').bind(lockKey).first();
    if (row && row.count >= 5 && row.window > Math.floor(Date.now() / 1000)) return true;
    return false;
  } catch { return false; }
}

async function clearFailedAttempts(DB, ip, action) {
  try {
    const lockKey = `lock:${action}:${ip}`;
    await DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(lockKey).run();
  } catch {}
}

export async function onRequest({ request, env }) {
  const CORS = getCORS(request);
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ── Origin check: reject cross-origin requests from unknown origins ──────
  const origin = request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
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
  const DB       = env.DB;
  const school   = url.searchParams.get('school') || '';

  try {

    // ── AUTH ─────────────────────────────────────────────────────────────────
    if (resource === 'auth') {
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

      // POST /api/auth/student-login
      if (sub === 'student-login' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'student-login', 10)) return err('طلبات كثيرة — أعد المحاولة بعد دقيقة', 429, CORS);
        if (await isLockedOut(DB, ip, 'student-login')) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        const rawBody = await request.json();
        // Mass assignment guard: only accept known fields
        const { code, school: bodySchool } = rawBody;
        if (Object.keys(rawBody).some(k => !['code','school'].includes(k))) return err('حقول غير مسموحة', 400, CORS);
        if (!code || !/^\d{10}$/.test(code)) return err('رمز غير صالح', 400, CORS);
        const sc = bodySchool || school;
        const student = sc
          ? await DB.prepare('SELECT id, code, name, school FROM students WHERE code = ? AND school = ?').bind(code, sc).first()
          : await DB.prepare('SELECT id, code, name, school FROM students WHERE code = ?').bind(code).first();
        if (!student) {
          await recordFailedAttempt(DB, ip, 'student-login');
          try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'warn','login',`محاولة دخول طالب فاشلة: ${code}`,'','student',sc,ip,new Date().toISOString()).run(); } catch {}
          return err('بيانات الدخول غير صحيحة', 401, CORS);
        }
        await clearFailedAttempts(DB, ip, 'student-login');
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const token = await jwtSign({ sub: student.id, role: 'student', name: student.name, school: student.school, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, env.JWT_SECRET);
        try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'success','login',`تسجيل دخول طالب: ${student.name}`,student.name,'student',student.school||'',ip,new Date().toISOString()).run(); } catch {}
        return ok({ token, student: { id: student.id, name: student.name, school: student.school } }, 200, CORS);
      }

      // POST /api/auth/admin-login
      if (sub === 'admin-login' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'admin-login', 5)) return err('طلبات كثيرة', 429, CORS);
        if (await isLockedOut(DB, ip, 'admin-login')) return err('تم تجميد المحاولات — أعد المحاولة بعد 15 دقيقة', 429, CORS);
        const rawAdminBody = await request.json();
        if (Object.keys(rawAdminBody).some(k => !['code','school'].includes(k))) return err('حقول غير مسموحة', 400, CORS);
        const { code: adminCode, school: bodySchool } = rawAdminBody;
        if (!adminCode || !/^\d{10}$/.test(adminCode)) return err('رمز غير صالح', 400, CORS);
        const admin = await DB.prepare('SELECT * FROM admins WHERE code = ?').bind(adminCode).first();
        const sc = bodySchool || school;
        if (!admin || (admin.school !== '*' && sc && admin.school !== sc)) {
          await recordFailedAttempt(DB, ip, 'admin-login');
          try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'warn','login',`محاولة دخول مشرف فاشلة: ${adminCode}`,'','admin',sc,ip,new Date().toISOString()).run(); } catch {}
          return err('بيانات الدخول غير صحيحة', 401, CORS);
        }
        await clearFailedAttempts(DB, ip, 'admin-login');
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const adminName = admin.admin_name || admin.name || '';
        // Normalize role: only 'director' keeps its value, everything else becomes 'admin'
        const adminRole = admin.role === 'director' ? 'director' : 'admin';
        const token = await jwtSign({ sub: admin.id, role: adminRole, name: adminName, school: admin.school, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, env.JWT_SECRET);
        try { await DB.prepare('INSERT INTO logs (id,level,category,message,user_name,user_role,school,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'success','login',`تسجيل دخول ${adminRole==='director'?'مدير':'مشرف'}: ${adminName}`,adminName,adminRole,admin.school||'',ip,new Date().toISOString()).run(); } catch {}
        return ok({ token, admin: { id: admin.id, name: adminName, school: admin.school, role: adminRole } }, 200, CORS);
      }

      // POST /api/auth/dev
      if (sub === 'dev' && method === 'POST') {
        if (!await rateLimit(DB, ip, 'dev-login', 5)) return err('طلبات كثيرة', 429, CORS);
        const { key } = await request.json();
        const devKey = env.DEV_KEY;
        if (!devKey || key !== devKey) return err('غير مصرح', 401, CORS);
        if (!env.JWT_SECRET) return err('خطأ في إعدادات الخادم', 500, CORS);
        const token = await jwtSign({ role: 'dev', exp: Math.floor(Date.now() / 1000) + 4 * 3600 }, env.JWT_SECRET);
        return ok({ token }, 200, CORS);
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
        // Admins are always limited to their own school from JWT — never from URL param
        // Directors/dev may filter by optional ?school= param
        let effectiveSchool;
        if (claims.role === 'admin') {
          effectiveSchool = claims.school || null;
        } else {
          effectiveSchool = school || null; // director/dev may filter or get all
        }
        if (effectiveSchool) { q += ' WHERE school = ?'; params.push(effectiveSchool); }
        q += ' ORDER BY created_at ASC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ students: results }, 200, CORS);
      }

      if (method === 'POST') {
        const postClaims = await verifyToken(request, env);
        if (!postClaims || !['admin','director','dev'].includes(postClaims.role)) return err('غير مصرح', 401, CORS);
        const body = await request.json();

        if (Array.isArray(body)) {
          const now = new Date().toISOString();
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
        if (claims.role === 'dev') {
          await DB.prepare('DELETE FROM students WHERE id = ?').bind(sub).run();
        } else {
          // Non-dev admins can only delete students from their own school
          const effectiveSchool = claims.school && claims.school !== '*' ? claims.school : school;
          if (!effectiveSchool) return err('المدرسة مطلوبة', 400, CORS);
          await DB.prepare('DELETE FROM students WHERE id = ? AND school = ?').bind(sub, effectiveSchool).run();
        }
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
        // Admins: always scope to their JWT school (dev/director may use URL param)
        const historySchool = claims.role === 'admin' ? (claims.school || null) : (school || null);
        if (historySchool) { q += ' AND school = ?'; params.push(historySchool); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      if (method === 'GET') {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        let q = 'SELECT * FROM plans';
        const params = [];
        // Admins: always scope to their JWT school
        const plansSchool = claims.role === 'admin' ? (claims.school || null) : (school || null);
        if (plansSchool) { q += ' WHERE school = ?'; params.push(plansSchool); }
        q += ' ORDER BY created_at DESC';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ plans: results.map(r => ({ ...r, gaps: JSON.parse(r.gaps || '[]') })) }, 200, CORS);
      }

      if (method === 'POST') {
        const claims = await verifyToken(request, env);
        if (!claims || !['student','admin','director'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const body = await request.json();
        // Mass assignment guard: only accept allowed fields
        const { gaps, school: bodySchool } = body;
        let { studentId, studentName } = body;
        // Students can only create plans for themselves — never trust body studentId
        if (claims.role === 'student') {
          studentId   = claims.sub;
          studentName = claims.name || '';
        }
        // Students cannot set status or adminNote — always start as 'pending'
        const status    = claims.role === 'student' ? 'pending' : (body.status || 'pending');
        const adminNote = claims.role === 'student' ? '' : (body.adminNote || '');
        const pid = crypto.randomUUID();
        const now = new Date().toISOString();
        // Admins: school always from JWT; dev/director may pass it
        const planSchool = claims.role === 'admin' ? (claims.school || '') : (bodySchool || school || '');
        await DB.prepare(
          `INSERT INTO plans (id, student_id, student_name, status, gaps, admin_note, school, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(pid, studentId, studentName, status, JSON.stringify(gaps), adminNote, planSchool, now).run();
        return ok({ plan: { id: pid, student_id: studentId, student_name: studentName, status, gaps, admin_note: adminNote, school: planSchool, created_at: now } }, 201, CORS);
      }

      if (method === 'PATCH' && sub) {
        const claims = await verifyToken(request, env);
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
      // Migrate: add answers column if table existed before this column was introduced
      try { await DB.prepare("ALTER TABLE test_results ADD COLUMN answers TEXT NOT NULL DEFAULT '[]'").run(); } catch {}

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
        // Admins scope to their own school from JWT
        const trSchool = claims.role === 'admin' ? (claims.school || null) : (school || null);
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
        let q = 'SELECT id, student_id, student_name, school, subject, test_type, score, correct, total, created_at FROM test_results';
        const params = [];
        if (trSchool) { q += ' WHERE school = ?'; params.push(trSchool); }
        q += ' ORDER BY created_at DESC LIMIT 1000';
        const { results } = await DB.prepare(q).bind(...params).all();
        return ok({ results }, 200, CORS);
      }
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
      try { await DB.prepare(`CREATE TABLE IF NOT EXISTS behavior_logs (
        id                     TEXT PRIMARY KEY,
        test_result_id         TEXT NOT NULL,
        student_id             TEXT NOT NULL,
        school                 TEXT NOT NULL DEFAULT '',
        exam_id                TEXT NOT NULL,
        avg_time_per_question  REAL NOT NULL DEFAULT 0,
        fastest_time           REAL NOT NULL DEFAULT 0,
        slowest_time           REAL NOT NULL DEFAULT 0,
        switching_count        INTEGER NOT NULL DEFAULT 0,
        fast_answer_ratio      REAL NOT NULL DEFAULT 0,
        speed_pattern          TEXT NOT NULL DEFAULT 'normal',
        confidence_level       INTEGER NOT NULL DEFAULT 0,
        guessing_pattern       INTEGER NOT NULL DEFAULT 0,
        suspicious_flag        INTEGER NOT NULL DEFAULT 0,
        suspicious_reasons     TEXT NOT NULL DEFAULT '[]',
        attempt_summary        TEXT NOT NULL DEFAULT '[]',
        created_at             TEXT NOT NULL
      )`).run(); } catch {}
      // Migration for behavior_logs tables created before attempt_summary existed
      try { await DB.prepare(`ALTER TABLE behavior_logs ADD COLUMN attempt_summary TEXT NOT NULL DEFAULT '[]'`).run(); } catch {}
      // attempt_logs (one row per question per attempt) is deprecated — per-question detail now
      // lives inline as JSON in behavior_logs.attempt_summary. The old table is dropped once via
      // POST /api/dev/migrate, not here, so this hot path never carries that extra round trip.

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
        const claims = await verifyToken(request, env);
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
        const claims = await verifyToken(request, env);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        const { testType, answers } = await request.json();
        if (testType !== 'pre' && testType !== 'post') return err('نوع الاختبار غير صالح', 400, CORS);
        if (!Array.isArray(answers) || answers.length === 0) return err('إجابات مطلوبة', 400, CORS);

        const { results: bank } = await DB.prepare(
          'SELECT qnum, sec, skill, text, opt1, opt2, opt3, opt4, ans, exp FROM bio_questions WHERE test_type = ? ORDER BY qnum ASC'
        ).bind(testType).all();
        if (!bank.length) return err('بنك الأسئلة غير موجود', 500, CORS);
        const qmap = Object.fromEntries(bank.map(q => [q.qnum, q]));

        // ── 1) CORE SCORING — correct/total only, nothing else may influence this ──
        const total = bank.length;
        let correct = 0;
        const breakdown = [];
        const storedAnswers = [];
        const attemptSummary = []; // per-question detail, kept in-memory only — written once as JSON, never as separate rows
        const times = [];
        let switchingCount = 0;
        let dkCount = 0;

        for (const q of bank) {
          const a = answers.find(x => Number(x.qnum) === q.qnum) || {};
          const selected = a.selected === 'dk' ? 'dk' : (Number.isInteger(Number(a.selected)) && a.selected !== null && a.selected !== undefined ? Number(a.selected) : null);
          const isCorrect = selected === q.ans;
          if (isCorrect) correct++;
          if (selected === 'dk') dkCount++;
          const timeSpent = Math.max(0, Number(a.timeSpent) || 0);
          const switches = Math.max(0, Number(a.switches) || 0);
          times.push(timeSpent);
          switchingCount += switches;
          breakdown.push({ qnum: q.qnum, sec: q.sec, skill: q.skill, text: q.text, opts: [q.opt1, q.opt2, q.opt3, q.opt4], ans: q.ans, exp: q.exp, selected, correct: isCorrect });
          storedAnswers.push({ q: q.qnum, a: selected, corr: q.ans });
          attemptSummary.push({ question_id: q.qnum, time_spent: timeSpent, is_correct: isCorrect ? 1 : 0, answer_changed_count: switches });
        }
        const finalScore = Math.round((correct / total) * 100);

        const rid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare(
          `INSERT INTO test_results (id, student_id, student_name, school, subject, test_type, score, correct, total, answers, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(rid, claims.sub, claims.name, claims.school || '', 'biology-g1', testType, finalScore, correct, total, JSON.stringify(storedAnswers), now).run();

        // ── 2) BEHAVIOR ANALYTICS — stored separately, never feeds the score above ──
        const avgTime    = times.reduce((s, t) => s + t, 0) / times.length;
        const fastestTime = Math.min(...times);
        const slowestTime = Math.max(...times);
        const fastCount   = times.filter(t => t > 0 && t < 3000).length;
        const fastRatio   = fastCount / total;
        const speedPattern = avgTime < 5000 ? 'fast' : avgTime > 20000 ? 'slow' : 'normal';
        const confidenceLevel = Math.max(0, Math.min(100, Math.round(
          100 - (dkCount / total) * 40 - Math.min(switchingCount / total, 1) * 30 - fastRatio * 30
        )));
        const guessingPattern = fastRatio > 0.6 && finalScore < 40;

        // ── 3) ANTI-CHEATING — pattern detection over behavior data only, never affects score ──
        const suspiciousReasons = [];
        if (avgTime > 0 && avgTime < 2000) suspiciousReasons.push('سرعة استجابة غير منطقية على كل الأسئلة');
        if (switchingCount > total * 2) suspiciousReasons.push('تغيير مفرط للإجابات');
        if (fastRatio > 0.8) suspiciousReasons.push('نمط تخمين سريع متكرر');
        if (slowestTime - fastestTime < 200 && total > 3) suspiciousReasons.push('توقيتات متطابقة بشكل غير طبيعي بين الأسئلة');
        const suspiciousFlag = suspiciousReasons.length > 0;

        // Single INSERT carries the full per-question detail as JSON — no row-per-question writes.
        const bid = crypto.randomUUID();
        await DB.prepare(
          `INSERT INTO behavior_logs (id, test_result_id, student_id, school, exam_id, avg_time_per_question, fastest_time, slowest_time, switching_count, fast_answer_ratio, speed_pattern, confidence_level, guessing_pattern, suspicious_flag, suspicious_reasons, attempt_summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(bid, rid, claims.sub, claims.school || '', `biology-g1:${testType}`, avgTime, fastestTime, slowestTime, switchingCount, fastRatio, speedPattern, confidenceLevel, guessingPattern ? 1 : 0, suspiciousFlag ? 1 : 0, JSON.stringify(suspiciousReasons), JSON.stringify(attemptSummary), now).run();

        if (suspiciousFlag) {
          try {
            await DB.prepare(
              'INSERT INTO logs (id, level, category, message, user_name, user_role, school, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(crypto.randomUUID(), 'warn', 'suspicious', `سلوك مشبوه في اختبار الأحياء (${testType}): ${suspiciousReasons.join('، ')}`, claims.name || '', 'student', claims.school || '', ip, now).run();
          } catch {}
        }

        // FOR STUDENT: final_score only + the breakdown needed to review answers — no behavior data
        return ok({ id: rid, created_at: now, score: finalScore, correct, total, breakdown }, 201, CORS);
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
        const qClaims = await verifyToken(request, env);
        if (!qClaims || !['admin','director','dev'].includes(qClaims.role)) return err('غير مصرح', 401, CORS);
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

    // GET /api/admins?school=X — list supervisors for chat (requires JWT)
    if (resource === 'admins' && !sub && method === 'GET' && school) {
      const admClaims = await verifyToken(request, env);
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
      const admClaims = await verifyToken(request, env);
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

      if (!authDev(request, env)) return err('غير مصرح', 401, CORS);

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

      // GET /api/dev/analytics — behavior analytics overview for the dashboard
      if (sub === 'analytics' && method === 'GET') {
        const totals = await DB.prepare(
          `SELECT COUNT(*) as cnt, AVG(score) as avgScore FROM test_results WHERE subject = 'biology-g1'`
        ).first().catch(() => ({ cnt: 0, avgScore: null }));

        const patternRows = await DB.prepare(
          `SELECT speed_pattern, COUNT(*) as cnt FROM behavior_logs GROUP BY speed_pattern`
        ).all().catch(() => ({ results: [] }));
        const patternDistribution = { fast: 0, normal: 0, slow: 0 };
        for (const r of (patternRows.results || [])) patternDistribution[r.speed_pattern] = r.cnt;

        const suspiciousCount = await DB.prepare(
          `SELECT COUNT(*) as cnt FROM behavior_logs WHERE suspicious_flag = 1`
        ).first().catch(() => ({ cnt: 0 }));

        const guessingCount = await DB.prepare(
          `SELECT COUNT(*) as cnt FROM behavior_logs WHERE guessing_pattern = 1`
        ).first().catch(() => ({ cnt: 0 }));

        const topSwitchers = await DB.prepare(
          `SELECT tr.student_name, tr.school, bl.switching_count, bl.exam_id, bl.created_at
           FROM behavior_logs bl JOIN test_results tr ON tr.id = bl.test_result_id
           ORDER BY bl.switching_count DESC LIMIT 10`
        ).all().catch(() => ({ results: [] }));

        // Per-question detail lives as JSON inside behavior_logs.attempt_summary (no attempt_logs table).
        // json_each unpacks it server-side in SQLite so this stays a single aggregate query, not N rows fetched into JS.
        const mostGuessedQuestions = await DB.prepare(
          `SELECT json_extract(je.value, '$.question_id') as question_id, COUNT(*) as guess_count
           FROM behavior_logs, json_each(behavior_logs.attempt_summary) je
           WHERE json_extract(je.value, '$.time_spent') > 0 AND json_extract(je.value, '$.time_spent') < 3000
             AND json_extract(je.value, '$.is_correct') = 0
           GROUP BY question_id ORDER BY guess_count DESC LIMIT 10`
        ).all().catch(() => ({ results: [] }));

        const errorLogs = await DB.prepare(
          `SELECT * FROM logs WHERE level = 'error' ORDER BY created_at DESC LIMIT 50`
        ).all().catch(() => ({ results: [] }));

        const suspiciousLogs = await DB.prepare(
          `SELECT * FROM logs WHERE category = 'suspicious' ORDER BY created_at DESC LIMIT 50`
        ).all().catch(() => ({ results: [] }));

        return ok({
          totals: { testsTaken: totals?.cnt || 0, avgScore: totals?.avgScore ? Math.round(totals.avgScore) : null },
          patternDistribution,
          suspiciousCount: suspiciousCount?.cnt || 0,
          guessingCount: guessingCount?.cnt || 0,
          topSwitchers: topSwitchers.results || [],
          mostGuessedQuestions: mostGuessedQuestions.results || [],
          errorLogs: errorLogs.results || [],
          suspiciousLogs: suspiciousLogs.results || [],
        }, 200, CORS);
      }

      // GET /api/dev/analytics/suspicious — full list of flagged attempts
      if (sub === 'analytics' && subsub === 'suspicious' && method === 'GET') {
        const { results } = await DB.prepare(
          `SELECT tr.student_name, tr.school, tr.subject, tr.test_type, tr.score, bl.*
           FROM behavior_logs bl JOIN test_results tr ON tr.id = bl.test_result_id
           WHERE bl.suspicious_flag = 1 ORDER BY bl.created_at DESC LIMIT 200`
        ).all();
        return ok({ flagged: results.map(r => ({ ...r, suspicious_reasons: JSON.parse(r.suspicious_reasons || '[]') })) }, 200, CORS);
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
        // One-time cleanup: attempt_logs was replaced by behavior_logs.attempt_summary (JSON)
        try { await DB.prepare('DROP TABLE IF EXISTS attempt_logs').run(); } catch {}
        return ok({ ok: true, tables: ['messages', 'tickets', 'ticket_replies'] }, 200, CORS);
      }
    }

    // ── DIRECTOR ENDPOINTS ───────────────────────────────────────────────────
    if (resource === 'director') {

      // Verify director via JWT — no sensitive code in URLs
      async function authDirector(targetSchool) {
        const claims = await verifyToken(request, env);
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
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/director/questions/:id?school=X — delete one question
      if (sub === 'questions' && subsub && method === 'DELETE') {
        const dir = await authDirector(school);
        if (!dir) return err('غير مصرح', 401, CORS);
        await DB.prepare('DELETE FROM questions WHERE id = ?').bind(subsub).run();
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

      // GET /api/messages/threads — admin: list students with conversations FOR THIS admin
      if (sub === 'threads' && method === 'GET') {
        if (!isPrivileged) return err('غير مسموح', 403, CORS);
        const adminId = url.searchParams.get('adminId') || '';
        let q, params;
        if (adminId && school) {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id AND m2.recipient_admin_id=? ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages WHERE recipient_admin_id=? AND school=?
               GROUP BY student_id ORDER BY last_at DESC`;
          params = [adminId, adminId, school];
        } else if (adminId) {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id AND m2.recipient_admin_id=? ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages WHERE recipient_admin_id=?
               GROUP BY student_id ORDER BY last_at DESC`;
          params = [adminId, adminId];
        } else if (school) {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages WHERE school=?
               GROUP BY student_id ORDER BY last_at DESC`;
          params = [school];
        } else {
          q = `SELECT student_id, student_name, school,
                 MAX(created_at) as last_at,
                 SUM(CASE WHEN sender_type='student' AND is_read=0 THEN 1 ELSE 0 END) as unread,
                 (SELECT body FROM messages m2 WHERE m2.student_id=messages.student_id ORDER BY m2.created_at DESC LIMIT 1) as last_msg
               FROM messages
               GROUP BY student_id ORDER BY last_at DESC`;
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
        if (msgClaims.role === 'student' && msgClaims.sub !== studentId) return err('غير مسموح', 403, CORS);
        // Admins verify the student belongs to their school
        if (isPrivileged && msgClaims.role !== 'dev' && msgClaims.school && msgClaims.school !== '*') {
          const msgStudent = await DB.prepare('SELECT school FROM students WHERE id = ?').bind(studentId).first();
          if (!msgStudent || msgStudent.school !== msgClaims.school) return err('غير مسموح', 403, CORS);
        }
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
          if (!targetStudentId) return err('معرّف الطالب مطلوب', 400, CORS);
          // Verify the target student belongs to this admin's school
          if (msgClaims.role !== 'dev' && msgClaims.school && msgClaims.school !== '*') {
            const targetSt = await DB.prepare('SELECT school, name FROM students WHERE id = ?').bind(targetStudentId).first();
            if (!targetSt || targetSt.school !== msgClaims.school) return err('غير مسموح', 403, CORS);
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
        const effectiveSchool = (msgClaims.school && msgClaims.school !== '*') ? msgClaims.school : (school || bodySchool || '');
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
        // Admins can only mark messages read for students in their own school
        if (isPrivileged && msgClaims.role !== 'dev' && msgClaims.school && msgClaims.school !== '*') {
          const readSt = await DB.prepare('SELECT school FROM students WHERE id = ?').bind(studentId).first();
          if (!readSt || readSt.school !== msgClaims.school) return err('غير مسموح', 403, CORS);
        }
        const senderType = readerType === 'admin' ? 'student' : 'admin';
        await DB.prepare(
          'UPDATE messages SET is_read=1 WHERE student_id=? AND sender_type=? AND is_read=0'
        ).bind(studentId, senderType).run();
        return ok({ ok: true }, 200, CORS);
      }
    }

    // ── TICKETS ──────────────────────────────────────────────────────────────
    if (resource === 'tickets') {
      // Accept either JWT or X-Dev-Key (for dev panel)
      const _devAuth = authDev(request, env);
      const tkClaims = _devAuth ? { role: 'dev', sub: 'dev' } : await verifyToken(request, env);
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
          // Admins always scoped to their school; directors/dev may filter by ?school=
          const tkSchool = tkClaims.role === 'admin' ? (tkClaims.school || null) : (school || null);
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
        if (tkClaims.role === 'admin' && tkClaims.school && ticket.school !== tkClaims.school) return err('غير مسموح', 403, CORS);
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
        if (tkClaims.role === 'admin' && tkClaims.school && ticket.school !== tkClaims.school) return err('غير مسموح', 403, CORS);
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
      } catch {}

      // POST /api/broadcasts — admin creates broadcast
      if (!sub && method === 'POST') {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        const { message } = await request.json();
        if (!message || message.trim().length < 3) return err('الرسالة قصيرة جداً', 400, CORS);
        if (message.length > 500) return err('الرسالة طويلة جداً (الحد 500 حرف)', 400, CORS);
        const broadcastSchool = (claims.school && claims.school !== '*') ? claims.school : school;
        if (!broadcastSchool) return err('المدرسة مطلوبة', 400, CORS);
        const bid = crypto.randomUUID();
        const now = new Date().toISOString();
        await DB.prepare('INSERT INTO broadcasts (id, school, admin_id, admin_name, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(bid, broadcastSchool, claims.sub || '', claims.name || 'المشرف', message.trim(), now).run();
        return ok({ broadcast: { id: bid, admin_name: claims.name, message: message.trim(), created_at: now } }, 201, CORS);
      }

      // GET /api/broadcasts/active?school=X — student gets unseen broadcasts
      if (sub === 'active' && method === 'GET') {
        const claims = await verifyToken(request, env);
        if (!claims) return err('غير مصرح', 401, CORS);
        if (claims.role === 'student') {
          // Students: always use their own school from JWT — never trust URL param
          const sc = claims.school || '';
          if (!sc) return ok({ broadcasts: [] }, 200, CORS);
          const { results } = await DB.prepare(`
            SELECT b.* FROM broadcasts b
            WHERE b.school = ? AND NOT EXISTS (
              SELECT 1 FROM broadcast_dismissals d WHERE d.broadcast_id = b.id AND d.student_id = ?
            ) ORDER BY b.created_at DESC LIMIT 5
          `).bind(sc, claims.sub).all();
          return ok({ broadcasts: results }, 200, CORS);
        } else {
          // Admins/directors: scoped to their own school (dev can pass school param)
          const sc = (claims.school && claims.school !== '*') ? claims.school : (school || '');
          if (!sc) return ok({ broadcasts: [] }, 200, CORS);
          const { results } = await DB.prepare('SELECT * FROM broadcasts WHERE school = ? ORDER BY created_at DESC LIMIT 30').bind(sc).all();
          return ok({ broadcasts: results }, 200, CORS);
        }
      }

      // POST /api/broadcasts/:id/dismiss — student dismisses broadcast
      if (sub && subsub === 'dismiss' && method === 'POST') {
        const claims = await verifyToken(request, env);
        if (!claims || claims.role !== 'student') return err('غير مصرح', 401, CORS);
        try { await DB.prepare('INSERT OR IGNORE INTO broadcast_dismissals (broadcast_id, student_id) VALUES (?, ?)').bind(sub, claims.sub).run(); } catch {}
        return ok({ ok: true }, 200, CORS);
      }

      // DELETE /api/broadcasts/:id — admin deletes broadcast (scoped to own school)
      if (sub && !subsub && method === 'DELETE') {
        const claims = await verifyToken(request, env);
        if (!claims || !['admin','director','dev'].includes(claims.role)) return err('غير مصرح', 401, CORS);
        if (claims.role === 'dev') {
          await DB.prepare('DELETE FROM broadcasts WHERE id = ?').bind(sub).run();
        } else {
          // Admin/director can only delete broadcasts from their own school
          const res = await DB.prepare('DELETE FROM broadcasts WHERE id = ? AND school = ?').bind(sub, claims.school).run();
          if (!res.meta?.changes) return err('غير موجود أو غير مصرح', 404, CORS);
        }
        return ok({ ok: true }, 200, CORS);
      }
    }

    return err('غير موجود', 404, CORS);

  } catch (e) {
    console.error('[API Error]', e);
    return err('خطأ في الخادم', 500, getCORS(request));
  }
}
