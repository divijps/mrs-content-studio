/**
 * Image import: reads picked/dropped files, measures them, dedupes by content,
 * and renames to the brand convention. Originals are never modified — the
 * file bytes become an object URL the app reads from.
 */

import { createId } from "./project-store";
import type { Asset, AssetKind, ProjectSnapshot } from "./types";

const IMAGE_TYPES = /^image\/(jpeg|png|webp|avif|gif)$/;
const VIDEO_TYPES = /^video\/(mp4|quicktime|webm|ogg)$/;
const HEIC_EXT = /\.(heic|heif)s?$/i;

/**
 * iPhone photos are HEIC/HEIF. The MIME is often "image/heic" — or empty, since
 * many browsers don't recognize the type — so we also sniff the extension.
 */
function isHeic(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.type === "image/heic-sequence" ||
    file.type === "image/heif-sequence" ||
    (file.type === "" && HEIC_EXT.test(file.name))
  );
}

/**
 * Decode a HEIC/HEIF file to a JPEG File. Only Safari can render HEIC in an
 * <img>/canvas, so we transcode at import time (libheif via heic2any, loaded
 * lazily so the ~1.5MB wasm stays out of the initial bundle) — the whole app,
 * exports included, then works with a universally-renderable JPEG.
 */
async function heicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, quality: 0.92, toType: "image/jpeg" });
  const blob = Array.isArray(converted) ? converted[0]! : converted;
  const base = file.name.replace(HEIC_EXT, "");
  const name = /\.jpe?g$/i.test(base) ? base : `${base || "image"}.jpg`;
  return new File([blob], name, { lastModified: file.lastModified, type: "image/jpeg" });
}

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

interface ReadMedia {
  durationSec?: number;
  height: number;
  kind: AssetKind;
  /** Poster blob for videos (uploaded as the cloud thumbnail). */
  posterBlob?: Blob;
  thumbUrl: string;
  /** The file whose bytes back this asset — differs from the picked file when a
   * HEIC was transcoded to JPEG. The cloud backend uploads this, not the raw
   * original, so every viewer gets a renderable image. */
  uploadFile?: File;
  url: string;
  width: number;
}

async function readImage(file: File, url: string): Promise<ReadMedia | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Could not read ${file.name}`));
    element.src = url;
  });
  const thumbUrl = (await makeThumb(image)) ?? url;
  return {
    height: image.naturalHeight,
    kind: "image",
    thumbUrl,
    url,
    width: image.naturalWidth,
  };
}

/** Await a media element event, resolving `false` on timeout so a fussy or
 * slow file can never hang the importer (the "video import spins forever"
 * trap on iOS, where a detached/non-inline <video> may never fire an event). */
function waitFor(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      el.removeEventListener(event, onEvent);
      resolve(ok);
    };
    const onEvent = (): void => finish(true);
    el.addEventListener(event, onEvent, { once: true });
    setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Grab a representative frame + duration/dimensions from a video. iOS Safari is
 * fussy: a detached, non-inline <video> often never fires metadata and won't
 * paint a frame to canvas until it has actually played. So we attach it
 * off-screen, play it muted inline to force a decode, and time-box every wait —
 * the import can never hang and the video always imports, even if the still
 * can't be grabbed (the grid then falls back to a live first-frame).
 */
async function readVideo(file: File, url: string): Promise<ReadMedia | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.src = url;
  video.style.cssText =
    "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);

  try {
    await waitFor(video, "loadedmetadata", 8000);
    const w = video.videoWidth || 1080;
    const h = video.videoHeight || 1080;
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;

    let thumbUrl = url;
    let posterBlob: Blob | undefined;
    try {
      // Nudge playback so the decoder spins up (iOS won't paint a paused,
      // never-played frame to canvas), then seek to the poster moment.
      await Promise.race([video.play().catch(() => undefined), waitFor(video, "timeupdate", 1500)]);
      video.pause();
      video.currentTime = Math.min(1, (durationSec || 2) * 0.1);
      await waitFor(video, "seeked", 1500);
      const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", 0.82);
        });
        if (blob && blob.size > 0) {
          posterBlob = blob;
          thumbUrl = URL.createObjectURL(blob);
        }
      }
    } catch {
      // Poster capture failed — the grid renders the video's own first frame.
    }
    return { durationSec, height: h, kind: "video", posterBlob, thumbUrl, url, width: w };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}

async function readMedia(file: File): Promise<ReadMedia | null> {
  const heic = isHeic(file);
  const isVideo = VIDEO_TYPES.test(file.type);
  const isImage = heic || IMAGE_TYPES.test(file.type);
  if (!isImage && !isVideo) {
    return null;
  }
  // Transcode HEIC/HEIF to JPEG up front so the rest of the pipeline (decode,
  // thumbnail, display, upload, export) works on a universally-renderable file.
  let workingFile = file;
  if (heic) {
    try {
      workingFile = await heicToJpeg(file);
    } catch {
      return null; // undecodable HEIC → skipped, counted in the import summary
    }
  }
  const url = URL.createObjectURL(workingFile);
  try {
    const read = isVideo ? await readVideo(workingFile, url) : await readImage(workingFile, url);
    return read ? { ...read, uploadFile: workingFile } : null;
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
  /** Video poster blob per asset id — uploaded as the cloud thumbnail. */
  posters: Map<string, Blob>;
  skipped: number;
  /** Source File per created asset id — the cloud backend uploads from these. */
  sources: Map<string, File>;
}

/**
 * Import a batch of files into a target collection, renaming to
 * `{date}_{campaign}_{###}` and skipping content already present.
 */
export async function importFiles(options: {
  /** Display name stamped on each asset as its "Added by" attribution. */
  addedBy?: string | null;
  collectionId: string | null;
  collectionName: string;
  existing: ProjectSnapshot["assets"];
  files: File[];
  /** Explicit dedupe fingerprint per file (parallel to `files`). Studio exports
   * pass a stable design-state key so an unchanged re-save is recognized; when
   * absent the content fingerprint (name:size:lastModified) is used. */
  fingerprints?: string[];
  now?: Date;
  /** Called after each file so big batches can show live progress. */
  onProgress?: (processed: number, total: number) => void;
  /** Studio design snapshot stamped on every imported asset, so a Studio-made
   * export can be reopened with "Edit in Studio". */
  sourceValues?: Record<string, unknown>;
}): Promise<ImportResult> {
  const { addedBy, collectionId, collectionName, existing, files, onProgress } = options;
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
  const posters = new Map<string, Blob>();
  let duplicates = 0;
  let skipped = 0;
  let processed = 0;

  for (const [index, file] of files.entries()) {
    processed += 1;
    onProgress?.(processed, files.length);
    const print = options.fingerprints?.[index] ?? fingerprint(file);
    if (seenPrints.has(print)) {
      duplicates += 1;
      continue;
    }
    const read = await readMedia(file);
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
    // Upload the file that actually backs the asset — the transcoded JPEG for a
    // HEIC import, the original otherwise — so the cloud copy is renderable.
    const source = read.uploadFile ?? file;
    sources.set(id, source);
    if (read.posterBlob) {
      posters.set(id, read.posterBlob);
    }
    assets.push({
      addedBy: addedBy ?? null,
      collectionId,
      comments: [],
      createdAt: iso,
      durationSec: read.durationSec,
      favoritedBy: [],
      filename: source.name,
      focalPoint: { x: 0.5, y: 0.4 },
      height: read.height,
      id,
      importFingerprint: print,
      kind: read.kind,
      name,
      sizeBytes: source.size,
      sourceValues: options.sourceValues,
      status: "draft",
      tags: [],
      thumbUrl: read.thumbUrl,
      updatedAt: iso,
      url: read.url,
      width: read.width,
    });
  }

  return { assets, duplicates, posters, skipped, sources };
}
