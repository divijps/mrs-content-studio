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
    const { height, width } = exportPixelSize(job.format, quality);
    const includeBackground = true;

    const canvas = await renderCompCanvas({
      assets,
      background: values.backgroundHex,
      brand,
      includeBackground,
      pixelHeight: height,
      pixelWidth: width,
      values,
    });

    const quantity =
      quality === "highest" ? 0.95 : job.format.encoding === "jpeg" ? job.format.jpegQuality : 0.9;
    const mime = ENCODING_MIME[job.format.encoding];
    const blob = await encodeCanvas(
      canvas,
      mime,
      job.format.encoding === "png" ? undefined : quantity,
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // The version key is the fully-resolved name with index fixed at 1, so any
    // two jobs that would collide on disk share a counter and get v1, v2, …
    const ext = ENCODING_EXT[job.format.encoding];
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
      format: `${job.format.platformLabel} ${job.format.label}`,
      height,
      platform: job.format.platform,
      status: job.comp.status,
      width,
    });

    reportProgress((index + 1) / Math.max(1, jobs.length) * 0.95);
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
    rendered: jobs.length,
    skipped,
    zip,
  };
}
