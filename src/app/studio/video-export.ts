/**
 * Branded-video export: play the clip (muted), cover-fit each frame into the
 * comp's format (respecting the focal point + zoom, exactly like the still
 * crop), blit the brand overlay on top, and encode to a downloadable MP4/WebM
 * with the clip's decoded audio track.
 *
 * Two encoders, chosen at runtime:
 *
 * 1. WebCodecs + mediabunny (preferred, MP4). Every frame is stamped with the
 *    clip's own MEDIA time (requestVideoFrameCallback's mediaTime), so the
 *    exported cadence is exact even when capture runs late — main-thread
 *    jitter can delay a frame's encode but can no longer wobble its timestamp.
 *    Audio is AAC-encoded from the decoded PCM, deterministically aligned at 0.
 * 2. MediaRecorder (fallback; also serves explicit WebM). Real-time canvas
 *    capture — frames carry wall-clock timestamps, so runtime jank shows up in
 *    the file. Kept for browsers without WebCodecs encoding.
 *
 * Architecture guarantees (each guards a failure we shipped once):
 * - The overlay rasterizes ONCE into a bitmap at export size. (Drawing the
 *   SVG-backed overlay image per frame re-rasterized the vectors 30×/s.)
 * - Output caps at {@link VIDEO_EXPORT_MAX_LONG_EDGE} (platform-native video
 *   size, never upscaled) — encoding above ~1080p can't keep pace.
 * - Playback is always muted (muted inline autoplay is never blocked); audio
 *   comes from decodeAudioData, not a media-element tap (silent on iOS WebKit,
 *   and the old muted-autoplay retry silenced it everywhere else).
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

/** Playback stalled before the clip's end — an honest failure. Never retried
 * on the fallback encoder: the stall is in playback, not the encoder. */
class ExportStallError extends Error {}

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

type VfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback: (
    callback: (now: number, metadata: { mediaTime: number }) => void,
  ) => number;
};

function supportsVideoFrameCallback(video: HTMLVideoElement): video is VfcVideo {
  return typeof (video as VfcVideo).requestVideoFrameCallback === "function";
}

/**
 * Resolve when playback truly finishes: the `ended` event, currentTime pinned
 * for {@link STALL_TIMEOUT_MS} (some encodings never fire `ended`), or an
 * absolute ceiling against pathological clocks — never a fixed wall-clock
 * deadline (a deadline truncated long clips the moment encoding lagged behind,
 * then reported success). `isBusy` marks intentional pauses (encoder
 * backpressure) that must not count as stalls.
 */
async function awaitPlaybackEnd(
  video: HTMLVideoElement,
  duration: number,
  isBusy?: () => boolean,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    let lastTime = video.currentTime;
    let lastAdvanceAt = performance.now();
    const startedAt = performance.now();
    // Scales with the clip so long footage is never cut off.
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
      if (video.currentTime > lastTime + 0.001 || isBusy?.()) {
        lastTime = Math.max(lastTime, video.currentTime);
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
}

/** Honesty check: playback must have reached the clip's end, else the export
 * is a failure to surface — never a truncated file passed off as success. */
function assertReachedEnd(video: HTMLVideoElement, duration: number): void {
  const reachedEnd =
    video.ended || duration === 0 || video.currentTime >= duration - 0.5;
  if (!reachedEnd) {
    throw new ExportStallError(
      `Export stalled at ${Math.round(video.currentTime)}s of ${Math.round(
        duration,
      )}s — playback couldn't keep up. Close other apps or tabs and try again.`,
    );
  }
}

interface EncodePipe {
  audioBuffer?: AudioBuffer;
  /** Live WebAudio context (fallback path routes its buffer source through it). */
  audioContext?: AudioContext;
  crop: { sh: number; sw: number; sx: number; sy: number };
  duration: number;
  onProgress?: (fraction: number) => void;
  overlay: HTMLCanvasElement;
  pixelHeight: number;
  pixelWidth: number;
  video: HTMLVideoElement;
}

function makeComposer(
  pipe: EncodePipe,
): { canvas: HTMLCanvasElement; drawFrame: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = pipe.pixelWidth;
  canvas.height = pipe.pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high"; // default "low" softens every frame's crop
  const drawFrame = (): void => {
    ctx.drawImage(
      pipe.video,
      pipe.crop.sx,
      pipe.crop.sy,
      pipe.crop.sw,
      pipe.crop.sh,
      0,
      0,
      pipe.pixelWidth,
      pipe.pixelHeight,
    );
    ctx.drawImage(pipe.overlay, 0, 0);
  };
  return { canvas, drawFrame };
}

/**
 * WebCodecs encoder (MP4 via mediabunny). Frames are stamped with the clip's
 * MEDIA time, so exported cadence is exact regardless of main-thread jitter —
 * the fix for "wall-clock timestamps wobble when capture runs late", which is
 * inherent to the MediaRecorder path. Returns null when this browser can't
 * encode H.264 (or AAC while audio is wanted); the caller then falls back.
 */
async function encodeWithWebCodecs(pipe: EncodePipe): Promise<Blob | null> {
  const { duration, video } = pipe;
  if (!supportsVideoFrameCallback(video)) {
    return null;
  }
  const { AudioBufferSource, BufferTarget, canEncodeAudio, canEncodeVideo, CanvasSource, Mp4OutputFormat, Output } =
    await import("mediabunny");

  const bitrate = videoBitsPerSecond(pipe.pixelWidth, pipe.pixelHeight);
  const videoOk = await canEncodeVideo("avc", {
    bitrate,
    height: pipe.pixelHeight,
    width: pipe.pixelWidth,
  }).catch(() => false);
  if (!videoOk) {
    return null;
  }
  if (pipe.audioBuffer) {
    const audioOk = await canEncodeAudio("aac", {
      bitrate: 192_000,
      numberOfChannels: pipe.audioBuffer.numberOfChannels,
      sampleRate: pipe.audioBuffer.sampleRate,
    }).catch(() => false);
    // Audio is wanted but can't be carried here — the MediaRecorder path can,
    // so keep the sound rather than shipping a silent MP4.
    if (!audioOk) {
      return null;
    }
  }

  const { canvas, drawFrame } = makeComposer(pipe);
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    bitrate,
    codec: "avc",
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource);
  const audioSource = pipe.audioBuffer
    ? new AudioBufferSource({ bitrate: 192_000, codec: "aac" })
    : undefined;
  if (audioSource) {
    output.addAudioTrack(audioSource);
  }
  await output.start();

  try {
    // Audio first: pure compute over the decoded PCM, aligned at timestamp 0
    // exactly like the first video frame.
    if (audioSource && pipe.audioBuffer) {
      await audioSource.add(pipe.audioBuffer);
      audioSource.close();
    }

    // Video: play muted; per presented frame, compose and encode stamped with
    // that frame's media time. Backpressure pauses playback instead of
    // dropping or mis-stamping frames.
    let encodeError: Error | null = null;
    let pending = 0;
    let pausedForPressure = false;
    // 30fps cap, anchored to TIMELINE SLOTS: a frame emits when it lands in a
    // new 1/30s slot (round(T/slot)). Sources at/below the cap pass through
    // completely even when their timestamps wobble around the nominal cadence
    // (a "last emit + minimum gap" gate dropped jittery frames and left
    // 2-slot holes); faster sources thin evenly — one frame per slot, never
    // above the cap.
    const slot = 1 / VIDEO_FPS_CAP;
    let lastSlot = -1;
    const emit = (mediaTime: number): void => {
      drawFrame();
      pending += 1;
      videoSource
        .add(mediaTime)
        .catch((error: Error) => {
          encodeError = error;
        })
        .finally(() => {
          pending -= 1;
          if (pausedForPressure && pending <= 8 && !video.ended) {
            pausedForPressure = false;
            void video.play();
          }
        });
      lastSlot = Math.round(mediaTime / slot);
      if (pending > 45 && !video.paused) {
        pausedForPressure = true;
        video.pause();
      }
    };
    const tick = (_now: number, metadata?: { mediaTime: number }): void => {
      if (encodeError) return;
      const mediaTime = metadata?.mediaTime ?? video.currentTime;
      if (Math.round(mediaTime / slot) > lastSlot) {
        emit(mediaTime);
      }
      if (duration) {
        pipe.onProgress?.(0.05 + Math.min(0.9, (mediaTime / duration) * 0.9));
      }
      if (!video.ended) {
        video.requestVideoFrameCallback(tick);
      }
    };

    emit(video.currentTime || 0);
    try {
      await video.play();
    } catch {
      // Muted inline play is essentially never refused; the stall guard turns
      // a refusal into an honest error instead of a hang.
    }
    video.requestVideoFrameCallback(tick);
    await awaitPlaybackEnd(video, duration, () => pausedForPressure);
    video.pause();

    if (encodeError) throw encodeError;
    assertReachedEnd(video, duration);

    // Drain in-flight encodes, then finalize the file.
    const drainStart = performance.now();
    while (pending > 0 && !encodeError && performance.now() - drainStart < 30_000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (encodeError) throw encodeError;
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error("Video encoding produced no data.");
    }
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state === "started") {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  }
}

/**
 * MediaRecorder encoder — real-time canvas capture. Wall-clock frame
 * timestamps make it jitter-prone, so it only serves browsers without
 * WebCodecs encoding and explicit WebM exports.
 */
async function encodeWithMediaRecorder(
  pipe: EncodePipe,
  mimeType: string,
): Promise<Blob> {
  const { duration, video } = pipe;
  const { canvas, drawFrame } = makeComposer(pipe);

  // Frame-accurate capture: a 0-fps stream emits a frame only when we call
  // requestFrame() — once per SOURCE frame (requestVideoFrameCallback pacing),
  // so the export carries the clip's real rhythm instead of a fixed 30fps
  // resample. Falls back to 30fps timing where requestFrame is unsupported.
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

  // Audio (best-effort): feed the decoded PCM through a buffer source into the
  // recording stream. Nothing routes to the speakers; playback stays muted.
  let audioSource: AudioBufferSourceNode | undefined;
  if (pipe.audioBuffer && pipe.audioContext) {
    try {
      if (pipe.audioContext.state === "suspended") {
        await pipe.audioContext.resume();
      }
      if (pipe.audioContext.state === "running") {
        const destination = pipe.audioContext.createMediaStreamDestination();
        audioSource = pipe.audioContext.createBufferSource();
        audioSource.buffer = pipe.audioBuffer;
        audioSource.connect(destination);
        for (const track of destination.stream.getAudioTracks()) {
          stream.addTrack(track);
        }
      }
    } catch {
      audioSource = undefined;
    }
  }

  const chunks: Blob[] = [];
  const encoderOptions = {
    audioBitsPerSecond: 192_000,
    videoBitsPerSecond: videoBitsPerSecond(pipe.pixelWidth, pipe.pixelHeight),
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

  const supportsVfc = supportsVideoFrameCallback(video);
  let rafId = 0;
  const scheduleTick = (fn: () => void): void => {
    if (supportsVfc) {
      video.requestVideoFrameCallback(fn);
    } else {
      rafId = requestAnimationFrame(fn);
    }
  };
  // 30fps cap anchored to timeline slots (see the WebCodecs path): sources
  // at/below the cap pass through completely even with jittery timestamps;
  // faster ones thin evenly to one frame per slot.
  const slot = 1 / VIDEO_FPS_CAP;
  let lastSlot = -1;
  const emitFrame = (): void => {
    drawFrame();
    pushFrame();
    lastSlot = Math.round(video.currentTime / slot);
  };
  const tick = (): void => {
    if (Math.round(video.currentTime / slot) > lastSlot) {
      emitFrame();
    }
    if (duration) {
      pipe.onProgress?.(0.05 + Math.min(0.9, (video.currentTime / duration) * 0.9));
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

  await awaitPlaybackEnd(video, duration);
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
  assertReachedEnd(video, duration);
  return blob;
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
  const preferred = options.preferredFormat ?? "mp4";
  if (!isVideoExportSupported()) {
    throw new Error("This browser can’t record video. Try Chrome, Edge, or Safari.");
  }
  const format = getFormat(values.formatId);
  onProgress?.(0.02);

  // Audio context up front, as close to the triggering click as we can get —
  // a context created after long awaits can be stuck `suspended` by autoplay
  // policy, which recorded a silent track on the MediaRecorder path. (Decoding
  // works even suspended.)
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

  // Fetch the clip once as a same-origin blob: playback (canvas reads never
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
    // measured from the true decoded dims, capped at the encode ceiling
    // (platform-native size; small clips still map 1:1, never up).
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

    // Overlay layer — scrim + text + logo on transparent, forced full-bleed so
    // the light-on-scrim treatment reads over the moving footage. Rasterized
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

    // Decode the clip's audio ONCE — both encoders consume the same PCM.
    let audioBuffer: AudioBuffer | undefined;
    if (includeAudio && audioContext) {
      try {
        audioBuffer = await audioContext.decodeAudioData(await fileBlob.arrayBuffer());
      } catch {
        // No audio track, or decode not supported — export video-only.
        audioBuffer = undefined;
      }
    }

    const pipe: EncodePipe = {
      audioBuffer,
      audioContext,
      crop,
      duration,
      onProgress,
      overlay,
      pixelHeight,
      pixelWidth,
      video,
    };
    const finish = (blob: Blob, extension: string, mimeType: string): RenderedStudioVideo => {
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
        mimeType,
      };
    };

    // Path 1 — WebCodecs (media-time timestamps → exact frame cadence).
    if (preferred === "mp4") {
      try {
        const blob = await encodeWithWebCodecs(pipe);
        if (blob) {
          return finish(blob, "mp4", "video/mp4");
        }
      } catch (error) {
        // A playback stall would stall the realtime path too — surface it.
        if (error instanceof ExportStallError) {
          throw error;
        }
        // Encoder rejected mid-flight — rewind and use the recorder path.
        video.pause();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 2_000);
          video.onseeked = () => {
            clearTimeout(timer);
            resolve();
          };
          video.currentTime = 0;
        });
      }
    }

    // Path 2 — MediaRecorder (realtime capture; also serves explicit WebM).
    const { extension, mimeType } = pickVideoMime(preferred);
    const blob = await encodeWithMediaRecorder(pipe, mimeType);
    return finish(blob, extension, mimeType || blob.type);
  } finally {
    video.pause();
    video.remove();
    await audioContext?.close().catch(() => undefined);
    setTimeout(() => URL.revokeObjectURL(videoUrl), 5_000);
  }
}
