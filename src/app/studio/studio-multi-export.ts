/**
 * Studio multi-format export — the Queue's batch pipeline, scoped to the one
 * artboard you're editing.
 *
 * Renders the current comp across every selected platform format (stills honor
 * the chosen encoding + resolution per format; a video background renders as a
 * branded MP4/WebM). One format yields the bare file; many are bundled into a
 * ZIP with platform folders + a manifest.csv — the same "neatly titled and
 * grouped" payoff the standalone Queue used to give.
 */

import { getFormat, type PlatformFormat } from "../data/formats";
import type { Asset, BrandKit } from "../data/types";
import type { StudioValues } from "./comp-layout";
import {
  applyNamingTemplate,
  dateStampNow,
  encodeCanvas,
  renderCompCanvas,
  slugify,
} from "./export";
import { findCompVideoAsset, renderStudioVideo } from "./video-export";
import { createZip, type ZipEntry } from "./zip";

export type StillEncoding = "jpeg" | "png" | "webp";

const ENCODING_MIME: Record<StillEncoding, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const ENCODING_EXT: Record<StillEncoding, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

/** Fixed File timestamp — deterministic, though dedupe now keys on the design
 * state (see studioExportKey), not the file's content fingerprint. */
export const STUDIO_EXPORT_LAST_MODIFIED = 0;

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Stable identity for "this exact design, rendered to this format at these
 * output settings." Computed from the design state BEFORE rendering, so an
 * unchanged re-save is recognized without re-rendering or writing a second
 * Library file. Stored as the saved asset's `importFingerprint`.
 */
export function studioExportKey(options: {
  encoding: StillEncoding;
  formatId: string;
  isVideo: boolean;
  resolution: string;
  values: StudioValues;
  video: { audio: boolean; format: "mp4" | "webm" };
}): string {
  const scopedValues = { ...options.values, formatId: options.formatId };
  const payload = options.isVideo
    ? { f: options.formatId, kind: "video", v: scopedValues, video: options.video }
    : {
        enc: options.encoding,
        f: options.formatId,
        kind: "still",
        res: options.resolution,
        v: scopedValues,
      };
  return `studio:${fnv1a(JSON.stringify(payload))}`;
}

/** Map the "jpg" | "png" | "webp" schema value to a canvas encoding. */
export function stillEncodingOf(value: unknown): StillEncoding {
  return value === "jpg" ? "jpeg" : value === "webp" ? "webp" : "png";
}

/** Absolute long-edge pixel target for a resolution tier. */
function resolutionLongEdge(resolution: string): number {
  return resolution === "8k" ? 7680 : resolution === "2k" ? 2048 : 3840;
}

/** Per-format scale so the longer edge reaches the resolution tier — keeps
 * every format sharp at the requested resolution regardless of aspect. */
function formatScale(format: PlatformFormat, resolution: string): number {
  return resolutionLongEdge(resolution) / Math.max(format.width, format.height);
}

export interface RenderedFormat {
  file: File;
  format: PlatformFormat;
  height: number;
  isVideo: boolean;
  width: number;
}

export interface RenderStudioFormatsOptions {
  assets: readonly Asset[];
  brand: BrandKit;
  campaign?: string;
  encoding: StillEncoding;
  formatIds: string[];
  onProgress: (fraction: number) => void;
  resolution: string;
  values: StudioValues;
  video: { audio: boolean; format: "mp4" | "webm" };
}

/**
 * Render the comp once per selected format into a named File. A video-backed
 * comp renders a branded video per format; everything else a still at the
 * chosen encoding + resolution. Progress spans 0→1 across all formats.
 */
export async function renderStudioFormatFiles(
  options: RenderStudioFormatsOptions,
): Promise<RenderedFormat[]> {
  const { assets, brand, encoding, onProgress, resolution, values, video } = options;
  const campaign = options.campaign?.trim() || "studio";
  const formatIds = options.formatIds.length > 0 ? options.formatIds : [values.formatId];
  const rendered: RenderedFormat[] = [];

  for (const [index, formatId] of formatIds.entries()) {
    const format = getFormat(formatId);
    const formatValues: StudioValues = { ...values, formatId };
    const videoAsset = findCompVideoAsset(formatValues, assets);
    const span = (fraction: number): number => (index + fraction) / formatIds.length;

    let file: File;
    let width = format.width;
    let height = format.height;
    const isVideo = Boolean(videoAsset);

    if (videoAsset) {
      const output = await renderStudioVideo({
        asset: videoAsset,
        assets,
        brand,
        includeAudio: video.audio,
        onProgress: (fraction) => onProgress(span(fraction)),
        preferredFormat: video.format,
        values: formatValues,
      });
      // MediaRecorder blobs carry codec params the Library importer's exact MIME
      // check rejects — normalize to the clean base type.
      const baseMime = output.extension === "mp4" ? "video/mp4" : "video/webm";
      file = new File([output.blob], output.filename, {
        lastModified: STUDIO_EXPORT_LAST_MODIFIED,
        type: baseMime,
      });
    } else {
      const scale = formatScale(format, resolution);
      width = Math.round(format.width * scale);
      height = Math.round(format.height * scale);
      const canvas = await renderCompCanvas({
        assets,
        background: formatValues.backgroundHex,
        brand,
        includeBackground: true,
        pixelHeight: height,
        pixelWidth: width,
        values: formatValues,
      });
      const blob = await encodeCanvas(
        canvas,
        ENCODING_MIME[encoding],
        encoding === "png" ? undefined : 0.95,
      );
      const name = `${applyNamingTemplate({
        campaign,
        comp: values.headingText || "comp",
        height,
        index: 1,
        platform: format.platform,
        template: brand.namingTemplate,
        width,
      })}.${ENCODING_EXT[encoding]}`;
      file = new File([blob], name, {
        lastModified: STUDIO_EXPORT_LAST_MODIFIED,
        type: ENCODING_MIME[encoding],
      });
      onProgress(span(1));
    }

    rendered.push({ file, format, height, isVideo, width });
  }

  return rendered;
}

export interface StudioBundle {
  blob: Blob;
  count: number;
  filename: string;
  /** True when a single file was produced (a bare download, not a ZIP). */
  single: boolean;
}

/**
 * Bundle rendered formats for download: one file downloads bare; many are
 * zipped under platform folders with a manifest.csv.
 */
export async function bundleStudioExport(
  rendered: RenderedFormat[],
  campaign = "studio",
): Promise<StudioBundle> {
  if (rendered.length === 1) {
    const only = rendered[0]!;
    return { blob: only.file, count: 1, filename: only.file.name, single: true };
  }

  const entries: ZipEntry[] = [];
  const versionCounter = new Map<string, number>();
  const escape = (cell: string | number): string => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const manifest = [["filename", "platform", "format", "width", "height"].join(",")];

  for (const item of rendered) {
    const key = `${item.format.platform}/${item.file.name}`;
    const version = (versionCounter.get(key) ?? 0) + 1;
    versionCounter.set(key, version);
    const filename =
      version > 1 ? item.file.name.replace(/(\.[^.]+)$/, `-v${version}$1`) : item.file.name;
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    entries.push({ bytes, path: `${item.format.platform}/${filename}` });
    manifest.push(
      [
        filename,
        item.format.platform,
        `${item.format.platformLabel} ${item.format.label}${item.isVideo ? " · video" : ""}`,
        item.width,
        item.height,
      ]
        .map(escape)
        .join(","),
    );
  }
  entries.push({
    bytes: new TextEncoder().encode(manifest.join("\n")),
    path: "manifest.csv",
  });

  return {
    blob: createZip(entries),
    count: rendered.length,
    filename: `${dateStampNow()}_${slugify(campaign)}_export.zip`,
    single: false,
  };
}
