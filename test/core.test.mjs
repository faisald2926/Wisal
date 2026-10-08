import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, eligible, objective } from '../src/allocator.mjs';
import { createCircle, addMember, addRequest, plan, act, editRequest, editMember, view, authorize, invite } from '../src/domain.mjs';

const member = (id, overrides = {}) => ({ id, name: id, skills: ['قراءة'], windows: ['مساء'], capacity: 60, previousOpportunities: 0, optIn: true, ...overrides });
const request = (id, requester, overrides = {}) => ({ id, requester, skill: 'قراءة', window: 'مساء', duration: 30, version: 1, ...overrides });

// Independent oracle: generate the Cartesian product, validate whole solutions,
// and independently compute the documented lexicographic objective.
function oracle(members, requests) {
  let best;
  const rows = [];
  function enumerate(i) {
    if (i < requests.length) {
      for (const p of [null, ...members.map(m => m.id)]) { rows[i] = p; enumerate(i + 1); }
      return;
    }
    const loads = new Map(members.map(m => [m.id, 0]));
    const counts = new Map(members.map(m => [m.id, 0]));
    for (let j = 0; j < rows.length; j++) {
      if (!rows[j]) continue;
      const m = members.find(m => m.id === rows[j]), r = requests[j];
      if (!m.optIn || m.id === r.requester || !m.skills.includes(r.skill) || !m.windows.includes(r.window) || r.declined?.includes(m.id)) return;
      loads.set(m.id, loads.get(m.id) + r.duration);
      counts.set(m.id, counts.get(m.id) + 1);
    }
    if (members.some(m => loads.get(m.id) > m.capacity)) return;
    const score = [rows.filter(Boolean).length,
      members.reduce((s, m) => s + (m.capacity ? (loads.get(m.id) / m.capacity) ** 2 : 0), 0),
      members.filter(m => m.optIn).reduce((s, m) => s + (m.previousOpportunities + counts.get(m.id)) ** 2, 0),
      rows.map(p => p ?? '~').join('|')];
    if (!best || score[0] > best.score[0] || score[0] === best.score[0] && (score[1] < best.score[1] - 1e-10 || Math.abs(score[1] - best.score[1]) < 1e-10 && (score[2] < best.score[2] || score[2] === best.score[2] && score[3] < best.score[3]))) best = { rows: [...rows], score };
  }
  enumerate(0);
  return best;
}

test('constraints include capacity, skill, time, self, voluntary participation and receive-only', () => {
  const members = [member('a', { optIn: false, capacity: 0 }), member('b', { skills: ['تقنية'] }), member('c', { windows: ['صباح'] }), member('d', { capacity: 15 }), member('e')];
  const result = allocate(members, [request('r', 'a')]);
  assert.equal(result.assignments[0].provider, 'e');
  assert.equal(eligible(members[0], request('s', 'e')), false);
  assert.equal(eligible(members[4], request('s', 'e')), false);
  assert.equal(result.uncovered.length, 0);
});

test('allocator agrees with independent exhaustive small-case oracle (40 fixtures)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const members = [member('a', { capacity: 30 + seed % 3 * 15, previousOpportunities: seed % 2 }), member('b', { capacity: 60, previousOpportunities: seed % 4 }), member('c', { optIn: seed % 5 !== 0, windows: seed % 2 ? ['مساء'] : ['صباح'] })];
    const requests = [request('r1', 'c', { duration: seed % 2 ? 15 : 30 }), request('r2', 'a'), request('r3', 'b', { window: seed % 3 ? 'مساء' : 'صباح' })];
    const expected = oracle(members, requests);
    const actual = allocate(members, requests);
    assert.deepEqual(actual.assignments.map(a => a.provider), expected.rows, `fixture ${seed}`);
    assert.equal(objective(members, requests, actual.assignments).coverage, expected.score[0]);
  }
});

test('determinism and true unmet-constraint explanation', () => {
  const members = [member('a'), member('b'), member('c', { optIn: false })];
  const requests = [request('r', 'c'), request('x', 'c', { skill: 'غير موجود' })];
  const a = allocate(members, requests);
  assert.deepEqual(a, allocate([...members].reverse(), requests));
  assert.equal(a.assignments[0].provider, 'a');
  assert.equal(a.uncovered[0].reason, 'no_skill');
  const cap = allocate([member('a', { capacity: 15 }), member('b', { optIn: false })], [request('r', 'b')]);
  assert.equal(cap.uncovered[0].reason, 'capacity');
});

function fixture() {
  const created = createCircle('اختبار');
  const c = created.circle;
  const a = addMember(c, { name: 'مستقبل', skills: [], windows: [], capacity: 0, optIn: false, previousOpportunities: 0 });
  const b = addMember(c, { name: 'مقدم', skills: ['قراءة'], windows: ['مساء'], capacity: 60, optIn: true, previousOpportunities: 0 });
  const other = addMember(c, { name: 'طرف آخر', skills: [], windows: [], capacity: 0, optIn: false, previousOpportunities: 0 });
  const r = addRequest(c, { requester: a.id, skill: 'قراءة', window: 'مساء', duration: 30, title: 'مراجعة فقرة' });
  plan(c);
  return { c, a, b, other, r, admin: { role: 'admin' }, requester: { role: 'member', memberId: a.id }, provider: { role: 'member', memberId: b.id } };
}

test('two independent acknowledgements on same version are required for completion', () => {
  const { c, r, provider, requester, admin, other } = fixture();
  const version = r.version;
  assert.throws(() => act(c, admin, r.id, version, 'accept'), e => e.status === 403);
  assert.throws(() => act(c, { role: 'member', memberId: other.id }, r.id, version, 'accept'), e => e.status === 403);
  assert.throws(() => act(c, provider, r.id, version, 'confirm'), e => e.status === 409);
  act(c, provider, r.id, version, 'accept');
  assert.equal(r.status, 'accepted_by_provider');
  act(c, requester, r.id, version, 'accept');
  assert.equal(r.status, 'in_progress');
  act(c, provider, r.id, version, 'confirm');
  assert.equal(r.status, 'confirmed_by_provider');
  act(c, requester, r.id, version, 'confirm');
  assert.equal(r.status, 'completed');
  assert.equal(c.members.find(m => m.id === provider.memberId).previousOpportunities, 1);
});

test('edits invalidate old versions and member acknowledgements; decline replans', () => {
  const f = fixture();
  const version = f.r.version;
  act(f.c, f.provider, f.r.id, version, 'accept');
  editRequest(f.c, f.r.id, { title: 'نص متغير' });
  assert.throws(() => act(f.c, f.requester, f.r.id, version, 'accept'), e => e.status === 409);
  assert.equal(f.r.status, 'suggested');
  act(f.c, f.provider, f.r.id, f.r.version, 'accept');
  editMember(f.c, f.b.id, { capacity: 15 });
  assert.equal(f.r.provider, null);
  assert.equal(f.r.providerAccepted, false);
  assert.throws(() => act(f.c, f.provider, f.r.id, f.r.version, 'accept'), e => e.status === 403);
  editMember(f.c, f.b.id, { capacity: 60 });
  act(f.c, f.provider, f.r.id, f.r.version, 'decline');
  assert.equal(f.r.provider, null);
  assert.ok(f.r.declined.includes(f.b.id));
});

test('private role hashes, expiry, views and export never disclose another token', () => {
  const { c, a, b } = fixture();
  const secret = invite(c, a.id);
  assert.equal(authorize(c, secret.token).memberId, a.id);
  assert.throws(() => authorize(c, 'bad'), e => e.status === 403);
  assert.throws(() => authorize(c, secret.token, Date.now() + 8 * 86400000), e => e.status === 403);
  const visible = JSON.stringify(view(c, { role: 'member', memberId: b.id }));
  assert.ok(!visible.includes(secret.token));
  assert.ok(!visible.includes('tokenHash'));
});
