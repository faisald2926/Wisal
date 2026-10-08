import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { allocate, baseline, objective } from './allocator.mjs';
export const TOKEN_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const hash = token => createHash('sha256').update(token).digest('hex');
const id = () => randomUUID();
function grant(c, role, memberId) {
  const token = randomBytes(32).toString('base64url'), expiresAt = Date.now() + TOKEN_LIFETIME;
  c.grants.push({ role, memberId, tokenHash: hash(token), expiresAt });
  return { token, expiresAt, memberId };
}
export function createCircle(name) {
  const circle = { id: id(), name, createdAt: new Date().toISOString(), demo: false, members: [], requests: [], grants: [], lastPlan: null };
  return { circle, ...grant(circle, 'admin', null) };
}
export function authorize(c, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 100) fail(403, 'رابط الدور غير صالح أو منتهي.');
  const digest = Buffer.from(hash(token), 'hex');
  const g = c.grants.find(g => timingSafeEqual(Buffer.from(g.tokenHash, 'hex'), digest));
  if (!g || g.expiresAt <= now) fail(403, 'رابط الدور غير صالح أو منتهي.');
  return { role: g.role, memberId: g.memberId, expiresAt: g.expiresAt };
}
export function invite(c, memberId) {
  if (!c.members.some(m => m.id === memberId)) fail(404, 'العضو غير موجود.');
  c.grants = c.grants.filter(g => g.memberId !== memberId);
  return grant(c, 'member', memberId);
}
export function addMember(c, fields) {
  if (c.members.length >= 8) fail(409, 'الحد الأقصى ثمانية أعضاء.');
  const m = { id: id(), ...fields };
  c.members.push(m); return m;
}
export function addRequest(c, fields) {
  if (c.requests.length >= 8) fail(409, 'الحد الأقصى ثمانية طلبات لهذه الجولة.');
  if (!c.members.some(m => m.id === fields.requester)) fail(400, 'اختر صاحب طلب من الدائرة.');
  const r = { id: id(), ...fields, version: 1, status: 'suggested', provider: null, declined: [], providerAccepted: false, requesterAccepted: false, providerConfirmed: false, requesterConfirmed: false };
  c.requests.push(r); return r;
}
const terminal = r => ['completed', 'cancelled'].includes(r.status);
const reset = r => { r.providerAccepted = false; r.requesterAccepted = false; r.providerConfirmed = false; r.requesterConfirmed = false; r.status = 'suggested'; };
export function plan(c) {
  const locked = c.requests.filter(r => r.status === 'completed' || !terminal(r) && (r.providerAccepted || r.requesterAccepted));
  const pending = c.requests.filter(r => !terminal(r) && !locked.includes(r));
  const members = c.members.map(m => ({ ...m, capacity: Math.max(0, m.capacity - locked.filter(r => r.provider === m.id).reduce((sum, r) => sum + r.duration, 0)) }));
  const result = allocate(members, pending);
  for (const a of result.assignments) {
    const r = c.requests.find(r => r.id === a.requestId);
    if (r.provider !== a.provider) { r.version++; reset(r); }
    r.provider = a.provider;
    r.uncoveredReason = result.uncovered.find(u => u.requestId === r.id)?.reason ?? null;
  }
  const first = baseline(members, pending);
  c.lastPlan = { at: new Date().toISOString(), score: result.score, uncovered: result.uncovered, baseline: objective(members, pending, first), visited: result.visited, lockedCount: locked.length };
  return c.lastPlan;
}
export function editRequest(c, requestId, changes) {
  const r = c.requests.find(r => r.id === requestId);
  if (!r) fail(404, 'الطلب غير موجود.');
  if (terminal(r)) fail(409, 'الطلب مغلق.');
  Object.assign(r, changes); r.version++; r.declined = []; reset(r); plan(c); return r;
}
export function editMember(c, memberId, changes) {
  const m = c.members.find(m => m.id === memberId);
  if (!m) fail(404, 'العضو غير موجود.');
  Object.assign(m, changes);
  for (const r of c.requests) if (!terminal(r) && (r.provider === m.id || r.requester === m.id)) { r.version++; reset(r); }
  plan(c); return m;
}
export function act(c, actor, requestId, version, action) {
  if (actor.role !== 'member') fail(403, 'الإقرار يخص العضو نفسه.');
  const r = c.requests.find(r => r.id === requestId);
  if (!r) fail(404, 'الطلب غير موجود.');
  if (r.version !== version || terminal(r)) fail(409, 'تغيرت نسخة الطلب أو أُغلق. حدّث الصفحة.');
  const side = r.provider === actor.memberId ? 'provider' : r.requester === actor.memberId ? 'requester' : null;
  if (!side) fail(403, 'هذا الإجراء لا يخص دورك.');
  if (!r.provider && action !== 'decline') fail(409, 'لم يُقترح مقدم لهذا الطلب.');
  if (action === 'accept') {
    if (r[`${side}Accepted`]) return r;
    r[`${side}Accepted`] = true;
    r.status = r.providerAccepted && r.requesterAccepted ? 'in_progress' : `accepted_by_${side}`;
  } else if (action === 'confirm') {
    if (!r.providerAccepted || !r.requesterAccepted) fail(409, 'يجب قبول الطرفين أولًا.');
    r[`${side}Confirmed`] = true;
    r.status = r.providerConfirmed && r.requesterConfirmed ? 'completed' : `confirmed_by_${side}`;
    if (r.status === 'completed') c.members.find(m => m.id === r.provider).previousOpportunities++;
  } else if (action === 'decline') {
    if (r.providerConfirmed || r.requesterConfirmed) fail(409, 'يوجد إقرار تنفيذ؛ استخدم تعديل الطلب مع توضيح للطرفين.');
    if (side === 'requester') { r.status = 'cancelled'; r.version++; resetFlags(r); }
    else { r.declined.push(actor.memberId); r.version++; reset(r); r.provider = null; }
    plan(c);
  } else fail(400, 'الإجراء غير معروف.');
  return r;
}
function resetFlags(r) { r.providerAccepted = r.requesterAccepted = r.providerConfirmed = r.requesterConfirmed = false; }
export function cancel(c, requestId) {
  const r = c.requests.find(r => r.id === requestId);
  if (!r) fail(404, 'الطلب غير موجود.');
  if (terminal(r)) fail(409, 'الطلب مغلق.');
  r.status = 'cancelled'; r.version++; resetFlags(r); plan(c);
}
export function view(c, actor) {
  return { id: c.id, name: c.name, createdAt: c.createdAt, demo: c.demo, role: actor.role, memberId: actor.memberId,
    members: structuredClone(c.members), requests: structuredClone(actor.role === 'admin' ? c.requests : c.requests.filter(r => r.requester === actor.memberId || r.provider === actor.memberId)),
    lastPlan: actor.role === 'admin' ? structuredClone(c.lastPlan) : null };
}
