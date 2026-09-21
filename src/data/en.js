/**
 * en.js — 英語教材データ(純粋なデータのみ)。
 * EN_WORDS は英語の使用頻度が高い順に近い並びで、a-z の小文字・1〜8文字のみ。
 * EN_SENTENCES は ASCII のみの短文で、カンマ・ピリオド・アポストロフィ・
 * ハイフン・疑問符などよく使う記号を自然に含む(数字入りの文も混ぜる)。
 * 著作権のある文章は入れず、自作文・パングラム・一般的な格言のみを使う。
 * 他ファイルを import せず、content.js から再輸出される。
 */

/** 英単語(小文字のみ・1〜8文字)。先頭ほど高頻度。 */
export const EN_WORDS = [
  // 超高頻度(機能語・基本動詞)
  'the', 'be', 'of', 'and', 'a', 'to', 'in', 'he', 'have', 'it',
  'that', 'for', 'they', 'i', 'with', 'as', 'not', 'on', 'she', 'at',
  'by', 'this', 'we', 'you', 'do', 'but', 'from', 'or', 'which', 'one',
  'would', 'all', 'will', 'there', 'say', 'who', 'make', 'when', 'can', 'more',
  'if', 'no', 'man', 'out', 'other', 'so', 'what', 'time', 'up', 'go',
  'about', 'than', 'into', 'could', 'state', 'only', 'new', 'year', 'some', 'take',
  'come', 'these', 'know', 'see', 'use', 'get', 'like', 'then', 'first', 'any',
  'work', 'now', 'may', 'such', 'give', 'over', 'think', 'most', 'even', 'find',
  'day', 'also', 'after', 'way', 'many', 'must', 'look', 'before', 'great', 'back',
  'through', 'long', 'where', 'much', 'should', 'well', 'people', 'down', 'own', 'just',

  // 高頻度(一般語)
  'because', 'good', 'each', 'those', 'feel', 'seem', 'how', 'high', 'too', 'place',
  'little', 'world', 'very', 'still', 'nation', 'hand', 'old', 'life', 'tell', 'write',
  'become', 'here', 'show', 'house', 'both', 'between', 'need', 'mean', 'call', 'develop',
  'under', 'last', 'right', 'move', 'thing', 'general', 'school', 'never', 'same', 'another',
  'begin', 'while', 'number', 'part', 'turn', 'real', 'leave', 'might', 'want', 'point',
  'form', 'off', 'child', 'few', 'small', 'since', 'against', 'ask', 'late', 'home',
  'interest', 'large', 'person', 'end', 'open', 'public', 'follow', 'during', 'present', 'without',
  'again', 'hold', 'govern', 'around', 'possible', 'head', 'consider', 'word', 'program', 'problem',
  'however', 'lead', 'system', 'set', 'order', 'eye', 'plan', 'run', 'keep', 'face',
  'fact', 'group', 'play', 'stand', 'increase', 'early', 'course', 'change', 'help', 'line',

  // 中頻度(日常・抽象)
  'city', 'put', 'mind', 'name', 'water', 'young', 'room', 'friend', 'area', 'money',
  'story', 'month', 'book', 'night', 'half', 'hour', 'hard', 'black', 'week', 'white',
  'study', 'land', 'idea', 'road', 'fall', 'kind', 'note', 'power', 'court', 'care',
  'body', 'music', 'color', 'level', 'market', 'report', 'result', 'office', 'member', 'meet',
  'watch', 'far', 'whole', 'near', 'side', 'north', 'south', 'east', 'west', 'above',
  'enough', 'always', 'often', 'almost', 'sure', 'able', 'free', 'full', 'best', 'better',
  'light', 'later', 'major', 'minor', 'local', 'social', 'simple', 'single', 'common', 'special',
  'within', 'along', 'among', 'across', 'behind', 'beyond', 'toward', 'until', 'upon', 'once',
  'every', 'either', 'others', 'second', 'third', 'final', 'total', 'whether', 'though', 'rather',
  'happen', 'appear', 'remain', 'return', 'receive', 'build', 'carry', 'break', 'speak', 'spend',

  // 動詞・人・自然
  'bring', 'sit', 'stay', 'add', 'pay', 'reach', 'offer', 'allow', 'serve', 'choose',
  'raise', 'pass', 'catch', 'walk', 'teach', 'drive', 'wait', 'close', 'wear', 'send',
  'expect', 'accept', 'decide', 'reduce', 'remove', 'repeat', 'review', 'record', 'direct', 'action',
  'answer', 'letter', 'minute', 'moment', 'family', 'mother', 'father', 'sister', 'doctor', 'teacher',
  'student', 'morning', 'evening', 'summer', 'winter', 'spring', 'autumn', 'season', 'weather', 'garden',
  'window', 'street', 'bridge', 'island', 'forest', 'river', 'ocean', 'beach', 'field', 'valley',
  'animal', 'bird', 'horse', 'sheep', 'mouse', 'plant', 'flower', 'tree', 'grass', 'stone',
  'paper', 'pencil', 'table', 'chair', 'floor', 'wall', 'door', 'glass', 'metal', 'wood',
  'bread', 'rice', 'apple', 'fruit', 'sugar', 'salt', 'milk', 'juice', 'lunch', 'dinner',
  'train', 'plane', 'truck', 'bike', 'boat', 'ship', 'wheel', 'engine', 'driver', 'ticket',

  // 仕事・IT・性質
  'price', 'value', 'cost', 'budget', 'profit', 'income', 'bank', 'cash', 'sale', 'trade',
  'client', 'target', 'sample', 'detail', 'design', 'update', 'upload', 'folder', 'screen', 'button',
  'file', 'data', 'code', 'input', 'output', 'server', 'device', 'memory', 'search', 'browse',
  'email', 'phone', 'message', 'contact', 'address', 'account', 'signal', 'network', 'access', 'submit',
  'happy', 'angry', 'quiet', 'brave', 'calm', 'clear', 'clean', 'fresh', 'bright', 'sharp',
  'heavy', 'quick', 'slow', 'soft', 'warm', 'cool', 'deep', 'wide', 'thin', 'thick',
  'strong', 'weak', 'smart', 'funny', 'lucky', 'safe', 'proud', 'gentle', 'honest', 'polite',
  'gather', 'select', 'invite', 'arrive', 'depart', 'travel', 'visit', 'enjoy', 'relax', 'smile',
  'laugh', 'dream', 'hope', 'share', 'thank', 'please', 'sorry', 'hello', 'maybe', 'today',
  'tomorrow', 'tonight', 'weekend', 'holiday', 'birthday', 'festival', 'picture', 'camera', 'museum', 'library',

  // 場所・もの・色・数
  'mountain', 'country', 'village', 'capital', 'station', 'airport', 'hotel', 'hospital', 'kitchen', 'bedroom',
  'shower', 'mirror', 'pillow', 'blanket', 'basket', 'bottle', 'candle', 'ribbon', 'pocket', 'jacket',
  'shirt', 'dress', 'shoes', 'socks', 'gloves', 'scarf', 'collar', 'zipper', 'cotton', 'fabric',
  'green', 'blue', 'red', 'yellow', 'orange', 'purple', 'brown', 'silver', 'golden', 'violet',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'zero',
  'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'eighty', 'ninety', 'hundred',
  'million', 'dozen', 'double', 'triple', 'couple', 'pair', 'plenty', 'amount', 'extra', 'spare',
];

/** 英文(ASCII のみ・1文 30〜90 字)。記号と数字の運指を混ぜて鍛える。 */
export const EN_SENTENCES = [
  // パングラム(全キーを一巡させる)
  'The quick brown fox jumps over the lazy dog.',
  'Sphinx of black quartz, judge my vow.',
  'How vexingly quick daft zebras jump!',
  'Jackdaws love my big sphinx of quartz.',
  'The five boxing wizards jump quickly.',
  'Bright vixens jump; dozy fowl quack.',

  // 練習の心構え(自作)
  'Keep your wrists relaxed and your eyes off the keyboard.',
  'Rest your fingers on the home row before you begin typing.',
  'Accuracy first, speed second; the rest takes care of itself.',
  'Type the whole word, then glance at the next one ahead.',
  'If you miss a key, breathe out and keep the rhythm steady.',
  'Short, daily sessions build memory better than one long one.',
  'A steady rhythm matters more than a burst of raw speed.',
  'Let the little finger reach the shift key, not the wrist.',
  'Sit up straight, plant both feet, and relax your shoulders.',
  'Look at the screen, not at your hands - that is the trick.',

  // 格言風(一般化した言い回し)
  'Practice every day, and progress will follow on its own.',
  'A small habit, repeated daily, beats a burst of effort.',
  'Slow and steady hands finish the work with fewer errors.',
  'Look before you leap, but do not wait forever to move.',
  'A journey of a thousand steps begins with a single one.',
  "Don't count your gains before the work is truly finished.",
  'Many hands make light work, and shared work feels short.',
  'Well begun is half done, so start with a calm breath.',
  'Haste makes waste; accuracy is faster in the long run.',
  'The best time to start was last year; the next is now.',

  // 数字入り
  "The meeting starts at 9:30 and ends by 11 o'clock sharp.",
  'Please order 24 blue folders and 3 boxes of white paper.',
  'Our team shipped 7 updates in 12 days without a rollback.',
  'She typed 65 words per minute with 98 percent accuracy.',
  'The report covers 2019 through 2024 in about 40 pages.',
  'Room 305 opens at 8 a.m. and closes at 6 p.m. on weekdays.',
  'Add 15 to 27, then divide the result by 6 to check it.',
  'A target of 50 words per minute is a fine first goal.',

  // 日常の情景(自作)
  'The morning train was late, so we walked to the office.',
  'She opened the window and let the cool air fill the room.',
  'We packed bread, fruit, and water for the long walk home.',
  'The old map showed a river that no longer runs that way.',
  'He wrote a short note, folded it, and left it on the desk.',
  'Blue paint dried on the fence while the dog watched us.',
  'A warm light filled the kitchen as the soup began to boil.',
  'They planted six young trees along the road last autumn.',
  'The cat slept on the keyboard until the screen went dark.',
  'Rain fell all night, and the garden smelled fresh at dawn.',
  'My brother builds small wooden boats in the back garden.',
  'The library closes early, so return the books before five.',
  'A quiet street, an open window, and a good book - perfect.',
  'We shared a simple lunch and talked about the next trip.',
  'The bridge over the river was built by hand, stone by stone.',
  'Turn left at the corner, then walk straight for two blocks.',
  'A single candle lit the room while the storm passed by.',
  'The market opens at dawn and smells of bread and coffee.',

  // 仕事の文(自作)
  'Please review the draft and send your notes by Friday.',
  'I have attached the file; let me know if it looks right.',
  'Could you confirm the date, or should we pick a new one?',
  'The plan is simple: write it down, test it, then ship it.',
  'We agreed to keep the scope small and the timeline clear.',
  'Thanks for the quick reply - that answers my question.',
  "Let's meet for thirty minutes and settle the last detail.",
  'The server was slow, so we moved the job to the night run.',
  'Write the code, read it again tomorrow, and simplify it.',
  'A well-named function needs far fewer comments to explain.',

  // 疑問文・ハイフン
  'Where did you put the blue folder that was on my desk?',
  'How many words can you type without looking at the keys?',
  'Do you prefer the quiet morning or the busy afternoon?',
  'What would you build if nobody told you how to do it?',
  'The well-lit room made the long-awaited work feel easy.',
  'A hand-written letter still carries weight in a busy week.',
  'This two-part lesson covers the home row and the top row.',
];
