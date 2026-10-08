# تقرير تنفيذ وشيج

تاريخ التنفيذ: ٨ أكتوبر ٢٠٢٦. فرع prototype، أساس `def85c278a52a1cb133143e676e46249b887259c`. جميع التغييرات داخل مستودع وشيج المستقل، ولا أجنتات فرعية ولا حزم مثبتة ولا اتصال Gemini ولا بيانات مشارك شخصية.

## مراحل العمل

1. قراءة الموجز وخطة التنفيذ العامة؛ كتابة اختبارات المحرك والإقرار أولًا، قبل ملفات src.
2. تنفيذ تعداد مضبوط ومقارن baseline، مع اختبارات مرجع تعداد مستقل على ٤٠ حالة. commit أول `78d5721`.
3. استلام مراجعة مبكرة وإصلاح حساب العبء المقبول بالسعات الأصلية وإضافة regression محدد. تقليل النطاق إلى ستة أعضاء وستة طلبات بإذن المنسق لأن التعداد عند الثمانية قد يكون بطيئًا.
4. فصل دعوة المنظم عن credential العضو. الدعوة تُستهلك بعد اختيار العضو سرًا خاصًا؛ حفظ scrypt+salt؛ لا يعاد إصدار دور مسجل من المنظم. لا ندعي إثبات هوية فاتح الدعوة الأول.
5. كتابة اختبارات HTTP قبل الخادم، ثم تنفيذ الأصل والمدخلات والصلاحيات والتخزين المتسلسل والحفظ قبل الرد.
6. واجهة RTL كاملة: بداية وتجربة مؤلفة ودائرة فارغة، قدرات، طلبات، تخصيص ورفض وإلغاء، روابط منفصلة وتسجيل، قبول وإقرار، عبء وفرص، دليل آلي، تصدير ومسح. كل نص المستخدم عبر textContent.
7. README عربي، ٦ Mermaid و٣ SVG، مصادر بدائل رسمية، build مستقل بلا بيانات. صور حقيقية من رحلة المتصفح يضيفها المنسق.

## الدليل الأحمر السابق للتنفيذ

Node المستخدم دائمًا `C:/Users/fysl9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`، الإصدار `v24.19.0`.

الأمر `node --test test/core.test.mjs` قبل إنشاء src، exit 1:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\shamela\work\norah_final\projects\washeej\src\allocator.mjs' imported from C:\shamela\work\norah_final\projects\washeej\test\core.test.mjs
Node.js v24.19.0
✖ test\core.test.mjs (94.5212ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 104.1241
```

الأمر `node --test test/http.test.mjs` قبل إنشاء server، exit 1:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\shamela\work\norah_final\projects\washeej\server.mjs' imported from C:\shamela\work\norah_final\projects\washeej\test\http.test.mjs
Node.js v24.19.0
✖ test\http.test.mjs (101.7709ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 111.4744
```

أول تشغيل HTTP داخل sandbox واجه `connect EACCES 127.0.0.1:<temporary port>`، ولم يكن فشل منطق المنتج. أُعيد عبر تصريح تنفيذ الاختبارات المحلية المأذونة واجتازها. لا تثبيت ولا تخطٍّ لفحص Origin في المنتج.

## التحقق النهائي

الأمر `node --test test/*.test.mjs`، exit 0 بعد آخر تعديل منطقي:

```text
✔ constraints include capacity, skill, time, self, voluntary participation and receive-only (15.934ms)
✔ allocator agrees with independent exhaustive small-case oracle (40 fixtures) (8.9014ms)
✔ determinism and true unmet-constraint explanation (0.3858ms)
✔ two independent acknowledgements on same version are required for completion (4.2413ms)
✔ edits invalidate old versions and member acknowledgements; decline replans (0.8221ms)
✔ private role hashes, expiry, views and export never disclose another token (84.0159ms)
✔ whole-round burden includes accepted loads and opportunity counts (review regression) (0.6435ms)
✔ maximum supported six-by-six complete eligibility search stays bounded (76.9697ms)
✔ HTTP complete journey, private roles, stale versions, inputs, same origin and redacted export (737.4658ms)
✔ storage failure cannot publish a successful mutation (5.9493ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 874.6551
```

الأمر `node scripts/build.mjs`، exit 0:

```text
BUILD PASS: 7 JavaScript modules checked; Arabic RTL entry and text-only DOM output verified.
BUILD PASS: standalone dist/ assembled with server, public, src, docs and private package; data and secrets excluded.
```

التوقيت عينة تشغيل على هذا الجهاز وليس ضمان زمن على كل جهاز. `npm run verify` يربط هذين الأمرين على التوالي عبر package scripts؛ لا يعتمد على حزمة اختبار إضافية. جميع الادعاءات في evidence برمجية وليست نتائج مشاركين.

## صلاحيات وحدود

- credential المنظم مرفوض لإقرار عضو. العضو الثالث مرفوض، ونسخة stale مرفوضة. الدعوة نفسها لا تقرأ الدائرة ولا تقرّ مساندة، واستعمالها ثانية مرفوض. admin invite لعضو مسجل HTTP409.
- لا raw tokens أو enrollment hashes في view/export. لا سجلات نص المستخدم أو credentials. بيانات القرص خارج Git، وخادم loopback مع SameOrigin. لا ضمان هوية إنسان أو جهاز، ولا تشفير قرص أو TLS أو حسابات تعافي إداري.
- الحد ٦×٦ مع اختبار كثيف دون تجاوز ٣ ثوانٍ. حقول نافذة عامة وليست تقويمًا دقيقًا. الفرص/العبء هدف عددي معلن، وقد لا يعبّر عن كل جوانب العدالة الاجتماعية.
- الدور والدعوة ينتهيان خلال ٧ أيام ثابتة؛ لا refresh يمددهما. حد ٢٠ دائرة. لا تشغيل multi-process على ملف الحفظ؛ قد يبقى temporary file عند فشل قرص أو قطع العملية.
- لا أثر ميداني مقاس، لا رسائل مرسلة، لا مساندة فعلية منفذة آليًا. شخصية العرض تستقبل فقط دون التزام تقديم.
- npm scripts موجودة ومعادلاتها تعمل بالمرفق. لا توجد npm CLI ضمن bin المرفق؛ تُنفذ اختبارات/build مباشرة بـNode دون الاعتماد على Node النظام.

## قرارات تصحيحية

اختبارات النسخ الأولى افترضت version1 بعد أول تخصيص، بينما التخصيص يرفع نسخة الطلب؛ صُححت الاختبارات لتستخدم نسخة الكائن الفعلية وتفحص stale مقابلها. لم يُلغَ رفع النسخة لإرضاء الاختبار. احتُفظ بالعبء المحجوز كاملًا بعد مراجعة مستقلة، واختُبرت الحالة المضادة الجديدة. لا claim لمنع انتحال الهوية المطلقة لمجرد حظر role admin.

## commits

- `78d5721`: اختبارات المحرك والإقرار والتعداد الأول، قبل الخادم والواجهة.
- `904d613`: الرحلة العربية كاملة، دعوة أحادية وسر مستقل، حساب العبء المحجوز، اختبارات HTTP، وثائق ومخططات وبناء مستقل.
- commit توثيقي تالٍ يسجل هذا الخرج ويزيل سطرًا زائدًا في نهاية HTML؛ لا تغييرات سلوكية بعد الخرج المذكور.
