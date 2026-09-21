/** src / tools / ルート直下の JS を構文チェックする(実行はしない)。 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) files.push(p);
  }
}

for (const root of ['src', 'tools']) {
  if (existsSync(root)) walk(root);
}
for (const f of ['sw.js']) {
  if (existsSync(f)) files.push(f);
}

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.log(`SYNTAX FAIL ${f}\n${e.stderr?.toString().split('\n').slice(0, 6).join('\n')}`);
  }
}
console.log(`${files.length - bad}/${files.length} files parsed`);
process.exit(bad ? 1 : 0);
