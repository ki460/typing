/**
 * test-core.mjs — ブラウザ非依存のコアロジック結合テスト。
 * store / curriculum / generator / engine を Node 上で実際に動かす。
 * DOM を触るモジュール(keyboard/ui)はここでは対象外。
 */
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.log(`  NG  ${name}\n      ${e.message}`); }
};
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg ?? ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };

const load = async (p) => {
  try { return await import(p); }
  catch (e) { console.log(`  !!  import ${p} failed: ${e.message.split('\n')[0]}`); return null; }
};

const romaji = await load('../src/core/romaji.js');
const storeMod = await load('../src/core/store.js');
const curr = await load('../src/core/curriculum.js');
const gen = await load('../src/core/generator.js');
const eng = await load('../src/core/engine.js');
const content = await load('../src/data/content.js');

// ---------------------------------------------------------------- store
if (storeMod) {
  const { store, recordKeystroke, mastery, weakness, isLearned, levelFromXp, worstBigrams } = storeMod;
  store.load();
  store.reset();

  t('recordKeystroke がキー統計を積む', () => {
    for (let i = 0; i < 30; i++) recordKeystroke({ expected: 'a', ok: true, ms: 150, prev: 'k' });
    recordKeystroke({ expected: 'a', ok: false, ms: null, prev: null });
    const k = store.profile.keys.a;
    eq(k.n, 30, 'n');
    eq(k.err, 1, 'err');
    ok(k.ms > 100 && k.ms < 200, `ms=${k.ms}`);
  });

  t('速くて正確なキーは learned になる', () => ok(isLearned('a'), 'a should be learned'));
  t('未知のキーは weakness が高い', () => ok(weakness('q') > weakness('a')));
  t('mastery は 0..1 に収まる', () => {
    const m = mastery('a');
    ok(m >= 0 && m <= 1, `mastery=${m}`);
    ok(mastery('q') === 0, 'unknown key mastery must be 0');
  });
  t('bigram が記録される', () => {
    for (let i = 0; i < 10; i++) recordKeystroke({ expected: 'b', ok: true, ms: 900, prev: 'z' });
    const w = worstBigrams(5, 5);
    ok(w.some((x) => x.pair === 'zb'), 'zb missing: ' + JSON.stringify(w));
  });
  t('レベルは XP に対して単調増加', () => {
    let prev = 0;
    for (let xp = 0; xp < 50000; xp += 137) {
      const lv = levelFromXp(xp);
      ok(lv >= prev, `level decreased at xp=${xp}`);
      prev = lv;
    }
    ok(levelFromXp(0) === 1, 'level at 0 xp must be 1');
  });
  t('export/import で往復できる', () => {
    const json = store.exportJSON();
    const keysBefore = store.profile.keys.a.n;
    store.reset();
    store.importJSON(json);
    eq(store.profile.keys.a.n, keysBefore, 'roundtrip');
  });
  store.reset();
}

// ----------------------------------------------------------- curriculum
if (curr && storeMod) {
  const { store, recordKeystroke } = storeMod;
  const { unlockedChars, maybeUnlock, progressOf, orderFor, charWeights, seedSize } = curr;
  store.reset();

  t('初期解禁数は seedSize', () => {
    eq(unlockedChars('ja').length, seedSize('ja'), 'ja seed');
    eq(unlockedChars('en').length, seedSize('en'), 'en seed');
  });
  t('日本語の初期解禁に母音が全部入っている', () => {
    const u = unlockedChars('ja');
    for (const v of 'aiueo') ok(u.includes(v), `missing vowel ${v}`);
  });
  t('習熟していなければ解禁されない', () => eq(maybeUnlock('en'), null));
  t('全部習熟したら1文字解禁される', () => {
    const before = unlockedChars('en');
    for (const ch of before) {
      for (let i = 0; i < 25; i++) recordKeystroke({ expected: ch, ok: true, ms: 120, prev: 'x' });
    }
    const n = maybeUnlock('en');
    ok(n, 'should unlock');
    eq(unlockedChars('en').length, before.length + 1, 'count+1');
    ok(!before.includes(n), 'newly unlocked char must be new');
  });
  t('progressOf が妥当な値を返す', () => {
    const p = progressOf('en');
    ok(p.unlocked > 0 && p.total >= p.unlocked, 'counts');
    ok(p.mastery >= 0 && p.mastery <= 1, 'mastery range');
  });
  t('charWeights が全文字に正の重みを返す', () => {
    const u = unlockedChars('en');
    const w = charWeights(u, 'en');
    for (const c of u) ok(w.get(c) > 0, `weight for ${c}`);
  });
  t('解禁順に重複が無い', () => {
    for (const lang of ['ja', 'en']) {
      const o = orderFor(lang);
      eq(new Set(o).size, o.length, `${lang} order has duplicates`);
    }
  });
  store.reset();
}

// ------------------------------------------------------------- content
if (content) {
  t('教材データが揃っている', () => {
    ok(content.JA_WORDS.length >= 300, `JA_WORDS=${content.JA_WORDS.length}`);
    ok(content.JA_SENTENCES.length >= 90, `JA_SENTENCES=${content.JA_SENTENCES.length}`);
    ok(content.EN_WORDS.length >= 500, `EN_WORDS=${content.EN_WORDS.length}`);
    ok(content.EN_SENTENCES.length >= 50, `EN_SENTENCES=${content.EN_SENTENCES.length}`);
    ok(content.BUSINESS_JA.length >= 60, `BUSINESS_JA=${content.BUSINESS_JA.length}`);
    ok(content.CODE_LINES.length >= 60, `CODE_LINES=${content.CODE_LINES.length}`);
    ok(content.KANA_POOL.length >= 70, `KANA_POOL=${content.KANA_POOL.length}`);
  });
  t('日本語データの k はひらがなのみ', () => {
    const re = /^[ぁ-んー、。]+$/;
    for (const list of [content.JA_WORDS, content.JA_SENTENCES, content.BUSINESS_JA]) {
      for (const it of list) ok(re.test(it.k), `bad k: ${it.k}`);
    }
  });
  t('日本語データは全てローマ字で打てる', () => {
    for (const list of [content.JA_WORDS, content.JA_SENTENCES, content.BUSINESS_JA]) {
      for (const it of list) ok(new romaji.RomajiMatcher(it.k).totalKeys > 0, `untypeable: ${it.k}`);
    }
  });
  t('英語データは ASCII のみ', () => {
    for (const w of content.EN_WORDS) ok(/^[a-z]{1,8}$/.test(w), `bad word: ${w}`);
    for (const s of content.EN_SENTENCES) ok(/^[\x20-\x7e]+$/.test(s), `non-ascii sentence: ${s}`);
    for (const c of content.CODE_LINES) ok(/^[\x20-\x7e]+$/.test(c.text), `non-ascii code: ${c.text}`);
  });
  t('kids タグの語彙が十分ある', () => {
    const kids = content.byTag(content.JA_WORDS, 'kids');
    ok(kids.length >= 120, `kids words=${kids.length}`);
    ok(content.byTag(content.JA_SENTENCES, 'kids').length >= 30, 'kids sentences');
  });
}

// ----------------------------------------------------------- generator
const allLines = [];
if (gen && storeMod) {
  const { store } = storeMod;
  store.reset();

  const checkLesson = (label, lesson, lang) => {
    ok(lesson && Array.isArray(lesson.lines), `${label}: lines missing`);
    ok(lesson.lines.length > 0, `${label}: no lines`);
    for (const l of lesson.lines) {
      ok(typeof l.target === 'string' && l.target.length > 0, `${label}: empty target`);
      ok(typeof l.display === 'string' && l.display.length > 0, `${label}: empty display`);
      ok(l.lang === lang, `${label}: lang mismatch ${l.lang}`);
      if (l.lang === 'ja') {
        ok(/^[ぁ-んー、。]+$/.test(l.target), `${label}: ja target not kana: ${l.target}`);
        ok(new romaji.RomajiMatcher(l.target).totalKeys > 0, `${label}: untypeable ${l.target}`);
      } else {
        ok(/^[\x20-\x7e]+$/.test(l.target), `${label}: en target not ascii: ${l.target}`);
      }
      allLines.push(l);
    }
  };

  for (const lang of ['ja', 'en']) {
    t(`buildAdaptiveLesson(${lang})`, () => {
      for (let i = 0; i < 5; i++) checkLesson(`adaptive.${lang}`, gen.buildAdaptiveLesson({ lang, lines: 8 }), lang);
    });
    t(`buildWordLesson(${lang})`, () => checkLesson(`word.${lang}`, gen.buildWordLesson({ lang, count: 10 }), lang));
    t(`buildTextLesson(${lang})`, () => {
      for (let i = 0; i < 10; i++) {
        const lesson = gen.buildTextLesson({ lang, count: 5 });
        checkLesson(`text.${lang}`, lesson, lang);
        // 「文章」は用語や単語ではなく、まとまった長さの文であること
        const min = lang === 'ja' ? 12 : 25;
        const tooShort = lesson.lines.filter((l) => l.target.length < min);
        ok(tooShort.length === 0, `text.${lang}: 短すぎる行 ${tooShort.map((l) => l.target).slice(0, 3).join(' / ')}`);
      }
    });
    t(`buildDrillLesson(${lang})`, () => checkLesson(`drill.${lang}`, gen.buildDrillLesson({ lang, count: 8 }), lang));
  }
  t('buildCodeLesson', () => checkLesson('code', gen.buildCodeLesson({ count: 6 }), 'en'));

  t('日本語の1行が 12 かなを下回らない', () => {
    const short = [];
    for (let i = 0; i < 40; i++) {
      for (const l of gen.buildAdaptiveLesson({ lang: 'ja', lines: 8 }).lines) {
        if (l.target.length < 12) short.push(`${l.kind}:${l.target}(${l.target.length})`);
      }
    }
    ok(short.length === 0, `${short.length} 行が 12 かな未満: ${short.slice(0, 5).join(', ')}`);
  });

  t('英語の1行が 5〜7 語に収まる', () => {
    const bad = [];
    for (let i = 0; i < 30; i++) {
      for (const l of gen.buildAdaptiveLesson({ lang: 'en', lines: 8 }).lines) {
        const n = l.target.split(' ').filter(Boolean).length;
        if (n < 5 || n > 7) bad.push(`${l.kind}:${n}語`);
      }
    }
    ok(bad.length === 0, `${bad.length} 行が範囲外: ${bad.slice(0, 5).join(', ')}`);
  });

  t('buildStageLesson が 1..24 全てで成立する', () => {
    for (const lang of ['ja', 'en']) {
      for (let s = 1; s <= 24; s++) {
        const lesson = gen.buildStageLesson({ stage: s, lang });
        checkLesson(`stage${s}.${lang}`, lesson, lang);
        ok(lesson.meta && lesson.meta.stage === s, `stage meta ${s}`);
        if (s % 5 === 0) ok(lesson.meta.isBoss === true, `stage ${s} should be boss`);
      }
    }
  });

  t('pseudoWords が alphabet 外の文字を出さない', () => {
    const alphabet = ['f', 'j', 'd', 'k', 'e', 'i'];
    const ws = gen.pseudoWords({ alphabet, weights: new Map(alphabet.map((c) => [c, 1])), count: 60, minLen: 3, maxLen: 6 });
    ok(ws.length === 60, `count=${ws.length}`);
    for (const w of ws) for (const c of w) ok(alphabet.includes(c), `stray char ${c} in ${w}`);
  });

  t('母音なしの alphabet でも pseudoWords が落ちない', () => {
    const alphabet = ['f', 'j', 'd', 'k'];
    const ws = gen.pseudoWords({ alphabet, weights: new Map(alphabet.map((c) => [c, 1])), count: 20, minLen: 3, maxLen: 5 });
    ok(ws.length === 20 && ws.every((w) => w.length >= 3), 'fallback failed');
  });

  t('pseudoKana のローマ字が alphabet に収まる', () => {
    const alphabet = ['a', 'i', 'u', 'e', 'o', 'k'];
    const ws = gen.pseudoKana({ alphabet, weights: new Map(alphabet.map((c) => [c, 1])), count: 40, minKana: 2, maxKana: 4 });
    ok(ws.length === 40, `count=${ws.length}`);
    for (const w of ws) {
      const r = romaji.RomajiMatcher.toRomaji(w);
      for (const c of r) ok(alphabet.includes(c), `stray romaji ${c} from ${w} (${r})`);
    }
  });
  store.reset();
}

// -------------------------------------------------------------- engine
if (eng && gen && storeMod) {
  const { store } = storeMod;
  const { TypingSession, gradeOf, formatMs } = eng;

  /** 最適なローマ字で最後まで打ち切るシミュレータ */
  const playPerfect = (lines, lang, extra = {}) => {
    let summary = null;
    const s = new TypingSession({
      lines, lang, mode: 'adult', kind: 'test', strict: true,
      onFinish: (sum) => { summary = sum; }, ...extra,
    });
    s.start();
    let guard = 0;
    while (!s.state.finished && guard++ < 20000) {
      const st = s.state;
      const ch = st.remainingRomaji?.[0] ?? [...st.expected][0];
      if (!ch) break;
      s.input(ch);
    }
    s.destroy();
    return { session: s, summary, guard };
  };

  t('完全入力で正確率 100% になる (ja)', () => {
    store.reset();
    const lesson = gen.buildAdaptiveLesson({ lang: 'ja', lines: 4 });
    const { session, summary } = playPerfect(lesson.lines, 'ja');
    ok(session.state.finished, 'not finished');
    const m = session.metrics;
    eq(Math.round(m.accuracy * 100), 100, 'accuracy');
    eq(m.errors, 0, 'errors');
    ok(m.correct > 0, 'no keys counted');
    ok(summary, 'onFinish not called');
    ok(summary.reward, 'reward missing');
  });

  t('完全入力で正確率 100% になる (en)', () => {
    store.reset();
    const lesson = gen.buildAdaptiveLesson({ lang: 'en', lines: 4 });
    const { session } = playPerfect(lesson.lines, 'en');
    ok(session.state.finished, 'not finished');
    eq(session.metrics.errors, 0, 'errors');
  });

  t('strict モードは誤打で前に進まない', () => {
    store.reset();
    const lines = [{ display: 'fj', target: 'fj', lang: 'en', kind: 'mixed' }];
    const s = new TypingSession({ lines, lang: 'en', mode: 'adult', strict: true });
    s.start();
    const r = s.input('z');
    eq(r.ok, false, 'wrong key accepted');
    eq(s.state.unitIndex, 0, 'cursor moved on error');
    ok(s.metrics.errors === 1, 'error not counted');
    s.input('f'); s.input('j');
    ok(s.state.finished, 'should finish');
    eq(s.metrics.errors, 1, 'error count');
    eq(s.metrics.correct, 2, 'correct count');
    s.destroy();
  });

  t('誤打は本来打つべきキーの統計に計上される', () => {
    store.reset();
    const lines = [{ display: 'fj', target: 'fj', lang: 'en', kind: 'mixed' }];
    const s = new TypingSession({ lines, lang: 'en', mode: 'adult', strict: true });
    s.start();
    s.input('z');
    ok(store.profile.keys.f && store.profile.keys.f.err === 1, 'expected key f should hold the error: ' + JSON.stringify(store.profile.keys));
    ok(!store.profile.keys.z, 'the mistyped key z must not be blamed');
    s.destroy();
  });

  t('メトリクスが数値として健全', () => {
    store.reset();
    const lesson = gen.buildAdaptiveLesson({ lang: 'en', lines: 3 });
    const { session } = playPerfect(lesson.lines, 'en');
    const m = session.metrics;
    for (const k of ['wpm', 'cpm', 'kpm', 'accuracy', 'consistency', 'elapsedMs', 'keys', 'correct', 'errors', 'progress']) {
      ok(k in m, `metric ${k} missing`);
      ok(Number.isFinite(m[k]), `metric ${k} is not finite: ${m[k]}`);
    }
    ok(m.accuracy >= 0 && m.accuracy <= 1, 'accuracy range');
    ok(m.consistency >= 0 && m.consistency <= 1, 'consistency range');
    ok(m.progress >= 0 && m.progress <= 1, 'progress range');
    ok(m.wpm >= 0, 'wpm negative');
  });

  t('finish() は二重呼び出しに耐える', () => {
    store.reset();
    const lines = [{ display: 'fj', target: 'fj', lang: 'en', kind: 'mixed' }];
    const s = new TypingSession({ lines, lang: 'en', mode: 'adult' });
    s.start(); s.input('f'); s.input('j');
    const before = store.profile.sessions.length;
    const a = s.finish(); const b = s.finish();
    eq(store.profile.sessions.length, before, 'session recorded twice');
    ok(a && b, 'summary missing');
    s.destroy();
  });

  t('abort() はセッションを記録しない', () => {
    store.reset();
    const lines = [{ display: 'fj', target: 'fj', lang: 'en', kind: 'mixed' }];
    const s = new TypingSession({ lines, lang: 'en', mode: 'adult' });
    s.start(); s.input('f'); s.abort();
    eq(store.profile.sessions.length, 0, 'aborted session was recorded');
    s.destroy();
  });

  t('gradeOf / formatMs が使える', () => {
    ok(typeof formatMs(83000) === 'string', 'formatMs');
    eq(formatMs(83000), '1:23', 'formatMs value');
    const g = gradeOf({ accuracy: 0.99, wpm: 60, consistency: 0.8 });
    ok(g && g.stars >= 0 && g.stars <= 3, 'stars range');
    ok(gradeOf({ accuracy: 0.5, wpm: 5 }).stars <= 1, 'low grade');
  });

  t('全ステージを通しで打ち切れる (ja)', () => {
    store.reset();
    for (let s = 1; s <= 20; s++) {
      const lesson = gen.buildStageLesson({ stage: s, lang: 'ja' });
      const { session, guard } = playPerfect(lesson.lines, 'ja');
      ok(session.state.finished, `stage ${s} did not finish (guard=${guard})`);
      ok(session.metrics.errors === 0, `stage ${s} had errors`);
    }
  });
  store.reset();
}

console.log(`\ncore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
