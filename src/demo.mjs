import { createCircle, addMember, addRequest, plan } from './domain.mjs';
export function demo() {
  const created = createCircle('دائرة الندى');
  const c = created.circle; c.demo = true;
  const members = [
    { name: 'سُهى', skills: ['قراءة', 'تقنية'], windows: ['مساء', 'نهاية الأسبوع'], capacity: 60, optIn: true, previousOpportunities: 2 },
    { name: 'رائد', skills: ['تقنية', 'مشي'], windows: ['مساء', 'نهاية الأسبوع'], capacity: 60, optIn: true, previousOpportunities: 0 },
    { name: 'هالة', skills: ['قراءة', 'مشي'], windows: ['مساء', 'نهاية الأسبوع'], capacity: 60, optIn: true, previousOpportunities: 1 },
    { name: 'نادر', skills: [], windows: [], capacity: 0, optIn: false, previousOpportunities: 0 }
  ].map(m => addMember(c, m));
  [
    { title: 'مراجعة رسالة قصيرة', requester: members[3].id, skill: 'قراءة', window: 'مساء', duration: 30 },
    { title: 'إعداد تطبيق للقراءة', requester: members[2].id, skill: 'تقنية', window: 'مساء', duration: 30 },
    { title: 'رفقة مشي في الحديقة', requester: members[0].id, skill: 'مشي', window: 'نهاية الأسبوع', duration: 30 },
    { title: 'تعلّم أساسيات التصوير', requester: members[1].id, skill: 'تصوير', window: 'مساء', duration: 30 }
  ].forEach(r => addRequest(c, r));
  plan(c); return created;
}
