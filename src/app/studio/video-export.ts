/**
 * Branded-video export: play the clip (muted), cover-fit each frame into the
 * comp's format (respecting the focal point + zoom, exactly like the still
 * crop), blit the brand overlay on top, and record the canvas — with the
 * clip's decoded audio track — to a downloadable MP4/WebM.
 *
 * The capture is real-time (canvas → MediaRecorder), so the architecture is
 * built around keeping playback smooth and never lying about the result. Each
 * guarantee below guards a failure we shipped once:
 *
 * - The overlay rasterizes ONCE into a bitmap at export size. Drawing the
 *   SVG-backed overlay image per frame re-rasterized the vectors 30×/s, which
 *   starved the encoder, dropped frames, and let playback fall behind.
 * - Output caps at {@link VIDEO_EXPORT_MAX_LONG_EDGE} (platform-native video
 *   size, never upscaled) — real-time encoding above ~1080p can't keep pace.
 * - Playback is always muted (muted inline autoplay is never blocked); audio
 *   comes from decodeAudioData → AudioBufferSourceNode, not a media-element
 *   tap. The element tap is silent on iOS WebKit, and the old muted-autoplay
 *   retry silenced it everywhere else.
 * - The export ends on the clip's `ended` event or a genuine playback stall —
 *   never a fixed wall-clock deadline. A stall before the end of the clip
 *   throws instead of passing off a truncated file as a finished export.
 */

import { getFormat } from "../data/formats";
import type { Asset, BrandKit } from "../data/types";
import type { StudioValues } from "./comp-layout";
import { buildExportFilename, loadCompImage } from "./export";
import { computeExportSize, VIDEO_EXPORT_MAX_LONG_EDGE } from "./export-size";

/** Output frame rate cap. Source clips are captured at their own cadence
 * (24/25/30fps pass through untouched) but never above this. */
const VIDEO_FPS_CAP = 30;

/** How long playback may make zero progress before we abort. Long enough to
 * ride out a decoder hiccup, short enough that a wedged export fails fast. */
const STALL_TIMEOUT_MS = 8_000;

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
  zoom = 1,
): { sh: number; sw: number; sx: number; sy: number } {
  const scale =
    Math.max(destWidth / naturalWidth, destHeight / naturalHeight) * Math.max(1, zoom);
  const sw = destWidth / scale;
  const sh = destHeight / scale;
  const sx = Math.min(Math.max(focalX * naturalWidth - sw / 2, 0), naturalWidth - sw);
  const sy = Math.min(Math.max(focalY * naturalHeight - sh / 2, 0), naturalHeight - sh);
  return { sh, sw, sx, sy };
}

/**
 * Platform-tuned encoder budget: bits scale with pixels and frame rate
 * (~0.15 bits/px/frame at 30fps) so a 9:16 story gets more than a square
 * post, floored at the old flat 8 Mbps and capped where H.264 stops gaining.
 */
export function videoBitsPerSecond(pixelWidth: number, pixelHeight: number): number {
  return Math.min(20_000_000, Math.max(8_000_000, Math.round(pixelWidth * pixelHeight * 30 * 0.15)));
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
  const { extension, mimeType } = pickVideoMime(options.preferredFormat ?? "mp4");
  onProgress?.(0.02);

  // Audio context up front, as close to the triggering click as we can get —
  // a context created after long awaits can be stuck `suspended` by autoplay
  // policy, which recorded a silent track.
  let audioContext: AudioContext | undefined;
  if (includeAudio) {
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      audioContext = AudioCtor ? new AudioCtor() : undefined;
      if (audioContext?.state === "suspended") {
        void audioContext.resume();
      }
    } catch {
      audioContext = undefined;
    }
  }

  // 1) Fetch the clip once as a same-origin blob: playback (canvas reads never
  // taint) and the audio decode both come from these bytes.
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Could not load the video (${response.status}).`);
  }
  const fileBlob = await response.blob();
  const videoUrl = URL.createObjectURL(fileBlob);

  // Muted + inline playback is never autoplay-blocked, on any engine. The
  // element lives off-screen in the DOM: detached videos may never fire
  // `loadedmetadata` on iOS WebKit.
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  video.style.cssText =
    "position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  video.src = videoUrl;
  document.body.appendChild(video);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out reading the video. Try re-importing the clip.")),
        15_000,
      );
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("The video could not be decoded."));
      };
    });
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10_000);
        video.oncanplay = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }

    const naturalWidth = video.videoWidth || asset.width || format.width;
    const naturalHeight = video.videoHeight || asset.height || format.height;
    // Output tracks the clip's native resolution through the format's crop,
    // measured from the true decoded dims, capped at the real-time-encode
    // ceiling (platform-native size; small clips still map 1:1, never up).
    const sizedAssets = assets.map((candidate) =>
      candidate.id === asset.id
        ? { ...candidate, height: naturalHeight, width: naturalWidth }
        : candidate,
    );
    const { height: pixelHeight, width: pixelWidth } = computeExportSize(
      format,
      values,
      sizedAssets,
      VIDEO_EXPORT_MAX_LONG_EDGE,
    );
    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const crop = coverRect(
      naturalWidth,
      naturalHeight,
      pixelWidth,
      pixelHeight,
      values.imageFocalX,
      values.imageFocalY,
      values.imageZoom,
    );

    // 2) Overlay layer — scrim + text + logo on transparent, forced full-bleed
    // so the light-on-scrim treatment reads over the moving footage. Rasterized
    // at export pixels, then blitted ONCE into a bitmap canvas: drawing the
    // SVG-backed image directly re-rasterizes the vectors on every frame.
    const { image: overlayImage } = await loadCompImage({
      assets,
      brand,
      omitBackgroundImage: true,
      rasterHeight: pixelHeight,
      rasterWidth: pixelWidth,
      values: { ...values, backgroundHex: "transparent", imageBleed: true, imageInclude: true },
    });
    const overlay = document.createElement("canvas");
    overlay.width = pixelWidth;
    overlay.height = pixelHeight;
    overlay.getContext("2d")?.drawImage(overlayImage, 0, 0, pixelWidth, pixelHeight);
    onProgress?.(0.05);

    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high"; // default "low" softens every frame's crop
    // Frame-accurate capture: a 0-fps stream emits a frame only when we call
    // requestFrame() — we do that once per SOURCE frame (requestVideoFrameCallback
    // pacing), so the export carries the clip's real rhythm instead of a fixed
    // 30fps resample that duplicates/drops frames. Falls back to 30fps timing
    // where requestFrame is unsupported.
    const manualStream = canvas.captureStream(0);
    const captureTrack = manualStream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    const supportsRequestFrame = typeof captureTrack?.requestFrame === "function";
    const stream = supportsRequestFrame ? manualStream : canvas.captureStream(30);
    const pushFrame = (): void => {
      if (supportsRequestFrame) {
        captureTrack!.requestFrame!();
      }
    };

    // 3) Audio (best-effort, when requested): decode the clip's audio track
    // off-line and feed a buffer source into the recording stream. Nothing is
    // routed to the speakers, and playback itself stays muted.
    let audioSource: AudioBufferSourceNode | undefined;
    if (includeAudio && audioContext) {
      try {
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        if (audioContext.state === "running") {
          const audioBuffer = await audioContext.decodeAudioData(
            await fileBlob.arrayBuffer(),
          );
          const destination = audioContext.createMediaStreamDestination();
          audioSource = audioContext.createBufferSource();
          audioSource.buffer = audioBuffer;
          audioSource.connect(destination);
          for (const track of destination.stream.getAudioTracks()) {
            stream.addTrack(track);
          }
        }
      } catch {
        // No audio track, or decode not supported — export video-only.
        audioSource = undefined;
      }
    }

    const chunks: Blob[] = [];
    const encoderOptions = {
      audioBitsPerSecond: 192_000,
      videoBitsPerSecond: videoBitsPerSecond(pixelWidth, pixelHeight),
    };
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, ...encoderOptions })
      : new MediaRecorder(stream, encoderOptions);
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
      ctx.drawImage(overlay, 0, 0);
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
    // Cap emitted frames at 30fps: emit only once ~1/30s of clip time has
    // elapsed. Slower sources (24/25fps) pass every frame through; faster ones
    // (60fps) drop to 30 — never upsampled, never above the cap.
    const minFrameGap = 1 / VIDEO_FPS_CAP - 0.002;
    let lastEmitTime = -Infinity;
    const emitFrame = (): void => {
      drawFrame();
      pushFrame();
      lastEmitTime = video.currentTime;
    };
    const tick = (): void => {
      if (video.currentTime - lastEmitTime >= minFrameGap) {
        emitFrame();
      }
      if (duration) {
        onProgress?.(0.05 + Math.min(0.9, (video.currentTime / duration) * 0.9));
      }
      if (video.ended || video.paused) return;
      scheduleTick(tick);
    };

    // Timeslice so long recordings accumulate progressively instead of one
    // giant end-of-take chunk.
    recorder.start(1_000);
    try {
      await video.play();
    } catch {
      // Muted inline play is essentially never refused; if it was, the stall
      // guard below turns it into an honest error instead of a hang.
    }
    // Align the decoded audio with wherever playback actually is right now.
    if (audioSource) {
      try {
        audioSource.start(0, video.currentTime || 0);
      } catch {
        audioSource = undefined;
      }
    }
    emitFrame();
    scheduleTick(tick);

    // 4) Run until the clip ENDS — completion is driven by playback progress,
    // never a wall-clock deadline (a deadline truncated long clips the moment
    // encoding lagged 3s behind, then reported success). The poll doubles as a
    // stall detector for encodings that never fire `ended`.
    await new Promise<void>((resolve) => {
      let settled = false;
      let lastTime = video.currentTime;
      let lastAdvanceAt = performance.now();
      const startedAt = performance.now();
      // Pure backstop against a pathological clock; stalls are caught long
      // before this. Scales with the clip so long footage is never cut off.
      const ceilingMs = duration > 0 ? duration * 2_000 + 60_000 : 600_000;
      const finish = (): void => {
        if (!settled) {
          settled = true;
          clearInterval(poll);
          resolve();
        }
      };
      const poll = setInterval(() => {
        const now = performance.now();
        if (video.currentTime > lastTime + 0.001) {
          lastTime = video.currentTime;
          lastAdvanceAt = now;
        }
        if (
          video.ended ||
          now - lastAdvanceAt >= STALL_TIMEOUT_MS ||
          now - startedAt >= ceilingMs
        ) {
          finish();
        }
      }, 250);
      video.onended = finish;
      video.onerror = finish;
    });
    video.pause();
    try {
      audioSource?.stop();
    } catch {
      // Already ended.
    }
    drawFrame();
    pushFrame();
    cancelAnimationFrame(rafId);
    // Let the last frame settle into the stream before closing the recorder.
    await new Promise((resolve) => setTimeout(resolve, 120));
    recorder.stop();
    const blob = await recorded;

    // Honesty check: if playback never reached the end of the clip, this is a
    // failed export — surface it instead of shipping a truncated file.
    const reachedEnd =
      video.ended || duration === 0 || video.currentTime >= duration - 0.5;
    if (!reachedEnd) {
      throw new Error(
        `Export stalled at ${Math.round(video.currentTime)}s of ${Math.round(
          duration,
        )}s — playback couldn't keep up. Close other apps or tabs and try again.`,
      );
    }
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
    video.pause();
    video.remove();
    await audioContext?.close().catch(() => undefined);
    setTimeout(() => URL.revokeObjectURL(videoUrl), 5_000);
  }
}
