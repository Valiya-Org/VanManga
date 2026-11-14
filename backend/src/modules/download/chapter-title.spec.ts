import { readFileSync } from 'fs';
import { join } from 'path';
import { reformatChapterTitle } from './chapter-title';

/** Expected values were produced by running the original
 *  utils/chapter_title_reformat.py over each input, so this suite pins the
 *  TypeScript port to the legacy behaviour byte for byte. */
const cases: { input: string; expected: string }[] = JSON.parse(
  readFileSync(
    join(__dirname, '__fixtures__', 'chapter-title-reformat.json'),
    'utf8',
  ),
);

describe('reformatChapterTitle', () => {
  it('has fixtures to check', () => {
    expect(cases.length).toBeGreaterThan(30);
  });

  it.each(cases)('"$input" -> "$expected"', ({ input, expected }) => {
    expect(reformatChapterTitle(input)).toBe(expected);
  });
});
