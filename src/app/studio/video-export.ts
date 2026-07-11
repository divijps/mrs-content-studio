/**
 * Branded-video export: play a video asset, cover-fit each frame into the
 * comp's format (respecting the focal point, exactly like the still crop), draw
 * the brand overlay (scrim + text + logo) on top, and record the canvas — with
 * the video's audio — to a downloadable MP4/WebM.
 *
 * The overlay is rendered once as a transparent image via the shared comp SVG
 * (`omitBackgroundImage`), so the branding matches the Studio preview pixel for
 * pixel; only the background swaps from a still poster to live frames.
 */

import { getFormat } from "../data/formats";
import type { Asset, BrandKit } from "../data/types";
import type { StudioValues } from "./comp-layout";
import { buildExportFilename, loadCompImage } from "./export";

const MIME_CANDIDATES: { extension: string; mimeType: string }[] = [
  { extension: "mp4", mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2" },
  { extension: "mp4", mimeType: "video/mp4;codecs=avc1" },
  { extension: "mp4", mimeType: "video/mp4" },
  { extension: "webm", mimeType: "video/webm;codecs=vp9,opus" },
  { extension: "webm", mimeType: "video/webm;codecs=vp8,opus" },
  { extension: "webm", mimeType: "video/webm" },
];

/** The best recording container/codec this browser supports. A preferred
 * container is tried first; the other remains the fallback. */
export function pickVideoMime(
  preferred: "mp4" | "webm" = "mp4",
): { extension: string; mimeType: string } {
  if (typeof MediaRecorder !== "undefined") {
    const ordered = [
      ...MIME_CANDIDATES.filter((candidate) => candidate.extension === preferred),
      ...MIME_CANDIDATES.filter((candidate) => candidate.extension !== preferred),
    ];
    for (const candidate of ordered) {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
        return candidate;
      }
    }
  }
  return { extension: "webm", mimeType: "" };
}

/**
 * The comp's background media when it is a video — such comps export as
 * branded videos (overlay burned onto the footage) instead of stills.
 */
export function findCompVideoAsset(
  values: StudioValues,
  assets: readonly Asset[],
): Asset | undefined {
  if (!values.imageInclude) {
    return undefined;
  }
  const asset = assets.find((candidate) => candidate.id === values.imageAssetId);
  return asset?.kind === "video" ? asset : undefined;
}

export function isVideoExportSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

/** Cover-fit source rectangle for drawImage — mirrors coverImageSvg's crop. */
function coverRect(
  naturalWidth: number,
  naturalHeight: number,
  destWidth: number,
  destHeight: number,
  focalX: number,
  focalY: number,
): { sh: number; sw: number; sx: number; sy: number } {
  const scale = Math.max(destWidth / naturalWidth, destHeight / naturalHeight);
  const sw = destWidth / scale;
  const sh = destHeight / scale;
  const sx = Math.min(Math.max(focalX * naturalWidth - sw / 2, 0), naturalWidth - sw);
  const sy = Math.min(Math.max(focalY * naturalHeight - sh / 2, 0), naturalHeight - sh);
  return { sh, sw, sx, sy };
}

export interface RenderedStudioVideo {
  blob: Blob;
  extension: string;
  filename: string;
  mimeType: string;
}

export async function renderStudioVideo(options: {
  asset: Asset;
  assets: readonly Asset[];
  brand: BrandKit;
  /** Record the clip's audio track into the export (default true). */
  includeAudio?: boolean;
  onProgress?: (fraction: number) => void;
  /** Preferred container; falls back if the browser can't encode it. */
  preferredFormat?: "mp4" | "webm";
  values: StudioValues;
}): Promise<RenderedStudioVideo> {
  const { asset, assets, brand, onProgress, values } = options;
  const includeAudio = options.includeAudio !== false;
  if (!isVideoExportSupported()) {
    throw new Error("This browser can’t record video. Try Chrome, Edge, or Safari.");
  }
  const format = getFormat(values.formatId);
  const pixelWidth = format.width;
  const pixelHeight = format.height;
  const { extension, mimeType } = pickVideoMime(options.preferredFormat ?? "mp4");
  onProgress?.(0.02);

  // 1) Overlay layer — scrim + text + logo on transparent, forced full-bleed so
  // the light-on-scrim treatment reads over the moving footage.
  const { image: overlay } = await loadCompImage({
    assets,
    brand,
    omitBackgroundImage: true,
    values: { ...values, backgroundHex: "transparent", imageBleed: true, imageInclude: true },
  });
  onProgress?.(0.05);

  // 2) Fetch the video as a same-origin blob so canvas reads never taint.
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Could not load the video (${response.status}).`);
  }
  const videoUrl = URL.createObjectURL(await response.blob());

  const video = document.createElement("video");
  video.src = videoUrl;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The video could not be decoded."));
    });
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        video.oncanplay = () => resolve();
      });
    }

    const naturalWidth = video.videoWidth || asset.width || pixelWidth;
    const naturalHeight = video.videoHeight || asset.height || pixelHeight;
    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const crop = coverRect(
      naturalWidth,
      naturalHeight,
      pixelWidth,
      pixelHeight,
      values.imageFocalX,
      values.imageFocalY,
    );

    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }
    const stream = canvas.captureStream(30);

    // Audio (best-effort, when requested): tap the element through WebAudio
    // without routing to the speakers, so the export is silent to the user but
    // carries the track.
    let audioContext: AudioContext | undefined;
    if (!includeAudio) {
      video.muted = true;
    } else {
      try {
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtor) {
          audioContext = new AudioCtor();
          const source = audioContext.createMediaElementSource(video);
          const destination = audioContext.createMediaStreamDestination();
          source.connect(destination);
          for (const track of destination.stream.getAudioTracks()) {
            stream.addTrack(track);
          }
          if (audioContext.state === "suspended") {
            await audioContext.resume();
          }
        }
      } catch {
        // No audio track, or capture not permitted — export video-only.
      }
    }

    const chunks: Blob[] = [];
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      : new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: mimeType || chunks[0]?.type || "video/webm" }));
      recorder.onerror = () => reject(new Error("Recording failed."));
    });

    const drawFrame = (): void => {
      ctx.drawImage(
        video,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        pixelWidth,
        pixelHeight,
      );
      ctx.drawImage(overlay, 0, 0, pixelWidth, pixelHeight);
    };

    const supportsVfc =
      typeof (video as unknown as { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback === "function";
    let rafId = 0;
    const scheduleTick = (fn: () => void): void => {
      if (supportsVfc) {
        (
          video as unknown as { requestVideoFrameCallback: (cb: () => void) => void }
        ).requestVideoFrameCallback(fn);
      } else {
        rafId = requestAnimationFrame(fn);
      }
    };
    const tick = (): void => {
      drawFrame();
      if (duration) {
        onProgress?.(0.05 + Math.min(0.9, (video.currentTime / duration) * 0.9));
      }
      if (video.ended || video.paused) return;
      scheduleTick(tick);
    };

    recorder.start();
    try {
      await video.play();
    } catch {
      // Either the clip ended during the play() call (very short video — fine,
      // it recorded), or autoplay-with-audio was blocked — retry muted.
      if (!video.ended) {
        video.muted = true;
        try {
          await video.play();
        } catch {
          // Give up on playback control; the watchdog below still stops cleanly.
        }
      }
    }
    drawFrame();
    scheduleTick(tick);

    // Stop when the clip ends — with a watchdog, since some encodings never
    // fire `ended` (or report no duration), so we never hang the export.
    const endGuardMs = duration > 0 ? duration * 1000 + 3000 : 60_000;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      video.onended = finish;
      setTimeout(finish, endGuardMs);
    });
    video.pause();
    drawFrame();
    cancelAnimationFrame(rafId);
    // Let the last frame settle into the stream before closing the recorder.
    await new Promise((resolve) => setTimeout(resolve, 120));
    recorder.stop();
    const blob = await recorded;
    await audioContext?.close().catch(() => undefined);
    onProgress?.(1);

    return {
      blob,
      extension,
      filename: buildExportFilename({
        brand,
        extension,
        height: pixelHeight,
        values,
        width: pixelWidth,
      }),
      mimeType: mimeType || blob.type,
    };
  } finally {
    setTimeout(() => URL.revokeObjectURL(videoUrl), 5_000);
  }
}
