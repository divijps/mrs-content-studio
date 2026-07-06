/**
 * "Add to Library" path — turns a rendered comp into a real Library asset
 * without a download round-trip. Runs the exact same import + cloud-upload
 * pipeline the Library uses for dropped files, so on a team workspace the whole
 * team sees the new asset immediately.
 */

import { getFormat } from "../data/formats";
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
  const scale = format.retina ? 2 : 1;
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
 * Import already-rendered image File(s) as Library assets. Mirrors the
 * Library's own drop-import: dedupes, renames to the brand convention, and
 * uploads to storage when connected to the team workspace. By default the
 * assets are filed into a dedicated board so saved comps are easy to find.
 */
export async function saveImagesToLibrary(
  files: File[],
  options: { boardName?: string | null } = {},
): Promise<Asset[]> {
  if (files.length === 0) {
    return [];
  }
  const boardName = options.boardName === undefined ? STUDIO_BOARD_NAME : options.boardName;
  const collectionId = boardName ? ensureCollection(boardName) : null;
  const snapshot = getProjectSnapshot();
  const result = await importFiles({
    collectionId,
    collectionName: boardName ?? "studio",
    existing: snapshot.assets,
    files,
  });
  if (snapshot.source === "cloud" && result.assets.length > 0) {
    const { uploadAssets } = await import("../data/backend/supabase-backend");
    const uploaded = await uploadAssets(
      result.assets,
      result.sources,
      undefined,
      result.posters,
    );
    addAssets(uploaded);
    return uploaded;
  }
  addAssets(result.assets);
  return result.assets;
}
