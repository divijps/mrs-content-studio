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

/** True if the URL decodes as an image (data:, blob:, and http all probe fine). */
function loadsAsImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(probe.naturalWidth > 0);
    probe.onerror = () => resolve(false);
    probe.src = url;
  });
}

/** Capture a representative frame (~10% in) from the video as a WebP blob. */
async function captureFrame(asset: Asset): Promise<Blob> {
  // Same-origin blob so canvas reads never taint on cloud (cross-origin) URLs.
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Could not load the video (${response.status}).`);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The video could not be decoded."));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(1, (duration || 2) * 0.1);
      // A stubborn file still yields whatever frame is current.
      setTimeout(resolve, 4000);
    });
    const width = video.videoWidth || asset.width || 1080;
    const height = video.videoHeight || asset.height || 1080;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable.");
    }
    context.drawImage(video, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Poster encoding failed."))),
        "image/webp",
        0.85,
      );
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  }
}

/**
 * A URL that is guaranteed to render as an image for this video asset — the
 * stored thumb when it decodes, else a freshly captured frame (cached).
 */
export function getVideoPosterUrl(asset: Asset): Promise<string> {
  let cached = posterCache.get(asset.id);
  if (!cached) {
    cached = (async () => {
      if (asset.thumbUrl && asset.thumbUrl !== asset.url && (await loadsAsImage(asset.thumbUrl))) {
        return asset.thumbUrl;
      }
      return URL.createObjectURL(await captureFrame(asset));
    })();
    cached.catch(() => posterCache.delete(asset.id));
    posterCache.set(asset.id, cached);
  }
  return cached;
}

/** The poster as a data URI, for SVG-as-image export documents (which cannot
 * fetch blob: or http URLs — only data URIs render). */
export async function getVideoPosterDataUri(asset: Asset): Promise<string> {
  const url = await getVideoPosterUrl(asset);
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
): readonly Asset[] {
  const [posters, setPosters] = React.useState<Record<string, string>>({});
  const videoIds = assets
    .filter((asset) => asset.kind === "video" && referencedIds.includes(asset.id))
    .map((asset) => asset.id)
    .join(",");

  React.useEffect(() => {
    let cancelled = false;
    for (const id of videoIds.split(",").filter(Boolean)) {
      const asset = assets.find((candidate) => candidate.id === id);
      if (!asset || posters[id]) {
        continue;
      }
      void getVideoPosterUrl(asset)
        .then((url) => {
          if (!cancelled) {
            setPosters((current) => (current[id] === url ? current : { ...current, [id]: url }));
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoIds]);

  return React.useMemo(
    () =>
      assets.map((asset) =>
        asset.kind === "video" && posters[asset.id] && posters[asset.id] !== asset.thumbUrl
          ? { ...asset, thumbUrl: posters[asset.id]! }
          : asset,
      ),
    [assets, posters],
  );
}
