import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store } from './src/store.mjs';
import { createCircle, authorize, invite, enroll, memberLogin, addMember, addRequest, plan, editMember, editRequest, act, cancel, view, fail } from './src/domain.mjs';
import { memberInput, requestInput, object, text, number } from './src/validation.mjs';
import { demo } from './src/demo.mjs';
const ROOT = dirname(fileURLToPath(import.meta.url));
const assets = new Map([['/', ['public/index.html', 'text/html']], ['/index.html', ['public/index.html', 'text/html']], ['/styles.css', ['public/styles.css', 'text/css']], ['/app.mjs', ['public/app.mjs', 'text/javascript']], ['/evidence.json', ['docs/evidence.json', 'application/json']], ['/diagrams/flow.svg', ['docs/diagrams/flow.svg', 'image/svg+xml']], ['/diagrams/matching.svg', ['docs/diagrams/matching.svg', 'image/svg+xml']], ['/diagrams/consent.svg', ['docs/diagrams/consent.svg', 'image/svg+xml']]]);
const security = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
function json(res, status, payload) { res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); }
async function input(req) {
  if (!/^application\/json(?:;.*)?$/i.test(req.headers['content-type'] ?? '')) fail(415, 'أرسل JSON.');
  let data = '', bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 24576) fail(413, 'حجم البيانات أكبر من الحد.'); data += chunk.toString('utf8'); }
  try { return JSON.parse(data); } catch { fail(400, 'JSON غير صالح.'); }
}
export async function createServer({ store = new Store(join(ROOT, 'data', 'circles.json')) } = {}) {
  await store.load();
  const rate = { at: Date.now(), count: 0 };
  return http.createServer(async (req, res) => {
    try {
      const port = req.socket.localPort;
      const host = req.headers.host;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) fail(403, 'اسم المضيف غير مسموح.');
      const url = new URL(req.url, `http://${host}`);
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') fail(405, 'طريقة غير مسموحة.');
        const asset = assets.get(url.pathname);
        if (!asset) fail(404, 'الصفحة غير موجودة.');
        const content = await readFile(join(ROOT, asset[0]));
        res.writeHead(200, { ...security, 'Content-Type': `${asset[1]}; charset=utf-8` }); res.end(content); return;
      }
      if (Date.now() - rate.at > 60000) { rate.at = Date.now(); rate.count = 0; }
      if (++rate.count > 600) fail(429, 'طلبات كثيرة؛ انتظر دقيقة.');
      if (!['GET', 'POST'].includes(req.method)) fail(405, 'طريقة غير مسموحة.');
      let body;
      if (req.method === 'POST') {
        if (req.headers.origin !== `http://${host}` || req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'الكتابة تتطلب الصفحة من الأصل نفسه.');
        body = await input(req);
      }
      if (req.method === 'POST' && ['/api/circles', '/api/demo'].includes(url.pathname)) {
        const created = await store.transaction(circles => {
          if (circles.size >= 20) fail(409, 'وصل التخزين المحلي إلى ٢٠ دائرة؛ امسح دائرة قديمة.');
          if (url.pathname === '/api/demo') object(body, []); else object(body, ['name']);
          const result = url.pathname === '/api/demo' ? demo() : createCircle(text(body.name, 'اسم الدائرة', 60));
          circles.set(result.circle.id, result.circle);
          return { id: result.circle.id, token: result.token, expiresAt: result.expiresAt };
        });
        json(res, 201, created); return;
      }
      const match = url.pathname.match(/^\/api\/circles\/([a-f0-9-]{36})(?:\/(.*))?$/);
      if (!match) fail(404, 'المسار غير موجود.');
      const [, circleId, tail] = match;
      if (req.method === 'POST' && ['enroll', 'member-login'].includes(tail)) {
        object(body, tail === 'enroll' ? ['invitation', 'secret'] : ['memberId', 'secret']);
        const result = await store.transaction(circles => {
          const c = circles.get(circleId); if (!c) fail(404, 'الدائرة غير موجودة.');
          return tail === 'enroll' ? enroll(c, body.invitation, body.secret) : memberLogin(c, body.memberId, body.secret);
        });
        json(res, 200, result); return;
      }
      const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      const get = circles => { const c = circles.get(circleId); if (!c) fail(404, 'الدائرة غير موجودة.'); return [c, authorize(c, token)]; };
      if (req.method === 'GET') {
        const [c, actor] = get(store.circles);
        if (!tail) json(res, 200, view(c, actor));
        else if (tail === 'export') { if (actor.role !== 'admin') fail(403, 'التصدير يخص المنظم.'); const output = view(c, actor); delete output.role; delete output.memberId; json(res, 200, output); }
        else fail(404, 'المسار غير موجود.');
        return;
      }
      const result = await store.transaction(circles => {
        const [c, actor] = get(circles);
        if (tail === 'action') {
          object(body, ['requestId', 'version', 'action']);
          act(c, actor, text(body.requestId, 'الطلب', 60), number(body.version, 'النسخة', 1, 1000000), text(body.action, 'الإجراء', 15));
        } else if (tail?.startsWith('requests/') && actor.role === 'member') {
          const requestId = tail.slice(9), r = c.requests.find(r => r.id === requestId);
          if (!r || r.requester !== actor.memberId) fail(403, 'تعديل الطلب يخص صاحبه.');
          const fields = requestInput(body); if (fields.requester !== actor.memberId) fail(403, 'لا يمكن تغيير صاحب الطلب.'); editRequest(c, requestId, fields);
        } else if (tail?.startsWith('members/') && actor.role === 'member') {
          const memberId = tail.slice(8); if (memberId !== actor.memberId) fail(403, 'تعديل القدرة يخص صاحبها.');
          const fields = memberInput(body); const current = c.members.find(m => m.id === memberId);
          if (fields.previousOpportunities !== current.previousOpportunities) fail(403, 'الفرص السابقة يديرها المنظم.'); editMember(c, memberId, fields);
        } else if (tail === 'requests' && actor.role === 'member') {
          const fields = requestInput(body); if (fields.requester !== actor.memberId) fail(403, 'إنشاء الطلب يخص صاحبه.'); addRequest(c, fields); plan(c);
        } else {
          if (actor.role !== 'admin') fail(403, 'هذا الإجراء يخص المنظم.');
          if (tail === 'members') { addMember(c, memberInput(body)); plan(c); }
          else if (tail === 'requests') { addRequest(c, requestInput(body)); plan(c); }
          else if (tail?.startsWith('members/')) editMember(c, tail.slice(8), memberInput(body));
          else if (tail?.startsWith('requests/')) { const fields = requestInput(body); if (!c.members.some(m => m.id === fields.requester)) fail(400, 'صاحب الطلب غير موجود.'); editRequest(c, tail.slice(9), fields); }
          else if (tail === 'plan') { object(body, []); plan(c); }
          else if (tail === 'invite') { object(body, ['memberId']); return invite(c, text(body.memberId, 'العضو', 60)); }
          else if (tail === 'cancel') { object(body, ['requestId']); cancel(c, text(body.requestId, 'الطلب', 60)); }
          else if (tail === 'delete') { object(body, ['confirm']); if (body.confirm !== c.name) fail(400, 'اكتب اسم الدائرة لتأكيد المسح.'); circles.delete(c.id); return { deleted: true }; }
          else fail(404, 'المسار غير موجود.');
        }
        return view(c, actor);
      });
      json(res, 200, result);
    } catch (error) { json(res, error.status ?? 500, { error: error.status ? error.message : 'تعذر حفظ العملية أو قراءة البيانات. لم يتم إعلان نجاحها.' }); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4172);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = await createServer();
  server.listen(port, '127.0.0.1', () => console.log(`وشيج: http://127.0.0.1:${port}`));
}
