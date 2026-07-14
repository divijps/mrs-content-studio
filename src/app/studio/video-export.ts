/**
 * Branded-video export: burn the comp's overlay (scrim + text + logo) onto the
 * footage without touching anything else about the clip.
 *
 * Primary path — OFFLINE TRANSCODE (mediabunny `Conversion`). This is the
 * export-engineer-correct approach when "we're only adding an overlay":
 *
 *   • VIDEO: each SOURCE frame is decoded, the overlay is composited on top,
 *     and it is re-encoded carrying THAT frame's own timestamp and duration.
 *     The output is frame-for-frame, timestamp-for-timestamp identical to the
 *     source — variable frame rate and all. No playback, so no realtime jitter
 *     leaks into the file (the old MediaRecorder capture stamped frames with
 *     wall-clock time, which is what made cadence feel "off").
 *   • AUDIO: copied through byte-for-byte (no decode, no re-encode). Besides
 *     being lossless, this is why audio finally survives on iPad — Safari's
 *     `decodeAudioData` rejects a whole video container, but a passthrough copy
 *     never decodes, so the track lands intact.
 *
 * Because there's no realtime constraint, the encode can run as fast as the
 * hardware allows and never drops or duplicates a frame.
 *
 * Fallback path — MediaRecorder realtime capture. Only used when the browser
 * can't encode H.264 via WebCodecs (very old engines). Kept so those users get
 * *something*; its audio is decoded via WebAudio and may be silent on ancient
 * iOS, but those builds don't have the WebCodecs path anyway.
 */

import { getFormat, type PlatformFormat } from "../data/formats";
import type { Asset, BrandKit } from "../data/types";
import type { StudioValues } from "./comp-layout";
import { buildExportFilename, loadCompImage } from "./export";
import { computeExportSize, VIDEO_EXPORT_MAX_LONG_EDGE } from "./export-size";

/** Output frame rate cap for the realtime FALLBACK only. The offline transcode
 * preserves the source's native cadence exactly and ignores this. */
const VIDEO_FPS_CAP = 30;

/** How long realtime playback may make zero progress before we abort. */
const STALL_TIMEOUT_MS = 8_000;

/** Playback stalled before the clip's end — an honest failure for the realtime
 * fallback (the offline transcode can't stall on playback). */
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

/** Output pixel size for the branded video: the clip's native display size
 * through the format's cover-crop, capped at the platform video ceiling and
 * never upscaled. */
function exportPixelSize(
  format: PlatformFormat,
  values: StudioValues,
  assets: readonly Asset[],
  asset: Asset,
  naturalWidth: number,
  naturalHeight: number,
): { height: number; width: number } {
  const sizedAssets = assets.map((candidate) =>
    candidate.id === asset.id
      ? { ...candidate, height: naturalHeight, width: naturalWidth }
      : candidate,
  );
  return computeExportSize(format, values, sizedAssets, VIDEO_EXPORT_MAX_LONG_EDGE);
}

/** The overlay layer — scrim + text + logo on transparent, forced full-bleed —
 * rasterized ONCE at export pixels into a plain bitmap canvas. Compositing this
 * per frame is two cheap blits; drawing the SVG-backed image directly would
 * re-rasterize the vectors on every frame. */
async function buildOverlayCanvas(
  assets: readonly Asset[],
  brand: BrandKit,
  values: StudioValues,
  pixelWidth: number,
  pixelHeight: number,
): Promise<HTMLCanvasElement> {
  const { image } = await loadCompImage({
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
  overlay.getContext("2d")?.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  return overlay;
}

/**
 * Resolve when realtime playback truly finishes: the `ended` event,
 * currentTime pinned for {@link STALL_TIMEOUT_MS}, or an absolute ceiling —
 * never a fixed wall-clock deadline (a deadline truncated long clips the moment
 * encoding lagged behind, then reported success).
 */
async function awaitPlaybackEnd(video: HTMLVideoElement, duration: number): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    let lastTime = video.currentTime;
    let lastAdvanceAt = performance.now();
    const startedAt = performance.now();
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
}

/** An encoded video blob plus the pixel size it was rendered at (for the
 * export filename). */
interface EncodedVideo {
  blob: Blob;
  height: number;
  width: number;
}

/**
 * OFFLINE TRANSCODE via mediabunny. Returns the MP4 blob, or null when this
 * browser can't decode the clip / encode H.264 (caller falls back to realtime).
 * Audio is passed through untouched; video frames are re-encoded one-to-one
 * with the overlay burned on, each carrying its source timestamp + duration.
 */
async function transcodeWithMediabunny(options: {
  asset: Asset;
  assets: readonly Asset[];
  brand: BrandKit;
  fileBlob: Blob;
  format: PlatformFormat;
  includeAudio: boolean;
  onProgress?: (fraction: number) => void;
  values: StudioValues;
}): Promise<EncodedVideo | null> {
  const { asset, assets, brand, fileBlob, format, includeAudio, onProgress, values } = options;
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    canEncodeVideo,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    VideoSample,
  } = await import("mediabunny");

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(fileBlob) });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      return null;
    }
    // Upright display dimensions (after rotation + pixel-aspect), matching what
    // a <video> element would show — the basis for the cover crop.
    const naturalWidth = videoTrack.displayWidth || asset.width || format.width;
    const naturalHeight = videoTrack.displayHeight || asset.height || format.height;
    const { height: pixelHeight, width: pixelWidth } = exportPixelSize(
      format,
      values,
      assets,
      asset,
      naturalWidth,
      naturalHeight,
    );
    const bitrate = videoBitsPerSecond(pixelWidth, pixelHeight);
    if (!(await canEncodeVideo("avc", { bitrate, height: pixelHeight, width: pixelWidth }).catch(() => false))) {
      return null;
    }

    const overlay = await buildOverlayCanvas(assets, brand, values, pixelWidth, pixelHeight);
    const crop = coverRect(
      naturalWidth,
      naturalHeight,
      pixelWidth,
      pixelHeight,
      values.imageFocalX,
      values.imageFocalY,
      values.imageZoom,
    );
    onProgress?.(0.05);

    const composite = document.createElement("canvas");
    composite.width = pixelWidth;
    composite.height = pixelHeight;
    const ctx = composite.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      audio: includeAudio ? {} : { discard: true },
      input,
      output,
      video: {
        // Rotation baked into the frames before compositing (default carries it
        // as metadata, which would rotate the burned-in overlay too, and trips
        // up some players); output is always upright.
        allowRotationMetadata: false,
        bitrate,
        codec: "avc",
        // We're compositing, so a straight copy is impossible — transcode.
        forceTranscode: true,
        keyFrameInterval: 2,
        // Cover-crop the decoded frame into the format, blit the overlay, and
        // hand back a frame stamped with the SOURCE frame's own time — cadence
        // is preserved exactly, VFR included.
        process: (sample) => {
          ctx.drawImage(
            sample.toCanvasImageSource() as CanvasImageSource,
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
          const out = new VideoSample(composite, {
            duration: sample.duration,
            timestamp: sample.timestamp,
          });
          sample.close();
          return out;
        },
        processedHeight: pixelHeight,
        processedWidth: pixelWidth,
      },
    });
    // No usable video track after setup — let the realtime path try instead.
    if (!conversion.isValid) {
      await conversion.cancel().catch(() => undefined);
      return null;
    }
    if (onProgress) {
      conversion.onProgress = (progress) => onProgress(0.05 + Math.min(0.92, progress * 0.92));
    }
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }
    onProgress?.(1);
    return { blob: new Blob([buffer], { type: "video/mp4" }), height: pixelHeight, width: pixelWidth };
  } finally {
    input.dispose();
  }
}

/**
 * MediaRecorder encoder — realtime canvas capture. Fallback for browsers
 * without WebCodecs H.264 encoding. Wall-clock frame timestamps make it
 * jitter-prone, so it's never used when the transcode path works.
 */
async function encodeWithMediaRecorder(options: {
  asset: Asset;
  assets: readonly Asset[];
  brand: BrandKit;
  fileBlob: Blob;
  format: PlatformFormat;
  includeAudio: boolean;
  mimeType: string;
  onProgress?: (fraction: number) => void;
  values: StudioValues;
}): Promise<EncodedVideo> {
  const { asset, assets, brand, fileBlob, format, includeAudio, mimeType, onProgress, values } =
    options;

  let audioContext: AudioContext | undefined;
  if (includeAudio) {
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioContext = AudioCtor ? new AudioCtor() : undefined;
      if (audioContext?.state === "suspended") {
        void audioContext.resume();
      }
    } catch {
      audioContext = undefined;
    }
  }

  const videoUrl = URL.createObjectURL(fileBlob);
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
    const { height: pixelHeight, width: pixelWidth } = exportPixelSize(
      format,
      values,
      assets,
      asset,
      naturalWidth,
      naturalHeight,
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
    const overlay = await buildOverlayCanvas(assets, brand, values, pixelWidth, pixelHeight);
    onProgress?.(0.05);

    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

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

    let audioSource: AudioBufferSourceNode | undefined;
    if (includeAudio && audioContext) {
      try {
        const audioBuffer = await audioContext.decodeAudioData(await fileBlob.arrayBuffer());
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        const destination = audioContext.createMediaStreamDestination();
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(destination);
        for (const track of destination.stream.getAudioTracks()) {
          stream.addTrack(track);
        }
      } catch {
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
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, pixelWidth, pixelHeight);
      ctx.drawImage(overlay, 0, 0);
    };
    const supportsVfc =
      typeof (video as unknown as { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback === "function";
    let rafId = 0;
    const scheduleTick = (fn: () => void): void => {
      if (supportsVfc) {
        (video as unknown as { requestVideoFrameCallback: (cb: () => void) => void })
          .requestVideoFrameCallback(fn);
      } else {
        rafId = requestAnimationFrame(fn);
      }
    };
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
        onProgress?.(0.05 + Math.min(0.9, (video.currentTime / duration) * 0.9));
      }
      if (video.ended || video.paused) return;
      scheduleTick(tick);
    };

    recorder.start(1_000);
    try {
      await video.play();
    } catch {
      // Muted inline play is essentially never refused; the stall guard turns a
      // refusal into an honest error instead of a hang.
    }
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
    await new Promise((resolve) => setTimeout(resolve, 120));
    recorder.stop();
    const blob = await recorded;

    const reachedEnd =
      video.ended || duration === 0 || video.currentTime >= duration - 0.5;
    if (!reachedEnd) {
      throw new ExportStallError(
        `Export stalled at ${Math.round(video.currentTime)}s of ${Math.round(
          duration,
        )}s — playback couldn't keep up. Close other apps or tabs and try again.`,
      );
    }
    return { blob, height: pixelHeight, width: pixelWidth };
  } finally {
    video.pause();
    video.remove();
    await audioContext?.close().catch(() => undefined);
    setTimeout(() => URL.revokeObjectURL(videoUrl), 5_000);
  }
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

  // Fetch the clip once as a same-origin blob — the transcode reads it directly
  // and, if it falls back, the realtime path plays it without canvas taint.
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Could not load the video (${response.status}).`);
  }
  const fileBlob = await response.blob();

  const finish = (
    encoded: EncodedVideo,
    extension: string,
    mimeType: string,
  ): RenderedStudioVideo => {
    onProgress?.(1);
    return {
      blob: encoded.blob,
      extension,
      filename: buildExportFilename({
        brand,
        extension,
        height: encoded.height,
        values,
        width: encoded.width,
      }),
      mimeType,
    };
  };

  // Primary: offline transcode → MP4 (exact cadence, passthrough audio). Only
  // for the MP4 target; an explicit WebM request goes straight to the recorder.
  if (preferred === "mp4") {
    try {
      const encoded = await transcodeWithMediabunny({
        asset,
        assets,
        brand,
        fileBlob,
        format,
        includeAudio,
        onProgress,
        values,
      });
      if (encoded) {
        return finish(encoded, "mp4", "video/mp4");
      }
    } catch {
      // Decode/encode/muxing failure — fall through to realtime capture.
    }
  }

  // Fallback: realtime MediaRecorder capture.
  const { extension, mimeType } = pickVideoMime(preferred);
  const encoded = await encodeWithMediaRecorder({
    asset,
    assets,
    brand,
    fileBlob,
    format,
    includeAudio,
    mimeType,
    onProgress,
    values,
  });
  return finish(encoded, extension, mimeType || encoded.blob.type);
}
