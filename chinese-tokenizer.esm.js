/*
 * chinese-tokenizer.esm.js (offline, browser-friendly ESM)
 *
 * - No network at runtime
 * - No Node-only APIs (e.g., fs)
 * - Dictionary stays external: call load(cedictText)
 *
 * Public API:
 *   export function load(contents)
 *
 * Where `contents` is the CC-CEDICT file text (UTF-8) you fetch/ship separately.
 *
 * Token output format (compatible with yishn/chinese-tokenizer's load(contents)):
 *   {
 *     text: string,
 *     traditional: string,
 *     simplified: string,
 *     position: { offset:number, line:number, column:number },
 *     matches: Array<{ pinyin:string, pinyinPretty:string, english:string[] }>
 *   }
 */

// A small set of Chinese punctuation used by the upstream project.
const CHINESE_PUNCTUATION = [
  "·", "×", "—", "‘", "’", "“", "”", "…", "、", "。", "《", "》", "『", "』", "〖", "〗",
  "！", "（", "）", "，", "：", "；", "？"
];

/** @typedef {{traditional:string,simplified:string,pinyin:string,pinyinPretty:string,english:string[]}} CedictEntry */

class TrieNode {
  constructor() {
    /** @type {Map<string, TrieNode>} */
    this.children = new Map();
    /** @type {CedictEntry[]} entries that share this prefix */
    this.entries = [];
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  /**
   * Insert a word, adding `entry` to every prefix node (so prefix lookups are O(prefixLen)).
   * @param {string} word
   * @param {CedictEntry} entry
   */
  insert(word, entry) {
    let node = this.root;
    // Iterate by Unicode code points, not UTF-16 code units.
    for (const ch of Array.from(word)) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      next.entries.push(entry);
      node = next;
    }
  }

  /**
   * Get entries for a given prefix (may be empty).
   * @param {string} prefix
   * @returns {CedictEntry[]}
   */
  getPrefix(prefix) {
    let node = this.root;
    for (const ch of Array.from(prefix)) {
      const next = node.children.get(ch);
      if (!next) return [];
      node = next;
    }
    return node.entries;
  }
}

/**
 * Minimal tone-number Pinyin prettifier (covers the common CC-CEDICT syllable format).
 * Examples:
 *   "Zhong1 guo2" -> "Zhōng guó"
 *   "nu:3" / "nü3" -> "nǚ"
 *
 * It won't handle every edge-case, but it does the standard thing:
 *   - tone 1-4 adds diacritic to the correct vowel
 *   - tone 5 or 0 keeps plain vowels
 */
function prettifyPinyin(pinyin) {
  const syllables = pinyin.trim().split(/\s+/).filter(Boolean);
  return syllables.map(prettifySyllable).join(" ");
}

const DIACRITICS = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
  A: ["Ā", "Á", "Ǎ", "À"],
  E: ["Ē", "É", "Ě", "È"],
  I: ["Ī", "Í", "Ǐ", "Ì"],
  O: ["Ō", "Ó", "Ǒ", "Ò"],
  U: ["Ū", "Ú", "Ǔ", "Ù"],
  Ü: ["Ǖ", "Ǘ", "Ǚ", "Ǜ"],
};

function indexOfAny(str, chars) {
  for (const c of chars) {
    const i = str.indexOf(c);
    if (i !== -1) return i;
  }
  return -1;
}

function prettifySyllable(s) {
  // Keep punctuation as-is (common: "ma1," or "ma1)")
  const m = s.match(/^(.+?)([0-5])([^\w\u00C0-\u024F\u1E00-\u1EFF]*)$/u);
  if (!m) return s.replace(/u:|v/g, "ü");

  let base = m[1];
  const tone = Number(m[2]);
  const trailing = m[3] || "";

  // normalize ü spellings
  base = base.replace(/u:|v/g, "ü");

  if (tone === 0 || tone === 5) return base + trailing;

  // Decide where to place tone mark:
  // 1) If 'a' or 'e' present, mark the first one.
  // 2) Else if 'ou' present, mark the 'o'.
  // 3) Else mark the last vowel in the syllable.
  const vowels = ["a", "e", "o", "i", "u", "ü", "A", "E", "O", "I", "U", "Ü"];

  let markIndex = -1;

  const idxA = indexOfAny(base, ["a", "A"]);
  const idxE = indexOfAny(base, ["e", "E"]);
  if (idxA !== -1) markIndex = idxA;
  else if (idxE !== -1) markIndex = idxE;
  else {
    const ouMatch = base.match(/ou|Ou|oU|OU/);
    if (ouMatch) markIndex = ouMatch.index; // mark the 'o'
    else {
      for (let i = base.length - 1; i >= 0; i--) {
        if (vowels.includes(base[i])) {
          markIndex = i;
          break;
        }
      }
    }
  }

  if (markIndex === -1) return base + trailing;

  const ch = base[markIndex];
  const map = DIACRITICS[ch];
  if (!map) return base + trailing;

  const marked = map[tone - 1];
  return base.slice(0, markIndex) + marked + base.slice(markIndex + 1) + trailing;
}

class Cedict {
  constructor() {
    /** @type {Map<string, CedictEntry[]>} */
    this.simplifiedMap = new Map();
    /** @type {Map<string, CedictEntry[]>} */
    this.traditionalMap = new Map();
    this.simplifiedTrie = new Trie();
    this.traditionalTrie = new Trie();
  }

  /**
   * Load CC-CEDICT file contents.
   * @param {string} contents
   */
  load(contents) {
    const lines = contents.replace(/\r/g, "").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Traditional Simplified [Pinyin] /eng/eng/
      const m = trimmed.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
      if (!m) continue;

      const traditional = m[1];
      const simplified = m[2];
      const pinyin = m[3].trim();
      const english = m[4].split("/").map((x) => x.trim()).filter(Boolean);

      /** @type {CedictEntry} */
      const entry = {
        traditional,
        simplified,
        pinyin,
        pinyinPretty: prettifyPinyin(pinyin),
        english,
      };

      this._addEntry(this.traditionalMap, traditional, entry);
      this._addEntry(this.simplifiedMap, simplified, entry);

      // Prefix structures for greedy matching
      this.traditionalTrie.insert(traditional, entry);
      this.simplifiedTrie.insert(simplified, entry);
    }
  }

  /**
   * Get full-word matches.
   * @param {string} word
   * @param {boolean} traditional
   * @returns {CedictEntry[]}
   */
  get(word, traditional) {
    const map = traditional ? this.traditionalMap : this.simplifiedMap;
    return map.get(word) || [];
  }

  /**
   * Get entries for words that start with `prefix` (used for greedy matching).
   * @param {string} prefix
   * @param {boolean} traditional
   * @returns {CedictEntry[]}
   */
  getPrefix(prefix, traditional) {
    return (traditional ? this.traditionalTrie : this.simplifiedTrie).getPrefix(prefix);
  }

  _addEntry(map, key, entry) {
    const arr = map.get(key);
    if (arr) arr.push(entry);
    else map.set(key, [entry]);
  }
}

/**
 * Parses CC-CEDICT string content from `contents` and returns a `tokenize(text)` function.
 * Mirrors upstream `load(contents)` (but omits `loadFile`).
 *
 * @param {string} contents
 * @returns {(text: string) => any[]} token list
 */
export function load(contents) {
  const dictionary = new Cedict();
  dictionary.load(contents);

  return function tokenize(text) {
    // Normalize CRs, iterate by code points.
    const chars = Array.from(text.replace(/\r/g, ""));
    const result = [];

    let i = 0;
    let offset = 0,
      line = 1,
      column = 1;

    // Prefer the script that appears more often as we go.
    let simplifiedPreference = 0;
    let traditionalPreference = 0;

    const isChinese = (character) =>
      CHINESE_PUNCTUATION.includes(character) ||
      dictionary.get(character, false).length > 0 ||
      dictionary.get(character, true).length > 0;

    const pushToken = (word) => {
      const simplifiedEntries = dictionary.get(word, false);
      const traditionalEntries = dictionary.get(word, true);

      const entries =
        simplifiedEntries.length === 0
          ? traditionalEntries
          : traditionalEntries.length === 0
            ? simplifiedEntries
            : simplifiedPreference < traditionalPreference
              ? traditionalEntries
              : simplifiedPreference > traditionalPreference
                ? simplifiedEntries
                : [...simplifiedEntries, ...traditionalEntries];

      if (traditionalEntries.length === 0 && simplifiedEntries.length > 0) {
        simplifiedPreference++;
      } else if (simplifiedEntries.length === 0 && traditionalEntries.length > 0) {
        traditionalPreference++;
      }

      result.push({
        text: word,
        traditional: entries[0] ? entries[0].traditional : word,
        simplified: entries[0] ? entries[0].simplified : word,
        position: { offset, line, column },
        matches: entries.map(({ pinyin, pinyinPretty, english }) => ({
          pinyin,
          pinyinPretty,
          english,
        })),
      });

      const wordArr = Array.from(word);
      const lastLineBreakIndex = word.lastIndexOf("\n");

      i += wordArr.length;
      offset += word.length;

      // Keep upstream-ish line/column behavior.
      line += wordArr.filter((x) => x === "\n").length;
      column = lastLineBreakIndex >= 0 ? word.length - lastLineBreakIndex : column + word.length;
    };

    while (i < chars.length) {
      // Try to match 2+ characters (greedy longest-word match)
      if (i !== chars.length - 1) {
        const two = chars.slice(i, i + 2).join("");

        const simplifiedCandidates = dictionary.getPrefix(two, false);
        const traditionalCandidates = dictionary.getPrefix(two, true);

        let foundWord = null;
        let foundEntries = null;

        for (const candidates of [traditionalCandidates, simplifiedCandidates]) {
          for (const entry of candidates) {
            const matchText = candidates === traditionalCandidates ? entry.traditional : entry.simplified;
            const matchLen = Array.from(matchText).length;
            const word = chars.slice(i, i + matchLen).join("");
            if (matchText === word) {
              if (foundWord == null || Array.from(word).length > Array.from(foundWord).length) {
                foundWord = word;
                foundEntries = candidates;
              }
            }
          }
        }

        if (foundWord != null) {
          pushToken(foundWord);
          if (foundEntries === simplifiedCandidates) simplifiedPreference++;
          else if (foundEntries === traditionalCandidates) traditionalPreference++;
          continue;
        }
      }

      // If it fails, match one character
      const character = chars[i];
      if (isChinese(character) || /\s/.test(character)) {
        pushToken(character);
        continue;
      }

      // Handle non-Chinese sequences (latin words, numbers, etc.)
      let end = i + 1;
      for (; end < chars.length; end++) {
        if (/\s/.test(chars[end]) || isChinese(chars[end])) break;
      }

      pushToken(chars.slice(i, end).join(""));
    }

    return result;
  };
}
