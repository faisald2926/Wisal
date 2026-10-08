import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server.mjs';
import { Store } from '../src/store.mjs';

test('HTTP complete journey, private roles, stale versions, inputs, same origin and redacted export', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'washeej-test-'));
  const store = new Store(join(dir, 'circles.json'));
  const server = await createServer({ store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { token, body, method = body ? 'POST' : 'GET', originHeader = origin } = {}) => {
    const res = await fetch(origin + path, { method, headers: { ...(body ? { 'content-type': 'application/json', Origin: originHeader } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  try {
    assert.equal((await call('/api/circles', { body: { name: 'مرفوض' }, originHeader: 'https://evil.example' })).status, 403);
    assert.equal((await call('/api/circles', { body: { name: 'x', unknown: 'escape' } })).status, 400);
    const made = await call('/api/demo', { body: {} });
    assert.equal(made.status, 201);
    const { id, token } = made.data;
    assert.equal((await call(`/api/circles/${id}`)).status, 403);
    const state = (await call(`/api/circles/${id}`, { token })).data;
    assert.ok(!JSON.stringify(state).includes('tokenHash'));
    const r = state.requests.find(r => r.provider);
    const enrollMember = async memberId => {
      const invitation = (await call(`/api/circles/${id}/invite`, { token, body: { memberId } })).data.token;
      assert.equal((await call(`/api/circles/${id}`, { token: invitation })).status, 403);
      const enrolled = await call(`/api/circles/${id}/enroll`, { body: { invitation, secret: 'private-test-member-secret' } });
      assert.equal(enrolled.status, 200);
      assert.equal((await call(`/api/circles/${id}/invite`, { token, body: { memberId } })).status, 409);
      assert.equal((await call(`/api/circles/${id}/enroll`, { body: { invitation, secret: 'private-test-member-secret' } })).status, 403);
      return enrolled.data.token;
    };
    const providerToken = await enrollMember(r.provider);
    const requesterToken = await enrollMember(r.requester);
    const outsider = state.members.find(m => ![r.provider, r.requester].includes(m.id));
    const outsiderToken = await enrollMember(outsider.id);
    const actionPath = `/api/circles/${id}/action`;
    const acceptance = { requestId: r.id, version: r.version, action: 'accept' };
    assert.equal((await call(actionPath, { token, body: acceptance })).status, 403);
    assert.equal((await call(actionPath, { token: outsiderToken, body: acceptance })).status, 403);
    assert.equal((await call(actionPath, { token: providerToken, body: { ...acceptance, action: 'confirm' } })).status, 409);
    assert.equal((await call(actionPath, { token: providerToken, body: acceptance })).status, 200);
    assert.equal((await call(actionPath, { token: requesterToken, body: acceptance })).status, 200);
    await call(actionPath, { token: providerToken, body: { ...acceptance, action: 'confirm' } });
    const before = (await call(`/api/circles/${id}`, { token })).data.requests.find(x => x.id === r.id);
    assert.equal(before.status, 'confirmed_by_provider');
    await call(actionPath, { token: requesterToken, body: { ...acceptance, action: 'confirm' } });
    const after = (await call(`/api/circles/${id}`, { token })).data.requests.find(x => x.id === r.id);
    assert.equal(after.status, 'completed');
    assert.equal((await call(actionPath, { token: requesterToken, body: acceptance })).status, 409);
    const pending = state.requests.find(x => x.id !== r.id && x.provider);
    const edited = await call(`/api/circles/${id}/requests/${pending.id}`, { token, body: { title: 'عنوان منقح', requester: pending.requester, duration: pending.duration, skill: pending.skill, window: pending.window } });
    assert.equal(edited.status, 200);
    assert.equal((await call(actionPath, { token: providerToken, body: { requestId: pending.id, version: pending.version, action: 'accept' } })).status, 409);
    const reloaded = new Store(join(dir, 'circles.json')); await reloaded.load();
    assert.equal(reloaded.circles.get(id).requests.find(x => x.id === r.id).status, 'completed');
    assert.equal((await call(`/api/circles/${id}/export`, { token: outsiderToken })).status, 403);
    const exported = await call(`/api/circles/${id}/export`, { token });
    for (const secret of [token, providerToken, requesterToken, outsiderToken, 'tokenHash', 'grants', 'secretHash', 'enrollments']) assert.ok(!JSON.stringify(exported.data).includes(secret));
    assert.ok((await readFile(join(dir, 'circles.json'), 'utf8')).includes('completed'));
    const malicious = '<img src=x onerror=alert(1)>';
    const update = await call(`/api/circles/${id}/members/${outsider.id}`, { token, body: { ...outsider, name: malicious, id: undefined, enrolled: undefined } });
    assert.equal(update.status, 200);
    assert.equal(update.data.members.find(m => m.id === outsider.id).name, malicious);
    const asset = await fetch(origin + '/app.mjs');
    const source = await asset.text();
    assert.ok(!source.includes('.innerHTML'));
    assert.match(source, /textContent/);
    assert.equal(asset.headers.get('referrer-policy'), 'no-referrer');
    const deleted = await call(`/api/circles/${id}/delete`, { token, body: { confirm: state.name } });
    assert.equal(deleted.status, 200);
    assert.equal((await call(`/api/circles/${id}`, { token })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('storage failure cannot publish a successful mutation', async () => {
  const store = new Store(null);
  const server = await createServer({ store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  store.persist = async () => { throw new Error('simulated disk failure'); };
  try {
    const res = await fetch(origin + '/api/circles', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'لن يحفظ' }) });
    assert.equal(res.status, 500);
    assert.equal(store.circles.size, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
