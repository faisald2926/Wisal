import { fail } from './domain.mjs';
export const WINDOWS = ['صباح', 'ظهر', 'مساء', 'نهاية الأسبوع'];
export function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail(400, 'حقول غير صالحة.');
  return value;
}
export function text(value, label, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(400, `${label}: أدخل نصًا من ١ إلى ${max} حرفًا.`);
  return value.trim();
}
export function number(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(400, `${label}: القيمة خارج النطاق.`);
  return value;
}
const list = (value, label, max, allowed) => {
  if (!Array.isArray(value) || value.length > max) fail(400, `${label}: قائمة غير صالحة.`);
  const clean = [...new Set(value.map(v => text(v, label, 40)))];
  if (allowed && clean.some(v => !allowed.includes(v))) fail(400, `${label}: خيار غير معروف.`);
  return clean;
};
export function memberInput(body) {
  object(body, ['name', 'skills', 'windows', 'capacity', 'optIn', 'previousOpportunities']);
  if (typeof body.optIn !== 'boolean') fail(400, 'حدد الرغبة الطوعية صراحة.');
  const value = { name: text(body.name, 'الاسم المستعار', 40), skills: list(body.skills, 'القدرات', 8), windows: list(body.windows, 'الأوقات', 4, WINDOWS),
    capacity: number(body.capacity, 'السعة', 0, 240), optIn: body.optIn, previousOpportunities: number(body.previousOpportunities, 'الفرص السابقة', 0, 10000) };
  if (value.optIn && (!value.skills.length || !value.windows.length || value.capacity < 15)) fail(400, 'الراغب في التقديم يحتاج قدرة ووقتًا وسعة لا تقل عن ١٥ دقيقة.');
  return value;
}
export function requestInput(body) {
  object(body, ['title', 'requester', 'skill', 'window', 'duration']);
  if (!WINDOWS.includes(body.window)) fail(400, 'اختر نافذة وقت معروفة.');
  const duration = number(body.duration, 'مدة الطلب', 15, 120);
  if (duration % 15) fail(400, 'المدة من مضاعفات ١٥ دقيقة.');
  return { title: text(body.title, 'عنوان الطلب', 120), requester: text(body.requester, 'صاحب الطلب', 60), skill: text(body.skill, 'القدرة', 40), window: body.window, duration };
}
