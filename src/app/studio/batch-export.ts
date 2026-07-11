/**
 * Queue batch export: render every queued comp × format, encode to each
 * platform's spec, name by convention, group into platform folders, and emit
 * one ZIP with a manifest.csv — the "one click, neatly titled and grouped" payoff.
 */

import { getFormat, type PlatformFormat } from "../data/formats";
import type { Asset, BrandKit, Comp, QueueItem } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import {
  applyNamingTemplate,
  dateStampNow,
  encodeCanvas,
  renderCompCanvas,
  slugify,
} from "./export";
import { findCompVideoAsset, renderStudioVideo } from "./video-export";
import { createZip, type ZipEntry } from "./zip";

export type ExportQuality = "recommended" | "highest";

const ENCODING_MIME: Record<PlatformFormat["encoding"], string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ENCODING_EXT: Record<PlatformFormat["encoding"], string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

function compValues(comp: Comp): StudioValues {
  // sourceValues is the flat Studio snapshot; fall back to defaults for any
  // older comp that predates the snapshot field.
  return { ...STUDIO_DEFAULTS, ...(comp.sourceValues as Partial<StudioValues> | undefined) };
}

/** Pixel size for a format under the chosen quality. */
function exportPixelSize(
  format: PlatformFormat,
  quality: ExportQuality,
): { height: number; width: number } {
  const scale = quality === "highest" ? 2 : format.retina ? 2 : 1;
  return { height: format.height * scale, width: format.width * scale };
}

export interface ManifestRow {
  campaign: string;
  comp: string;
  filename: string;
  format: string;
  height: number;
  platform: string;
  status: string;
  width: number;
}

function manifestCsv(rows: ManifestRow[]): string {
  const header = [
    "filename",
    "platform",
    "format",
    "width",
    "height",
    "comp",
    "campaign",
    "status",
  ];
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.filename,
        row.platform,
        row.format,
        row.width,
        row.height,
        row.comp,
        row.campaign,
        row.status,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export interface BatchExportOptions {
  assets: readonly Asset[];
  brand: BrandKit;
  campaign: string;
  comps: readonly Comp[];
  quality: ExportQuality;
  /** Force one encoding for every file (else each format's own default). */
  encoding?: PlatformFormat["encoding"];
  /** Force a pixel scale for every file (else derived from `quality`). */
  scale?: number;
  /** Container + audio for comps whose background media is a video (they render
   * as branded videos instead of stills). Defaults to MP4 with audio. */
  video?: { audio: boolean; format: "mp4" | "webm" };
  queue: readonly QueueItem[];
  /** Only export comps whose status is Approved. */
  approvedOnly: boolean;
  reportProgress: (progress: number) => void;
}

export interface BatchExportResult {
  filename: string;
  manifest: ManifestRow[];
  rendered: number;
  skipped: number;
  zip: Blob;
}

export async function runBatchExport(
  options: BatchExportOptions,
): Promise<BatchExportResult> {
  const { approvedOnly, assets, brand, campaign, comps, quality, queue, reportProgress } =
    options;

  // Expand the queue into concrete (comp, format) render jobs.
  type Job = { comp: Comp; format: PlatformFormat };
  const jobs: Job[] = [];
  let skipped = 0;
  for (const item of queue) {
    const comp = comps.find((candidate) => candidate.id === item.compId);
    if (!comp) {
      continue;
    }
    if (approvedOnly && comp.status !== "approved") {
      skipped += item.formatIds.length;
      continue;
    }
    for (const formatId of item.formatIds) {
      jobs.push({ comp, format: getFormat(formatId) });
    }
  }

  const entries: ZipEntry[] = [];
  const manifest: ManifestRow[] = [];
  // Version by final path so two comps that resolve to the same name+format get
  // v1, v2, … instead of silently overwriting each other inside the ZIP.
  const versionCounter = new Map<string, number>();

  for (const [index, job] of jobs.entries()) {
    // Nudge the bar at job start so a slow first render doesn't read as stuck.
    reportProgress(Math.max(0.02, (index / Math.max(1, jobs.length)) * 0.95));
    const values: StudioValues = { ...compValues(job.comp), formatId: job.format.id };
    const videoAsset = findCompVideoAsset(values, assets);

    let bytes: Uint8Array;
    let ext: string;
    let height: number;
    let width: number;
    let formatLabel = `${job.format.platformLabel} ${job.format.label}`;
    if (videoAsset) {
      // A video background exports as a branded video (real-time render), at
      // the format's base pixel size — encoding/scale overrides don't apply.
      height = job.format.height;
      width = job.format.width;
      const rendered = await renderStudioVideo({
        asset: videoAsset,
        assets,
        brand,
        includeAudio: options.video?.audio ?? true,
        onProgress: (fraction) =>
          reportProgress(
            Math.max(0.02, ((index + fraction) / Math.max(1, jobs.length)) * 0.95),
          ),
        preferredFormat: options.video?.format ?? "mp4",
        values,
      });
      bytes = new Uint8Array(await rendered.blob.arrayBuffer());
      ext = rendered.extension;
      formatLabel += " · video";
    } else {
      ({ height, width } = options.scale
        ? {
            height: job.format.height * options.scale,
            width: job.format.width * options.scale,
          }
        : exportPixelSize(job.format, quality));

      const canvas = await renderCompCanvas({
        assets,
        background: values.backgroundHex,
        brand,
        includeBackground: true,
        pixelHeight: height,
        pixelWidth: width,
        values,
      });

      const encoding = options.encoding ?? job.format.encoding;
      const quantity =
        quality === "highest" ? 0.95 : encoding === "jpeg" ? job.format.jpegQuality : 0.9;
      const mime = ENCODING_MIME[encoding];
      const blob = await encodeCanvas(
        canvas,
        mime,
        encoding === "png" ? undefined : quantity,
      );
      bytes = new Uint8Array(await blob.arrayBuffer());
      ext = ENCODING_EXT[encoding];
    }

    // The version key is the fully-resolved name with index fixed at 1, so any
    // two jobs that would collide on disk share a counter and get v1, v2, …
    const collisionKey = `${job.format.platform}/${applyNamingTemplate({
      campaign,
      comp: job.comp.name,
      height,
      index: 1,
      platform: job.format.platform,
      template: brand.namingTemplate,
      width,
    })}.${ext}`;
    const version = (versionCounter.get(collisionKey) ?? 0) + 1;
    versionCounter.set(collisionKey, version);

    const base = applyNamingTemplate({
      campaign,
      comp: job.comp.name,
      height,
      index: version,
      platform: job.format.platform,
      template: brand.namingTemplate,
      width,
    });
    const filename = `${base}.${ext}`;

    entries.push({ bytes, path: `${job.format.platform}/${filename}` });
    manifest.push({
      campaign,
      comp: job.comp.name,
      filename,
      format: formatLabel,
      height,
      platform: job.format.platform,
      status: job.comp.status,
      width,
    });

    reportProgress((index + 1) / Math.max(1, jobs.length) * 0.95);
  }

  // Raw assets queued for export ride along as their original files under
  // originals/, named by their library name. Fetched as bytes (no rendering).
  const assetItems = queue.filter((item) => item.assetId != null);
  let originalsExported = 0;
  for (const [index, item] of assetItems.entries()) {
    const asset = assets.find((candidate) => candidate.id === item.assetId);
    if (!asset) {
      continue;
    }
    try {
      const response = await fetch(asset.url, { mode: "cors" });
      if (!response.ok) {
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const ext = asset.filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
      const filename = `${asset.name}.${ext}`;
      entries.push({ bytes, path: `originals/${filename}` });
      manifest.push({
        campaign,
        comp: asset.name,
        filename,
        format: "Original file",
        height: asset.height,
        platform: "originals",
        status: asset.status,
        width: asset.width,
      });
      originalsExported += 1;
    } catch {
      // Skip an original the browser can't fetch (CORS/transient); the rest
      // of the batch still exports.
    }
    reportProgress(0.95 + ((index + 1) / Math.max(1, assetItems.length)) * 0.04);
  }

  const csv = manifestCsv(manifest);
  entries.push({
    bytes: new TextEncoder().encode(csv),
    path: "manifest.csv",
  });

  const zip = createZip(entries);
  reportProgress(1);

  return {
    filename: `${dateStampNow()}_${slugify(campaign)}_export.zip`,
    manifest,
    rendered: jobs.length + originalsExported,
    skipped,
    zip,
  };
}
