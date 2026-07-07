/**
 * "Add to Library" path — turns a rendered comp into a real Library asset
 * without a download round-trip. Runs the exact same import + cloud-upload
 * pipeline the Library uses for dropped files, so on a team workspace the whole
 * team sees the new asset immediately.
 */

import { getFormat, type PlatformFormat } from "../data/formats";
import { importFiles } from "../data/import-assets";
import { addAssets, ensureCollection, getProjectSnapshot } from "../data/project-store";
import type { Asset, BrandKit, Comp } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import { encodeCanvas, renderCompCanvas } from "./export";

/** Render a comp at the given format to a PNG File (retina-scaled). */
export async function renderCompToFile(options: {
  assets: readonly Asset[];
  brand: BrandKit;
  comp: Comp;
  formatId: string;
}): Promise<File> {
  const { assets, brand, comp, formatId } = options;
  const format = getFormat(formatId);
  const values: StudioValues = {
    ...STUDIO_DEFAULTS,
    ...(comp.sourceValues as Partial<StudioValues> | undefined),
    formatId,
  };
  // Always render at 2× — library saves keep the highest standard.
  const scale = 2;
  const canvas = await renderCompCanvas({
    assets,
    background: values.backgroundHex,
    brand,
    includeBackground: true,
    pixelHeight: format.height * scale,
    pixelWidth: format.width * scale,
    values,
  });
  const blob = await encodeCanvas(canvas, "image/png");
  const safe = comp.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "comp";
  return new File([blob], `${safe}.png`, { type: "image/png" });
}

/** Board that collects everything saved out of the Studio. */
export const STUDIO_BOARD_NAME = "Studio exports";

/**
 * Where a rendered format belongs: a per-type sub-board under "Studio exports"
 * (e.g. Studio exports / Instagram Post 4:5) plus search tags for the platform
 * and format.
 */
export function exportDestination(format: PlatformFormat): {
  boardPath: string[];
  tags: string[];
} {
  return {
    boardPath: [STUDIO_BOARD_NAME, `${format.platformLabel} ${format.label}`],
    tags: [format.platform, format.id],
  };
}

/**
 * Import already-rendered image File(s) as Library assets. Mirrors the
 * Library's own drop-import: dedupes, renames to the brand convention, and
 * uploads to storage when connected to the team workspace. By default the
 * assets are filed into a dedicated board (nested via boardPath) so saved
 * comps stay organized by type.
 */
export async function saveImagesToLibrary(
  files: File[],
  options: { boardPath?: string[]; tags?: string[] } = {},
): Promise<Asset[]> {
  if (files.length === 0) {
    return [];
  }
  const boardPath = options.boardPath ?? [STUDIO_BOARD_NAME];
  let collectionId: string | null = null;
  for (const name of boardPath) {
    collectionId = ensureCollection(name, collectionId);
  }
  const snapshot = getProjectSnapshot();
  const result = await importFiles({
    collectionId,
    collectionName: boardPath[boardPath.length - 1] ?? "studio",
    existing: snapshot.assets,
    files,
  });
  const tags = options.tags ?? [];
  const assets =
    tags.length > 0
      ? result.assets.map((asset) => ({
          ...asset,
          tags: [...new Set([...asset.tags, ...tags])],
        }))
      : result.assets;
  if (snapshot.source === "cloud" && assets.length > 0) {
    const { uploadAssets } = await import("../data/backend/supabase-backend");
    const uploaded = await uploadAssets(assets, result.sources, undefined, result.posters);
    addAssets(uploaded);
    return uploaded;
  }
  addAssets(assets);
  return assets;
}
