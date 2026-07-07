/**
 * Export pipeline: comp HTML → SVG foreignObject → rasterized canvas → file.
 *
 * The same HTML that drives the live preview is serialized into an SVG with the
 * brand fonts embedded as data URIs, so exported pixels carry the exact Romie
 * swashes and wrapping seen on canvas.
 */

import onsiteUrl from "../../../brand/fonts/Onsite/OnsiteStandard-Regular.woff2";
import reworkUrl from "../../../brand/fonts/Rework/ReworkMicro-Semibold.woff2";
import romieItalicUrl from "../../../brand/fonts/Romie/Romie-Italic.woff2";
import romieRegularUrl from "../../../brand/fonts/Romie/Romie-Regular.woff2";

import { createToolcraftPngExportCanvas } from "@/toolcraft/runtime";
import type { ToolcraftState } from "@/toolcraft/runtime";

import { getFormat } from "../data/formats";
import type { Asset, BrandKit } from "../data/types";
import { readStudioValues, type StudioValues } from "./comp-layout";
import { buildCompSvg } from "./comp-svg";

const FONT_SOURCES = [
  { style: "normal", family: "Romie", url: romieRegularUrl, weight: 400 },
  { style: "italic", family: "Romie", url: romieItalicUrl, weight: 400 },
  { style: "normal", family: "Rework Micro", url: reworkUrl, weight: 600 },
  { style: "normal", family: "Onsite Standard", url: onsiteUrl, weight: 400 },
] as const;

let fontFaceCssPromise: Promise<string> | null = null;
const dataUriCache = new Map<string, Promise<string>>();

async function fetchAsDataUri(url: string, mimeOverride?: string): Promise<string> {
  if (url.startsWith("data:")) {
    return url;
  }
  let cached = dataUriCache.get(url);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Fetching a resource failed (${response.status}).`);
      }
      const blob = await response.blob();
      const typed = mimeOverride ? blob.slice(0, blob.size, mimeOverride) : blob;
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Failed to inline resource: ${url}`));
        reader.readAsDataURL(typed);
      });
    })();
    // Don't cache failures — a retry after a transient error should refetch.
    cached.catch(() => dataUriCache.delete(url));
    dataUriCache.set(url, cached);
  }
  return cached;
}

function toDataUri(url: string): Promise<string> {
  return fetchAsDataUri(url, "font/woff2");
}

/** Brand @font-face CSS with fonts inlined as data URIs. Cached per session. */
export function getBrandFontFaceCss(): Promise<string> {
  if (!fontFaceCssPromise) {
    fontFaceCssPromise = Promise.all(
      FONT_SOURCES.map(async (font) => {
        const dataUri = await toDataUri(font.url);
        return (
          `@font-face{font-family:'${font.family}';font-style:${font.style};` +
          `font-weight:${font.weight};src:url('${dataUri}') format('woff2');}`
        );
      }),
    ).then((faces) => faces.join(""));
  }
  return fontFaceCssPromise;
}

export interface CompBitmapOptions {
  assets: readonly Asset[];
  brand: BrandKit;
  values: StudioValues;
}

/** Every asset id mentioned anywhere in the comp's values (covers single image,
 * collage arrays, and any future asset-referencing field). */
function collectReferencedAssetIds(values: StudioValues): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      ids.add(value);
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
    } else if (value && typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  visit(values);
  return ids;
}

/**
 * Inline the subresources the comp actually uses (its photos + logos) as data
 * URIs. SVG-as-image documents may not reference network resources — a single
 * http(s) URL taints the canvas. Only referenced images are fetched: inlining
 * the whole library pulled every full-res original (and entire video files)
 * over the network before the first pixel rendered, which froze exports at 0%
 * on real cloud libraries.
 */
async function inlineResources(options: CompBitmapOptions): Promise<CompBitmapOptions> {
  const referenced = collectReferencedAssetIds(options.values);
  const assets = await Promise.all(
    options.assets.map(async (asset) => {
      // Videos are never composited into comps; unreferenced assets never
      // appear in the SVG. Neither needs (or should pay for) inlining.
      if (asset.kind === "video" || !referenced.has(asset.id)) {
        return asset;
      }
      return { ...asset, url: await fetchAsDataUri(asset.url) };
    }),
  );
  const logos = await Promise.all(
    options.brand.logos.map(async (logo) => ({
      ...logo,
      url: await fetchAsDataUri(logo.url),
    })),
  );
  return { ...options, assets, brand: { ...options.brand, logos } };
}

/** Rasterize the comp into an Image backed by a pure-SVG document (no foreignObject). */
export async function loadCompImage(rawOptions: CompBitmapOptions): Promise<{
  height: number;
  image: HTMLImageElement;
  width: number;
}> {
  const options = await inlineResources(rawOptions);
  const format = getFormat(options.values.formatId);
  const fontFaceCss = await getBrandFontFaceCss();
  const { svg } = buildCompSvg({
    assets: options.assets,
    brand: options.brand,
    fontFaceCss,
    format,
    values: options.values,
  });

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Comp rasterization failed to load."));
    });
    // Fonts inside SVG images need a settle tick in some engines.
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { height: format.height, image, width: format.width };
  } finally {
    // Revoke after the current task so pending decode can finish.
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

/**
 * Rasterize a comp to a canvas at an explicit pixel size. Shared by the Studio
 * single export and the Queue batch pipeline so both produce identical pixels.
 */
export async function renderCompCanvas(options: {
  assets: readonly Asset[];
  background: string;
  brand: BrandKit;
  includeBackground: boolean;
  pixelHeight: number;
  pixelWidth: number;
  values: StudioValues;
}): Promise<HTMLCanvasElement> {
  const { image } = await loadCompImage({
    assets: options.assets,
    brand: options.brand,
    values: options.includeBackground
      ? options.values
      : { ...options.values, backgroundHex: "transparent" },
  });
  const canvas = document.createElement("canvas");
  canvas.width = options.pixelWidth;
  canvas.height = options.pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Comp export requires a 2D canvas context.");
  }
  if (options.includeBackground) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, options.pixelWidth, options.pixelHeight);
  }
  context.drawImage(image, 0, 0, options.pixelWidth, options.pixelHeight);
  return canvas;
}

export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Export encoding failed."))),
      mimeType,
      quality,
    );
  });
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "comp"
  );
}

export function dateStampNow(now = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function buildExportFilename(options: {
  brand: BrandKit;
  extension: string;
  height: number;
  values: StudioValues;
  width: number;
}): string {
  const { brand, extension, height, values, width } = options;
  const format = getFormat(values.formatId);
  const name = applyNamingTemplate({
    campaign: "studio",
    comp: values.headingText,
    height,
    index: 1,
    platform: format.platform,
    template: brand.namingTemplate,
    width,
  });
  return `${name}.${extension}`;
}

/** Fill a naming template with the standard tokens. */
export function applyNamingTemplate(options: {
  campaign: string;
  comp: string;
  height: number;
  index: number;
  now?: Date;
  platform: string;
  template: string;
  width: number;
}): string {
  return options.template
    .replace("{date}", dateStampNow(options.now))
    .replace("{campaign}", slugify(options.campaign))
    .replace("{comp}", slugify(options.comp))
    .replace("{platform}", options.platform)
    .replace("{w}", String(options.width))
    .replace("{h}", String(options.height))
    .replace("{n}", String(options.index));
}

export interface ExportStudioImageOptions {
  assets: readonly Asset[];
  brand: BrandKit;
  reportProgress: (progress: number) => void;
  state: ToolcraftState;
}

export interface ExportedStudioImage {
  blob: Blob;
  filename: string;
  height: number;
  mimeType: string;
  width: number;
}

export async function renderStudioExport(
  options: ExportStudioImageOptions,
): Promise<ExportedStudioImage> {
  const { assets, brand, reportProgress, state } = options;
  const values = readStudioValues(state.values);

  const exportFormat =
    state.values["export.image.format"] === "jpg" ? "jpg" : "png";
  const resolution = String(state.values["export.image.resolution"] ?? "4k");
  const includeBackground =
    state.values["export.includeBackground"] !== false || exportFormat === "jpg";

  reportProgress(0.1);
  const { image } = await loadCompImage({
    assets,
    brand,
    values: includeBackground ? values : { ...values, backgroundHex: "transparent" },
  });
  reportProgress(0.55);

  const canvas = createToolcraftPngExportCanvas({
    background: values.backgroundHex,
    includeBackground,
    render: ({ context, cssHeight, cssWidth }) => {
      context.drawImage(image, 0, 0, cssWidth, cssHeight);
    },
    resolution,
    state,
  });
  reportProgress(0.8);

  const mimeType = exportFormat === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Export encoding failed.")),
      mimeType,
      exportFormat === "jpg" ? 0.92 : undefined,
    );
  });
  reportProgress(0.95);

  return {
    blob,
    filename: buildExportFilename({
      brand,
      extension: exportFormat,
      height: canvas.height,
      values,
      width: canvas.width,
    }),
    height: canvas.height,
    mimeType,
    width: canvas.width,
  };
}

// Download helpers live in the dependency-free data/download module so library
// surfaces can trigger downloads without importing the export pipeline. Kept
// re-exported here for existing importers (queue, studio).
export { downloadBlob, downloadFromUrl } from "../data/download";
