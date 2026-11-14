/**
 * Port of utils/chapter_title_reformat.py.
 *
 * The legacy Flask app rewrote every chapter title before using it as the
 * chapter folder / zip name and as `last_epi_name`. Kavita parses volume and
 * chapter numbers out of those names, so new downloads must be named exactly
 * as the old ones were. The branches below mirror the Python one for one,
 * including its quirks (e.g. the season branch does not widen parentheses).
 */

const SEASON = /[sS][0-9]+/;
const CHAPTER_RANGE = /第[0-9]+-[0-9]+话/;
const VERSION = /[vV][0-9]+/;
const NUMBER = /[0-9]+/g;

function widenParens(title: string): string {
  return title.replace(/\(/g, '（').replace(/\)/g, '）');
}

/** Insert `$` right after the letter that starts the match at `index`. */
function splitAfterLetter(title: string, index: number): string {
  return `${title.slice(0, index + 1)}$${title.slice(index + 1)}`;
}

export function reformatChapterTitle(title: string): string {
  // s1 / S02 -> s$1 / S$02, for every occurrence.
  if (SEASON.test(title)) {
    let next = title;
    for (let m = SEASON.exec(next); m; m = SEASON.exec(next)) {
      next = splitAfterLetter(next, m.index);
    }
    return next;
  }

  // 第68-69话 -> 第68-第69话
  if (CHAPTER_RANGE.test(title)) {
    return widenParens(title.replace(/-/g, '-第'));
  }

  // v2 / V2 -> v$2 / V$2, first occurrence only.
  const version = VERSION.exec(title);
  if (version) {
    return widenParens(splitAfterLetter(title, version.index));
  }

  // Two or more bare numbers and no decimal point: prefix each with 第.
  const numbers = title.match(NUMBER);
  if (numbers && numbers.length >= 2 && !title.includes('.')) {
    return title.replace(NUMBER, (n) => `第${n}`);
  }

  return widenParens(title.replace(/-/g, '$'));
}
