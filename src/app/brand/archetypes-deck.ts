/**
 * The "Brand Archetypes" deck, rendered from brand/decks/archetypes/Archetypes-web.pdf
 * into per-page JPEGs (slide-NN.jpg full-res + thumb-NN.jpg for the filmstrip).
 *
 * The images are eager-imported so Vite bundles + fingerprints them; the viewer
 * only needs ordered URL strings. Importing a `.jpg` yields its URL by default.
 */

const slideModules = import.meta.glob(
  "../../../brand/decks/archetypes/slide-*.jpg",
  { eager: true, import: "default" },
) as Record<string, string>;
const thumbModules = import.meta.glob(
  "../../../brand/decks/archetypes/thumb-*.jpg",
  { eager: true, import: "default" },
) as Record<string, string>;

/** Sort by path — the NN zero-padding keeps pages in order. */
function ordered(modules: Record<string, string>): string[] {
  return Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}

export type DeckSlide = { page: number; src: string; thumb: string };

export type Deck = {
  id: string;
  slides: DeckSlide[];
  subtitle: string;
  title: string;
};

const slideUrls = ordered(slideModules);
const thumbUrls = ordered(thumbModules);

export const ARCHETYPES_DECK: Deck = {
  id: "archetypes",
  slides: slideUrls.map((src, index) => ({
    page: index + 1,
    src,
    thumb: thumbUrls[index] ?? src,
  })),
  subtitle: "House of Mrs. — the customer personas",
  title: "Brand Archetypes",
};
