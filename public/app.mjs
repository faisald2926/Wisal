const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const ar = value => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 3 }).format(value);
const windows = ['صباح', 'ظهر', 'مساء', 'نهاية الأسبوع'];
const reason = {
  no_volunteer: 'لا يوجد عضو راغب آخر لم يرفض هذا الطلب. الاستقبال لا يفرض التقديم.',
  no_skill: 'لا توجد هذه القدرة لدى عضو راغب آخر لم يرفض الطلب.',
  no_window: 'توجد القدرة، لكن لا تتوافق نافذة الوقت مع أي عضو مؤهل.',
  capacity: 'مدة الطلب تتجاوز سعة كل عضو يملك القدرة والوقت المناسبين.',
  reserved_capacity: 'السعة المتاحة محجوزة لطلبات مقبولة أو منجزة؛ لا تكفي لهذا الطلب.',
  round_capacity: 'توجد أهلية، لكن السعات لا تغطي جميع الطلبات في الجولة؛ هذا الطلب بقي دون تخصيص وفق ترتيب الهدف.'
};
const status = { suggested: ['اقتراح بانتظار الاتفاق', 'blue'], accepted_by_provider: ['قبله المقدم', 'blue'], accepted_by_requester: ['قبله صاحب الطلب', 'blue'], in_progress: ['متفق عليه · جارٍ التنفيذ', 'green'], confirmed_by_provider: ['بانتظار إقرار صاحب الطلب', 'blue'], confirmed_by_requester: ['بانتظار إقرار المقدم', 'blue'], completed: ['منجز بإقرار الطرفين', 'green'], cancelled: ['ملغى', 'gray'] };
let session = null, circle = null, page = 'overview', editing = null, noticeTimer, loading = false;
function node(tag, className, content) {
  const n = document.createElement(tag); if (className) n.className = className;
  if (content !== undefined) n.textContent = content; return n;
}
function append(parent, ...children) { parent.append(...children.filter(Boolean)); return parent; }
function button(label, className, action) { const b = node('button', className, label); b.type = 'button'; b.addEventListener('click', () => run(action, b)); return b; }
function notify(message, error = false) { clearTimeout(noticeTimer); const n = $('#notice'); n.textContent = message; n.classList.toggle('error', error); n.hidden = false; noticeTimer = setTimeout(() => n.hidden = true, 8000); }
async function run(fn, control) { if (control?.disabled) return; if (control) control.disabled = true; try { await fn(); } catch (error) { notify(error.message, true); } finally { if (control) control.disabled = false; } }
async function api(path, body, token = session?.token) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  let result; try { result = await response.json(); } catch { throw new Error('تعذر قراءة رد الخادم.'); }
  if (!response.ok) throw new Error(result.error ?? 'تعذر تنفيذ العملية.'); return result;
}
const path = suffix => `/api/circles/${session.id}${suffix ? '/' + suffix : ''}`;
function saveSession(value) { session = value; sessionStorage.setItem('washeej-role', JSON.stringify(value)); history.replaceState(null, '', '/'); }
async function loadCircle(silent = false) {
  if (!session?.token || loading) return; loading = true;
  try { const current = session; const result = await api(path()); if (current !== session) return; circle = result; session.expiresAt = result.expiresAt; session.memberId = result.memberId; sessionStorage.setItem('washeej-role', JSON.stringify(session)); render(); $('#saved-label').textContent = 'متصل · محفوظ محليًا'; }
  catch (error) { $('#saved-label').textContent = 'تعذر التحديث'; if (!silent) throw error; }
  finally { loading = false; }
}
async function mutate(suffix, body, message = 'حُفظ التغيير محليًا.') { circle = await api(path(suffix), body); render(); notify(message); }
function switchPage(next) {
  page = next; $$('[data-section]').forEach(s => s.hidden = s.dataset.section !== page);
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function name(id) { return circle.members.find(m => m.id === id)?.name ?? 'دون مقدم'; }
function avatar(id, sizeClass = '') { const m = circle.members.find(m => m.id === id); const i = circle.members.indexOf(m); return node('span', `avatar ${['emerald', 'sand', 'lavender', 'navy'][Math.max(0, i) % 4]} ${sizeClass}`, (m?.name ?? '—').slice(0, 1)); }
const terminal = r => ['completed', 'cancelled'].includes(r.status);
function empty(message, detail) { return append(node('div', 'empty'), node('strong', '', message), node('p', '', detail)); }
function render() {
  $('#welcome').hidden = true; $('#dashboard').hidden = false; $('#sidebar').hidden = false; $('#layout').classList.add('has-circle');
  $('#circle-name').textContent = circle.name;
  $('#role-label').textContent = circle.role === 'admin' ? 'دور المنظم · متابعة وإدارة' : `دور العضو · ${name(circle.memberId)}`;
  $('#demo-label').hidden = !circle.demo;
  $$('.admin-only').forEach(n => n.hidden = circle.role !== 'admin');
  if (circle.role !== 'admin' && ['insights', 'privacy'].includes(page)) page = 'overview';
  $('#overview-title').textContent = circle.role === 'admin' ? 'صلة تنمو بخطوات صغيرة' : `أهلًا، ${name(circle.memberId)}`;
  $('#overview-description').textContent = circle.role === 'admin' ? 'رتّب الطلبات، وامنح المساحة للموافقة. كل اتفاق يخص طرفيه.' : 'هذه الطلبات تخصك كمقدم أو صاحب حاجة. قبولك وإقرارك يصدران من هذا الدور فقط.';
  const counts = [
    [circle.requests.filter(r => !terminal(r) && r.provider).length, 'اقتراحات واتفاقات نشطة', 'كل اقتراح يحتاج اتفاقًا'],
    [circle.requests.filter(r => !terminal(r) && !r.provider).length, 'طلبات دون مقدم', 'قيود واضحة، دون إلزام'],
    [circle.requests.filter(r => r.status === 'completed').length, 'مساندات منجزة', 'بتأكيد الطرفين فقط'],
    [circle.members.filter(m => m.optIn).length, 'راغبون في التقديم', `من ${ar(circle.members.length)} أعضاء في الدائرة`]
  ];
  $('#stats').replaceChildren(...counts.map(([value, label, caption]) => append(node('article', 'stat'), node('span', 'stat-label', label), node('strong', '', ar(value)), node('small', '', caption))));
  renderRequests(); renderMembers(); if (circle.role === 'admin') renderInsights(); switchPage(page);
}
function requestCard(r) {
  const card = node('article', 'request-card');
  const [label, color] = !r.provider && !terminal(r) ? ['دون مقدم متاح', 'gray'] : status[r.status];
  append(card, append(node('div', 'request-top'), node('span', `badge ${color}`, label), node('span', 'caption', `نسخة ${ar(r.version)}`)), node('h3', '', r.title), node('p', 'muted', `طلب ${name(r.requester)}`));
  append(card, append(node('div', 'request-meta'), ...[r.skill, r.window, `${ar(r.duration)} دقيقة`].map(text => node('span', 'chip', text))));
  if (r.provider) {
    const pair = append(node('div', 'pair'), avatar(r.provider), append(node('div'), node('strong', '', name(r.provider)), node('small', '', 'المقدم')), node('span', 'pair-arrow', '←'), avatar(r.requester), append(node('div'), node('strong', '', name(r.requester)), node('small', '', 'صاحب الطلب')));
    append(card, pair);
    if (!terminal(r)) append(card, node('p', 'request-note', 'قدرة ووقت متوافقان، وسعة ضمن حد الجولة. حُسم اختيار المقدم وفق ترتيب هدف المحرك.'));
    append(card, append(node('div', 'status-lines'), ...[['providerAccepted', 'قبول المقدم'], ['requesterAccepted', 'قبول صاحب الطلب'], ['providerConfirmed', 'إقرار المقدم'], ['requesterConfirmed', 'إقرار صاحب الطلب']].map(([key, label]) => node('span', r[key] ? 'done' : '', `${r[key] ? '✓' : '○'} ${label}`))));
  } else if (!terminal(r)) append(card, node('p', 'request-note uncovered', reason[r.uncoveredReason] ?? 'أضف قدرات وأوقات، ثم حدّث الاقتراحات.'));
  const actions = node('div', 'request-actions');
  if (circle.role === 'member' && !terminal(r)) {
    const side = r.provider === circle.memberId ? 'provider' : 'requester';
    if (r.provider && !r[`${side}Accepted`]) append(actions, button('أقبل هذا الاقتراح', 'primary', () => action(r, 'accept')));
    if (r.providerAccepted && r.requesterAccepted && !r[`${side}Confirmed`]) append(actions, button('أقرّ أن التنفيذ تم', 'primary', () => confirmExecution(r)));
    if (!r.providerConfirmed && !r.requesterConfirmed) append(actions, button(side === 'requester' ? 'أسحب طلبي' : 'أرفض باختياري', 'secondary', () => declineRequest(r, side)));
    if (r[`${side}Accepted`] && !r.providerConfirmed && !r.requesterConfirmed) append(card, node('p', 'request-note', r.providerAccepted && r.requesterAccepted ? 'نسّقا الوقت الفعلي بينكما خارج الموقع. بعد التنفيذ، يقر كل طرف من دوره.' : 'سُجل قبولك. ننتظر اختيار الطرف الآخر.'));
    if (r[`${side}Confirmed`]) append(card, node('p', 'snapshot-status', 'سُجل إقرارك؛ ننتظر الطرف الآخر لإتمام المساندة.'));
  }
  if (!terminal(r) && (circle.role === 'admin' || r.requester === circle.memberId)) append(actions, button('تعديل الطلب', 'text-button', () => openRequest(r)));
  if (circle.role === 'admin' && !terminal(r)) append(actions, button('إلغاء', 'text-button', () => cancelRequest(r)));
  if (circle.role === 'admin' && r.provider && !terminal(r)) append(card, node('p', 'request-note', 'المنظم يتابع. إقرار التنفيذ متاح للطرفين من دوريهما فقط.'));
  if (actions.childElementCount) append(card, actions); return card;
}
function renderRequests() {
  const active = circle.requests.filter(r => !terminal(r));
  $('#overview-requests').replaceChildren(...(active.length ? active.slice(0, 4).map(requestCard) : [empty('مساحة لخطوة جديدة', circle.requests.length ? 'لا توجد طلبات نشطة. يمكنك الاطلاع على المنجز في قسم المساندات.' : 'أضف أعضاء وقدرات، ثم اكتب أول طلب مساندة صغير.')]));
  const filter = $('#request-filter').value;
  const rows = circle.requests.filter(r => filter === 'all' || filter === 'open' && !terminal(r) || filter === 'uncovered' && !terminal(r) && !r.provider || filter === 'completed' && r.status === 'completed');
  $('#requests-list').replaceChildren(...(rows.length ? rows.map(requestCard) : [empty('لا توجد طلبات بهذا العرض', 'جرّب اختيار كل الحالات، أو أضف طلبًا جديدًا.')]));
}
function renderMembers() {
  $('#members-list').replaceChildren(...(circle.members.length ? circle.members.map(m => {
    const card = node('article', 'member-card');
    append(card, append(node('div', 'member-head'), avatar(m.id), append(node('div'), node('h3', '', m.name), node('small', '', `${ar(m.previousOpportunities)} فرص سابقة`)), node('span', `badge ${m.optIn ? 'green' : 'gray'}`, m.optIn ? 'راغب طوعًا' : 'يستقبل فقط')));
    append(card, append(node('div'), ...(m.skills.length ? m.skills.map(s => node('span', 'chip', s)) : [node('span', 'muted', 'لا التزام بتقديم قدرة')])));
    append(card, append(node('div', 'member-details'), node('span', '', m.windows.length ? m.windows.join(' · ') : 'دون أوقات تقديم'), node('strong', '', `${ar(m.capacity)} دقيقة`)));
    const actions = node('div', 'request-actions');
    if (circle.role === 'admin' || m.id === circle.memberId) append(actions, button('تعديل القدرات', 'secondary', () => openMember(m)));
    if (circle.role === 'admin') {
      if (!m.enrolled) append(actions, button('إصدار دعوة خاصة ↗', 'text-button', () => inviteMember(m)));
      else append(actions, node('span', 'snapshot-status', '✓ سجّل دوره بسرّ خاص'));
    }
    append(card, actions); return card;
  }) : [empty('كل دائرة تبدأ بمعرفة', 'أضف اسمًا مستعارًا وقدرات وأوقاتًا يختارها صاحبها. يمكنه الاستقبال فقط.')]));
}
function renderInsights() {
  const p = circle.lastPlan;
  $('#comparison').replaceChildren(...(p ? [['التوزيع المقترح', p.score], ['أول مؤهل، بلا رجوع', p.baseline]].map(([label, score]) => append(node('div'), node('h3', '', label), node('strong', '', ar(score.coverage)), node('span', 'muted', ' طلب غير محجوز مغطّى'), node('small', '', `مجموع مربعات نسبة العبء: ${ar(score.burden)}`), node('small', '', `مجموع مربعات الفرص: ${ar(score.opportunities)}`))) : [empty('لا توجد خطة بعد', 'أضف طلبًا لرؤية المقارنة.')]));
  $('#load-list').replaceChildren(...(circle.members.length ? circle.members.map(m => {
    const loads = circle.requests.filter(r => r.provider === m.id && r.status !== 'cancelled').reduce((sum, r) => sum + r.duration, 0);
    const bar = node('progress'); bar.max = Math.max(1, m.capacity); bar.value = loads; bar.setAttribute('aria-label', `سعة ${m.name}: ${loads} من ${m.capacity} دقيقة`);
    return append(node('div', 'load-row'), append(node('div'), node('strong', '', m.name), node('small', '', m.optIn ? 'طوعي' : 'استقبال فقط')), append(node('div', 'load-bar'), bar), append(node('div'), node('strong', '', `${ar(loads)} / ${ar(m.capacity)} د`), node('small', '', `سابقة ${ar(m.previousOpportunities)} · مقترحة ${ar(circle.requests.filter(r => r.provider === m.id && !terminal(r)).length)}`)));
  }) : [empty('لم يُضف أعضاء بعد', 'تظهر سعاتهم هنا بعد الإضافة.')]));
  const missing = circle.requests.filter(r => !terminal(r) && !r.provider);
  $('#uncovered-list').replaceChildren(...(missing.length ? missing.map(r => append(node('div', 'uncovered-row'), node('strong', '', r.title), node('p', '', reason[r.uncoveredReason] ?? 'لا توجد خطة مناسبة بعد.'))) : [node('p', 'muted', 'لا توجد طلبات نشطة دون مقدم في التوزيع الحالي.')]));
}
function field(label, type, key, value = '', attrs = {}) {
  const wrap = node('div'); const input = node('input'); input.type = type; input.name = key; input.id = `field-${key}`; input.value = value;
  Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
  const l = node('label', '', label); l.htmlFor = input.id; append(wrap, l, input); return wrap;
}
function selectField(label, key, options, value) {
  const wrap = node('div'), select = node('select'); select.name = key; select.id = `field-${key}`;
  options.forEach(([id, label]) => { const opt = node('option', '', label); opt.value = id; select.append(opt); }); select.value = value ?? options[0]?.[0];
  const l = node('label', '', label); l.htmlFor = select.id; return append(wrap, l, select);
}
function editor(title, content, submit, help = '') {
  editing = submit; $('#editor-title').textContent = title; $('#editor-error').textContent = ''; $('#editor-fields').replaceChildren(...content, ...(help ? [node('p', 'form-help', help)] : [])); $('#editor-submit').textContent = 'حفظ'; $('#editor').showModal();
}
function openMember(m) {
  const defaultMember = { name: '', skills: [], windows: ['مساء'], capacity: 60, previousOpportunities: 0, optIn: true };
  const v = m ?? defaultMember;
  const optLabel = node('label', 'check-label'); const opt = node('input'); opt.type = 'checkbox'; opt.name = 'optIn'; opt.checked = v.optIn; append(optLabel, opt, node('span', '', 'أرغب طوعًا في تقديم المساندة'));
  const times = node('div', 'window-options'); windows.forEach(w => { const l = node('label', 'check-label'); const box = node('input'); box.type = 'checkbox'; box.name = 'windows'; box.value = w; box.checked = v.windows.includes(w); append(times, append(l, box, node('span', '', w))); });
  const previous = field('فرص سابقة خارج الجولة', 'number', 'previousOpportunities', v.previousOpportunities, { min: 0, max: 10000, required: '' });
  if (circle.role !== 'admin') previous.querySelector('input').readOnly = true;
  editor(m ? `قدرات ${m.name}` : 'إضافة عضو للدائرة', [field('الاسم المستعار', 'text', 'name', v.name, { maxlength: 40, required: '', autocomplete: 'off' }), optLabel,
    field('القدرات — افصل بينها بفاصلة', 'text', 'skills', v.skills.join('، '), { maxlength: 320, placeholder: 'قراءة، تقنية، مشي' }), node('label', '', 'أوقات تقديم المساندة'), times,
    append(node('div', 'form-grid'), field('السعة لهذه الجولة (دقيقة)', 'number', 'capacity', v.capacity, { min: 0, max: 240, required: '' }), previous)], async f => {
      const body = { name: f.get('name'), skills: f.get('skills').split(/[,،]/).map(s => s.trim()).filter(Boolean), windows: f.getAll('windows'), capacity: Number(f.get('capacity')), previousOpportunities: Number(f.get('previousOpportunities')), optIn: f.has('optIn') };
      if (!body.optIn) { body.skills = []; body.windows = []; body.capacity = 0; }
      await mutate(m ? `members/${m.id}` : 'members', body, m ? 'حُفظت القدرات. الاتفاقات المتعلقة بالعضو تحتاج موافقة جديدة.' : 'أُضيف العضو. يمكنك إصدار دعوة خاصة له.');
    }, 'الرغبة يحددها صاحبها صراحة. الاستقبال فقط لا يفرض تقديمًا. تعديل القدرة يبطل إقرارات الطلبات المتعلقة بالعضو؛ المنجز يبقى محفوظًا. الحد ستة أعضاء.');
}
function openRequest(r) {
  if (!circle.members.length) { notify('أضف عضوًا واحدًا على الأقل قبل كتابة الطلب.', true); switchPage('members'); return; }
  if (!r && circle.requests.length >= 6) { notify('الحد ستة طلبات لهذه الجولة. أنشئ دائرة جديدة لجولة مستقلة.', true); return; }
  const options = circle.members.filter(m => circle.role === 'admin' || m.id === circle.memberId).map(m => [m.id, m.name]);
  const skills = [...new Set(circle.members.flatMap(m => m.skills))];
  editor(r ? 'تعديل طلب المساندة' : 'طلب مساندة صغير', [field('عنوان مختصر', 'text', 'title', r?.title, { maxlength: 120, required: '', placeholder: 'مثلًا: مراجعة رسالة قصيرة' }),
    selectField('صاحب الطلب', 'requester', options, r?.requester), field('القدرة المطلوبة', 'text', 'skill', r?.skill, { maxlength: 40, required: '', placeholder: skills.join('، ') || 'قدرة واضحة' }),
    append(node('div', 'form-grid'), selectField('نافذة الوقت', 'window', windows.map(w => [w, w]), r?.window ?? 'مساء'), selectField('مدة المساندة', 'duration', [15, 30, 45, 60, 75, 90, 105, 120].map(n => [String(n), `${ar(n)} دقيقة`]), String(r?.duration ?? 30)))], async f => {
      await mutate(r ? `requests/${r.id}` : 'requests', { title: f.get('title'), requester: f.get('requester'), skill: f.get('skill'), window: f.get('window'), duration: Number(f.get('duration')) }, r ? 'حُفظت نسخة جديدة. على الطرفين قبول الاقتراح مجددًا.' : 'حُفظ الطلب واقتُرح توزيع ممكن وفق السعات.');
    }, r ? 'التعديل يبطل موافقات وإقرارات النسخة السابقة. المساندة تتطلب اتفاقًا جديدًا.' : 'اختر حاجة محددة في ١٥–١٢٠ دقيقة. نافذة الوقت فئة عامة، والتوقيت الدقيق يُنسّق خارج الموقع.');
}
function action(r, action) { return mutate('action', { requestId: r.id, version: r.version, action }, action === 'accept' ? 'سُجل قبولك لهذه النسخة. يحتاج الاتفاق موافقة الطرف الآخر.' : 'سُجل إقرارك بالتنفيذ. الإنجاز يتطلب إقرار الطرفين.'); }
function confirmExecution(r) { editor('إقرار تنفيذ مستقل', [node('p', '', `هل نُفذت مساندة «${r.title}» بالفعل؟`), node('p', 'muted', 'سيُسجل هذا الإقرار من دورك فقط. إذا لم تنتهِ المساندة، أغلق النافذة وانتظر.')], async () => action(r, 'confirm')); $('#editor-submit').textContent = 'نعم، أقرّ التنفيذ'; }
function declineRequest(r, side) { editor(side === 'requester' ? 'سحب طلبك' : 'رفض الاقتراح', [node('p', '', side === 'requester' ? 'سيُلغى طلبك ويُحرّر ما حُجز له من السعة.' : 'سيُستبعد دورك من هذا الطلب ويعاد اقتراح توزيع آخر إن أمكن. لا التزام عليك برد خدمة.')], async () => mutate('action', { requestId: r.id, version: r.version, action: 'decline' }, 'حُفظ اختيارك وأُعيد التخطيط.')); $('#editor-submit').textContent = 'تأكيد الاختيار'; }
function cancelRequest(r) { editor('إلغاء الطلب', [node('p', '', `إلغاء «${r.title}» يبطل إجراءات نسخته الحالية ويحرر السعة.`)], async () => mutate('cancel', { requestId: r.id }, 'أُلغي الطلب وحُفظ التغيير.')); $('#editor-submit').textContent = 'إلغاء الطلب'; }
function roleUrl({ token, invitation, memberId, name }) { const params = new URLSearchParams({ circle: session.id }); if (token) params.set('token', token); if (invitation) params.set('invite', invitation); if (memberId) params.set('member', memberId); if (name) params.set('name', name); return `${location.origin}/#${params}`; }
function showLink(title, url, expiresAt, invitation = false) {
  $('#link-title').textContent = title; $('#role-url').value = url; $('#open-role').href = url;
  $('#link-description').textContent = invitation ? 'دعوة أحادية الاستخدام. عند فتحها يختار العضو سرًا خاصًا، ثم يحصل على صلاحية دوره وحده. لا يستطيع المنظم إعادة إصدارها بعد التسجيل.' : 'هذا الرابط يمنح صلاحية دورك. لا تشاركه إلا مع صاحب الدور المقصود.';
  $('#link-expiry').textContent = `ينتهي في ${new Date(expiresAt).toLocaleString('ar-SA')}.`; $('#link-dialog').showModal();
  $('#recovery-link')?.remove();
  if (!invitation && circle.role === 'member') {
    const recovery = node('a', 'text-link', 'رابط العودة باستخدام السر الخاص (احفظه إذا فقدت رابط الدور)'); recovery.id = 'recovery-link'; recovery.href = roleUrl({ memberId: circle.memberId }); recovery.target = '_blank'; recovery.rel = 'noopener noreferrer'; $('#link-expiry').after(recovery);
  }
}
async function inviteMember(m) {
  const issued = await api(path('invite'), { memberId: m.id }); showLink(`دعوة ${m.name}`, roleUrl({ invitation: issued.token, memberId: m.id, name: m.name }), issued.expiresAt, true);
}
function openEnrollment(pending) {
  editor('تسجيل دور العضو', [node('p', '', `أهلًا، ${pending.name ?? 'صاحب الدعوة'}. اختر سرًا خاصًا لا تشاركه مع المنظم.`),
    field('سرّك الخاص (١٢ حرفًا على الأقل)', 'password', 'secret', '', { minlength: 12, maxlength: 128, required: '', autocomplete: 'new-password' }), field('كرر السر', 'password', 'repeat', '', { minlength: 12, maxlength: 128, required: '', autocomplete: 'new-password' })], async f => {
      if (f.get('secret') !== f.get('repeat')) throw new Error('السرّان غير متطابقين.');
      const issued = await api(`/api/circles/${pending.id}/enroll`, { invitation: pending.invitation, secret: f.get('secret') }, null);
      saveSession({ id: pending.id, token: issued.token, expiresAt: issued.expiresAt, memberId: issued.memberId }); await loadCircle(); notify('استهلكت الدعوة. احتفظ بسرّك ورابط دورك؛ المنظم لا يحصل على صلاحيتك.');
    }, 'لا تثبت الدعوة الهوية البشرية لمن فتحها أولًا. تُحفظ قيمة مشتقة من السر محليًا، ولا تُعرض للمنظم. صلاحية الدور ثابتة ٧ أيام من التسجيل.'); $('#editor-submit').textContent = 'تسجيل دوري الخاص';
}
function openMemberLogin(pending) {
  editor('العودة إلى دور العضو', [field('سرّك الخاص', 'password', 'secret', '', { minlength: 12, maxlength: 128, required: '', autocomplete: 'current-password' })], async f => {
    const issued = await api(`/api/circles/${pending.id}/member-login`, { memberId: pending.memberId, secret: f.get('secret') }, null);
    saveSession({ id: pending.id, token: issued.token, expiresAt: issued.expiresAt, memberId: issued.memberId }); await loadCircle();
  }, 'الدخول يُبطل رابط الدور السابق، ولا يمدّد تاريخ الانتهاء. المنظم لا يستطيع استرجاع سرّك.');
}
async function acceptUrl(raw) {
  const u = new URL(raw, location.origin); if (u.origin !== location.origin) throw new Error('افتح دعوة هذا الخادم المحلي نفسه.');
  const params = new URLSearchParams(u.hash.slice(1)), id = params.get('circle');
  if (!/^[a-f0-9-]{36}$/.test(id ?? '')) throw new Error('رابط الدعوة غير صالح.');
  if (params.get('invite')) { openEnrollment({ id, invitation: params.get('invite'), name: params.get('name') }); return; }
  if (params.get('token')) { saveSession({ id, token: params.get('token') }); await loadCircle(); return; }
  if (params.get('member')) { openMemberLogin({ id, memberId: params.get('member') }); return; }
  throw new Error('رابط الدور لا يحتوي على صلاحية أو دعوة.');
}
async function createDemo() { const result = await api('/api/demo', {}, null); saveSession(result); await loadCircle(); notify('هذه دائرة توضيحية مؤلفة. جرّب دعوة المقدم وصاحب الطلب من بطاقات الأعضاء.'); }
function newCircle() { editor('أنشئ دائرة معارف', [field('اسم الدائرة', 'text', 'name', '', { required: '', maxlength: 60, placeholder: 'مثلًا: دائرة الجوار' })], async f => { const result = await api('/api/circles', { name: f.get('name') }, null); saveSession(result); await loadCircle(); notify('حُفظت دائرتك. ابدأ بإضافة أعضاء وقدرات طوعية.'); switchPage('members'); }, 'دائرة للبالغين يعرفون بعضهم، حتى ستة أعضاء وستة طلبات. احتفظ برابط المنظم الخاص قبل مغادرة هذا التبويب.'); $('#editor-submit').textContent = 'إنشاء الدائرة'; }
async function exportData() {
  const data = await api(path('export')); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = node('a'); a.href = url; a.download = 'washeej-circle.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('صُدرت نسخة بيانات بلا مفاتيح أدوار.');
}
function leave() { session = circle = null; sessionStorage.removeItem('washeej-role'); history.replaceState(null, '', '/'); $('#dashboard').hidden = true; $('#sidebar').hidden = true; $('#welcome').hidden = false; $('#layout').classList.remove('has-circle'); page = 'overview'; notify('غادرت الدور في هذا التبويب. البيانات المحفوظة باقية.'); }
function deleteCircle() { const currentName = circle.name; editor('مسح الدائرة نهائيًا', [node('p', 'muted', 'يُحذف سجل الدائرة المحفوظ وتُبطل روابطها. النسخ المصدّرة تحتاج حذفًا منفصلًا.'), field(`اكتب «${currentName}» للتأكيد`, 'text', 'confirm', '', { required: '', autocomplete: 'off' })], async f => { await api(path('delete'), { confirm: f.get('confirm') }); leave(); notify('مُسحت الدائرة المحفوظة وأُبطلت روابطها.'); }); $('#editor-submit').textContent = 'مسح الدائرة'; }

$('#editor-form').addEventListener('submit', async event => {
  event.preventDefault(); const b = $('#editor-submit'); if (b.disabled) return; b.disabled = true; $('#editor-error').textContent = '';
  try { await editing(new FormData(event.currentTarget)); $('#editor').close(); }
  catch (error) { $('#editor-error').textContent = error.message; }
  finally { b.disabled = false; }
});
$$('[data-close]').forEach(b => b.addEventListener('click', () => $(`#${b.dataset.close}`).close()));
$$('[data-page]').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
$$('[data-do]').forEach(b => b.addEventListener('click', () => b.dataset.do === 'new-member' ? openMember() : openRequest()));
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
$('#demo-button').addEventListener('click', () => run(createDemo, $('#demo-button')));
$('#new-circle-button').addEventListener('click', newCircle);
$('#refresh-button').addEventListener('click', () => run(() => loadCircle(), $('#refresh-button')));
$('#leave-button').addEventListener('click', leave);
$('#plan-button').addEventListener('click', () => run(() => mutate('plan', {}, 'حُدّث التوزيع. الطلبات المقبولة محفوظة على مقدمها.'), $('#plan-button')));
$('#request-filter').addEventListener('change', renderRequests);
$('#join-form').addEventListener('submit', event => { event.preventDefault(); run(() => acceptUrl($('#join-url').value)); });
$('#admin-link-button').addEventListener('click', () => showLink('رابط المنظم', roleUrl({ token: session.token }), session.expiresAt ?? Date.now()));
$('#copy-link').addEventListener('click', () => run(async () => { try { await navigator.clipboard.writeText($('#role-url').value); notify('نُسخ الرابط الخاص.'); } catch { $('#role-url').select(); notify('تعذر النسخ التلقائي؛ حُدد الرابط لتنسخه يدويًا.'); } }));
$('#export-button').addEventListener('click', () => run(exportData, $('#export-button')));
$('#delete-button').addEventListener('click', deleteCircle);
const ownLink = button('رابط دوري', 'text-button', () => showLink('رابط هذا الدور', roleUrl({ token: session.token }), session.expiresAt ?? Date.now()));
$('.workspace-actions').prepend(ownLink);
async function loadEvidence() {
  try {
    const e = await api('/evidence.json', undefined, null);
    const list = node('ul'); e.checks.forEach(s => append(list, node('li', '', s))); $('#evidence-results').replaceChildren(node('p', '', `تحقق آلي بتاريخ ${e.checkedAt}، على ${e.runtime}.`), list, node('p', 'caption', e.limit));
  } catch { $('#evidence-results').textContent = 'دليل البناء غير متاح الآن. راجع docs/evidence.json في حزمة المشروع.'; }
}
await loadEvidence();
try {
  if (location.hash) await acceptUrl(location.href);
  else { const previous = sessionStorage.getItem('washeej-role'); if (previous) { session = JSON.parse(previous); await loadCircle(); } }
} catch (error) { notify(error.message, true); }
setInterval(() => { if (circle && !$$('dialog').some(d => d.open)) loadCircle(true); }, 10000);
