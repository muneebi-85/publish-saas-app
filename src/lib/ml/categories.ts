/**
 * The cell-key vocabulary: category names, subscriber buckets, and the key itself.
 *
 * Split out of `benchmark.ts` for one reason: `benchmark.ts` imports `./index`, which
 * reads the model artefact off disk with `node:fs`. A client component that only needs
 * the category list would drag that in and fail the webpack build with
 * "Reading from node:fs is not handled by plugins" - which is what happened. This file
 * has no imports at all, so anything may use it, on either side of the boundary.
 *
 * Everything here mirrors `publishml/labels.py` and `publishml/config.py`. If the two
 * ever disagree the app looks up a cell that does not exist, and shows no benchmark and
 * no advice for every video, with nothing logged.
 */

/**
 * YouTube category id to the name `labels.py` uses in its cell keys.
 *
 * Mirrors `config.CATEGORIES`. This map is not cosmetic: `labels.py:199` resolves the
 * numeric id to a NAME before building the cell key, so a cell is `People & Blogs|small|long`
 * and never `22|small|long`. Looking up the numeric form finds nothing, and finding
 * nothing here is silent - the app renders no benchmark and no advice for every video,
 * with no error anywhere. Duplicated rather than derived for the same reason
 * `FEATURE_NAMES` is: an independent copy is the only thing that can disagree, and
 * disagreeing loudly is the point.
 *
 * Two ids share a name upstream (23 and 34 are both "Comedy"), which is YouTube's own
 * doing - both map to the same cell, exactly as they did in training.
 */
export const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  '1': 'Film & Animation',
  '2': 'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '18': 'Short Movies',
  '19': 'Travel & Events',
  '20': 'Gaming',
  '21': 'Videoblogging',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
  '30': 'Movies',
  '31': 'Anime/Animation',
  '32': 'Action/Adventure',
  '33': 'Classics',
  '34': 'Comedy',
  '35': 'Documentary',
  '36': 'Drama',
  '37': 'Family',
  '38': 'Foreign',
  '39': 'Horror',
  '40': 'Sci-Fi/Fantasy',
  '41': 'Thriller',
  '42': 'Shorts',
  '43': 'Shows',
  '44': 'Trailers',
};

/** What `labels.py` writes for an id it does not know. */
export const UNKNOWN_CATEGORY = 'Other';

/** Every value in `CATEGORY_NAMES`, for recognising a name that is already resolved. */
const CATEGORY_NAME_SET: ReadonlySet<string> = new Set(Object.values(CATEGORY_NAMES));

/**
 * The category name for an id, or `Other` - matching `config.CATEGORIES.get(id, "Other")`.
 *
 * Accepts an already-resolved NAME and returns it unchanged. Not for tidiness: a caller
 * holding `'Gaming'` (say, read back from a stored cell key) would otherwise be mapped to
 * `'Other'` and look up a cell that exists but is not theirs - a wrong benchmark, which is
 * worse than none. Passing a name through is always the right answer because `labels.py`
 * keys its cells by exactly these strings.
 */
export function categoryName(categoryId: string | number | null | undefined): string {
  if (categoryId === null || categoryId === undefined) return UNKNOWN_CATEGORY;
  const raw = String(categoryId).trim();
  const mapped = CATEGORY_NAMES[raw];
  if (mapped) return mapped;
  if (CATEGORY_NAME_SET.has(raw) || raw === UNKNOWN_CATEGORY) return raw;
  return UNKNOWN_CATEGORY;
}

/**
 * The cell key for a video: `categoryName|sizeBucket|form`.
 *
 * Mirrors `labels.py`, which builds the same string when it assigns training rows to
 * cells - including the id-to-NAME step, which is easy to miss because the input is a
 * numeric id and the output contains none of it. `cellKey('22', 48_200, false)` is
 * `'People & Blogs|small|long'`.
 *
 * If these two ever disagree the app looks up a cell that does not exist and shows no
 * benchmark and no advice, for every video, with nothing logged. The format is
 * duplicated deliberately rather than derived, so that a disagreement is a test
 * failure instead of a blank panel.
 */
export function cellKey(categoryId: string, subscribers: number, isShorts: boolean): string {
  return `${categoryName(categoryId)}|${sizeBucket(subscribers)}|${isShorts ? 'short' : 'long'}`;
}

/** Mirrors `config.SIZE_BUCKETS`. A hidden subscriber count arrives as 0 → nano. */
export function sizeBucket(subscribers: number): string {
  const subs = Number.isFinite(subscribers) ? Math.max(0, subscribers) : 0;
  if (subs < 1_000) return 'nano';
  if (subs < 10_000) return 'micro';
  if (subs < 100_000) return 'small';
  if (subs < 1_000_000) return 'mid';
  if (subs < 10_000_000) return 'large';
  return 'mega';
}
