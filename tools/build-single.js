/**
 * build-single.js — 依存ゼロの単一HTMLビルダー。
 * index.html の stylesheet を <style> に取り込み、src/main.js から import を
 * 再帰的にたどって 1 つの <script type="module"> にまとめ、dist/kaede-typing.html を書く。
 * 各モジュールは即時関数で包んで元の名前空間を保つ(名前衝突と `import * as` に対応するため)。
 * 解決できない import / export default / 外部パッケージは黙って壊さずエラーで止める。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRY_HTML = join(ROOT, 'index.html');
const OUT = join(ROOT, 'dist', 'kaede-typing.html');

class BuildError extends Error {}

const rel = (p) => relative(ROOT, p).split('\\').join('/');
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** モジュールごとの変数名。パスから機械的に作るので衝突しない。 */
function modVar(file) {
  return '__m_' + rel(file).replace(/[^\w$]/g, '_');
}

/** `a, b as c` を [{orig,local}] にする */
function parseClause(clause, file) {
  return clause.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
    const out = m ? { orig: m[1], local: m[2] } : { orig: s, local: s };
    if (!IDENT.test(out.orig) || !IDENT.test(out.local)) {
      throw new BuildError(`${rel(file)}: 解析できない import/export 句 "${s}"`);
    }
    return out;
  });
}

const cache = new Map();

/** 1 ファイルを読み、import/export 文を取り除いた本体と依存情報を返す。 */
function parseModule(file) {
  if (cache.has(file)) return cache.get(file);
  let code = readFileSync(file, 'utf8');

  if (/^export\s+default\b/m.test(code)) {
    throw new BuildError(`${rel(file)}: export default は未対応。名前付き export を使ってください。`);
  }

  const deps = [];
  const imports = [];
  const exports = [];
  const stars = [];

  const addDep = (spec) => {
    if (!spec.startsWith('.')) {
      throw new BuildError(`${rel(file)}: 外部パッケージ "${spec}" は使えません(依存ゼロが前提)`);
    }
    const p = resolve(dirname(file), spec);
    if (!existsSync(p)) throw new BuildError(`${rel(file)}: import 先 "${spec}" が見つかりません`);
    if (!deps.includes(p)) deps.push(p);
    return p;
  };

  // 1) 再輸出 export { a, b as c } from './x.js'
  code = code.replace(/^export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2\s*;?[ \t]*$/gm, (_m, clause, _q, spec) => {
    const from = addDep(spec);
    for (const { orig, local } of parseClause(clause, file)) exports.push({ name: local, from, orig });
    return '';
  });

  // 2) 全再輸出 export * from './x.js'
  code = code.replace(/^export\s*\*\s*from\s*(['"])([^'"]+)\1\s*;?[ \t]*$/gm, (_m, _q, spec) => {
    stars.push(addDep(spec));
    return '';
  });

  // 3) import ... from './x.js'(複数行も可)
  code = code.replace(/^import\s+([^'"]*?)\s*from\s*(['"])([^'"]+)\2\s*;?[ \t]*$/gm, (_m, what, _q, spec) => {
    const from = addDep(spec);
    const w = what.trim();
    const ns = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(w);
    if (ns) { imports.push({ from, ns: ns[1] }); return ''; }
    const named = /^\{([\s\S]*)\}$/.exec(w);
    if (named) { imports.push({ from, names: parseClause(named[1], file) }); return ''; }
    throw new BuildError(`${rel(file)}: default import は未対応です → "import ${w} from '${spec}'"`);
  });

  // 4) 副作用 import './x.js'
  code = code.replace(/^import\s*(['"])([^'"]+)\1\s*;?[ \t]*$/gm, (_m, _q, spec) => {
    addDep(spec);
    return '';
  });

  // 5) export { a, b as c };(ローカル束縛の輸出)
  code = code.replace(/^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (_m, clause) => {
    for (const { orig, local } of parseClause(clause, file)) exports.push({ name: local, from: null, orig });
    return '';
  });

  // 6) export const / let / var / function / class → export だけ外す
  code = code.replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm, '');
  // 上で外したので、宣言名はこちらで拾い直す
  for (const m of readFileSync(file, 'utf8').matchAll(
    /^export\s+(?:async\s+)?(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exports.push({ name: m[1], from: null, orig: m[1] });
  }

  const left = /^(?:import|export)\b.*$/m.exec(code);
  if (left) throw new BuildError(`${rel(file)}: 処理できない文があります → ${left[0].trim()}`);

  const seen = new Set();
  for (const e of exports) {
    if (seen.has(e.name)) throw new BuildError(`${rel(file)}: export "${e.name}" が重複しています`);
    seen.add(e.name);
  }

  const mod = { file, code: code.trim(), deps, imports, exports, stars };
  cache.set(file, mod);
  return mod;
}

/** 依存を先に並べた順序を作る(深さ優先の帰りがけ)。循環は止める。 */
function order(entry) {
  const out = [];
  const done = new Set();
  const path = [];
  (function visit(file) {
    if (done.has(file)) return;
    if (path.includes(file)) {
      throw new BuildError(`循環 import: ${[...path, file].map(rel).join(' → ')}`);
    }
    path.push(file);
    const mod = parseModule(file);
    for (const d of mod.deps) visit(d);
    path.pop();
    done.add(file);
    out.push(mod);
  })(entry);
  return out;
}

/** モジュールが提供する名前の集合(再輸出・全再輸出を含む) */
function exportNames(mod) {
  const set = new Set(mod.exports.map((e) => e.name));
  for (const s of mod.stars) for (const n of exportNames(parseModule(s))) set.add(n);
  return set;
}

function emit(mod) {
  const lines = [];
  for (const im of mod.imports) {
    if (im.ns) { lines.push(`const ${im.ns} = ${modVar(im.from)};`); continue; }
    const available = exportNames(parseModule(im.from));
    const missing = im.names.filter((n) => !available.has(n.orig));
    if (missing.length) {
      throw new BuildError(
        `${rel(mod.file)}: ${rel(im.from)} に ${missing.map((n) => `"${n.orig}"`).join(', ')} が export されていません`);
    }
    const pairs = im.names.map((n) => (n.orig === n.local ? n.orig : `${n.orig}: ${n.local}`));
    lines.push(`const { ${pairs.join(', ')} } = ${modVar(im.from)};`);
  }

  const fields = mod.stars.map((s) => `...${modVar(s)}`);
  for (const e of mod.exports) {
    fields.push(e.from ? `${e.name}: ${modVar(e.from)}.${e.orig}` : (e.name === e.orig ? e.name : `${e.name}: ${e.orig}`));
  }

  return [
    `/* ------------------------------------------------ ${rel(mod.file)} */`,
    `const ${modVar(mod.file)} = (function () {`,
    lines.join('\n'),
    mod.code,
    `return { ${fields.join(', ')} };`,
    `})();`,
  ].filter((s) => s !== '').join('\n');
}

function bundle(entry) {
  return order(entry).map(emit).join('\n\n');
}

function main() {
  let html = readFileSync(ENTRY_HTML, 'utf8');

  // 単一ファイルでは manifest を参照できないので外す
  html = html.replace(/[ \t]*<link\b[^>]*\brel=["']manifest["'][^>]*>[ \t]*\r?\n?/gi, '');

  // 1) stylesheet を取り込む
  const missing = [];
  html = html.replace(/[ \t]*<link\b[^>]*\brel=["']stylesheet["'][^>]*>[ \t]*/gi, (tag) => {
    const href = /\bhref=["']([^"']+)["']/.exec(tag);
    if (!href) return tag;
    const file = resolve(ROOT, href[1]);
    if (!existsSync(file)) { missing.push(href[1]); return ''; }
    let css = readFileSync(file, 'utf8').trim();
    if (/<\/style/i.test(css)) throw new BuildError(`${rel(file)}: CSS に </style が含まれています`);
    return `<style>\n/* ${href[1]} */\n${css}\n</style>`;
  });
  if (missing.length) throw new BuildError(`CSS が見つかりません: ${missing.join(', ')}`);

  // 2) module スクリプトを取り込む
  let found = false;
  html = html.replace(/[ \t]*<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/i,
    (_m, src) => {
      found = true;
      const entry = resolve(ROOT, src);
      if (!existsSync(entry)) throw new BuildError(`エントリ ${src} が見つかりません`);
      // 文字列中の </script が HTML を早く閉じないようにする(JS 的には等価)
      const js = bundle(entry).replace(/<\/script/gi, '<\\/script');
      return `<script type="module">\n${js}\n</script>`;
    });
  if (!found) throw new BuildError('index.html に <script type="module" src="..."> が見つかりません');

  html = html.replace(/<head>/i, '<head>\n<!-- 単一HTMLビルド: tools/build-single.js が生成。編集しないこと。 -->');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`書き出しました: ${rel(OUT)}  (${kb} KB / ${cache.size} モジュール)`);
}

try {
  main();
} catch (e) {
  if (e instanceof BuildError) { console.error(`ビルド失敗: ${e.message}`); process.exit(1); }
  throw e;
}
