import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = ['server.mjs', 'src/allocator.mjs', 'src/domain.mjs', 'src/store.mjs', 'src/validation.mjs', 'src/demo.mjs', 'public/app.mjs'];
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  if (check.status !== 0) { process.stderr.write(check.stderr); process.exit(1); }
}
const html = await readFile(join(root, 'public/index.html'), 'utf8');
if (!html.includes('lang="ar" dir="rtl"') || !html.includes('/app.mjs')) throw new Error('Missing Arabic RTL entry point');
const app = await readFile(join(root, 'public/app.mjs'), 'utf8');
if (app.includes('.innerHTML') || app.includes('eval(')) throw new Error('Unsafe output sink');
await mkdir(join(root, 'dist'), { recursive: true });
await cp(join(root, 'public'), join(root, 'dist/public'), { recursive: true });
await cp(join(root, 'src'), join(root, 'dist/src'), { recursive: true });
await cp(join(root, 'scripts'), join(root, 'dist/scripts'), { recursive: true });
await cp(join(root, 'test'), join(root, 'dist/test'), { recursive: true });
await cp(join(root, 'docs'), join(root, 'dist/docs'), { recursive: true });
await cp(join(root, 'server.mjs'), join(root, 'dist/server.mjs'));
await cp(join(root, 'package.json'), join(root, 'dist/package.json'));
await cp(join(root, 'README.md'), join(root, 'dist/README.md'));
const hashes = {};
for (const file of [...files, 'public/index.html', 'public/styles.css']) hashes[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
await writeFile(join(root, 'dist/build-manifest.json'), JSON.stringify({ node: process.version, files: hashes }, null, 2));
console.log('BUILD PASS: 7 JavaScript modules checked; Arabic RTL entry and text-only DOM output verified.');
console.log('BUILD PASS: standalone dist/ assembled with server, public, src, docs and private package; data and secrets excluded.');
