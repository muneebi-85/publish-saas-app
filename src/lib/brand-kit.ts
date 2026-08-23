/**
 * Brand kit — shared shape, defaults, and a safe reader for the stored JSON.
 *
 * Lives in `lib` rather than beside the page because the server reads the same
 * record on the rewrite path (`/api/optimize`): the creator's tone selections and
 * banned words steer the humanizer, so page and engine must agree on the shape.
 * `brandKit` is a Prisma `Json` column, which means anything could be in it —
 * every field is re-validated here rather than trusted.
 */

export interface Kit {
  colors: { name: string; hex: string }[];
  headingFont: string;
  bodyFont: string;
  tones: string[];
  description: string;
  banned: string[];
  /** Public storage URL of the uploaded logo, or null when none is set. */
  logoUrl: string | null;
}

/**
 * Defaults for an account that has never saved a kit.
 *
 * Deliberately empty. An invented palette, brand voice, and banned-word list
 * would be indistinguishable from choices the user actually made — and the tone
 * and banned words feed the rewrite, so seeded values would silently steer
 * output the user never asked for. Fonts are the one exception: a font picker
 * needs a concrete selection, and these two are the app's own defaults, so they
 * are a real answer rather than a guess about the user's brand.
 */
export const DEFAULT_KIT: Kit = {
  colors: [],
  headingFont: 'General Sans',
  bodyFont: 'Inter',
  tones: [],
  description: '',
  banned: [],
  logoUrl: null,
};

const isColorList = (val: unknown): val is Kit['colors'] =>
  Array.isArray(val) &&
  val.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as { name?: unknown }).name === 'string' &&
      typeof (c as { hex?: unknown }).hex === 'string',
  );

const isStringList = (val: unknown): val is string[] =>
  Array.isArray(val) && val.every((s) => typeof s === 'string');

/**
 * Read a stored `user.brandKit` value into a complete `Kit`.
 *
 * Note the array checks do not test for length: a user who deliberately removed
 * every colour must get their empty list back, not the default reinstated.
 *
 * Defaulted arrays are always fresh copies. `DEFAULT_KIT` is a module-level
 * constant living in a long-running server process, so handing out its own
 * arrays would let one caller's edit leak into every later parse — and into
 * other users' kits.
 */
export function parseBrandKit(raw: unknown): Kit {
  const saved =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Partial<Record<keyof Kit, unknown>>)
      : null;

  return {
    colors: isColorList(saved?.colors) ? saved!.colors : [...DEFAULT_KIT.colors],
    headingFont:
      typeof saved?.headingFont === 'string' ? saved.headingFont : DEFAULT_KIT.headingFont,
    bodyFont: typeof saved?.bodyFont === 'string' ? saved.bodyFont : DEFAULT_KIT.bodyFont,
    tones: isStringList(saved?.tones) ? saved!.tones : [...DEFAULT_KIT.tones],
    description:
      typeof saved?.description === 'string' ? saved.description : DEFAULT_KIT.description,
    banned: isStringList(saved?.banned) ? saved!.banned : [...DEFAULT_KIT.banned],
    logoUrl:
      typeof saved?.logoUrl === 'string' && saved.logoUrl.length > 0 ? saved.logoUrl : null,
  };
}
