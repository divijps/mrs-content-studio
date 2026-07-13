/**
 * Guaranteed poster frames for video assets used in comps.
 *
 * The comp SVG renders a video's `thumbUrl` as its background still — but that
 * poster is best-effort at import time (generation can time out on big files,
 * and older cloud rows may predate posters), in which case `thumbUrl` falls
 * back to the video file itself, which an SVG <image> cannot render. This
 * module resolves a displayable frame at use time: it verifies the stored
 * thumb actually decodes as an image, and otherwise captures a frame from the
 * video, cached per asset for the session.
 */

import * as React from "react";

import type { Asset } from "../data/types";

const posterCache = new Map<string, Promise<string>>();

/** Longest edge of a design-surface poster — full quality on a 1080+ canvas
 * (the 480px import thumb stays for Library grid tiles). */
const POSTER_MAX_EDGE = 1920;

/** True if the URL decodes as an image (data:, blob:, and http all probe fine). */
function loadsAsImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(probe.naturalWidth > 0);
    probe.onerror = () => resolve(false);
    probe.src = url;
  });
}

/** Await a media event, resolving `false` on timeout so a fussy file (iOS
 * especially) can never wedge the poster promise open forever. */
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

/** Capture a frame from the video as a WebP blob at near-native resolution.
 * timeSec 0 means "auto" (~10% in, matching the import-time capture). iOS-safe:
 * the element is attached off-screen and played muted inline to force a decode,
 * and every wait is time-boxed so the promise never hangs. */
async function captureFrame(asset: Asset, timeSec: number): Promise<Blob> {
  // Same-origin blob so canvas reads never taint on cloud (cross-origin) URLs.
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Could not load the video (${response.status}).`);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.src = objectUrl;
  video.style.cssText =
    "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);
  try {
    await waitFor(video, "loadedmetadata", 8000);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target =
      timeSec > 0
        ? Math.min(timeSec, Math.max(0, duration - 0.05))
        : Math.min(1, (duration || 2) * 0.1);
    // Nudge playback so the decoder produces a frame (iOS won't paint a paused,
    // never-played frame to canvas), then seek to the target moment.
    await Promise.race([video.play().catch(() => undefined), waitFor(video, "timeupdate", 1500)]);
    video.pause();
    video.currentTime = target;
    await waitFor(video, "seeked", 4000);
    const naturalWidth = video.videoWidth || asset.width || 1080;
    const naturalHeight = video.videoHeight || asset.height || 1080;
    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable.");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob && blob.size > 0 ? resolve(blob) : reject(new Error("Poster encoding failed.")),
        "image/webp",
        0.9,
      );
    });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  }
}

/**
 * A URL that is guaranteed to render as an image for this video asset at the
 * requested moment. timeSec 0 ("auto") prefers the stored thumb when it
 * decodes; a chosen moment always captures fresh at near-native resolution.
 * Cached per asset + moment for the session.
 */
export function getVideoPosterUrl(asset: Asset, timeSec = 0): Promise<string> {
  const key = `${asset.id}@${timeSec > 0 ? timeSec.toFixed(2) : "auto"}`;
  let cached = posterCache.get(key);
  if (!cached) {
    cached = (async () => {
      if (
        timeSec <= 0 &&
        asset.thumbUrl &&
        asset.thumbUrl !== asset.url &&
        (await loadsAsImage(asset.thumbUrl))
      ) {
        return asset.thumbUrl;
      }
      return URL.createObjectURL(await captureFrame(asset, timeSec));
    })();
    cached.catch(() => posterCache.delete(key));
    posterCache.set(key, cached);
  }
  return cached;
}

/** The poster as a data URI, for SVG-as-image export documents (which cannot
 * fetch blob: or http URLs — only data URIs render). */
export async function getVideoPosterDataUri(asset: Asset, timeSec = 0): Promise<string> {
  const url = await getVideoPosterUrl(asset, timeSec);
  if (url.startsWith("data:")) {
    return url;
  }
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Poster inlining failed."));
    reader.readAsDataURL(blob);
  });
}

/**
 * React hook: returns the asset list with every referenced video's thumbUrl
 * swapped to a guaranteed-displayable poster. Posters resolve asynchronously;
 * the hook re-renders as they land.
 */
export function useVideoPosterAssets(
  assets: readonly Asset[],
  referencedIds: readonly string[],
  /** Per-asset moment (seconds) to show — e.g. the design's chosen still. */
  posterTimes?: Record<string, number | undefined>,
): readonly Asset[] {
  const [posters, setPosters] = React.useState<Record<string, string>>({});
  const timeFor = (id: string): number => Math.max(0, posterTimes?.[id] ?? 0);
  const videoKeys = assets
    .filter((asset) => asset.kind === "video" && referencedIds.includes(asset.id))
    .map((asset) => `${asset.id}@${timeFor(asset.id).toFixed(2)}`)
    .join(",");

  React.useEffect(() => {
    let cancelled = false;
    for (const key of videoKeys.split(",").filter(Boolean)) {
      const id = key.slice(0, key.lastIndexOf("@"));
      const asset = assets.find((candidate) => candidate.id === id);
      if (!asset || posters[key]) {
        continue;
      }
      void getVideoPosterUrl(asset, timeFor(id))
        .then((url) => {
          if (!cancelled) {
            setPosters((current) =>
              current[key] === url ? current : { ...current, [key]: url },
            );
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKeys]);

  return React.useMemo(
    () =>
      assets.map((asset) => {
        if (asset.kind !== "video") {
          return asset;
        }
        const url = posters[`${asset.id}@${timeFor(asset.id).toFixed(2)}`];
        return url && url !== asset.thumbUrl ? { ...asset, thumbUrl: url } : asset;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, posters, videoKeys],
  );
}
