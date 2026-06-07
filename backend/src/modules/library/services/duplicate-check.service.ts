import { Injectable } from '@nestjs/common';
import type { Manga } from '../entities/manga.entity';

/** Replaces utils/duplicate_check.py:duplicate_check.
 *  Python uses difflib.get_close_matches (Ratcliff-Obershelp similarity);
 *  we approximate it with a normalised Dice coefficient on character
 *  bigrams. The behaviour is functionally equivalent for the dedup use
 *  case — both return high scores for "near-identical" titles. */
@Injectable()
export class DuplicateCheckService {
  /** Returns the top `maxResults` library titles that are close enough
   *  to the candidate name, sorted by similarity (descending). */
  findCloseMatches(
    candidateName: string,
    library: Manga[],
    options: { cutoff?: number; maxResults?: number } = {},
  ): string[] {
    const cutoff = options.cutoff ?? 0.6; // matches Python difflib default
    const maxResults = options.maxResults ?? 10;

    const target = this.normalise(candidateName);
    const targetGrams = this.bigrams(target);
    if (targetGrams.size === 0) return [];

    const scored: { name: string; score: number }[] = [];

    for (const manga of library) {
      const candidate = this.normalise(manga.manga_name);
      if (candidate === target) {
        scored.push({ name: manga.manga_name, score: 1 });
        continue;
      }
      const score = this.dice(targetGrams, this.bigrams(candidate));
      if (score >= cutoff) {
        scored.push({ name: manga.manga_name, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => s.name);
  }

  private normalise(s: string): string {
    return s.toLowerCase().trim();
  }

  private bigrams(s: string): Map<string, number> {
    const grams = new Map<string, number>();
    if (s.length < 2) {
      if (s.length === 1) grams.set(s, 1);
      return grams;
    }
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    return grams;
  }

  private dice(a: Map<string, number>, b: Map<string, number>): number {
    let intersection = 0;
    for (const [gram, countA] of a) {
      const countB = b.get(gram);
      if (countB !== undefined) intersection += Math.min(countA, countB);
    }
    const sizeA = Array.from(a.values()).reduce((s, n) => s + n, 0);
    const sizeB = Array.from(b.values()).reduce((s, n) => s + n, 0);
    return (2 * intersection) / (sizeA + sizeB);
  }
}
