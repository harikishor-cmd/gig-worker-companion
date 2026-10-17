// Prompt-injection hygiene for free-text fields before they reach a prompt.
// User text is always wrapped in XML-style tags and the system instruction says tag content is data;
// this module makes sure the text cannot close those tags or smuggle control characters.

// C0/C1 control chars except \t and \n, plus zero-width / bidi override characters.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Strip control characters, neutralise angle brackets (so `</facts>` cannot end a delimiter),
 * normalise \r\n and collapse runs of blank lines / spaces.
 * @param {string} text
 * @returns {string}
 */
export function cleanUserText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Canonical form of a question for cache keys: cleaned, lower-cased, single-spaced, no trailing punctuation.
 * @param {string} q
 * @returns {string}
 */
export function normalizeQuestion(q) {
  return cleanUserText(q)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s?.!।,]+$/u, '');
}

/**
 * Wrap untrusted content in a named delimiter for the prompt.
 * @param {string} tag
 * @param {unknown} content string or JSON-serialisable value
 * @returns {string}
 */
export const wrap = (tag, content) => `<${tag}>${typeof content === 'string' ? content : JSON.stringify(content)}</${tag}>`;
