/**
 * Arabic-aware fuzzy text matching for automatic answer grading in online
 * multiplayer (no human host to judge correctness remotely).
 *
 * Strategy: normalize both strings (strip diacritics/tatweel, unify letter
 * variants, strip punctuation/whitespace), then accept as correct if the
 * normalized submission either exactly matches a normalized valid answer or
 * is within a Levenshtein-distance similarity threshold that scales with
 * answer length (typos should be forgiven, wrong words should not).
 */

const DIACRITICS_REGEX = /[\u064B-\u0652\u0670\u0653-\u065F\u06D6-\u06ED]/g;
const TATWEEL_REGEX = /\u0640/g;
const PUNCTUATION_REGEX = /[\u060C\u061B\u061F\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]/g;

export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFKC")
    .replace(DIACRITICS_REGEX, "")
    .replace(TATWEEL_REGEX, "")
    // Unify alef variants (أ إ آ ا -> ا)
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    // Unify taa marbuta -> haa (رياضة vs رياضه, common typing variance)
    .replace(/\u0629/g, "\u0647")
    // Unify yaa / alef maqsura
    .replace(/\u0649/g, "\u064A")
    // Drop "the/al-" definite article "ال" prefix on words for looser matching
    .replace(PUNCTUATION_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const currRow = new Array(b.length + 1);
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Similarity threshold scales with word length — short answers must be near-exact.
 *  Master Plan spec: ">= 85% similar". Very short answers (≤3 chars) must be exact
 *  to avoid accepting single-char mismatches on 2-letter words. */
function thresholdFor(normalized: string): number {
  if (normalized.length <= 3) return 1; // exact match only for very short answers
  return 0.85; // 85% threshold for all longer answers, per Master Plan
}

/**
 * Returns true if `submitted` matches any of `validAnswers` closely enough
 * to be graded correct. Each valid answer may itself contain "or" variants
 * separated by "/" or "،" — these are split and checked individually.
 */
export function isAnswerCorrect(submitted: string, validAnswers: string[]): boolean {
  const normSubmitted = normalizeAnswer(submitted);
  if (!normSubmitted) return false;

  const candidates = validAnswers.flatMap((answer) => answer.split(/[\/،,]/));

  for (const candidate of candidates) {
    const normCandidate = normalizeAnswer(candidate);
    if (!normCandidate) continue;
    if (normSubmitted === normCandidate) return true;
    if (similarity(normSubmitted, normCandidate) >= thresholdFor(normCandidate)) return true;
  }
  return false;
}
