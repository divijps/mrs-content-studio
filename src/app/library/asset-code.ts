import type { Asset, Collection } from "../data/types";

/**
 * A short, human-friendly asset code — e.g. `SOL 106` — used as the asset's
 * display title in the viewer, media panel, and cards. It replaces the raw
 * schema filename with something you can say out loud.
 *
 * Derived only from data that already exists (no new fields, no manual entry):
 *  · prefix = a 3-letter code from the asset's board name (diacritics stripped),
 *    or the project code when the asset is unfiled;
 *  · number = the trailing number in the asset's schema name, else a stable
 *    number derived from its id so the code never changes across sessions.
 */

const PROJECT_CODE = "MRS";

/** First three letters of a name, ASCII-folded and uppercased. */
function codeFromName(name: string): string {
  const letters = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 3) || PROJECT_CODE).toUpperCase();
}

/** Deterministic 1–999 number from an id (fallback when the name has none). */
function stableNumber(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 999) + 1;
}

/** The board an asset sits directly in (its most specific folder), if filed. */
function directBoard(asset: Asset, collections: Collection[]): Collection | null {
  if (!asset.collectionId) return null;
  return collections.find((collection) => collection.id === asset.collectionId) ?? null;
}

export function assetCode(asset: Asset, collections: Collection[]): string {
  const board = directBoard(asset, collections);
  const prefix = board ? codeFromName(board.name) : PROJECT_CODE;
  const trailing = asset.name.match(/(\d+)\s*$/);
  const number = trailing ? Number(trailing[1]) : stableNumber(asset.id);
  return `${prefix} ${number}`;
}
