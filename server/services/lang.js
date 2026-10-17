import { AppError } from '../http/errors.js';

// Language helper: the single source of truth for supported output languages.
export const SUPPORTED_LANGS = ['hi', 'pa', 'en'];
export const LANG_NAMES = { hi: 'Hindi (Devanagari script)', pa: 'Punjabi (Gurmukhi script)', en: 'English' };

/** Throws if lang is not hi | pa | en. */
export function assertLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw new AppError(400, 'invalid_lang', { message: `Unsupported lang "${lang}". Use one of ${SUPPORTED_LANGS.join(', ')}.` });
  }
  return lang;
}

const SCRIPT_RULE = {
  hi: ' Write Hindi ONLY in Devanagari script (e.g. "आपकी कमाई"). NEVER write Hindi in Latin/Roman transliteration (not "aapki kamai"), and never use letters from other Indian scripts.',
  pa: ' Write Punjabi ONLY in Gurmukhi script (e.g. "ਤੁਹਾਡੀ ਕਮਾਈ"). NEVER write Punjabi in Latin/Roman transliteration (not "tuhadi kamai"), and never use Devanagari, Telugu or any other Indian script letters.',
};

/** System instruction fragment prepended to EVERY Gemini call. */
export function languageInstruction(lang) {
  assertLang(lang);
  return `Respond ONLY in ${LANG_NAMES[lang]}. Every human-readable string value in your JSON output must be in ${LANG_NAMES[lang]}, using simple words a gig worker can understand. Do not mix languages except for proper nouns, scheme names, URLs and numbers.${SCRIPT_RULE[lang] || ''}`;
}

// ---- Script normalization + wrong-language guard (hi/pa only) ----
// The main Brahmic blocks share one 128-codepoint layout, so a stray letter from another
// Indic block maps to the same offset in the target block (only where that codepoint is assigned).
const INDIC_BLOCKS = [0x0900, 0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80, 0x0c00, 0x0c80, 0x0d00];
const TARGET = { hi: { base: 0x0900, re: /\p{Script=Devanagari}/u }, pa: { base: 0x0a00, re: /\p{Script=Gurmukhi}/u } };

/** Convert characters from other Indic blocks into the target script for one string. */
export function normalizeScript(text, lang) {
  const tgt = TARGET[lang];
  if (!tgt || typeof text !== 'string') return text;
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0900 && cp < 0x0d80) {
      const base = INDIC_BLOCKS.find((b) => cp >= b && cp < b + 0x80);
      if (base !== undefined && base !== tgt.base) {
        const mapped = String.fromCodePoint(tgt.base + (cp - base));
        // Keep the original if the target slot is unassigned; shared marks (danda U+0964/5) are Common and stay as-is.
        if (tgt.re.test(mapped)) {
          out += mapped;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

/** Recursively normalize every string value in a JSON value. */
export function normalizeDeep(value, lang) {
  if (!TARGET[lang]) return value;
  if (typeof value === 'string') return normalizeScript(value, lang);
  if (Array.isArray(value)) return value.map((v) => normalizeDeep(v, lang));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeDeep(v, lang)]));
  return value;
}

function collectStrings(value, acc = []) {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, acc));
  return acc;
}

/** Share of letters (\p{L} + Indic marks) that are in the target script; 1 for en or text with no letters. */
export function targetScriptRatio(value, lang) {
  const tgt = TARGET[lang];
  if (!tgt) return 1;
  let letters = 0;
  let inTarget = 0;
  for (const ch of collectStrings(value).join(' ')) {
    if (!/[\p{L}\p{M}]/u.test(ch)) continue;
    letters++;
    if (tgt.re.test(ch)) inTarget++;
  }
  return letters === 0 ? 1 : inTarget / letters;
}

export const MIN_TARGET_SCRIPT_RATIO = 0.2;
export const isTargetScript = (value, lang) => targetScriptRatio(value, lang) >= MIN_TARGET_SCRIPT_RATIO;

/** Count letters left from a non-target Indic script after normalization (e.g. Devanagari ष inside Punjabi). */
export function foreignIndicCount(value, lang) {
  const tgt = TARGET[lang];
  if (!tgt) return 0;
  let n = 0;
  for (const ch of collectStrings(value).join(' ')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0900 && cp < 0x0e00 && !tgt.re.test(ch) && /[\p{L}\p{M}]/u.test(ch)) n++;
  }
  return n;
}
