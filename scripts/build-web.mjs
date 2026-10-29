import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'dist');
const files = [
  'app.html',
  'index.html',
  'admin.html',
  'employee.js',
  'admin.js',
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
console.log(`Built K&B Enterprise OS web shell into ${output}`);
