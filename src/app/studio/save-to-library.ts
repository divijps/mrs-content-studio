/**
 * "Add to Library" path — turns a rendered comp into a real Library asset
 * without a download round-trip. Runs the exact same import + cloud-upload
 * pipeline the Library uses for dropped files, so on a team workspace the whole
 * team sees the new asset immediately.
 */

import { cloneCurrentVersion } from "../data/asset-versions";
import { getFormat, type PlatformFormat } from "../data/formats";
import { importFiles } from "../data/import-assets";
import {
  addAssets,
  addAssetVersion,
  createId,
  ensureCollection,
  getProjectSnapshot,
} from "../data/project-store";
import type { Asset, AssetVersion, BrandKit, Comp } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import { encodeCanvas, renderCompCanvas } from "./export";
import { computeExportSize } from "./export-size";

/** Render a comp at the given format to a PNG File at the source's native
 * resolution (no up/downscale beyond the export cap). */
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
  const size = computeExportSize(format, values, assets);
  const canvas = await renderCompCanvas({
    assets,
    background: values.backgroundHex,
    brand,
    includeBackground: true,
    pixelHeight: size.height,
    pixelWidth: size.width,
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
export function exportDestination(
  format: PlatformFormat,
  baseBoard: string = STUDIO_BOARD_NAME,
): {
  boardPath: string[];
  tags: string[];
} {
  return {
    boardPath: [baseBoard, `${format.platformLabel} ${format.label}`],
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
  options: {
    boardPath?: string[];
    fingerprints?: string[];
    sourceValues?: Record<string, unknown>;
    tags?: string[];
  } = {},
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
    addedBy: snapshot.settings.displayName ?? null,
    collectionId,
    collectionName: boardPath[boardPath.length - 1] ?? "studio",
    existing: snapshot.assets,
    files,
    fingerprints: options.fingerprints,
    sourceValues: options.sourceValues,
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

/**
 * File a rendered image as a new *version* of an existing Library asset (used
 * when a design opened via "Edit in Studio" is re-saved). Runs the same read +
 * cloud-upload pipeline as a normal save, then appends the result as the asset's
 * new current version. Returns the updated asset, or null if the target is gone.
 */
export async function saveFileAsAssetVersion(
  assetId: string,
  file: File,
  fingerprint: string,
  sourceValues?: Record<string, unknown>,
): Promise<Asset | null> {
  const snapshot = getProjectSnapshot();
  const target = snapshot.assets.find((asset) => asset.id === assetId);
  if (!target) {
    return null;
  }
  // Read the rendered file through the shared pipeline (dimensions + thumbnail).
  const result = await importFiles({
    addedBy: snapshot.settings.displayName ?? null,
    collectionId: null,
    collectionName: target.name,
    existing: [],
    files: [file],
    fingerprints: [fingerprint],
    sourceValues,
  });
  const read = result.assets[0];
  if (!read) {
    return null;
  }
  const version: AssetVersion = {
    ...cloneCurrentVersion(read, {
      createdAt: new Date().toISOString(),
      createdBy: snapshot.settings.displayName ?? null,
      id: createId("ver"),
    }),
    importFingerprint: fingerprint,
    sourceValues,
  };
  if (snapshot.source === "cloud") {
    const { uploadAssetVersion } = await import("../data/backend/supabase-backend");
    const source = result.sources.get(read.id);
    if (!source) {
      return null;
    }
    const uploaded = await uploadAssetVersion(assetId, version, source, result.posters.get(read.id));
    addAssetVersion(assetId, uploaded);
  } else {
    addAssetVersion(assetId, version);
  }
  return getProjectSnapshot().assets.find((asset) => asset.id === assetId) ?? null;
}
