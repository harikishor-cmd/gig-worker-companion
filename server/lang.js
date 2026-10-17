// Language helper: the single source of truth for supported output languages.
export const SUPPORTED_LANGS = ['hi', 'pa', 'en'];
export const LANG_NAMES = { hi: 'Hindi (Devanagari script)', pa: 'Punjabi (Gurmukhi script)', en: 'English' };

/** Throws if lang is not hi | pa | en. */
export function assertLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    const err = new Error(`Unsupported lang "${lang}". Use one of ${SUPPORTED_LANGS.join(', ')}.`);
    err.status = 400;
    throw err;
  }
  return lang;
}

/** System instruction fragment prepended to EVERY Gemini call. */
export function languageInstruction(lang) {
  assertLang(lang);
  return `Respond ONLY in ${LANG_NAMES[lang]}. Every human-readable string value in your JSON output must be in ${LANG_NAMES[lang]}, using simple words a gig worker can understand. Do not mix languages except for proper nouns, scheme names, URLs and numbers.`;
}
