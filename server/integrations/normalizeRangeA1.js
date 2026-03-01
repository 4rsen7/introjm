/**
 * Normalize A1 notation: replace Cyrillic lookalike letters with Latin in the cell reference part.
 * Sheet name (before "!") is left unchanged so names like "Аркуш1" work.
 * Fixes "Unable to parse range" when user types column letters with Ukrainian/Russian keyboard.
 */
const CYRILLIC_TO_LATIN = {
  '\u0410': 'A', // А
  '\u0412': 'B', // В
  '\u041E': 'O', // О
  '\u0420': 'P', // Р
  '\u0421': 'C', // С
  '\u0415': 'E', // Е
  '\u041D': 'H', // Н
  '\u041A': 'K', // К
  '\u041C': 'M', // М
  '\u0422': 'T', // Т
  '\u0423': 'Y', // У
  '\u0425': 'X', // Х
};

function normalizeRangeA1(range) {
  if (!range || typeof range !== 'string') return range || '';
  const idx = range.indexOf('!');
  let sheetPart = '';
  let a1Part = range;
  if (idx !== -1) {
    sheetPart = range.slice(0, idx);
    a1Part = range.slice(idx + 1);
  }
  let out = '';
  for (let i = 0; i < a1Part.length; i++) {
    const c = a1Part[i];
    out += CYRILLIC_TO_LATIN[c] ?? c;
  }
  return sheetPart ? sheetPart + '!' + out : out;
}

module.exports = { normalizeRangeA1 };
