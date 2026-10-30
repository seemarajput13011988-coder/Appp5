import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'dist');
const files = [
  'app.html',
  'index.html',
  'admin.html',
  'employee.js',
  'employee-requests.js',
  'admin.js',
  'enterprise-admin.js',
  'firebase.js',
  'manifest.webmanifest',
  'icon.svg',
  'sw.js'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(resolve(root, file), resolve(output, file));
}

// Native wrappers open index.html by default. Preserve the worker portal at
// employee.html and make index.html a launcher so both workspaces are reachable.
await cp(resolve(output, 'index.html'), resolve(output, 'employee.html'));
const launcher = (await readFile(resolve(output, 'app.html'), 'utf8'))
  .replace('href="./index.html"', 'href="./employee.html"');
await writeFile(resolve(output, 'app.html'), launcher, 'utf8');
await writeFile(resolve(output, 'launcher.html'), launcher, 'utf8');
await writeFile(resolve(output, 'index.html'), launcher, 'utf8');

const swPath = resolve(output, 'sw.js');
const sw = await readFile(swPath, 'utf8');
await writeFile(swPath, sw.replace('const SHELL = [', "const SHELL = ['./employee.html', './launcher.html', "), 'utf8');

console.log(`Built K&B Enterprise OS web shell into ${output}`);
