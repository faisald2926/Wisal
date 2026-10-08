import { randomBytes, randomUUID, createHash, timingSafeEqual, scryptSync } from 'node:crypto';
import { allocate, baseline, objective } from './allocator.mjs';
export const TOKEN_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const hash = token => createHash('sha256').update(token).digest('hex');
const id = () => randomUUID();
function grant(c, role, memberId, expiresAt = Date.now() + TOKEN_LIFETIME) {
  const token = randomBytes(32).toString('base64url');
  c.grants.push({ role, memberId, tokenHash: hash(token), expiresAt });
  return { token, expiresAt, memberId };
}
export function createCircle(name) {
  const circle = { id: id(), name, createdAt: new Date().toISOString(), demo: false, members: [], requests: [], grants: [], enrollments: {}, lastPlan: null };
  return { circle, ...grant(circle, 'admin', null) };
}
export function authorize(c, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 100) fail(403, 'رابط الدور غير صالح أو منتهي.');
  const digest = Buffer.from(hash(token), 'hex');
  const g = c.grants.find(g => timingSafeEqual(Buffer.from(g.tokenHash, 'hex'), digest));
  if (!g || g.role === 'invitation' || g.expiresAt <= now) fail(403, 'رابط الدور غير صالح أو منتهي.');
  return { role: g.role, memberId: g.memberId, expiresAt: g.expiresAt };
}
export function invite(c, memberId) {
  if (!c.members.some(m => m.id === memberId)) fail(404, 'العضو غير موجود.');
  if (c.enrollments[memberId]) fail(409, 'العضو سجّل دوره بالفعل؛ المنظم لا يستطيع إعادة إصدار صلاحية العضو.');
  c.grants = c.grants.filter(g => g.memberId !== memberId);
  return grant(c, 'invitation', memberId);
}
export function enroll(c, invitation, secret) {
  if (typeof invitation !== 'string' || typeof secret !== 'string' || secret.length < 12 || secret.length > 128) fail(400, 'اختر سرًا خاصًا من ١٢ إلى ١٢٨ حرفًا.');
  const g = c.grants.find(g => g.role === 'invitation' && g.tokenHash === hash(invitation) && g.expiresAt > Date.now());
  if (!g || c.enrollments[g.memberId]) fail(403, 'الدعوة منتهية أو استُخدمت بالفعل.');
  const salt = randomBytes(16).toString('hex'), expiresAt = Date.now() + TOKEN_LIFETIME;
  c.enrollments[g.memberId] = { salt, secretHash: scryptSync(secret, salt, 32).toString('hex'), expiresAt };
  c.grants = c.grants.filter(other => other.memberId !== g.memberId);
  c.members.find(m => m.id === g.memberId).enrolled = true;
  return grant(c, 'member', g.memberId, expiresAt);
}
export function memberLogin(c, memberId, secret) {
  const e = c.enrollments[memberId];
  if (!e || e.expiresAt <= Date.now() || typeof secret !== 'string' || secret.length < 12 || secret.length > 128 || !timingSafeEqual(Buffer.from(e.secretHash, 'hex'), scryptSync(secret, e.salt, 32))) fail(403, 'السر غير صحيح أو انتهت صلاحية الدور.');
  c.grants = c.grants.filter(g => g.memberId !== memberId);
  return grant(c, 'member', memberId, e.expiresAt);
}
export function addMember(c, fields) {
  if (c.members.length >= 6) fail(409, 'الحد الأقصى ستة أعضاء في النموذج المحلي.');
  const m = { id: id(), ...fields };
  c.members.push(m); return m;
}
export function addRequest(c, fields) {
  if (c.requests.length >= 6) fail(409, 'الحد الأقصى ستة طلبات لهذه الجولة.');
  if (!c.members.some(m => m.id === fields.requester)) fail(400, 'اختر صاحب طلب من الدائرة.');
  const r = { id: id(), ...fields, version: 1, status: 'suggested', provider: null, declined: [], providerAccepted: false, requesterAccepted: false, providerConfirmed: false, requesterConfirmed: false };
  c.requests.push(r); return r;
}
const terminal = r => ['completed', 'cancelled'].includes(r.status);
const reset = r => { r.providerAccepted = false; r.requesterAccepted = false; r.providerConfirmed = false; r.requesterConfirmed = false; r.status = 'suggested'; };
export function plan(c) {
  const locked = c.requests.filter(r => r.status === 'completed' || !terminal(r) && (r.providerAccepted || r.requesterAccepted));
  const pending = c.requests.filter(r => !terminal(r) && !locked.includes(r));
  const reserved = { loads: Object.fromEntries(c.members.map(m => [m.id, locked.filter(r => r.provider === m.id).reduce((sum, r) => sum + r.duration, 0)])), counts: Object.fromEntries(c.members.map(m => [m.id, locked.filter(r => r.provider === m.id && r.status !== 'completed').length])) };
  const members = c.members;
  const result = allocate(members, pending, reserved);
  for (const a of result.assignments) {
    const r = c.requests.find(r => r.id === a.requestId);
    if (r.provider !== a.provider) { r.version++; reset(r); }
    r.provider = a.provider;
    r.uncoveredReason = result.uncovered.find(u => u.requestId === r.id)?.reason ?? null;
  }
  const first = baseline(members, pending, reserved);
  c.lastPlan = { at: new Date().toISOString(), score: result.score, uncovered: result.uncovered, baseline: objective(members, pending, first, reserved), visited: result.visited, lockedCount: locked.length };
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
  if (action !== 'decline') plan(c);
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
    expiresAt: actor.expiresAt,
    members: structuredClone(c.members), requests: structuredClone(actor.role === 'admin' ? c.requests : c.requests.filter(r => r.requester === actor.memberId || r.provider === actor.memberId)),
    lastPlan: actor.role === 'admin' ? structuredClone(c.lastPlan) : null };
}
