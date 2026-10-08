// Exact bounded search: coverage, squared utilization, opportunity dispersion,
// then stable provider IDs in request-ID order. No inferred willingness.
export const eligible = (m, r) => m.optIn && m.id !== r.requester && m.skills.includes(r.skill) && m.windows.includes(r.window) && !r.declined?.includes(m.id);
export function objective(members, requests, assignments, reserved = {}) {
  const loads = Object.fromEntries(members.map(m => [m.id, reserved.loads?.[m.id] ?? 0]));
  const counts = Object.fromEntries(members.map(m => [m.id, reserved.counts?.[m.id] ?? 0]));
  for (const a of assignments) if (a.provider) {
    loads[a.provider] += requests.find(r => r.id === a.requestId).duration;
    counts[a.provider]++;
  }
  return { coverage: assignments.filter(a => a.provider).length,
    burden: members.reduce((s, m) => s + (m.capacity ? (loads[m.id] / m.capacity) ** 2 : 0), 0),
    opportunities: members.filter(m => m.optIn).reduce((s, m) => s + (m.previousOpportunities + counts[m.id]) ** 2, 0),
    tie: [...assignments].sort((a, b) => a.requestId.localeCompare(b.requestId, 'en')).map(a => a.provider ?? '~').join('|'), loads, counts };
}
function better(a, b) {
  return !b || a.coverage > b.coverage || a.coverage === b.coverage &&
    (a.burden < b.burden - 1e-10 || Math.abs(a.burden - b.burden) < 1e-10 &&
      (a.opportunities < b.opportunities || a.opportunities === b.opportunities && a.tie < b.tie));
}
export function allocate(members, requests, reserved = {}) {
  if (members.length > 6 || requests.length > 6) throw new Error('Bound exceeded');
  const ms = [...members].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const rs = [...requests].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const candidates = rs.map(r => ms.filter(m => eligible(m, r) && r.duration + (reserved.loads?.[m.id] ?? 0) <= m.capacity));
  const loads = Object.fromEntries(ms.map(m => [m.id, reserved.loads?.[m.id] ?? 0]));
  const picked = [];
  let bestScore, bestRows, visited = 0;
  function search(i, coverage) {
    visited++;
    if (bestScore && coverage + rs.length - i < bestScore.coverage) return;
    if (i === rs.length) {
      const rows = rs.map((r, j) => ({ requestId: r.id, provider: picked[j] }));
      const score = objective(ms, rs, rows, reserved);
      if (better(score, bestScore)) { bestScore = score; bestRows = rows; }
      return;
    }
    for (const m of candidates[i]) if (loads[m.id] + rs[i].duration <= m.capacity) {
      picked[i] = m.id; loads[m.id] += rs[i].duration;
      search(i + 1, coverage + 1);
      loads[m.id] -= rs[i].duration;
    }
    picked[i] = null; search(i + 1, coverage);
  }
  search(0, 0);
  const byId = new Map(bestRows.map(a => [a.requestId, a]));
  const assignments = requests.map(r => byId.get(r.id));
  const uncovered = requests.filter(r => !byId.get(r.id).provider).map(r => {
    const willing = ms.filter(m => m.optIn && m.id !== r.requester && !r.declined?.includes(m.id));
    const skilled = willing.filter(m => m.skills.includes(r.skill));
    const timed = skilled.filter(m => m.windows.includes(r.window));
    const sized = timed.filter(m => m.capacity >= r.duration);
    const remaining = sized.filter(m => m.capacity - (reserved.loads?.[m.id] ?? 0) >= r.duration);
    const reason = !willing.length ? 'no_volunteer' : !skilled.length ? 'no_skill' : !timed.length ? 'no_window' : !sized.length ? 'capacity' : !remaining.length ? 'reserved_capacity' : 'round_capacity';
    return { requestId: r.id, reason, eligibleCount: sized.length };
  });
  return { assignments, uncovered, score: bestScore, visited };
}
export function baseline(members, requests, reserved = {}) {
  const loads = Object.fromEntries(members.map(m => [m.id, reserved.loads?.[m.id] ?? 0]));
  return requests.map(r => {
    const provider = [...members].sort((a, b) => a.id.localeCompare(b.id, 'en')).find(m => eligible(m, r) && loads[m.id] + r.duration <= m.capacity);
    if (provider) loads[provider.id] += r.duration;
    return { requestId: r.id, provider: provider?.id ?? null };
  });
}
