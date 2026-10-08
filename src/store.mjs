import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export class Store {
  constructor(path) { this.path = path; this.circles = new Map(); this.queue = Promise.resolve(); }
  async load() {
    if (!this.path) return;
    try {
      const rows = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(rows)) throw new Error('Invalid data file');
      this.circles = new Map(rows.map(c => [c.id, c]));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async persist(circles) {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify([...circles.values()]), { mode: 0o600 });
    await rename(temporary, this.path);
  }
  transaction(fn) {
    const work = this.queue.then(async () => {
      const draft = structuredClone(this.circles);
      const result = await fn(draft);
      await this.persist(draft);
      this.circles = draft;
      return result;
    });
    this.queue = work.catch(() => {}); return work;
  }
}
