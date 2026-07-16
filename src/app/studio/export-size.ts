/**
 * Source-respecting export dimensions.
 *
 * We never upscale a source photo/clip and never gratuitously downscale it:
 * output pixels map the source's native resolution 1:1 through the cover-crop
 * into the format's aspect ratio, capped at a sane long edge. A comp with no
 * raster source (text/solid only) exports at the format's authored size —
 * vectors stay razor-sharp at any size, and that's the platform's canonical
 * spec. This replaces the old fixed 2K/4K/8K tier, which upscaled small photos
 * into fuzzy pixels and ignored the extra detail in large ones.
 */

import { getFormat, type PlatformFormat } from "../data/formats";
import type { Asset } from "../data/types";
import type { StudioValues } from "./comp-layout";

/**
 * Ceiling on the exported long edge. Output is 1:1 with the source up to here;
 * only sources larger than this are downscaled to fit. 4096 is the practical
 * max for platform delivery and in-browser (MediaRecorder) video encoding.
 */
export const EXPORT_MAX_LONG_EDGE = 4096;

/**
 * Ceiling on the long edge for VIDEO exports. Video encodes in real time in
 * the browser (canvas → MediaRecorder), so pixels cost wall-clock: above
 * ~1080p the encoder can't keep pace with playback and the capture drops
 * frames or stalls. 1920 is also the delivery ceiling for every video surface
 * we target (1080×1920 stories/TikTok, 1920×1080 landscape) — platforms
 * re-encode anything larger back down. Smaller sources still map 1:1, never
 * upscaled.
 */
export const VIDEO_EXPORT_MAX_LONG_EDGE = 1920;

/** The raster asset that drives a comp's resolution — its background photo or
 * video (the single image, or the first collage cell). */
function sourceAssetOf(values: StudioValues, assets: readonly Asset[]): Asset | undefined {
  if (!values.imageInclude) {
    return undefined;
  }
  const id = values.imageAssetId || values.imageAssetIds?.[0];
  const asset = id ? assets.find((candidate) => candidate.id === id) : undefined;
  return asset && asset.width > 0 && asset.height > 0 ? asset : undefined;
}

export interface ExportSize {
  height: number;
  width: number;
}

/** Snap DOWN to an even number (H.264 requires even dimensions), floor of 2.
 * Flooring — never rounding up — guarantees the output can't exceed the 1:1
 * source size, so we never upscale by even a fraction of a pixel. The epsilon
 * absorbs float error only: 1350/1.35 = 999.9999… must snap to 1000, not 998
 * (a real 999.4 still floors to 998). */
function even(value: number): number {
  return Math.max(2, Math.floor(value / 2 + 1e-6) * 2);
}

/** Scale (w,h) down so its long edge fits `cap`, then snap to even dimensions.
 * Never scales up — a block already under the cap keeps its size. */
function capLongEdge(width: number, height: number, cap: number): ExportSize {
  const longEdge = Math.max(width, height);
  const k = longEdge > cap ? cap / longEdge : 1;
  return { height: even(height * k), width: even(width * k) };
}

/**
 * Output pixel size for a comp at a format, honoring the source's native
 * resolution with no up/downscaling (beyond the {@link EXPORT_MAX_LONG_EDGE}
 * safety cap). Deterministic from (format, values, source asset).
 */
export function computeExportSize(
  format: PlatformFormat,
  values: StudioValues,
  assets: readonly Asset[],
  maxLongEdge: number = EXPORT_MAX_LONG_EDGE,
): ExportSize {
  const source = sourceAssetOf(values, assets);

  // No raster source: the design is all vector — export at the authored format
  // size (capped). Nothing to up/downscale.
  if (!source) {
    return capLongEdge(format.width, format.height, maxLongEdge);
  }

  // Cover-crop scale that fits the source into the format at format-native px,
  // including the design's zoom. `format / coverScale` then renders the visible
  // source region at 1:1 — never upscaled, and using the source's full detail
  // when it is larger than the format.
  const zoom = Math.max(1, values.imageZoom || 1);
  const coverScale =
    Math.max(format.width / source.width, format.height / source.height) * zoom;
  return capLongEdge(format.width / coverScale, format.height / coverScale, maxLongEdge);
}

/** {@link computeExportSize} by format id. */
export function computeExportSizeForFormatId(
  formatId: string,
  values: StudioValues,
  assets: readonly Asset[],
  maxLongEdge: number = EXPORT_MAX_LONG_EDGE,
): ExportSize {
  return computeExportSize(getFormat(formatId), values, assets, maxLongEdge);
}
