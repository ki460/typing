# Kaede Typing — 実装契約 (ARCHITECTURE)

**この文書は唯一の真実 (single source of truth)。** 各モジュールはここに書かれた
シグネチャを厳密に守る。勝手に API を変えない。足りない補助関数は各ファイル内に
private として置く（export しない）。

- 依存ゼロ。ビルド不要。素の ES Modules + 素の CSS のみ。
- npm パッケージ／CDN／外部フォント／外部画像は **一切使わない**。
- 出力は `<script type="module">` から直接読める `.js`。TypeScript 構文は禁止。
- UI 文言はすべて日本語。子供向けはひらがな主体、大人向けは常用漢字。
- 広告・課金・外部送信・トラッキングは禁止。保存は localStorage のみ。

---

## 0. ディレクトリと担当

```
index.html                 [済] シェル。CSS を5枚 link 済み（下記の名前で作ること）
src/main.js                [済] エントリ。store.load() → startApp(#app)
src/core/romaji.js         [済] かな→ローマ字オートマトン
src/core/store.js          [済] プロファイル永続化・統計・XP
src/core/curriculum.js     [済] 適応カリキュラム（解禁・重み）
src/data/layouts.js        [済] JIS/US 配列・運指
assets/css/base.css        [済] デザイントークン・共通部品

src/data/content.js        [要] 教材データ
src/core/generator.js      [要] 出題文生成
src/core/engine.js         [要] タイピング実行エンジン
src/core/keyboard.js       [要] 画面キーボード + assets/css/keyboard.css
src/core/audio.js          [要] WebAudio 効果音
src/ui/shell.js            [要] ルーター・ホーム・設定 + assets/css/shell.css
src/ui/adult.js            [要] 大人モード + assets/css/adult.css
src/ui/kids.js             [要] 子供モード + assets/css/kids.css
src/ui/stats.js            [要] 統計画面 + assets/css/stats.css
sw.js / manifest.webmanifest / README.md / docs/RESEARCH.md / tools/build-single.js
```

---

## 1. 既存モジュールの API（変更禁止・そのまま使う）

### `src/core/romaji.js`
```js
export function normalizeKana(s): string          // カタカナ・全角→ひらがな・半角
export class RomajiMatcher {
  constructor(kana: string)
  get totalKeys(): number        // 最短打鍵数
  get done(): boolean
  expected(): Set<string>        // 次に受理できる文字の集合
  feed(ch: string): { ok: boolean, done: boolean, advanced: number }
  remaining(): string            // 残りローマ字（最短経路）
  unitIndex: number              // 確定したかな位置（表示カーソル）
  typed: string                  // 実際に打たれた正しいローマ字
  kana: string                   // 正規化後の目標かな
  static toRomaji(kana): string
}
export class DirectMatcher { /* 同じ API。1文字=1打鍵 */ }
export function createMatcher(lang: 'ja'|'en', target: string): RomajiMatcher|DirectMatcher
```

### `src/core/store.js`
```js
export const store = {
  profile, settings,
  load(), save(), onChange(fn)->unsub, set(patch),
  course(id) -> {unlocked:number, cleared:{}, best:{}},
  targetMs(): number, reset(), exportJSON(): string, importJSON(text)
}
export const DEFAULT_SETTINGS = {
  mode, lang:'ja'|'en', layout:'jis'|'us', targetWpm:50, strict:true,
  showKeyboard:true, showHands:true, sound:true, order:'balanced'|'homerow',
  skin:'editor', panicOnBlur:false, spoofTitle:true, reduceMotion:false,
  breakReminder:20, fontScale:1
}
export function recordKeystroke({expected, ok, ms, prev})   // prev=直前の正解文字
export function mastery(char, targetMs?): number            // 0..1
export function isLearned(char, targetMs?): boolean
export function weakness(char, targetMs?): number           // 大きいほど苦手
export function worstBigrams(n?, minSamples?): {pair, ms, n}[]
export function levelFromXp(xp): number
export function xpForLevel(lv): number
export function finishSession(rec): { gained, levelUp, level, newBadges, newPets }
export function todayKey(d?): 'YYYY-MM-DD'
export const BADGES: {id, name, need(profile)}[]
```
`finishSession(rec)` に渡す `rec` の形（**engine.js がこの形で渡す**）:
```js
{ mode:'adult'|'kids', lang:'ja'|'en', kind:string, durationMs:number,
  keys:number, errors:number, acc:number /*0..1*/, wpm:number, cpm:number,
  consistency:number /*0..1*/ }
```
`profile` の形:
```js
{ v, createdAt, keys:{char:{n,err,ms,best}}, bigrams:{'ab':{n,ms}},
  courses:{}, sessions:[{t, ...rec}], daily:{'YYYY-MM-DD':{ms,keys,sessions}},
  xp, streak, lastDay, badges:[id], pets:[{e,n,at}], petProgress, totalKeys,
  kidsDaily }   // kidsDaily = {date, claimed:[]} 子供モードのデイリーミッション受領状況
```

### `src/core/curriculum.js`
```js
export function orderFor(lang, style?): string[]
export function seedSize(lang): number
export function unlockedChars(lang, courseId?): string[]      // courseId 既定 `adaptive.${lang}`
export function maybeUnlock(lang, courseId?): string|null
export function progressOf(lang, courseId?): {unlocked, total, mastery, next}
export function charWeights(chars, lang): Map<string, number>
export function weakestChars(chars, n?): string[]
export function planSession(lines?): ('focus'|'mixed'|'real')[]
```

### `src/data/layouts.js`
```js
export const FINGERS: string[]                 // ['lp','lr','lm','li','th','ri','rm','rr','rp']
export const FINGER_LABEL, FINGER_LABEL_ADULT  // 指ID -> 日本語（前者はひらがな）
export const FINGER_COLOR                      // 指ID -> #rrggbb
export const LAYOUTS = { jis:{id,name,rows}, us:{id,name,rows} }
// rows: Key[][] / Key = {c, s, f, w} または {c:null, label, f, w, special:true}
export function charIndex(layoutId): Map<string, {key,shift,finger,row,col}>
export function keyInfoFor(layoutId, char): {key,shift,finger,row,col}|null
export function fingerOf(layoutId, char): string|null
export function handOf(finger): 'left'|'right'|'both'|null
export function shiftSideFor(finger): 'left'|'right'|null
export const HOME_KEYS: string[]
```

---

## 2. 新規モジュールの契約

### 2.1 教材データ

`src/data/content.js` は **バレル（再輸出）で作成済み・変更禁止**。実データは以下の 3 ファイルに分割する。
各ファイルは他を import せず、純粋なデータ配列を `export const` するだけにする。

- `src/data/ja.js` → `JA_WORDS` `JA_SENTENCES` `BUSINESS_JA` `KANA_POOL`
- `src/data/en.js` → `EN_WORDS` `EN_SENTENCES`
- `src/data/code.js` → `CODE_LINES`

`content.js` は上記に加えて `byTag(list, tag)` `pick(list)` `shuffled(list)` も提供する（実装済み）。


```js
/** 日本語語彙。k=入力対象のひらがな, d=表示（漢字可）, t=タグ配列 */
export const JA_WORDS: { k: string, d: string, t: string[] }[]
/** 日本語短文。同上。1文 12〜40 かな程度 */
export const JA_SENTENCES: { k: string, d: string, t: string[] }[]
/** 英単語（小文字のみ） */
export const EN_WORDS: string[]
/** 英文（ASCII のみ。1文 30〜90 字） */
export const EN_SENTENCES: string[]
/** 大人向けビジネス定型句（日本語） */
export const BUSINESS_JA: { k: string, d: string, t: string[] }[]
/** コード練習行。記号運指の訓練用 */
export const CODE_LINES: { lang: string, text: string }[]
/** 擬似かな語生成用のかな一覧（清音・濁音・半濁音・拗音を含む） */
export const KANA_POOL: string[]
```

必須タグ:
- `JA_WORDS` … `kids`（小学生が知っている語・ひらがな表記が自然なもの。**d は必ずひらがな**）、
  `common`（一般語）、`biz`（仕事語）、`animal` `food` `school` `nature` `body` `action`（子供向けテーマ）
- `JA_SENTENCES` … `kids`（やさしい文・**d はひらがな中心**）、`common`、`proverb`（ことわざ）、`biz`
- `BUSINESS_JA` … `mail`（メール定型）、`term`（用語）、`phrase`

分量の下限（下回らないこと）:
- `JA_WORDS` **300 件以上**（うち `kids` 120 件以上）
- `JA_SENTENCES` **90 件以上**（うち `kids` 30 件以上、`proverb` 25 件以上）
- `EN_WORDS` **500 語以上**（頻度順に近い並び。1〜8 文字）
- `EN_SENTENCES` **50 文以上**
- `BUSINESS_JA` **60 件以上**
- `CODE_LINES` **60 行以上**（js / py / sql / html / shell / css を混ぜる）
- `KANA_POOL` 清音46＋濁音半濁音＋拗音（拗音は 'きゃ' のように2文字要素で入れる）

内容の制約:
- **著作権のある文章をそのまま入れない。** ことわざ・慣用句・自作の平易な文のみ。
- `k` は必ずひらがな（＋`ー` `、` `。`）だけ。カタカナ・漢字・英数字を `k` に入れない。
- `k` と `d` のかな読みは一致させる（`d` は漢字交じりでよい）。
- 子供向けは怖い語・暴力・食べ物アレルギー等に触れない、前向きな語彙にする。
- 全データを1ファイルに直書き。総行数 1200 行を超えてよい。

### 2.2 `src/core/generator.js` — 出題生成

```js
import { store } from './store.js'
import { unlockedChars, charWeights, weakestChars, planSession, maybeUnlock } from './curriculum.js'
import * as C from '../data/content.js'
import { RomajiMatcher, normalizeKana } from './romaji.js'

/**
 * Line = 1 行の出題。
 * @typedef {{ display:string, target:string, lang:'ja'|'en',
 *             kind:'focus'|'mixed'|'real'|'text'|'code'|'word',
 *             reading?:string, note?:string }} Line
 * display = 画面に出す文字列 / target = 実際に入力する文字列
 * ja: target はひらがな、display は漢字交じり可、reading にひらがな読み
 * en: display === target
 */

export function pseudoWords({ alphabet, weights, count, minLen, maxLen }): string[]
export function pseudoKana({ alphabet, weights, count, minKana, maxKana }): string[]
/** ローマ字が alphabet に収まるかな語だけを content から抽出 */
export function realWordsFor(lang, alphabet, count): string[]
/** 適応レッスン。解禁判定もここで行い meta.newChar に入れる */
export function buildAdaptiveLesson({ lang, lines = 8 }): { lines: Line[], meta: { unlocked: string[], newChar: string|null, focus: string[] } }
/** タグ指定の単語レッスン */
export function buildWordLesson({ lang, tag = null, count = 12 }): { lines: Line[], meta: object }
/** 文章レッスン */
export function buildTextLesson({ lang, tag = null, count = 6 }): { lines: Line[], meta: object }
/** コード行レッスン（大人向け） */
export function buildCodeLesson({ count = 8, lang = null }): { lines: Line[], meta: object }
/** 弱点ビッグラム狙い撃ちレッスン */
export function buildDrillLesson({ lang, count = 10 }): { lines: Line[], meta: object }
/** 子供のステージ用。難易度 1..N で出題を作る */
export function buildStageLesson({ stage, lang = 'ja' }): { lines: Line[], meta: object }
```

生成規則:
- `pseudoWords` は音節テンプレート（CV/CVC/CVCV/VC/CVCVC）で発音可能な擬似語を作る。
  母音が alphabet に無い場合は重み付きランダムな 3〜5 文字列にフォールバックする。
- `pseudoKana` は `KANA_POOL` から「`RomajiMatcher.toRomaji(かな)` の全文字が alphabet に含まれる」
  かなだけを選んで 2〜4 かな語を作る。
- `buildAdaptiveLesson` は `planSession()` のレシピに従い `focus`/`mixed`/`real` を混ぜる。
  1行は **英語 = 5〜7 単語（空白区切り）／日本語 = 4〜6 語（空白なしで連結せず、`　`全角空白でも区切らない → 半角スペース区切りは使わず、語を `・` で区切らず、単純に空白なしで連結）**。
  → 日本語の1行は「語を 1 つずつ」ではなく、**語を空白なしで 3〜5 語つないだ 12〜24 かな**とする。
- `buildAdaptiveLesson` の先頭で `maybeUnlock(lang)` を呼び、戻り値を `meta.newChar` に入れる。
- すべての `target` は、生成後に `new RomajiMatcher(target).totalKeys > 0` を満たすこと（ja のとき）。
- 乱数は `Math.random()` を使ってよい（ブラウザ実行のため）。

### 2.3 `src/core/engine.js` — 実行エンジン

```js
import { createMatcher } from './romaji.js'
import { store, recordKeystroke, finishSession } from './store.js'

/**
 * 1 セッション＝複数 Line。1 打鍵ごとに onUpdate を呼ぶ。
 * strict=true のとき誤打は前に進まない（強制訂正）。false なら誤りを記録して進む。
 */
export class TypingSession {
  constructor(opts: {
    lines: Line[], lang: 'ja'|'en', mode: 'adult'|'kids', kind?: string,
    strict?: boolean,                       // 既定は store.settings.strict
    timeLimitMs?: number|null,              // あればカウントダウン
    onUpdate?: (state) => void,             // 毎打鍵＋タイマー刻み
    onLineDone?: (state, lineIndex) => void,
    onFinish?: (summary) => void,
  })

  start(): void                 // 最初の打鍵で計測開始（start 時点では計測しない）
  /** 1 文字入力。printable な1文字だけを渡すこと */
  input(ch: string): { ok:boolean, expected:Set<string>, lineDone:boolean, finished:boolean, combo:number }
  backspace(): void             // strict=false のときだけ意味を持つ
  skipLine(): void
  pause(): void
  resume(): void
  abort(): void                 // 記録せず終了
  finish(): Summary             // 記録して終了（finishSession を呼ぶ）
  destroy(): void               // タイマー解除

  get state(): {
    lineIndex:number, totalLines:number, line:Line,
    display:string, unitIndex:number,        // display 上のカーソル位置
    typedRomaji:string, remainingRomaji:string,
    expected:Set<string>, lastWrong:string|null, displayIsTarget:boolean,
    combo:number, maxCombo:number,
    metrics: Metrics, remainingMs:number|null, running:boolean, finished:boolean
  }
  get metrics(): Metrics
}

/** Metrics = { wpm, cpm, kpm, accuracy /*0..1*/, consistency /*0..1*/,
                elapsedMs, keys, correct, errors, progress /*0..1*/ } */

/** UI が共有するヘルパ。engine.js から export する。 */
export function formatMs(ms): string                    // "1:23"
export function gradeOf(metrics): { stars: number, label: string }  // stars は 0〜3

/** キー入力を session に流し込むヘルパ。IME を避けるため keydown で拾う。 */
export function attachInput(session: TypingSession, opts?: {
  onNonInput?: (e: KeyboardEvent) => boolean   // true を返したら session に流さない
}): () => void   // 解除関数を返す
```

計測規則（厳密に守る）:
- `wpm = (correct / 5) / (elapsedMs / 60000)`（グロス）。`correct` は正しく打てた打鍵数。
- `cpm = correct / (elapsedMs / 60000)`。日本語では `kpm` を「かな/分」として別途出す
  （`kpm = 確定かな数 / 分`）。英語では `kpm = cpm`。
- `accuracy = correct / (correct + errors)`。
- `consistency` = 正解打鍵間隔の変動係数 cv から `Math.max(0, 1 - cv)`。
  間隔は 2000ms で丸めてから用いる（長考や中断が 1 回入っただけで指標が潰れないようにするため。
  2000ms は通常の打鍵間隔の約 10 倍なので、外れ値としての影響は十分残る）。
- `elapsedMs` は **最初の打鍵から**。pause 中は加算しない。
- 1 打鍵ごとに `recordKeystroke({expected, ok, ms, prev})` を呼ぶ。
  - `expected`: 誤打のときは「本来押すべきだった代表文字」（`expected` 集合から1つ、
    `remainingRomaji[0]` を優先）。正打のときは打たれた文字そのもの。
  - `ms`: 直前の**正解**打鍵からの経過。最初の打鍵は記録しない（prev=null, ms=null なら skip）。
  - `prev`: 直前の正解文字（無ければ null）。
- `finish()` は `finishSession(rec)` を呼び、その戻り値を `summary.reward` に入れる。
  `Summary = { ...Metrics, mode, lang, kind, durationMs, reward, maxCombo, perLine:[] }`

`attachInput` の仕様:
- `keydown` を listen。`e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey` の
  ときだけ `session.input(e.key)` を呼び、`e.preventDefault()` する。
- `Backspace` は `session.backspace()`、`Escape` は無視（呼び出し側が処理）。
- `onNonInput` が true を返したキーは無視する（パニックキー等に使う）。

### 2.4 `src/core/keyboard.js` — 画面キーボード + `assets/css/keyboard.css`

```js
import { LAYOUTS, keyInfoFor, FINGER_COLOR, FINGER_LABEL, FINGER_LABEL_ADULT, handOf, shiftSideFor, HOME_KEYS } from '../data/layouts.js'

export class KeyboardView {
  constructor(opts: { mount: HTMLElement, layout?: 'jis'|'us', showHands?: boolean,
                      kidsLabels?: boolean, compact?: boolean })
  setLayout(id): void
  /** 次に押すべき文字集合をハイライト。Shift も自動で光らせる */
  highlight(chars: Iterable<string>): void
  /** 打鍵フィードバック。ok=false なら赤く点滅 */
  flash(char: string, ok: boolean): void
  setVisible(v: boolean): void
  destroy(): void
}

/** 「右手の人差し指」などのヒント文字列 */
export function handHintFor(layoutId, char, kids = false): { finger, hand, label, color } | null
/** 指ごとの色凡例 DOM を作る */
export function renderFingerLegend(mount: HTMLElement, kids = false): void
/** 両手の SVG 図。押す指だけ色づく */
export class HandsView {
  constructor(opts: { mount: HTMLElement, kids?: boolean })
  highlight(finger: string|null, shiftSide?: 'left'|'right'|null): void
  destroy(): void
}
```
- CSS クラスは `kb-*` / `hands-*` 接頭辞のみ。`assets/css/keyboard.css` に書く。
- キーは `<div class="kb-key" data-char="a" data-finger="lp">`。
- ハイライトは `.is-next`、押下は `.is-hit` / `.is-miss`（180ms で自動解除）。
- HandsView は **画像を使わず inline SVG** で描く。左右それぞれ5本指の単純な図でよい。
- `prefers-reduced-motion` を尊重。

### 2.5 `src/core/audio.js` — 効果音（アセット不要・全部合成）

```js
export const sfx = {
  get enabled(): boolean, set enabled(v: boolean),
  init(): void,            // 初回のユーザー操作で呼ぶ（AudioContext の解禁）
  key(): void,             // 打鍵
  error(): void,           // ミス
  combo(n: number): void,  // コンボ上昇（n で音程を上げる）
  levelUp(): void, clear(): void, star(): void, hatch(): void, tick(): void,
}
```
- `AudioContext` を遅延生成。`store.settings.sound === false` なら全て no-op。
- 音は Oscillator + GainNode のみ。外部ファイル禁止。1音 120ms 以内。
- 大人モードでは呼び出し側が `sfx.enabled = false` にする（既定で無音）。

### 2.6 `src/ui/shell.js` — ルーター・ホーム・設定 + `assets/css/shell.css`

```js
export function startApp(root: HTMLElement): void
export function navigate(route: string): void        // '#/kids' など
export function toast(msg: string, ms?: number): void
export function modal({ title, body, actions }): Promise<any>   // body は HTMLElement か string
```
ルート:
- `#/` … モード選択（大人 / 子供）＋続きから＋連続日数
- `#/adult` … `mountAdult(root, ctx)`
- `#/kids` … `mountKids(root, ctx)`
- `#/stats` … `mountStats(root, ctx)`
- `#/settings` … shell 内で実装

`#/adult` `#/kids` に直接来たときは、モード未選択でもそのコースを選んだものとして扱う
（ブックマーク・共有リンクからそのまま練習に入れる）。ハッシュが無い／未知のときだけホームを表示する。

`ctx` の形（各ビューに渡す）:
```js
{ navigate, toast, modal, store }
```
各ビューは `export function mount(root: HTMLElement, ctx): { destroy(): void }` を実装する。
`shell.js` は動的 import ではなく **静的 import** で `./adult.js` `./kids.js` `./stats.js` を読む。

設定画面に出す項目（すべて `store.set()` で保存）:
言語(ja/en)・配列(jis/us)・目標WPM・強制訂正・キーボード表示・手の表示・音・
解禁順(balanced/homerow)・テーマ(dark/light)・文字サイズ・動きを減らす・
休憩リマインダー(分)・データ書き出し/読み込み/全消去。

### 2.7 `src/ui/adult.js` — 大人モード + `assets/css/adult.css`

要件:
- **職場で目立たない**こと。既定は無音・無アニメ・低彩度。
- 擬態スキン `skin` を切替可能にする。最低 5 種類:
  - `editor` … コードエディタ風（行番号・タブバー・サイドバー）
  - `docs` … 文書エディタ風（白い紙・ツールバー）
  - `sheet` … 表計算風（セルグリッド。1 セル 1 語）
  - `mail` … メールクライアント風（受信トレイ一覧＋本文ペイン）
  - `terminal` … ターミナル風（プロンプト行）
  - `plain` … 最小限
- **パニックキー**: `Esc` 2回 または `Ctrl+.` で即座に「無害な画面」へ切替。
  `document.title` と favicon も差し替える。もう一度同じキーで復帰。
  復帰時は必ずセッションを `pause()` 済みにしておく。
- `panicOnBlur` が true のとき `window.blur` / `visibilitychange` で自動パニック。
- 練習メニュー: 適応練習 / 弱点ドリル / 単語 / 文章 / ビジネス文 / コード / 速度計測(60秒)。
- 画面キーボードは既定 ON、ただしスキンによっては折りたたみ可。
- セッション終了時は WPM・正確率・一貫性・新しく解禁された文字を落ち着いたカードで表示。
- 派手な祝福演出・効果音は出さない。
- 「休憩リマインダー」設定値を超えたら控えめに 1 行だけ通知する。

### 2.8 `src/ui/kids.js` — 子供モード + `assets/css/kids.css`

要件（ゲーミフィケーション）:
- 文言は**すべてひらがな＋やさしい漢字**（漢字にはふりがなを付けない代わりに、原則ひらがな）。
- ステージマップ: 20 以上のステージ。各ステージはクリアで★1〜3（★は正確率と速度で決まる）。
  クリア済みは `store.course('kids').cleared[stageId] = stars` に保存。
- ステージ 1〜6 はホームポジション、7〜12 は上段、13〜16 は下段、17〜20 は総合。
  日本語モードではかな語、英語モードでは単語。`buildStageLesson({stage})` を使う。
- プレイ中の要素: コンボメーター、XP バー、レベル、タイム、ミスで画面が小さく揺れる。
- **ボスバトル**: 5 ステージごとにボス。ボスの HP を打鍵で削る。制限時間あり。
- **コレクション**: `store.profile.pets` に貯まる仲間を図鑑として見せる。
  600 打鍵ごとに 1 匹（store 側で自動付与されるので、結果画面で `reward.newPets` を演出する）。
- デイリーミッション 3 つ（例: 300 打つ / 正確率 95% / ステージ 1 つクリア）。
  `store.profile.daily[todayKey()]` から進捗を計算。達成でボーナス XP。
- 効果音は既定 ON（`sfx`）。レベルアップ・★獲得・ふ化で演出。
- 紙吹雪などの演出は `<canvas>` に自前描画（ライブラリ禁止）。`reduceMotion` 設定で無効化。
- **健全性**: `breakReminder` 分を超えたら「ちょっと休もう」を出す（閉じれば続行可能）。
- 外部リンク・課金導線・広告は一切置かない。

### 2.9 `src/ui/stats.js` — 統計 + `assets/css/stats.css`

- キー別ヒートマップ（キーボード配列上に速度／正確率で着色）。`KeyboardView` は使わず
  この画面用に軽量描画してよいが、`layouts.js` の配列データを使うこと。
- 推移グラフ（直近 30 セッションの WPM と正確率）。**inline SVG で自作**。
- 苦手キー Top 10、苦手連接（`worstBigrams`）Top 8。
- 日別の練習時間ヒートマップ（GitHub 風・直近 12 週）。
- 連続日数・累計打鍵・獲得バッジ一覧。
- `lang` 切替に応じて表示を変える。

---

## 3. 共通ルール

- **アクセシビリティ**: ボタンは `<button>`。装飾以外に `aria-label`。キーボードだけで全操作可能。
  タイピング領域は `aria-live="off"`（読み上げが煩くならないように）。
- **レスポンシブ**: 360px 幅で横スクロールが出ないこと。画面キーボードは小画面で自動縮小。
- **IME 対策**: 日本語入力でも「直接ローマ字を拾う」方式。`keydown` の `e.key` を使い、
  `compositionstart` が起きたら `toast` で「半角英数(直接入力)にしてください」と促す。
  隠し `<textarea class="key-sink">` にフォーカスを維持してよい。
- **エラー処理**: localStorage が使えない環境でも落ちない。
- **コメント**: 各ファイル冒頭に「何をするファイルか」を日本語で 3〜6 行。
  アルゴリズム的に非自明な箇所にだけ行コメント。過剰コメント禁止。
- **文字コード**: UTF-8。絵文字は使ってよい（子供モードのみ多用）。
- 既存ファイルは**書き換えない**。自分の担当ファイルだけを書く。
