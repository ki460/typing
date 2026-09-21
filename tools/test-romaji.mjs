import { RomajiMatcher } from '../src/core/romaji.js';

let pass = 0, fail = 0;
function accept(kana, romaji, shouldPass = true) {
  const m = new RomajiMatcher(kana);
  let ok = true;
  for (const ch of romaji) { if (!m.feed(ch).ok) { ok = false; break; } }
  const result = ok && m.done;
  if (result === shouldPass) { pass++; }
  else { fail++; console.log(`  NG  ${kana} <- "${romaji}"  expected ${shouldPass ? 'accept' : 'reject'}, got ${result ? 'accept' : 'reject'}`); }
}
function hint(kana, expected) {
  const got = RomajiMatcher.toRomaji(kana);
  if (got === expected) pass++;
  else { fail++; console.log(`  NG  hint(${kana}) = "${got}" expected "${expected}"`); }
}

// 基本
accept('あいうえお', 'aiueo');
accept('かきくけこ', 'kakikukeko');
// 複数つづり
accept('し', 'si'); accept('し', 'shi'); accept('し', 'ci');
accept('つ', 'tu'); accept('つ', 'tsu');
accept('ふ', 'hu'); accept('ふ', 'fu');
accept('じ', 'zi'); accept('じ', 'ji');
// 拗音
accept('きゃ', 'kya'); accept('きゃ', 'kixya'); accept('きゃ', 'kilya');
accept('しゃ', 'sha'); accept('しゃ', 'sya'); accept('しゃ', 'shixya');
accept('じゅ', 'ju'); accept('じゅ', 'zyu'); accept('じゅ', 'jyu');
accept('ちょ', 'cho'); accept('ちょ', 'tyo'); accept('ちょ', 'cyo');
// 促音
accept('がっこう', 'gakkou'); accept('がっこう', 'gaxtukou'); accept('がっこう', 'galtukou');
accept('まって', 'matte'); accept('まって', 'maxtute');
accept('いっしょ', 'issho'); accept('いっしょ', 'issyo'); accept('いっしょ', 'isixyo', false);
accept('あっ', 'axtu'); accept('あっ', 'at', false);
// 撥音
accept('ほん', 'hon'); accept('ほん', 'honn');
accept('ほんや', 'honnya'); accept('ほんや', 'honya', false);   // honya = ほにゃ
accept('にほんご', 'nihongo'); accept('にほんご', 'nihonngo');
accept('あんい', 'anni'); accept('あんい', 'ani', false);        // ani = あに
accept('しんぶん', 'shinbun'); accept('しんぶん', 'sinnbunn');
accept('こんにちは', 'konnnichiha'); accept('こんにちは', 'konnnitiha');
// 長音・記号
accept('コーヒー', 'ko-hi-');
accept('ねこ、いぬ。', 'neko,inu.');
// カタカナ正規化
accept('パソコン', 'pasokon'); accept('パソコン', 'pasokonn');
// 拒否
accept('あい', 'ao', false);
accept('かき', 'kaka', false);
// ヒント(最短)
hint('がっこう', 'gakkou');
hint('しゃしん', 'syasin');
hint('ほんや', 'honnya');
hint('コーヒー', 'ko-hi-');

// --- 促音の難所
accept('いっしょに', 'isshoni'); accept('いっしょに', 'issyoni'); accept('いっしょに', 'ixtusyoni');
accept('ざっし', 'zassi'); accept('ざっし', 'zasshi');
accept('まっちゃ', 'maccha'); accept('まっちゃ', 'matcha'); accept('まっちゃ', 'mattya');
accept('しゅっちょう', 'shutchou'); accept('しゅっちょう', 'syuttyou'); accept('しゅっちょう', 'syucchou');
accept('がっつり', 'gattsuri'); accept('がっつり', 'gatturi');
accept('きっぷ', 'kippu'); accept('っ', 'ltu');
// --- 撥音の難所(「ん」の単独 n が使えない条件)
accept('しんにん', 'shinnninn'); accept('しんにん', 'sinnninn'); accept('しんにん', 'shinninn', false);
accept('たんい', 'tanni'); accept('たんい', 'tannni', false);
accept('あんない', 'annnai'); accept('あんない', 'annai', false);
accept('ほんね', 'honnne'); accept('ほんね', 'honne', false);
accept('ぐんま', 'gunma'); accept('ぐんま', 'gunnma');
accept('せんえん', 'sennenn'); accept('せんえん', 'sennen');
// --- 外来音
accept('ふぁいる', 'fairu'); accept('ふぁいる', 'huxairu');
accept('ぱーてぃー', 'pa-thi-'); accept('ぱーてぃー', 'pa-texi-');
accept('ゔぁいおりん', 'vaiorinn'); accept('うぇぶ', 'webu'); accept('うぇぶ', 'whebu');
accept('じぇっと', 'jetto'); accept('じぇっと', 'zyetto');
accept('ちぇっく', 'chekku'); accept('ちぇっく', 'tyekku');
accept('つぁー', 'tsa-'); accept('しぇあ', 'shea'); accept('しぇあ', 'syea');
accept('ヴィオラ', 'viora'); accept('コーヒーカップ', 'ko-hi-kappu');
accept('あ、い。', 'a,i.');

// 途中経過の remaining() が正しく縮むか
const m = new RomajiMatcher('がっこう');
const seq = [];
for (const ch of 'gakkou') { m.feed(ch); seq.push(m.remaining()); }
const expectSeq = ['akkou','kkou','kou','ou','u',''];
if (JSON.stringify(seq) === JSON.stringify(expectSeq)) pass++;
else { fail++; console.log('  NG  remaining seq', seq); }

// 「ん」分岐中に remaining が破綻しないか
const m2 = new RomajiMatcher('ほんや');
m2.feed('h'); m2.feed('o'); m2.feed('n');
if (m2.remaining() === 'nya') pass++; else { fail++; console.log('  NG  honnya remaining after "hon":', m2.remaining()); }

// totalKeys
const tk = new RomajiMatcher('がっこう').totalKeys;
if (tk === 6) pass++; else { fail++; console.log('  NG totalKeys', tk); }

console.log(`\nromaji: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
