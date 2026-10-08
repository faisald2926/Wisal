# معمارية وشيج

المخططات الستة الآتية وصف للمنفذ فعليًا. حد النطاق ٦ أعضاء و٦ طلبات؛ كل دائرة مخزنة محليًا، ولا اتصالات تشغيل بخدمة AI.

## ١. حدود النظام

```mermaid
flowchart RL
  Admin[متصفح المنظم] --> HTTP[خادم Node محلي 127.0.0.1]
  Member[متصفح عضو مستقل] --> HTTP
  HTTP --> Validate[تحقق Origin والمضيف والحقول]
  Validate --> Domain[أدوار ونسخ وإقرارات]
  Domain --> Allocator[محرك تعداد محدود]
  Domain --> Store[معاملة متسلسلة]
  Store --> Disk[(data/circles.json خارج Git)]
  HTTP --> Static[واجهة RTL ومخططات وأدلة عامة]
```

## ٢. الرحلة

```mermaid
flowchart RL
  Create[إنشاء دائرة] --> Members[أسماء مستعارة وقدرات طوعية]
  Members --> Requests[طلب صغير بقدرة ووقت ومدة]
  Requests --> Suggest[اقتراح ممكن مع تفسير]
  Suggest --> Invites[دعوتان لطرفي الطلب]
  Invites --> Accept[قبول مستقل للطرفين]
  Accept --> Outside[التنسيق والتنفيذ خارج الموقع]
  Outside --> Confirm[إقرار مستقل للطرفين]
  Confirm --> Done[منجز مسجل]
  Done --> Review[توزيع فرص وعبء وتصدير]
  Suggest --> Refuse[رفض اختياري]
  Refuse --> Replan[استبعاد الرافض وإعادة التخطيط]
  Replan --> Suggest
```

## ٣. حالات الطلب

```mermaid
stateDiagram-v2
  [*] --> suggested
  suggested --> accepted_by_provider: المقدم يقبل النسخة
  suggested --> accepted_by_requester: صاحب الطلب يقبل النسخة
  accepted_by_provider --> in_progress: صاحب الطلب يقبل
  accepted_by_requester --> in_progress: المقدم يقبل
  in_progress --> confirmed_by_provider: المقدم يقر التنفيذ
  in_progress --> confirmed_by_requester: صاحب الطلب يقر التنفيذ
  confirmed_by_provider --> completed: صاحب الطلب يقر النسخة نفسها
  confirmed_by_requester --> completed: المقدم يقر النسخة نفسها
  suggested --> cancelled: إلغاء أو سحب صاحب الطلب
  accepted_by_provider --> suggested: رفض المقدم أو تعديل مرتبط
  accepted_by_requester --> suggested: رفض المقدم أو تعديل مرتبط
  in_progress --> suggested: تعديل الطلب أو قدرة مرتبطة
  confirmed_by_provider --> suggested: تعديل مرتبط قبل إغلاق الطلب
  confirmed_by_requester --> suggested: تعديل مرتبط قبل إغلاق الطلب
  completed --> [*]
  cancelled --> [*]
```

يسمح التعديل بإبطال إقرار واحد قبل إغلاق الطلب؛ يُرفع version ولا تقبل إجراءات النسخة السابقة. الطلب المغلق غير قابل للتعديل. الرفض لا يسمح به بعد إقرار تنفيذ أحد الطرفين؛ التعديل الصريح متاح قبل الإنجاز.

## ٤. دعوة وتسجيل خاص

```mermaid
sequenceDiagram
  participant A as المنظم
  participant S as الخادم
  participant M as العضو
  A->>S: إصدار دعوة لعضو غير مسجل
  S-->>A: invitation عشوائي لمدة 7 أيام
  A-->>M: رابط دعوة أحادي الاستخدام
  M->>S: invitation + سر اختاره العضو
  S->>S: استهلاك الدعوة وحفظ scrypt(secret,salt)
  S-->>M: credential خاص لمدة 7 أيام
  A->>S: طلب إعادة دعوة العضو المسجل
  S-->>A: 409 لا إعادة إصدار
  A->>S: إقرار عبر credential المنظم
  S-->>A: 403 يخص الطرف نفسه
  M->>S: إقرار عبر credential العضو وversion
  S-->>M: حالة محفوظة بعد commit
```

لا يثبت هذا البروتوكول من فتح الدعوة أولًا؛ لا ندعي منع انتحال الهوية البشرية. يؤمّن فصل إصدار الصلاحية بعد تسجيل العضو بسر خاص، ولا يملك المنظم endpoint إعادة ضبط ذلك السر.

## ٥. البحث وهدفه

```mermaid
flowchart TD
  Pending[طلبات غير محجوزة] --> Candidates[أهلية رغبة وقدرة ووقت وغير صاحب الطلب]
  Locked[طلبات مقبولة أو منجزة] --> Reserved[أحمال وفرص محجوزة بالسعات الأصلية]
  Candidates --> DFS[تعداد: كل مقدم مؤهل أو عدم تخصيص]
  Reserved --> DFS
  DFS --> Capacity{السعة تكفي بعد المحجوز؟}
  Capacity -->|نعم| Branch[فرع التوزيع]
  Capacity -->|لا| Skip[استبعاد الفرع]
  Branch --> Bound{أقصى تغطية الباقي أقل من أفضل؟}
  Bound -->|نعم| Skip
  Bound -->|لا| Score[تغطية ثم عبء ثم فرص ثم تعادل ثابت]
  Score --> Best[احتفظ بأفضل حل كامل]
  Best --> Explain[تفسير القيد الحاسم لغير المغطى]
```

مع `m` أعضاء و`r` طلبات يحدّ التعداد `(m+1)^r` قبل تقليم القيود. في طلب صحيح صاحبُه ضمن الدائرة، فيقل عدد المرشحين إلى `m-1` ويكون الحد `m^r` شاملاً عدم التخصيص، أي `6^6 = 46,656` فرع ورقة خام؛ التقليم يخفض visited الفعلي. لا يُستبعد فرع ممكن بسبب العبء؛ التقليم الوحيد للقيمة يمنع فرعًا لا يمكنه بلوغ أفضل تغطية. لذلك كل حل مفضل ممكن بقي قابلًا للفحص. الذاكرة عمق r وأفضل صفوف، دون cache تزداد مع كل حل. مقارنة كسور JavaScript لها هامش عددي معلن.

## ٦. الحفظ والتحقق

```mermaid
sequenceDiagram
  participant C as المتصفح
  participant H as HTTP
  participant D as نسخة دائرة مسودة
  participant F as القرص
  C->>H: POST Origin + role credential + JSON
  H->>H: فحص الأصل والمدخل والصلاحية والنسخة
  H->>D: نسخ الحالة ثم تغييرها في طابور
  D->>F: write ملف مؤقت
  F->>F: rename إلى circles.json
  alt حفظ ناجح
    F-->>H: نجاح
    H->>H: نشر المسودة في الذاكرة
    H-->>C: 200 بحالة محفوظة
  else تعذر الحفظ
    F-->>H: خطأ
    H-->>C: 500 دون نشر المسودة
  end
```

ملف القرص لا يشفر الأسماء/الطلبات، ولا يدعم عمليتين متزامنتين. الحذف يكتب ملف الدوائر المتبقية، فلا تبقى الدائرة في ملف البيانات الحالي. قد يبقى ملف مؤقت عند تعطل العملية أثناء الحفظ؛ تُعامل مجلدات data والنسخ الاحتياطية كلها كبيانات خاصة.

## SVG قابلة للعرض

![رحلة المساندة](diagrams/flow.svg)

![التوزيع](diagrams/matching.svg)

![الإقرار](diagrams/consent.svg)

الرسوم تفسيرية مؤلفة. اللقطات الحقيقية تُضاف بعد تحقق المتصفح.
