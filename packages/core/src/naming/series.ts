import { MetaError } from '../errors';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface ParsedSeries {
  tokens: string[];
  hashIndex: number;
  width: number;
}

/**
 * Frappe-style pattern: dot-separated tokens. YYYY / YY / MM / DD are date parts,
 * a run of '#' is the zero-padded counter (must be exactly one, and last),
 * anything else is literal. Example: 'MEM-.YYYY.-.#####' -> 'MEM-2026-00001'.
 */
export function parseSeriesPattern(pattern: string): ParsedSeries {
  const tokens = pattern.split('.');
  const hashIndexes = tokens.flatMap((t, i) => (/^#+$/.test(t) ? [i] : []));
  if (hashIndexes.length !== 1) {
    throw new MetaError(`Series pattern "${pattern}" must contain exactly one "#" block`);
  }
  const hashIndex = hashIndexes[0]!;
  if (hashIndex !== tokens.length - 1) {
    throw new MetaError(`Series pattern "${pattern}": the "#" block must be the last token`);
  }
  return { tokens, hashIndex, width: tokens[hashIndex]!.length };
}

function renderToken(token: string, date: DateParts): string {
  switch (token) {
    case 'YYYY':
      return String(date.year).padStart(4, '0');
    case 'YY':
      return String(date.year % 100).padStart(2, '0');
    case 'MM':
      return String(date.month).padStart(2, '0');
    case 'DD':
      return String(date.day).padStart(2, '0');
    default:
      return token;
  }
}

/** Everything before the counter; used as the key of the counter document. */
export function seriesPrefix(pattern: string, date: DateParts): string {
  const { tokens, hashIndex } = parseSeriesPattern(pattern);
  return tokens
    .slice(0, hashIndex)
    .map((t) => renderToken(t, date))
    .join('');
}

export function formatSeriesName(pattern: string, date: DateParts, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) {
    throw new RangeError(`counter must be a positive integer, got ${counter}`);
  }
  const { width } = parseSeriesPattern(pattern);
  return seriesPrefix(pattern, date) + String(counter).padStart(width, '0');
}
