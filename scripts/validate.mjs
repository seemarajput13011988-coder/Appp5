import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const htmlPairs = [
  ['index.html', ['employee.js', 'employee-requests.js']],
  ['admin.html', ['admin.js', 'enterprise-admin.js']]
];
const jsFiles = [
  'employee.js',
  'employee-requests.js',
  'admin.js',
  'enterprise-admin.js',
  'firebase.js',
  'scripts/build-web.mjs',
  'server.js',
  'electron/main.cjs'
];
const jsonFiles = ['package.json', 'database.rules.json', 'manifest.webmanifest', 'capacitor.config.json'];
const errors = [];

async function read(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) {
    errors.push(`Cannot read ${path}: ${error.message}`);
    return '';
  }
}

for (const path of jsonFiles) {
  const source = await read(path);
  if (!source) continue;
  try { JSON.parse(source); }
  catch (error) { errors.push(`${path} is not valid JSON: ${error.message}`); }
}

for (const path of jsFiles) {
  const source = await read(path);
  if (!source) continue;
  const isCommonJs = path.endsWith('.cjs') || path === 'server.js';
  const args = isCommonJs ? ['--check'] : ['--input-type=module', '--check'];
  const result = spawnSync(process.execPath, args, { input: source, encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`JavaScript syntax error in ${path}: ${(result.stderr || result.stdout || 'Node parser failed').trim()}`);
  }
}

for (const [htmlPath, scripts] of htmlPairs) {
  const html = await read(htmlPath);
  if (!html) continue;
  const ids = [...html.matchAll(/\\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const idSet = new Set(ids);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) errors.push(`${htmlPath} contains duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);

  for (const scriptPath of scripts) {
    const source = await read(scriptPath);
        for (const match of source.matchAll(/\\$\\(['"]([^'"]+)['"]\\)/g)) {
      if (!idSet.has(match[1])) errors.push(`${scriptPath} references missing #${match[1]} in ${htmlPath}`);
    }
  }
}

const buildScript = await read('scripts/build-web.mjs');
for (const match of buildScript.matchAll(/'([^']+\\.(?:html|js|webmanifest|svg))'/g)) {
  try { await access(match[1]); }
  catch { errors.push(`Build input is missing: ${match[1]}`); }
}

if (errors.length) {
  console.error('Website validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Website validation passed: JavaScript syntax, JSON files, DOM ID wiring, duplicate IDs, and web build inputs.');
}
