/**
 * code.js — コード練習行のデータ(純粋なデータのみ)。
 * 記号キーの運指訓練が目的なので、括弧・引用符・演算子などが
 * 全体でまんべんなく登場するように配分してある。
 * text は ASCII のみ・20〜70文字・タブ無し(半角スペースのみ)。
 * 実在ライブラリの転記ではなく、一般的で読みやすい自作の1行断片。
 * 他ファイルを import せず、content.js から再輸出される。
 */

/** コード練習行。lang は表示ラベル兼フィルタ用のキー。 */
export const CODE_LINES = [
  // --- JavaScript ---
  { lang: 'js', text: 'const sum = (a, b) => a + b;' },
  { lang: 'js', text: 'let total = items.reduce((s, x) => s + x.price, 0);' },
  { lang: 'js', text: "const name = user?.profile?.name ?? 'guest';" },
  { lang: 'js', text: "if (n % 2 === 0) { console.log('even'); }" },
  { lang: 'js', text: 'const msg = `hi, ${user.name}! you have ${n} items.`;' },
  { lang: 'js', text: "export default { port: 8080, host: '0.0.0.0' };" },
  { lang: 'js', text: 'const re = /^[a-z_]+\\d{2,4}$/i;' },
  { lang: 'js', text: 'arr.sort((a, b) => (a.id > b.id ? 1 : -1));' },
  { lang: 'js', text: 'const [first, ...rest] = list.filter(Boolean);' },
  { lang: 'js', text: "el.addEventListener('keydown', onKey, false);" },
  { lang: 'js', text: 'flags |= MASK_READ & ~MASK_WRITE;' },
  { lang: 'js', text: "throw new Error('missing field: ' + key);" },
  { lang: 'js', text: "const path = dir + '\\\\logs\\\\app.txt';" },
  { lang: 'js', text: 'for (let i = 0; i < len; i += 1) { run(i); }' },
  { lang: 'js', text: 'const ok = a !== b && c === d || !flag;' },
  { lang: 'js', text: "obj['key'] = obj['key'] || { count: 0 };" },
  { lang: 'js', text: 'async function load() { await wait(250); }' },
  { lang: 'js', text: 'items.forEach((it, i) => { it.rank = i + 1; });' },

  // --- TypeScript ---
  { lang: 'ts', text: 'interface Point { x: number; y: number; }' },
  { lang: 'ts', text: 'type Id = string | number | null;' },
  { lang: 'ts', text: 'function head<T>(xs: T[]): T | undefined { return xs[0]; }' },
  { lang: 'ts', text: 'const cache = new Map<string, number[]>();' },
  { lang: 'ts', text: 'export type Result<T> = { ok: boolean; value: T };' },
  { lang: 'ts', text: 'const rec = input as unknown as Record<string, number>;' },
  { lang: 'ts', text: 'enum Level { Low = 1, Mid = 2, High = 3 }' },
  { lang: 'ts', text: 'const isPos: (n: number) => boolean = (n) => n > 0;' },

  // --- Python ---
  { lang: 'py', text: 'def area(w, h): return w * h  # simple box area' },
  { lang: 'py', text: 'values = [x ** 2 for x in range(1, 20) if x % 3]' },
  { lang: 'py', text: 'print(f"total={total:.2f} rate={rate:.1%}")' },
  { lang: 'py', text: "data = {'id': 7, 'tags': ['a', 'b'], 'ok': True}" },
  { lang: 'py', text: '@lru_cache(maxsize=128)  # memoize small results' },
  { lang: 'py', text: '@app.route("/health")  # tiny status endpoint' },
  { lang: 'py', text: "rows = open(path, 'r').read().split('\\n')" },
  { lang: 'py', text: 'if name not in table: raise KeyError(name)' },
  { lang: 'py', text: 'top = sorted(pairs, key=lambda p: -p[1])[:10]' },
  { lang: 'py', text: 'assert n >= 0 and n <= 100, "value out of range"' },
  { lang: 'py', text: "class Node: __slots__ = ('left', 'right', 'val')" },
  { lang: 'py', text: "total += sum(v for k, v in items if k != 'skip')" },
  { lang: 'py', text: "path = os.path.join(base, 'logs', 'app.log')" },

  // --- SQL ---
  { lang: 'sql', text: 'SELECT id, name FROM users WHERE age >= 18;' },
  { lang: 'sql', text: 'UPDATE cart SET qty = qty + 1 WHERE id = 42;' },
  { lang: 'sql', text: "SELECT * FROM logs WHERE msg LIKE '%error%';" },
  { lang: 'sql', text: "INSERT INTO tags (id, name) VALUES (1, 'new');" },
  { lang: 'sql', text: 'SELECT COUNT(*) AS n FROM orders GROUP BY day;' },
  { lang: 'sql', text: "DELETE FROM cache WHERE hit_at < '2024-01-01';" },
  { lang: 'sql', text: "SELECT first_name || ' ' || last_name AS who FROM staff;" },
  { lang: 'sql', text: 'CREATE TABLE note (id INT PRIMARY KEY, body TEXT);' },
  { lang: 'sql', text: 'SELECT a.id FROM a JOIN b ON a.id = b.a_id LIMIT 20;' },
  { lang: 'sql', text: 'SELECT `order`, price * 1.10 AS tax_in FROM item;' },
  { lang: 'sql', text: 'ALTER TABLE users ADD COLUMN email TEXT NOT NULL;' },

  // --- HTML ---
  { lang: 'html', text: '<a href="/docs/index.html" title="manual">docs</a>' },
  { lang: 'html', text: '<input type="text" name="q" placeholder="search">' },
  { lang: 'html', text: '<div id="app" class="card row" data-role="main"></div>' },
  { lang: 'html', text: '<img src="logo.png" alt="logo" width="64" height="64">' },
  { lang: 'html', text: '<p>Tom &amp; Ann &lt;tag&gt; ready!</p>' },
  { lang: 'html', text: '<script type="module" src="./src/main.js"></script>' },
  { lang: 'html', text: '<meta name="viewport" content="width=device-width">' },
  { lang: 'html', text: '<a href="mailto:ops@example.com">contact us</a>' },
  { lang: 'html', text: '<button onclick="save()" disabled>save &#38; exit</button>' },

  // --- CSS ---
  { lang: 'css', text: '.card { padding: 16px; border-radius: 10px; }' },
  { lang: 'css', text: '@media (max-width: 480px) { .row { display: block; } }' },
  { lang: 'css', text: '#app > .list > li:nth-child(2n+1) { opacity: .8; }' },
  { lang: 'css', text: 'a:hover, a:focus { color: #4f9cf9; outline: none; }' },
  { lang: 'css', text: '.btn[disabled] { cursor: not-allowed; opacity: 50%; }' },
  { lang: 'css', text: ':root { --gap: 8px; --fg: #e6edf3; --bg: #0f1216; }' },
  { lang: 'css', text: '.bar::after { content: "*"; color: var(--accent); }' },
  { lang: 'css', text: 'input[type="text"] + label { margin-left: 4px; }' },
  { lang: 'css', text: '.grid { display: grid; grid-template-columns: 1fr 2fr; }' },

  // --- Shell ---
  { lang: 'sh', text: '#!/usr/bin/env bash   # portable shebang line' },
  { lang: 'sh', text: 'set -euo pipefail  # stop on the first error' },
  { lang: 'sh', text: 'grep -rn "TODO" ./src | wc -l' },
  { lang: 'sh', text: 'for f in *.log; do gzip "$f"; done' },
  { lang: 'sh', text: 'if [ -d "$HOME/bin" ]; then export PATH="$HOME/bin:$PATH"; fi' },
  { lang: 'sh', text: "ls -la | awk '{print $1, $9}' | sort -r | head" },
  { lang: 'sh', text: 'echo "count=$(ls | wc -l)" > /tmp/report.txt' },
  { lang: 'sh', text: "find . -name '*.js' -exec node --check {} \\;" },
  { lang: 'sh', text: "curl -s 'https://api.local/v1?id=7&page=2' | jq '.'" },
  { lang: 'sh', text: "tar -czf backup.tgz ./src ./docs && echo 'done!'" },
  { lang: 'sh', text: "sed -i 's/old/new/g' notes.txt  # replace in file" },
  { lang: 'sh', text: 'count=`wc -l < data.csv`; echo "lines: $count"' },

  // --- JSON ---
  { lang: 'json', text: '{ "name": "kaede", "version": "1.0.0", "private": true }' },
  { lang: 'json', text: '{ "scripts": { "test": "node tools/test.mjs" } }' },
  { lang: 'json', text: '{ "port": 8080, "hosts": ["a.local", "b.local"] }' },
  { lang: 'json', text: '{ "flags": [true, false, null], "ratio": -0.75 }' },
  { lang: 'json', text: '{ "path": "C:\\\\tmp\\\\out.json", "keep": false }' },
  { lang: 'json', text: '{ "query": "a=1&b=2", "tag": "#new", "cost": 9.99 }' },

  // --- Go ---
  { lang: 'go', text: 'func Add(a, b int) int { return a + b }' },
  { lang: 'go', text: 'if err != nil { return nil, fmt.Errorf("bad: %w", err) }' },
  { lang: 'go', text: 'm := map[string]int{"a": 1, "b": 2, "c": 3}' },
  { lang: 'go', text: 'for i, v := range list { fmt.Println(i, v) }' },
  { lang: 'go', text: 'type Point struct { X, Y float64 }' },
  { lang: 'go', text: 'ch := make(chan []byte, 8); defer close(ch)' },
  { lang: 'go', text: 'p := &Point{X: 1.5, Y: -2.5}; p.X *= 2' },
  { lang: 'go', text: 's := strings.Join(parts, "/") + "?v=" + tag' },
  { lang: 'go', text: 'var _ = time.Now().Unix() % 60' },

  // --- Rust ---
  { lang: 'rust', text: 'let v: Vec<i32> = (1..=10).map(|x| x * 3).collect();' },
  { lang: 'rust', text: 'fn main() { println!("hi, {}!", name); }' },
  { lang: 'rust', text: 'match n { 0 => "zero", 1 => "one", _ => "many" }' },
  { lang: 'rust', text: 'let s = String::from("a/b\\\\c");' },
  { lang: 'rust', text: 'if let Some(x) = opt { total += x; }' },
  { lang: 'rust', text: 'struct Cfg { port: u16, host: String, dbg: bool }' },
  { lang: 'rust', text: 'let sum: i32 = xs.iter().filter(|&x| *x > 0).sum();' },
  { lang: 'rust', text: 'pub fn id(&self) -> u64 { self.id + 1 }' },
];
