/**
 * Image import: reads picked/dropped files, measures them, dedupes by content,
 * and renames to the brand convention. Originals are never modified — the
 * file bytes become an object URL the app reads from.
 */

import { createId } from "./project-store";
import type { Asset, ProjectSnapshot } from "./types";

const IMAGE_TYPES = /^image\/(jpeg|png|webp|avif|gif)$/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** YYYYMMDD from an ISO-ish date, local time. */
function dateStamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
}

/** Slugify a campaign/collection name for filenames. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "import"
  );
}

/** Longest edge for grid/picker thumbnails. Keeps big batches decodable. */
const THUMB_MAX_EDGE = 480;

/**
 * Downscale a decoded image to a small object URL. Grids and pickers render
 * dozens of these at once — full-resolution camera files there decode to
 * hundreds of MB of bitmaps and crash the tab.
 */
async function makeThumb(image: HTMLImageElement): Promise<string | null> {
  const scale = Math.min(
    1,
    THUMB_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  if (scale >= 1) {
    return null; // already small — the original is its own thumb
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    // Browsers without webp encoding silently fall back to png — also fine.
    canvas.toBlob(resolve, "image/webp", 0.82);
  });
  return blob ? URL.createObjectURL(blob) : null;
}

async function readImage(file: File): Promise<{
  height: number;
  thumbUrl: string;
  url: string;
  width: number;
} | null> {
  if (!IMAGE_TYPES.test(file.type)) {
    return null;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read ${file.name}`));
      element.src = url;
    });
    const thumbUrl = (await makeThumb(image)) ?? url;
    return { height: image.naturalHeight, thumbUrl, url, width: image.naturalWidth };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** Cheap content fingerprint for dedupe: size + name + last-modified. */
function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export interface ImportResult {
  assets: Asset[];
  duplicates: number;
  skipped: number;
  /** Source File per created asset id — the cloud backend uploads from these. */
  sources: Map<string, File>;
}

/**
 * Import a batch of files into a target collection, renaming to
 * `{date}_{campaign}_{###}` and skipping content already present.
 */
export async function importFiles(options: {
  collectionId: string | null;
  collectionName: string;
  existing: ProjectSnapshot["assets"];
  files: File[];
  now?: Date;
  /** Called after each file so big batches can show live progress. */
  onProgress?: (processed: number, total: number) => void;
}): Promise<ImportResult> {
  const { collectionId, collectionName, existing, files, onProgress } = options;
  const now = options.now ?? new Date();
  const stamp = dateStamp(now);
  const campaign = slug(collectionName);

  const seen = new Set(existing.map((asset) => asset.name));
  const seenPrints = new Set(
    existing
      .map((asset) => asset.importFingerprint)
      .filter((print): print is string => Boolean(print)),
  );

  // Continue numbering after any existing asset that shares this prefix.
  const prefix = `${stamp}_${campaign}_`;
  let counter = existing.reduce((max, asset) => {
    if (!asset.name.startsWith(prefix)) {
      return max;
    }
    const suffix = Number(asset.name.slice(prefix.length));
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);

  const assets: Asset[] = [];
  const sources = new Map<string, File>();
  let duplicates = 0;
  let skipped = 0;
  let processed = 0;

  for (const file of files) {
    processed += 1;
    onProgress?.(processed, files.length);
    const print = fingerprint(file);
    if (seenPrints.has(print)) {
      duplicates += 1;
      continue;
    }
    const read = await readImage(file);
    if (!read) {
      skipped += 1;
      continue;
    }
    seenPrints.add(print);
    counter += 1;
    let name = `${prefix}${pad(counter, 3)}`;
    while (seen.has(name)) {
      counter += 1;
      name = `${prefix}${pad(counter, 3)}`;
    }
    seen.add(name);

    const iso = now.toISOString();
    const id = createId("asset");
    sources.set(id, file);
    assets.push({
      collectionId,
      comments: [],
      createdAt: iso,
      favorite: false,
      filename: file.name,
      focalPoint: { x: 0.5, y: 0.4 },
      height: read.height,
      id,
      importFingerprint: print,
      name,
      sizeBytes: file.size,
      status: "draft",
      tags: [],
      thumbUrl: read.thumbUrl,
      updatedAt: iso,
      url: read.url,
      width: read.width,
    });
  }

  return { assets, duplicates, skipped, sources };
}
