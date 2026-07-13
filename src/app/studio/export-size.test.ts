import { describe, expect, it } from "vitest";

import type { PlatformFormat } from "../data/formats";
import type { Asset } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import {
  computeExportSize,
  EXPORT_MAX_LONG_EDGE,
  VIDEO_EXPORT_MAX_LONG_EDGE,
} from "./export-size";

/** Minimal format/asset/values fixtures — computeExportSize only reads a few fields. */
const fmt = (width: number, height: number): PlatformFormat =>
  ({ height, width } as PlatformFormat);
const asset = (width: number, height: number): Asset =>
  ({ height, id: "src", kind: "image", width } as unknown as Asset);
const withImage = (zoom = 1): StudioValues => ({
  ...STUDIO_DEFAULTS,
  imageAssetId: "src",
  imageAssetIds: [],
  imageInclude: true,
  imageZoom: zoom,
});

/** The scale the source is drawn at to fill the OUTPUT crop. >1 means the source
 * was upscaled (the thing we must never do). */
function sourceScaleAtOutput(
  out: { height: number; width: number },
  src: Asset,
  zoom = 1,
): number {
  return Math.max(out.width / src.width, out.height / src.height) * Math.max(1, zoom);
}

const FORMATS = {
  landscape: fmt(1920, 1080),
  post: fmt(1080, 1350),
  square: fmt(1080, 1080),
  story: fmt(1080, 1920),
};

describe("computeExportSize — respect the source, never upscale", () => {
  const SOURCES: Array<{ h: number; label: string; w: number }> = [
    { h: 4032, label: "phone-portrait 3024×4032", w: 3024 },
    { h: 3000, label: "dslr-landscape 4000×3000", w: 4000 },
    { h: 800, label: "small 600×800", w: 600 },
    { h: 6000, label: "huge 8000×6000", w: 8000 },
    { h: 1080, label: "exactly-1080p 1920×1080", w: 1920 },
  ];

  for (const format of Object.values(FORMATS)) {
    for (const src of SOURCES) {
      for (const zoom of [1, 1.5, 2]) {
        it(`${format.width}×${format.height} · ${src.label} · zoom ${zoom}`, () => {
          const out = computeExportSize(format, withImage(zoom), [asset(src.w, src.h)]);

          // 1) Never upscale the source (scale to fill output must be ≤ 1).
          const scale = sourceScaleAtOutput(out, asset(src.w, src.h), zoom);
          expect(scale).toBeLessThanOrEqual(1.001);

          // 2) Output aspect matches the format (within even-rounding slack).
          expect(out.width / out.height).toBeCloseTo(format.width / format.height, 1);

          // 3) Long edge never exceeds the cap; dimensions are even & positive.
          expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(EXPORT_MAX_LONG_EDGE);
          expect(out.width % 2).toBe(0);
          expect(out.height % 2).toBe(0);
          expect(out.width).toBeGreaterThan(0);

          // 4) No gratuitous downscale: when the source can fill the format
          // aspect under the cap, the source is used ~1:1 (scale ≈ 1).
          const coverLong = Math.max(
            format.width / Math.max(format.width / src.w, format.height / src.h),
            format.height / Math.max(format.width / src.w, format.height / src.h),
          );
          if (coverLong / zoom <= EXPORT_MAX_LONG_EDGE) {
            expect(scale).toBeGreaterThan(0.98);
          } else {
            // Source larger than the cap → downscaled exactly to the cap.
            expect(Math.max(out.width, out.height)).toBe(EXPORT_MAX_LONG_EDGE);
          }
        });
      }
    }
  }

  it("caps a huge source at the long-edge ceiling", () => {
    const out = computeExportSize(FORMATS.story, withImage(1), [asset(8000, 6000)]);
    expect(Math.max(out.width, out.height)).toBe(EXPORT_MAX_LONG_EDGE);
  });

  it("uses a small source at its native size (no upscale to the format)", () => {
    // 600×800 into a 1080×1350 post: cover long edge is source-limited to 750px.
    const out = computeExportSize(FORMATS.post, withImage(1), [asset(600, 800)]);
    expect(out.width).toBe(600);
    expect(out.height).toBe(750);
  });

  it("a text/solid comp (no raster source) exports at the authored format size", () => {
    const out = computeExportSize(FORMATS.post, { ...STUDIO_DEFAULTS, imageInclude: false }, []);
    expect(out.width).toBe(1080);
    expect(out.height).toBe(1350);
  });
});

describe("computeExportSize — video cap (real-time encode ceiling)", () => {
  it("caps a 4K clip in a 9:16 story at platform-native 1080×1920", () => {
    const out = computeExportSize(
      FORMATS.story,
      withImage(1),
      [asset(2160, 3840)],
      VIDEO_EXPORT_MAX_LONG_EDGE,
    );
    expect(out.width).toBe(1080);
    expect(out.height).toBe(1920);
  });

  it("caps a 4K landscape clip at 1920×1080", () => {
    const out = computeExportSize(
      FORMATS.landscape,
      withImage(1),
      [asset(3840, 2160)],
      VIDEO_EXPORT_MAX_LONG_EDGE,
    );
    expect(out.width).toBe(1920);
    expect(out.height).toBe(1080);
  });

  it("still never upscales a small clip (720p into a story stays source-native)", () => {
    // 720×1280 into 1080×1920: cover is source-limited — output maps 1:1.
    const out = computeExportSize(
      FORMATS.story,
      withImage(1),
      [asset(720, 1280)],
      VIDEO_EXPORT_MAX_LONG_EDGE,
    );
    expect(out.width).toBe(720);
    expect(out.height).toBe(1280);
    const scale = sourceScaleAtOutput(out, asset(720, 1280));
    expect(scale).toBeLessThanOrEqual(1.001);
  });
});
