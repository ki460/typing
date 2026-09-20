/** 全 JS ファイルの構文チェック(実行はしない)。 */
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const roots = ['src', 'tools'];
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) files.push(p);
  }
})('src');
for (const r of roots.slice(1)) { try { walk(r); } catch {} }

let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.log(`SYNTAX FAIL ${f}\n${e.stderr?.toString().split('\n').slice(0, 6).join('\n')}`); }
}
console.log(`${files.length - bad}/${files.length} files parsed`);
process.exit(bad ? 1 : 0);
