/**
 * Pure-SVG comp builder.
 *
 * The comp is authored as ONE SVG document: inline in the canvas for live
 * preview, serialized + font-embedded for export. Pure SVG (no foreignObject)
 * with data-URI resources never taints an export canvas, and tspan runs carry
 * Romie's swash features into the exported bytes.
 *
 * Line breaks are measured against a hidden DOM block using the same fonts and
 * styles, so wrapping in the SVG matches real text layout exactly. When a text
 * stack cannot fit its zone, the whole type scale steps down together (Swiss
 * guardrail: hierarchy preserved, nothing ever overprints or leaves the canvas).
 */

import { getFormat, type PlatformFormat } from "../data/formats";
import type { Asset, BrandKit, BrandTextStyle } from "../data/types";
import {
  ANCHOR_X_FRACTION,
  ANCHOR_Y_FRACTION,
  HEADING_SIZE_MULTIPLIERS,
  LEADING_MULTIPLIERS,
  LOGO_SIZE_MULTIPLIERS,
  LOGO_VARIANT_SCALE,
  SIZE_MULTIPLIERS,
  type FlourishStyle,
  type FlowKind,
  type LogoAnchor,
  type OverlayStyle,
  type StudioValues,
  type TextAlign,
  type TextPosition,
} from "./comp-layout";

type SizeStepKey = "l" | "m" | "s";

/**
 * Resolve an element's size multiplier. New comps store a percentage of the
 * baseline (100 = the former "M", scaled off `base`); legacy comps and Email
 * sections still store a "s"|"m"|"l" step, which we look up directly. Handling
 * both here keeps every render path (Studio, planner, Email) safe.
 */
function sizeMultiplier(
  value: unknown,
  base: number,
  legacy: Record<SizeStepKey, number>,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return (base * value) / 100;
  }
  if (value === "s" || value === "m" || value === "l") {
    return legacy[value];
  }
  return base;
}

/** Divider length as a fraction of its zone (1 = full). Migrates "full"/"short". */
function dividerFraction(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0.02, value / 100));
  }
  return value === "full" ? 1 : 0.15;
}

/**
 * Resolve the logo's placement to a concrete top/bottom anchor that never
 * overlaps or crowds the text. "auto" (the default) drops the logo on the edge
 * opposite the text block, aligned with the copy; a legacy center-row anchor, or
 * an explicit edge that the text now occupies, also falls back to auto so the
 * logo is safe at any text placement. (The layout reserves the logo's band, so
 * top/bottom never collide with the copy.)
 */
function resolveLogoAnchor(values: StudioValues): LogoAnchor {
  // Neutral: the logo stacks in the flow like any other element — no edge pin.
  if (values.logoAnchor === "stack") {
    return "stack";
  }
  const fills = values.layoutDistribution !== "stack";
  const topFree = fills || values.layoutAnchorY !== "top";
  const bottomFree = fills || values.layoutAnchorY !== "bottom";

  const stored = values.logoAnchor;
  if (stored !== "auto" && !stored.startsWith("center")) {
    const onTop = stored.startsWith("top");
    if ((onTop && topFree) || (!onTop && bottomFree)) {
      return stored;
    }
  }

  // Auto / unsafe / legacy-center → opposite the text, aligned with it.
  const end =
    values.layoutAnchorY === "bottom" ? "top" : bottomFree ? "bottom" : "top";
  return `${end}-${values.layoutAlign}` as LogoAnchor;
}

// Romie's swashes in THIS font build ship via the `ss01` stylistic set — the
// `swsh`/`salt` tags the specimen advertises are not present in the woff2
// (verified against the font's GSUB table). `ss01` gives the entry swash on an
// initial glyph and the calligraphic terminal form; we apply it only to a
// word's edge letters so the flourish touches the first/last letter, never the
// middle.
const FLOURISH_FEATURES = "'ss01' 1";
const MIN_TEXT_SCALE = 0.55;

/** ---- Text measurement -------------------------------------------------- */

export interface MeasuredLine {
  /** Word indexes (into the block's word list) on this visual line. */
  words: number[];
}

export interface MeasuredTextBlock {
  ascentPx: number;
  heightPx: number;
  lineHeightPx: number;
  lines: MeasuredLine[];
  sizePx: number;
  words: { flourished: boolean; text: string }[];
}

let measureHost: HTMLDivElement | null = null;

function getMeasureHost(): HTMLDivElement {
  if (!measureHost || !measureHost.isConnected) {
    measureHost = document.createElement("div");
    measureHost.setAttribute("aria-hidden", "true");
    measureHost.style.cssText =
      "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;";
    document.body.appendChild(measureHost);
  }
  return measureHost;
}

function applyTransform(text: string, transform: BrandTextStyle["textTransform"]): string {
  if (transform === "uppercase") {
    return text.toUpperCase();
  }
  if (transform === "lowercase") {
    return text.toLowerCase();
  }
  return text;
}

/**
 * Measure how a text block wraps at the given width. Returns per-line word
 * groupings plus vertical metrics, using real DOM layout with loaded fonts.
 * Words never break mid-word (SVG tspans cannot), so measurement must not either.
 */
export function measureTextBlock(options: {
  flourishWordIndexes: number[];
  /** Effective line height multiple (style lineHeight × leading step). */
  lineHeight: number;
  maxWidthPx: number;
  sizePx: number;
  style: BrandTextStyle;
  text: string;
}): MeasuredTextBlock {
  const { flourishWordIndexes, lineHeight, maxWidthPx, sizePx, style } = options;
  // Preserve explicit line breaks: split on \n first, keeping a flat word list
  // (so flourish indexes still line up) plus the word indexes that a hard break
  // follows. Soft wrapping within each line still happens at maxWidthPx.
  const words: { flourished: boolean; text: string }[] = [];
  const hardBreakAfter = new Set<number>();
  const rawLines = options.text.split("\n");
  for (const [lineIndex, rawLine] of rawLines.entries()) {
    for (const word of rawLine.split(/\s+/).filter(Boolean)) {
      words.push({
        flourished: flourishWordIndexes.includes(words.length),
        text: applyTransform(word, style.textTransform),
      });
    }
    if (lineIndex < rawLines.length - 1 && words.length > 0) {
      hardBreakAfter.add(words.length - 1);
    }
  }

  const host = getMeasureHost();
  const block = document.createElement("p");
  block.style.cssText =
    `margin:0;width:${maxWidthPx}px;font-family:${style.fontFamily};` +
    `font-weight:${style.fontWeight};font-size:${sizePx}px;line-height:${lineHeight};` +
    `letter-spacing:${style.letterSpacingEm}em;word-break:normal;overflow-wrap:normal;`;
  for (const [index, word] of words.entries()) {
    const span = document.createElement("span");
    span.textContent = word.text;
    if (word.flourished) {
      span.style.fontStyle = "italic";
      span.style.fontFeatureSettings = FLOURISH_FEATURES;
    }
    block.appendChild(span);
    if (hardBreakAfter.has(index)) {
      block.appendChild(document.createElement("br"));
    } else if (index < words.length - 1) {
      block.appendChild(document.createTextNode(" "));
    }
  }
  host.appendChild(block);

  const spans = Array.from(block.querySelectorAll("span"));
  const lines: MeasuredLine[] = [];
  let currentTop: number | null = null;
  const blockTop = block.getBoundingClientRect().top;
  for (const [index, span] of spans.entries()) {
    const top = Math.round(span.getBoundingClientRect().top - blockTop);
    if (currentTop === null || Math.abs(top - currentTop) > 2) {
      lines.push({ words: [index] });
      currentTop = top;
    } else {
      lines[lines.length - 1]!.words.push(index);
    }
  }

  const rect = block.getBoundingClientRect();
  const lineHeightPx = sizePx * lineHeight;
  block.remove();

  // Baseline: line box centers the glyph box; ascent ≈ 0.78em works across the
  // brand set and, because preview and export share this SVG, stays consistent.
  const ascentPx = sizePx * 0.78;

  return {
    ascentPx,
    heightPx: Math.max(rect.height, lines.length * lineHeightPx),
    lineHeightPx,
    lines,
    sizePx,
    words,
  };
}

/** ---- SVG helpers -------------------------------------------------------- */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colorHex(brand: BrandKit, colorId: string, fallback = "#111110"): string {
  return brand.colors.find((color) => color.id === colorId)?.hex ?? fallback;
}

function hexLuminanceOf(hex: string): number {
  const normalized = hex.replace("#", "");
  if (normalized.length < 6) {
    return 1;
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cover-crop an image into a region, keeping the focal point visible. */
function coverImageSvg(options: {
  asset: Asset;
  /** Normalized focal point (0..1) to center the crop on; defaults to the
   * asset's own focal point. The Studio overrides this per comp so the same
   * placement holds when the crop is re-solved for each format. */
  focalX?: number;
  focalY?: number;
  height: number;
  /** Corner radius (native px). 0 = square (the default everywhere). */
  radius?: number;
  width: number;
  x: number;
  y: number;
  /** Crop zoom past cover-fit (1 = none) around the focal point. */
  zoom?: number;
}): string {
  const { asset, height, width, x, y } = options;
  const focalX = options.focalX ?? asset.focalPoint.x;
  const focalY = options.focalY ?? asset.focalPoint.y;
  const naturalWidth = Math.max(1, asset.width);
  const naturalHeight = Math.max(1, asset.height);
  const zoom = Math.max(1, options.zoom ?? 1);
  const scale = Math.max(width / naturalWidth, height / naturalHeight) * zoom;
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.min(
    Math.max(focalX * naturalWidth - sourceWidth / 2, 0),
    naturalWidth - sourceWidth,
  );
  const sourceY = Math.min(
    Math.max(focalY * naturalHeight - sourceHeight / 2, 0),
    naturalHeight - sourceHeight,
  );
  const svg =
    `<svg x="${x}" y="${y}" width="${width}" height="${height}" ` +
    `viewBox="${sourceX.toFixed(1)} ${sourceY.toFixed(1)} ${sourceWidth.toFixed(1)} ${sourceHeight.toFixed(1)}" ` +
    `preserveAspectRatio="none">` +
    // Videos can't render in an <image>; show their poster frame instead. The
    // Studio designs over this still, and the video export burns overlays onto
    // the live frames separately.
    `<image href="${asset.kind === "video" ? asset.thumbUrl : asset.url}" width="${naturalWidth}" height="${naturalHeight}"/>` +
    `</svg>`;
  const radius = options.radius ?? 0;
  if (radius <= 0) {
    return svg;
  }
  // Deterministic id (position-based) so preview and export stay byte-identical.
  const clipId = `imgclip-${x}-${y}-${width}-${height}`;
  return (
    `<defs><clipPath id="${clipId}">` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/>` +
    `</clipPath></defs>` +
    `<g clip-path="url(#${clipId})">${svg}</g>`
  );
}

/**
 * Buzz-style collage: cover-crop a photo set into a grid of cells. Rows are
 * filled left-to-right; a short last row stretches its cells to full width so
 * the grid always reads as one composed block.
 */
function collageCellsSvg(options: {
  assets: readonly Asset[];
  /** Per-cell captions (parallel to assets); when present, a caption band is
   * reserved under each image and the image height shrinks to fit it. */
  captionColor?: string;
  captionFontFamily?: string;
  captions?: { name: string; note: string }[];
  captionSize?: number;
  columns: number;
  gutter: number;
  height: number;
  radius?: number;
  width: number;
  x: number;
  y: number;
}): string {
  const { assets, columns, gutter, height, width, x, y } = options;
  const captions = options.captions ?? [];
  const captionSize = options.captionSize ?? 0;
  const showCaptions = captions.length > 0 && captionSize > 0;
  const captionH = showCaptions ? Math.round(captionSize * 2.8) : 0;
  const captionColor = options.captionColor ?? "#111110";
  const captionFont = options.captionFontFamily ?? "'Inter Variable', sans-serif";
  const count = assets.length;
  const rows = Math.ceil(count / columns);
  const cellHeight = (height - gutter * (rows - 1)) / rows;
  const imageH = Math.max(1, cellHeight - captionH);
  const parts: string[] = [];
  let cellIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    const rowAssets = assets.slice(row * columns, (row + 1) * columns);
    const cellWidth = (width - gutter * (rowAssets.length - 1)) / rowAssets.length;
    for (const [column, asset] of rowAssets.entries()) {
      const cellX = Math.round(x + column * (cellWidth + gutter));
      const cellY = Math.round(y + row * (cellHeight + gutter));
      parts.push(
        coverImageSvg({
          asset,
          height: Math.round(imageH),
          radius: options.radius,
          width: Math.round(cellWidth),
          x: cellX,
          y: cellY,
        }),
      );
      if (showCaptions) {
        const caption = captions[cellIndex] ?? { name: "", note: "" };
        const nameY = cellY + imageH + captionSize * 1.25;
        if (caption.name) {
          parts.push(
            `<text x="${cellX}" y="${nameY.toFixed(1)}" font-family="${escapeXml(captionFont)}" ` +
              `font-weight="500" font-size="${captionSize.toFixed(1)}" fill="${captionColor}" ` +
              `style="white-space:pre">${escapeXml(caption.name)}</text>`,
          );
        }
        if (caption.note) {
          parts.push(
            `<text x="${cellX}" y="${(nameY + captionSize * 1.3).toFixed(1)}" ` +
              `font-family="${escapeXml(captionFont)}" font-weight="400" ` +
              `font-size="${(captionSize * 0.82).toFixed(1)}" fill="${captionColor}" opacity="0.6" ` +
              `style="white-space:pre">${escapeXml(caption.note)}</text>`,
          );
        }
      }
      cellIndex += 1;
    }
  }
  return parts.join("");
}

/**
 * Full-canvas overlay treatments. Paint-only: never move layout. `under`
 * renders below the text (legibility shades/washes); `over` renders above
 * everything (keyline frame, film grain). All effects are SVG-native
 * (gradients, feTurbulence) so preview and export stay byte-identical.
 */
function buildOverlaySvg(options: {
  height: number;
  /** Content margin used to place the keyline frame. */
  margin: number;
  /** Whether photography dominates the surface (drives keyline color). */
  onImage: boolean;
  strengthPct: number;
  style: OverlayStyle;
  surfaceHex: string;
  width: number;
}): { over: string; under: string } {
  const { height, margin, onImage, style, surfaceHex, width } = options;
  const s = Math.min(1, Math.max(0.1, options.strengthPct / 100));
  const ink = "#111110";
  const bone = "#f5f2ec";
  const full = (fill: string, opacity: number): string =>
    `<rect width="${width}" height="${height}" fill="${fill}" opacity="${opacity.toFixed(3)}"/>`;
  const linear = (id: string, rotate: boolean, stops: string): string =>
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${rotate ? 1 : 0}" y2="${rotate ? 0 : 1}">${stops}</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#${id})"/>`;
  const stop = (offset: number, opacity: number): string =>
    `<stop offset="${offset}" stop-color="${ink}" stop-opacity="${(opacity * s).toFixed(3)}"/>`;

  switch (style) {
    case "none":
      return { over: "", under: "" };
    case "shade-bottom":
      return { over: "", under: linear("ovb", false, stop(0, 0) + stop(0.55, 0.06) + stop(1, 0.8)) };
    case "shade-top":
      return { over: "", under: linear("ovt", false, stop(0, 0.8) + stop(0.45, 0.06) + stop(1, 0)) };
    case "shade-frame":
      return {
        over: "",
        under: linear(
          "ovf",
          false,
          stop(0, 0.72) + stop(0.3, 0) + stop(0.7, 0) + stop(1, 0.72),
        ),
      };
    case "shade-left":
      return { over: "", under: linear("ovl", true, stop(0, 0.78) + stop(0.55, 0.05) + stop(1, 0)) };
    case "shade-right":
      return { over: "", under: linear("ovr", true, stop(0, 0) + stop(0.45, 0.05) + stop(1, 0.78)) };
    case "vignette":
      return {
        over: "",
        under:
          `<defs><radialGradient id="ovv" cx="0.5" cy="0.5" r="0.75">` +
          stop(0, 0) +
          stop(0.6, 0) +
          stop(1, 0.66) +
          `</radialGradient></defs>` +
          `<rect width="${width}" height="${height}" fill="url(#ovv)"/>`,
      };
    case "wash-ink":
      return { over: "", under: full(ink, 0.34 * s) };
    case "wash-bone":
      return { over: "", under: full(bone, 0.34 * s) };
    case "keyline": {
      const inset = Math.round(margin * 0.55);
      const lineColor = onImage || hexLuminanceOf(surfaceHex) < 0.45 ? bone : ink;
      const strokeWidth = Math.max(1.5, width * 0.0022);
      return {
        over:
          `<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" ` +
          `fill="none" stroke="${lineColor}" stroke-width="${strokeWidth.toFixed(1)}" opacity="${(0.92 * s).toFixed(3)}"/>`,
        under: "",
      };
    }
    case "grain":
      return {
        over:
          `<defs><filter id="ovg" x="0" y="0" width="100%" height="100%">` +
          `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
          `<feColorMatrix type="saturate" values="0"/>` +
          `</filter></defs>` +
          `<rect width="${width}" height="${height}" filter="url(#ovg)" opacity="${(0.16 * s).toFixed(3)}"/>`,
        under: "",
      };
  }
}

type SvgAlign = "start" | "middle" | "end";

function toSvgAlign(align: TextAlign): SvgAlign {
  return align === "center" ? "middle" : align === "right" ? "end" : "start";
}

function textBlockSvg(options: {
  align: SvgAlign;
  block: MeasuredTextBlock;
  color: string;
  /** Per-word swash style; wordIndex is the flat heading word index. Defaults
   * to "swash" (both ends) for any word without an explicit style. */
  flourishStyleFor?: (wordIndex: number) => FlourishStyle;
  style: BrandTextStyle;
  width: number;
  x: number;
  y: number;
}): string {
  const { align, block, color, style, width, x, y } = options;
  const flourishStyleFor = options.flourishStyleFor ?? (() => "swash" as FlourishStyle);
  const anchorX = align === "end" ? x + width : align === "middle" ? x + width / 2 : x;
  const parts: string[] = [];
  for (const [lineIndex, line] of block.lines.entries()) {
    const baseline = y + lineIndex * block.lineHeightPx + block.ascentPx;
    const tspans = line.words
      .map((wordIndex, position) => {
        const word = block.words[wordIndex]!;
        const leadingSpace = position > 0 ? " " : "";
        if (!word.flourished || word.text.length === 0) {
          return `<tspan>${leadingSpace}${escapeXml(word.text)}</tspan>`;
        }
        // The whole word slants; the swash feature rides only the end letters
        // the style asks for (entry, terminal, both) — never the middle.
        // "italic" carries no swash glyphs at all.
        const flourishStyle = flourishStyleFor(wordIndex);
        const open = `<tspan style="font-feature-settings:${FLOURISH_FEATURES}">`;
        const text = word.text;
        const swash = (glyph: string): string => `${open}${escapeXml(glyph)}</tspan>`;
        const inner =
          flourishStyle === "italic"
            ? escapeXml(text)
            : text.length === 1
              ? swash(text)
              : flourishStyle === "swash-first"
                ? swash(text[0]!) + escapeXml(text.slice(1))
                : flourishStyle === "swash-last"
                  ? escapeXml(text.slice(0, -1)) + swash(text.slice(-1))
                  : swash(text[0]!) + escapeXml(text.slice(1, -1)) + swash(text.slice(-1));
        return `<tspan font-style="italic">${leadingSpace}${inner}</tspan>`;
      })
      .join("");
    parts.push(
      `<text x="${anchorX.toFixed(1)}" y="${baseline.toFixed(1)}" ` +
        `text-anchor="${align}" ` +
        `font-family="${escapeXml(style.fontFamily)}" font-weight="${style.fontWeight}" ` +
        `font-size="${block.sizePx.toFixed(1)}" letter-spacing="${(style.letterSpacingEm * block.sizePx).toFixed(2)}" ` +
        `fill="${color}" style="white-space:pre">${tspans}</text>`,
    );
  }
  return parts.join("");
}

/** ---- Comp assembly ------------------------------------------------------ */

interface Region {
  height: number;
  width: number;
  x: number;
  y: number;
}

type TextKey = "heading" | "subhead" | "body" | "eyebrow";

interface PlacedText {
  align: SvgAlign;
  block: MeasuredTextBlock;
  colorId: string;
  style: BrandTextStyle;
  width: number;
  x: number;
  y: number;
}

export interface BuiltComp {
  height: number;
  svg: string;
  /** Final text scale after fit guardrails (1 = no downscale was needed). */
  textScale: number;
  width: number;
}

export interface BuildCompSvgOptions {
  assets: readonly Asset[];
  brand: BrandKit;
  /** Embedded @font-face CSS (export path). Preview relies on document fonts. */
  fontFaceCss?: string;
  format?: PlatformFormat;
  /** Skip the background photo(s), keeping overlay scrim + text + logo. Used to
   * render a transparent overlay layer composited onto live video frames. */
  omitBackgroundImage?: boolean;
  values: StudioValues;
}

export function buildCompSvg(options: BuildCompSvgOptions): BuiltComp {
  const { assets, brand, values } = options;
  const format = options.format ?? getFormat(values.formatId);
  const width = format.width;
  const height = format.height;

  const margin = Math.round(Math.min(width, height) * 0.055);
  const inset = {
    bottom: Math.max(margin, format.safeZones.bottom),
    left: Math.max(margin, format.safeZones.left),
    right: Math.max(margin, format.safeZones.right),
    top: Math.max(margin, format.safeZones.top),
  };
  const content: Region = {
    height: height - inset.top - inset.bottom,
    width: width - inset.left - inset.right,
    x: inset.left,
    y: inset.top,
  };
  // User-tunable spacing rhythm: scales every stack and image-to-text gap.
  const spacing = Math.min(2.4, Math.max(0.4, values.elementsSpacing / 100));
  const gap = Math.max(2, Math.round(height * 0.02 * spacing));
  const gapL = Math.round(gap * 1.6);
  const gapM = Math.round(gap * 1.4);
  // Logos always get a touch more breathing room below them (~10px) than the
  // base rhythm, so a mark never sits too tight to the copy beneath it.
  const logoGap = gap + Math.round(height * 0.008);
  // Per-element add-only spacing (canvas px). Above/below feed the shared seam
  // with the neighbor; a lone element's top/bottom offsets it from its anchor.
  // Global Layout spacing offsets the WHOLE stack as one block — extra room
  // above (blockTop) or below (blockBottom) it — never between the elements
  // (that's each element's own nudge below). Folded into outerOffset only.
  const blockTop = Math.max(0, Math.round(values.layoutSpaceAll?.top ?? 0));
  const blockBottom = Math.max(0, Math.round(values.layoutSpaceAll?.bottom ?? 0));
  const spaceTopFor = (kind: FlowKind | "logo"): number =>
    Math.max(0, Math.round(values.elementSpacing[kind]?.top ?? 0));
  const spaceBottomFor = (kind: FlowKind | "logo"): number =>
    Math.max(0, Math.round(values.elementSpacing[kind]?.bottom ?? 0));

  const asset = values.imageInclude
    ? assets.find((candidate) => candidate.id === values.imageAssetId)
    : undefined;
  const collageAssets =
    values.layoutPattern === "collage" && values.imageInclude
      ? values.imageAssetIds
          .map((id) => assets.find((candidate) => candidate.id === id))
          .filter((candidate): candidate is Asset => Boolean(candidate))
      : [];
  const collageActive = collageAssets.length > 0;
  const bleed = (collageActive || Boolean(asset)) && values.imageBleed;

  // Single-image crop centers on the per-comp focal point, so the chosen
  // placement is preserved as the crop is re-solved for each format.
  const coverImage = (opts: {
    asset: Asset;
    height: number;
    width: number;
    x: number;
    y: number;
  }): string =>
    coverImageSvg({
      ...opts,
      focalX: values.imageFocalX,
      focalY: values.imageFocalY,
      radius: values.imageRadius,
      zoom: values.imageZoom,
    });

  const headingStyle =
    brand.textStyles.find((style) => style.id === values.headingStyleId) ??
    brand.textStyles[0]!;
  const subheadStyle =
    brand.textStyles.find((style) => style.role === "subhead") ?? brand.textStyles[0]!;
  const bodyStyle =
    brand.textStyles.find((style) => style.role === "body") ?? brand.textStyles[0]!;
  // Romie caps face for the masthead title ("SOL №4") — ordinals ride 'ordn'.
  const editorialCapsStyle =
    brand.textStyles.find((style) => style.id === "editorial-caps") ?? headingStyle;

  // On a bleed image, force light text over the scrim for legibility.
  // A Studio content colour (values.contentColorId) wins over the bleed-bone
  // default so it recolours every element on the canvas. Email values omit it,
  // keeping their per-element colours and the bleed-bone legibility default.
  const headingColorId = values.contentColorId ?? (bleed ? "bone" : values.headingColorId);
  const subheadColorId = values.contentColorId ?? (bleed ? "bone" : values.subheadColorId);
  const bodyColorId = values.contentColorId ?? (bleed ? "bone" : values.bodyColorId);
  const eyebrowColorId = values.contentColorId ?? (bleed ? "bone" : values.eyebrowColorId);
  // Eyebrow = body face, forced to uppercase with wide tracking (the recurring
  // fashion "overline"). Gated: only rendered when eyebrowInclude is set.
  const eyebrowStyle: BrandTextStyle = {
    ...bodyStyle,
    letterSpacingEm: 0.16,
    textTransform: "uppercase",
  };

  // Per-element leading (eyebrow rides the body rhythm; legacy comps resolve
  // every element to the old shared type.leading via readStudioValues).
  const leadingFor = (key: TextKey): number =>
    LEADING_MULTIPLIERS[
      key === "heading"
        ? values.headingLeading
        : key === "subhead"
          ? values.subheadLeading
          : key === "body" || key === "eyebrow"
            ? values.bodyLeading
            : values.typeLeading
    ];
  const pattern = values.layoutPattern;
  const wide = width / height > 1.4;
  // User-tunable max text-column width, as a fraction of the content zone.
  const widthScale = Math.min(1, Math.max(0.3, values.typeWidthPct / 100));
  const textWidth = Math.round(
    (pattern === "edge" && !bleed
      ? content.width * 0.78
      : pattern === "split" && wide && !bleed
        ? (content.width - Math.round(width * 0.04)) / 2
        : content.width) * widthScale,
  );

  const styleFor = (key: TextKey): BrandTextStyle =>
    key === "heading"
      ? headingStyle
      : key === "subhead"
        ? subheadStyle
        : key === "eyebrow"
          ? eyebrowStyle
          : bodyStyle;
  const colorFor = (key: TextKey): string =>
    key === "heading"
      ? headingColorId
      : key === "subhead"
        ? subheadColorId
        : key === "eyebrow"
          ? eyebrowColorId
          : bodyColorId;
  // Alignment is a single global control now (Layout › Alignment); every flow
  // element shares it. (Per-element align values still exist in the model for
  // older comps but are no longer surfaced or read here.)
  const alignFor = (_key: FlowKind): TextAlign => values.layoutAlign;
  const baseSizeFor = (key: TextKey): number => {
    const style = styleFor(key);
    if (key === "heading") {
      return (
        style.sizeFactor *
        width *
        sizeMultiplier(values.headingSize, HEADING_SIZE_MULTIPLIERS.m, HEADING_SIZE_MULTIPLIERS)
      );
    }
    if (key === "eyebrow") {
      return width * 0.022 * SIZE_MULTIPLIERS[values.eyebrowSize];
    }
    const step = key === "subhead" ? values.subheadSize : values.bodySize;
    return style.sizeFactor * width * sizeMultiplier(step, SIZE_MULTIPLIERS.m, SIZE_MULTIPLIERS);
  };

  /** ---- Flow stack: the user-ordered element list. ------------------------ */
  const TEXT_KINDS: readonly TextKey[] = ["heading", "subhead", "body", "eyebrow"];
  const isTextKind = (kind: FlowKind): kind is TextKey =>
    (TEXT_KINDS as readonly string[]).includes(kind);

  const ctaColor = colorHex(brand, values.contentColorId ?? (bleed ? "bone" : values.ctaColorId));
  const dividerColor = colorHex(
    brand,
    values.contentColorId ?? (bleed ? "bone" : values.dividerColorId),
  );
  const dividerHeight = Math.max(
    2,
    Math.round(
      width *
        (values.dividerWeight === "hairline"
          ? 0.0018
          : values.dividerWeight === "bold"
            ? 0.0068
            : 0.0035),
    ),
  );

  // Values/benefits list metrics (gated): single-line rows with a hairline rule
  // between them. Rendered directly (not measured) since items are one line each.
  const listFontSize = width * 0.026 * SIZE_MULTIPLIERS[values.listSize];
  const listRowHeight = Math.round(listFontSize + listFontSize * 0.72 * 2);
  const listColor = colorHex(brand, values.contentColorId ?? (bleed ? "bone" : values.listColorId));
  const listHeight = values.listInclude ? listRowHeight * values.listItems.length : 0;

  const presentInFlow = (kind: FlowKind): boolean => {
    switch (kind) {
      case "heading":
        return values.headingInclude && values.headingText.trim().length > 0;
      case "subhead":
        return values.subheadInclude && values.subheadText.trim().length > 0;
      case "body":
        return values.bodyInclude && values.bodyText.trim().length > 0;
      case "cta":
        return values.ctaInclude && values.ctaText.trim().length > 0;
      case "divider":
        return values.dividerInclude;
      case "eyebrow":
        return values.eyebrowInclude && values.eyebrowText.trim().length > 0;
      case "list":
        return values.listInclude && values.listItems.length > 0;
      case "lockup":
        // The motif renders even with both texts empty — it's still a mark.
        return values.lockupInclude;
      case "masthead":
        // The logo segment renders even with both texts empty.
        return values.mastheadInclude;
    }
  };

  // The logo joins the flow stack ONLY in the neutral "stack" mode; the pinned
  // anchors (auto / corners) keep it out of the flow and position it directly.
  const inFlowLogo = values.logoInclude && values.logoAnchor === "stack";
  const includedKeys: (FlowKind | "logo")[] = values.elementsOrder.filter((kind) =>
    kind === "logo" ? inFlowLogo : presentInFlow(kind),
  );
  // In-flow logo whose comp predates the logo row (older order without it) still
  // joins the stack — append it so it stacks rather than falling to the corner.
  if (inFlowLogo && !includedKeys.includes("logo")) {
    includedKeys.push("logo");
  }
  const includedTextKeys = includedKeys.filter(
    (kind): kind is TextKey => kind !== "logo" && isTextKind(kind),
  );

  interface CtaBox {
    boxHeight: number;
    boxWidth: number;
    fontSize: number;
    label: string;
  }

  const measureCta = (scale: number): CtaBox => {
    const fontSize =
      width * 0.019 * sizeMultiplier(values.ctaSize, SIZE_MULTIPLIERS.m, SIZE_MULTIPLIERS) * scale;
    const label = values.ctaText.trim().toUpperCase();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    let labelWidth = label.length * fontSize * 0.72;
    if (context) {
      context.font = `600 ${fontSize}px 'Rework Micro', 'Inter Variable', sans-serif`;
      const spacing = fontSize * 0.08;
      // Feature-detect (assigning an unsupported property silently no-ops).
      const hasLetterSpacing = "letterSpacing" in (context as object);
      if (hasLetterSpacing) {
        (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
          `${spacing}px`;
        labelWidth = context.measureText(label).width;
      } else {
        labelWidth = context.measureText(label).width + spacing * Math.max(0, label.length - 1);
      }
    }
    const padX = fontSize * 1.5;
    const padY = fontSize * 0.85;
    return {
      boxHeight: Math.round(
        values.ctaStyle === "underline" ? fontSize * 1.55 : fontSize + padY * 2,
      ),
      boxWidth: Math.round(
        values.ctaStyle === "underline" ? labelWidth : labelWidth + padX * 2,
      ),
      fontSize,
      label,
    };
  };

  /** ---- Lockup: the brand motif flanked by two tracked-caps texts. --------- */
  interface LockupBox {
    fontSize: number;
    gapPx: number;
    leftText: string;
    leftW: number;
    motifH: number;
    motifW: number;
    rightText: string;
    rightW: number;
    rowH: number;
    rowW: number;
  }

  // Always the motif mark (whitened at startup; content-colour variants baked).
  const lockupMotif =
    brand.logos.find((candidate) => candidate.id === "motif") ?? brand.logos[0];

  const measureLockup = (scale: number): LockupBox => {
    // One design baseline, two independent scales: the texts sit smaller than
    // the subhead face (0.8×) and the motif reads clearly larger than the type
    // (per the masthead reference) — each with its own slider.
    const lockupBase = subheadStyle.sizeFactor * width * scale;
    const textMultiplier =
      sizeMultiplier(values.lockupTextSize, SIZE_MULTIPLIERS.m, SIZE_MULTIPLIERS) * 0.8;
    const motifMultiplier = sizeMultiplier(
      values.lockupMotifSize,
      SIZE_MULTIPLIERS.m,
      SIZE_MULTIPLIERS,
    );
    let fontSize = lockupBase * textMultiplier;
    let motifBase = lockupBase * 0.72 * 3.2 * motifMultiplier;
    const leftText = values.lockupLeftText.trim().toUpperCase();
    const rightText = values.lockupRightText.trim().toUpperCase();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    // Eyebrow-wide tracking (0.16em) — the fashion masthead voice.
    const measureSide = (text: string, size: number): number => {
      if (!text) return 0;
      const spacing = size * 0.16;
      if (!context) return text.length * size * 0.72 + spacing * Math.max(0, text.length - 1);
      context.font = `600 ${size}px 'Rework Micro', 'Inter Variable', sans-serif`;
      // Feature-detect: assigning an unsupported property never throws (it just
      // no-ops), so a try/catch can't see old engines (iPadOS < 17.4).
      const hasLetterSpacing = "letterSpacing" in (context as object);
      if (hasLetterSpacing) {
        (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
          `${spacing}px`;
        return context.measureText(text).width;
      }
      return context.measureText(text).width + spacing * Math.max(0, text.length - 1);
    };
    const metrics = (size: number, motifSize: number) => {
      const motifH = Math.round(motifSize);
      const motifW = Math.round(motifH * (lockupMotif?.aspectRatio ?? 1));
      const gapPx = Math.round(size * 1.2);
      const leftW = measureSide(leftText, size);
      const rightW = measureSide(rightText, size);
      const rowW =
        leftW + (leftW > 0 ? gapPx : 0) + motifW + (rightW > 0 ? gapPx : 0) + rightW;
      return { gapPx, leftW, motifH, motifW, rightW, rowW };
    };
    let m = metrics(fontSize, motifBase);
    // The row is a single line — clamp it to the text column so long texts
    // shrink instead of walking off the canvas (ensureTextFits only fixes height).
    if (m.rowW > textWidth && m.rowW > 0) {
      const clamp = textWidth / m.rowW;
      fontSize *= clamp;
      motifBase *= clamp;
      m = metrics(fontSize, motifBase);
    }
    return {
      fontSize,
      gapPx: m.gapPx,
      leftText,
      leftW: m.leftW,
      motifH: m.motifH,
      motifW: m.motifW,
      rightText,
      rightW: m.rightW,
      rowH: Math.max(m.motifH, Math.round(fontSize)),
      rowW: Math.round(m.rowW),
    };
  };

  /** ---- Masthead: [logo] | [Romie caps title] | [two-line caption]. -------- */
  interface MastheadBox {
    captionFont: number;
    captionLineH: number;
    captionLines: string[];
    captionW: number;
    gapPx: number;
    hairW: number;
    logoH: number;
    logoW: number;
    rowH: number;
    rowW: number;
    titleFont: number;
    titleText: string;
    titleW: number;
  }

  const mastheadLogoVariant =
    brand.logos.find((candidate) => candidate.id === values.mastheadLogoVariantId) ??
    brand.logos[0];

  const measureMasthead = (scale: number): MastheadBox => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const measureCaps = (text: string, size: number): number => {
      if (!text) return 0;
      const spacing = size * 0.16;
      if (!context) return text.length * size * 0.72 + spacing * Math.max(0, text.length - 1);
      context.font = `600 ${size}px 'Rework Micro', 'Inter Variable', sans-serif`;
      const hasLetterSpacing = "letterSpacing" in (context as object);
      if (hasLetterSpacing) {
        (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
          `${spacing}px`;
        return context.measureText(text).width;
      }
      return context.measureText(text).width + spacing * Math.max(0, text.length - 1);
    };
    // Romie + 'ordn' swaps glyphs (No. → №), which canvas measureText can't see —
    // measure with a DOM span (the wrap measurer's host) so widths match the draw.
    const measureTitle = (text: string, size: number): number => {
      if (!text) return 0;
      const span = document.createElement("span");
      span.style.cssText =
        `font-family:${editorialCapsStyle.fontFamily};` +
        `font-weight:${editorialCapsStyle.fontWeight};` +
        `font-size:${size}px;` +
        `letter-spacing:${((editorialCapsStyle.letterSpacingEm ?? 0.045) * size).toFixed(2)}px;` +
        "white-space:pre;font-feature-settings:'ordn' 1;";
      span.textContent = text;
      const host = getMeasureHost();
      host.appendChild(span);
      const measured2 = span.getBoundingClientRect().width;
      span.remove();
      return measured2;
    };

    const compute = (base: number): MastheadBox => {
      const titleFont = base * 1.35;
      const captionFont = base * 0.62;
      const captionLineH = Math.round(captionFont * 1.4);
      const logoH = Math.round(
        base * 2.1 * (LOGO_VARIANT_SCALE[mastheadLogoVariant?.id ?? ""] ?? 1),
      );
      const logoW = Math.round(logoH * (mastheadLogoVariant?.aspectRatio ?? 1));
      // Title renders AS TYPED — uppercasing here would break the ordn ligature.
      const titleText = values.mastheadTitleText.trim();
      const captionLines = values.mastheadCaptionText
        .split("\n")
        .map((line) => line.trim().toUpperCase())
        .filter(Boolean);
      const titleW = measureTitle(titleText, titleFont);
      const captionW =
        captionLines.length > 0
          ? Math.max(...captionLines.map((line) => measureCaps(line, captionFont)))
          : 0;
      const gapPx = Math.round(titleFont * 0.9);
      const hairW = Math.max(1, Math.round(width * 0.0018));
      const segments = [logoW, titleW, captionW].filter((segment) => segment > 0);
      const dividers = Math.max(0, segments.length - 1);
      const rowW = segments.reduce((sum, segment) => sum + segment, 0) + dividers * (hairW + gapPx * 2);
      const captionH = captionLines.length * captionLineH;
      return {
        captionFont,
        captionLineH,
        captionLines,
        captionW,
        gapPx,
        hairW,
        logoH,
        logoW,
        rowH: Math.max(logoH, Math.round(titleFont * 1.1), captionH),
        rowW: Math.round(rowW),
        titleFont,
        titleText,
        titleW,
      };
    };

    let base =
      subheadStyle.sizeFactor *
      width *
      sizeMultiplier(values.mastheadSize, SIZE_MULTIPLIERS.m, SIZE_MULTIPLIERS) *
      scale;
    let box = compute(base);
    // Single-line row: clamp to the text column (ensureTextFits only fixes height).
    if (box.rowW > textWidth && box.rowW > 0) {
      base *= textWidth / box.rowW;
      box = compute(base);
    }
    return box;
  };

  // Per-element width trims a single block's column below the shared textWidth
  // baseline (Layout › Text width). 100% follows the baseline exactly.
  const elementWidthPct = (key: TextKey): number =>
    key === "heading"
      ? values.headingWidthPct
      : key === "subhead"
        ? values.subheadWidthPct
        : key === "body"
          ? values.bodyWidthPct
          : 100;
  const widthFor = (key: TextKey): number =>
    Math.max(1, Math.round(textWidth * Math.min(1, Math.max(0.2, elementWidthPct(key) / 100))));

  type MeasuredMap = Partial<Record<TextKey, MeasuredTextBlock>>;
  const measureAll = (scale: number): MeasuredMap => {
    const map: MeasuredMap = {};
    for (const key of includedTextKeys) {
      const style = styleFor(key);
      map[key] = measureTextBlock({
        flourishWordIndexes: key === "heading" ? values.headingFlourish : [],
        lineHeight: style.lineHeight * leadingFor(key),
        maxWidthPx: widthFor(key),
        sizePx: baseSizeFor(key) * scale,
        style,
        text:
          key === "heading"
            ? values.headingText
            : key === "subhead"
              ? values.subheadText
              : key === "eyebrow"
                ? values.eyebrowText
                : values.bodyText,
      });
    }
    return map;
  };

  let measured = measureAll(1);
  let ctaBox = includedKeys.includes("cta") ? measureCta(1) : null;
  let lockupBox = includedKeys.includes("lockup") ? measureLockup(1) : null;
  let mastheadBox = includedKeys.includes("masthead") ? measureMasthead(1) : null;
  let textScale = 1;

  // Logo artwork + size — declared here so blockHeight can measure it when the
  // logo stacks in the flow. Wide-short banners size it off the band height so a
  // tiny short edge doesn't shrink it away; standard formats use the short edge.
  const logo = values.logoInclude
    ? (brand.logos.find((candidate) => candidate.id === values.logoVariantId) ??
      brand.logos[0])
    : undefined;
  const logoHeight = logo
    ? Math.round(
        (width / height > 2 ? height * 0.35 : Math.min(width, height) * 0.085) *
          sizeMultiplier(values.logoSize, LOGO_SIZE_MULTIPLIERS.m, LOGO_SIZE_MULTIPLIERS) *
          (LOGO_VARIANT_SCALE[logo.id] ?? 1),
      )
    : 0;
  const logoWidth = logo ? Math.round(logoHeight * logo.aspectRatio) : 0;

  const blockHeight = (kind: FlowKind | "logo"): number => {
    if (kind === "logo") {
      return inFlowLogo ? logoHeight : 0;
    }
    if (kind === "cta") {
      return ctaBox?.boxHeight ?? 0;
    }
    if (kind === "divider") {
      return dividerHeight;
    }
    if (kind === "list") {
      return listHeight;
    }
    if (kind === "lockup") {
      return lockupBox?.rowH ?? 0;
    }
    if (kind === "masthead") {
      return mastheadBox?.rowH ?? 0;
    }
    const block = measured[kind];
    return block && block.lines.length > 0 ? block.heightPx : 0;
  };

  const stackHeight = (keys: (FlowKind | "logo")[]): number => {
    const present = keys.filter((kind) => blockHeight(kind) > 0);
    if (present.length === 0) {
      return 0;
    }
    return (
      present.reduce((sum, kind) => sum + blockHeight(kind), 0) +
      gap * (present.length - 1)
    );
  };

  /**
   * Swiss guardrail: if the full text set cannot fit its budget, step the whole
   * type scale down together (hierarchy preserved), re-measuring wraps. Two
   * passes cover wrap changes; the floor keeps text legible.
   */
  const ensureTextFits = (budgetPx: number, extraGapsPx: number): void => {
    for (let pass = 0; pass < 2; pass += 1) {
      const total = stackHeight(includedKeys) + extraGapsPx;
      if (total <= budgetPx || stackHeight(includedKeys) <= 0) {
        return;
      }
      const ratio = Math.max(
        MIN_TEXT_SCALE,
        textScale * ((budgetPx - extraGapsPx) / Math.max(1, stackHeight(includedKeys))),
      );
      if (ratio >= textScale) {
        return;
      }
      textScale = ratio;
      measured = measureAll(ratio);
      ctaBox = includedKeys.includes("cta") ? measureCta(ratio) : null;
      lockupBox = includedKeys.includes("lockup") ? measureLockup(ratio) : null;
      mastheadBox = includedKeys.includes("masthead") ? measureMasthead(ratio) : null;
    }
  };

  /** ---- Logo placement: pinned in the content box, UNLESS it stacks in-flow
   *  ("stack"), where placeStack sets its position from the flow instead. --- */
  const anchor = resolveLogoAnchor(values);
  let logoX = logo
    ? anchor.endsWith("right")
      ? content.x + content.width - logoWidth
      : anchor.endsWith("center") || anchor === "center"
        ? content.x + Math.round((content.width - logoWidth) / 2)
        : content.x
    : 0;
  let logoY = logo
    ? anchor.startsWith("bottom")
      ? content.y + content.height - logoHeight
      : anchor.startsWith("center") || anchor === "center"
        ? content.y + Math.round((content.height - logoHeight) / 2)
        : content.y
    : 0;

  // Reserve the logo's horizontal band so text and image never collide with it.
  // The top band gets the extra logo gap so copy sits a touch lower under it.
  const reservedTop = logo && anchor.startsWith("top") ? logoHeight + logoGap : 0;
  const reservedBottom = logo && anchor.startsWith("bottom") ? logoHeight + gap : 0;
  const region: Region = {
    height: content.height - reservedTop - reservedBottom,
    width: content.width,
    x: content.x,
    y: content.y + reservedTop,
  };

  // Vertical placement is owned by the Layout placement grid (anchorY, a 5-step
  // fraction); this coarse top/middle/bottom mapping is retained only for the
  // legacy `position` signature — placeStackInZone anchors off the fraction.
  const resolveTextPosition = (
    _fallback: Exclude<TextPosition, "auto">,
  ): Exclude<TextPosition, "auto"> =>
    values.layoutAnchorY === "top" || values.layoutAnchorY === "tm"
      ? "top"
      : values.layoutAnchorY === "bottom" || values.layoutAnchorY === "bm"
        ? "bottom"
        : "middle";

  const placedTexts: PlacedText[] = [];
  const imageRegions: string[] = [];
  const overlays: string[] = [];
  /** CTA boxes and divider rules, rendered above text in the flow layer. */
  const flowExtras: string[] = [];

  const alignedX = (align: TextAlign, x: number, zoneWidth: number, boxWidth: number): number =>
    align === "center"
      ? x + Math.round((zoneWidth - boxWidth) / 2)
      : align === "right"
        ? x + zoneWidth - boxWidth
        : x;

  const drawCta = (x: number, y: number, zoneWidth: number): void => {
    if (!ctaBox) {
      return;
    }
    const boxX = alignedX(values.layoutAlign, x, zoneWidth, ctaBox.boxWidth);
    const fontSize = ctaBox.fontSize;
    const strokeWidth = Math.max(1.5, fontSize * 0.09);
    const fontAttrs =
      `font-family="'Rework Micro', 'Inter Variable', sans-serif" font-weight="600" ` +
      `font-size="${fontSize.toFixed(1)}" letter-spacing="${(fontSize * 0.08).toFixed(2)}"`;
    if (values.ctaStyle === "underline") {
      const baseline = y + fontSize * 0.95;
      flowExtras.push(
        `<text x="${boxX}" y="${baseline.toFixed(1)}" ${fontAttrs} fill="${ctaColor}" style="white-space:pre">${escapeXml(ctaBox.label)}</text>` +
          `<rect x="${boxX}" y="${(y + ctaBox.boxHeight - strokeWidth).toFixed(1)}" width="${ctaBox.boxWidth}" height="${strokeWidth.toFixed(1)}" fill="${ctaColor}"/>`,
      );
      return;
    }
    const filled = values.ctaStyle === "filled";
    // Filled buttons pick a contrasting label automatically.
    const labelColor = filled
      ? hexLuminanceOf(ctaColor) > 0.45
        ? "#111110"
        : "#f5f2ec"
      : ctaColor;
    const radius = values.ctaPill ? (ctaBox.boxHeight / 2).toFixed(1) : "0";
    const rect = filled
      ? `<rect x="${boxX}" y="${y}" width="${ctaBox.boxWidth}" height="${ctaBox.boxHeight}" rx="${radius}" fill="${ctaColor}"/>`
      : `<rect x="${(boxX + strokeWidth / 2).toFixed(1)}" y="${(y + strokeWidth / 2).toFixed(1)}" width="${(ctaBox.boxWidth - strokeWidth).toFixed(1)}" height="${(ctaBox.boxHeight - strokeWidth).toFixed(1)}" rx="${radius}" fill="none" stroke="${ctaColor}" stroke-width="${strokeWidth.toFixed(1)}"/>`;
    const labelX = boxX + ctaBox.boxWidth / 2;
    const labelY = y + ctaBox.boxHeight / 2 + fontSize * 0.34;
    flowExtras.push(
      rect +
        `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" ${fontAttrs} fill="${labelColor}" style="white-space:pre">${escapeXml(ctaBox.label)}</text>`,
    );
  };

  const drawDivider = (x: number, y: number, zoneWidth: number): void => {
    const length = Math.max(48, Math.round(zoneWidth * dividerFraction(values.dividerLength)));
    const lineX = alignedX(values.layoutAlign, x, zoneWidth, length);
    flowExtras.push(
      `<rect x="${lineX}" y="${y}" width="${length}" height="${dividerHeight}" fill="${dividerColor}"/>`,
    );
  };

  const drawList = (x: number, y: number, zoneWidth: number): void => {
    const anchor = toSvgAlign(values.layoutAlign);
    const textX =
      values.layoutAlign === "center"
        ? x + zoneWidth / 2
        : values.layoutAlign === "right"
          ? x + zoneWidth
          : x;
    values.listItems.forEach((item, index) => {
      const rowTop = y + index * listRowHeight;
      const baseline = rowTop + listRowHeight / 2 + listFontSize * 0.34;
      flowExtras.push(
        `<text x="${textX.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="${anchor}" ` +
          `font-family="${escapeXml(bodyStyle.fontFamily)}" font-weight="${bodyStyle.fontWeight}" ` +
          `font-size="${listFontSize.toFixed(1)}" fill="${listColor}" style="white-space:pre">` +
          `${escapeXml(item)}</text>`,
      );
      if (index < values.listItems.length - 1) {
        const ruleY = rowTop + listRowHeight;
        flowExtras.push(
          `<rect x="${x}" y="${ruleY.toFixed(1)}" width="${zoneWidth}" height="1" fill="${listColor}" opacity="0.16"/>`,
        );
      }
    });
  };

  const drawLockup = (x: number, y: number, zoneWidth: number): void => {
    if (!lockupBox || !lockupMotif) {
      return;
    }
    const box = lockupBox;
    const rowX = alignedX(values.layoutAlign, x, zoneWidth, box.rowW);
    const color = colorHex(
      brand,
      values.contentColorId ?? (bleed ? "bone" : values.subheadColorId),
    );
    // Recolour like the logo: pre-baked variant per content colour (no filters).
    const motifUrl = values.contentColorId
      ? (lockupMotif.colorVariants?.[values.contentColorId] ?? lockupMotif.url)
      : lockupMotif.url;
    const baseline = y + box.rowH / 2 + box.fontSize * 0.34;
    const fontAttrs =
      `font-family="'Rework Micro', 'Inter Variable', sans-serif" font-weight="600" ` +
      `font-size="${box.fontSize.toFixed(1)}" letter-spacing="${(box.fontSize * 0.16).toFixed(2)}"`;
    let cursorX = rowX;
    if (box.leftW > 0) {
      flowExtras.push(
        `<text x="${cursorX.toFixed(1)}" y="${baseline.toFixed(1)}" ${fontAttrs} fill="${color}" style="white-space:pre">${escapeXml(box.leftText)}</text>`,
      );
      cursorX += box.leftW + box.gapPx;
    }
    flowExtras.push(
      `<image href="${motifUrl}" x="${cursorX.toFixed(1)}" y="${(y + (box.rowH - box.motifH) / 2).toFixed(1)}" ` +
        `width="${box.motifW}" height="${box.motifH}" preserveAspectRatio="xMidYMid meet"/>`,
    );
    cursorX += box.motifW;
    if (box.rightW > 0) {
      cursorX += box.gapPx;
      flowExtras.push(
        `<text x="${cursorX.toFixed(1)}" y="${baseline.toFixed(1)}" ${fontAttrs} fill="${color}" style="white-space:pre">${escapeXml(box.rightText)}</text>`,
      );
    }
  };

  const drawMasthead = (x: number, y: number, zoneWidth: number): void => {
    if (!mastheadBox) {
      return;
    }
    const box = mastheadBox;
    const rowX = alignedX(values.layoutAlign, x, zoneWidth, box.rowW);
    const midY = y + box.rowH / 2;
    const color = colorHex(
      brand,
      values.contentColorId ?? (bleed ? "bone" : values.subheadColorId),
    );
    const logoUrl = mastheadLogoVariant
      ? values.contentColorId
        ? (mastheadLogoVariant.colorVariants?.[values.contentColorId] ?? mastheadLogoVariant.url)
        : mastheadLogoVariant.url
      : "";
    const dividerH = Math.round(box.rowH * 0.8);
    const pushDivider = (atX: number): void => {
      flowExtras.push(
        `<rect x="${atX.toFixed(1)}" y="${(midY - dividerH / 2).toFixed(1)}" width="${box.hairW}" height="${dividerH}" fill="${color}" opacity="0.5"/>`,
      );
    };
    let cursorX = rowX;
    let previousSegment = false;
    const divideBefore = (): void => {
      if (!previousSegment) return;
      cursorX += box.gapPx;
      pushDivider(cursorX);
      cursorX += box.hairW + box.gapPx;
    };
    if (box.logoW > 0 && logoUrl) {
      flowExtras.push(
        `<image href="${logoUrl}" x="${cursorX.toFixed(1)}" y="${(midY - box.logoH / 2).toFixed(1)}" ` +
          `width="${box.logoW}" height="${box.logoH}" preserveAspectRatio="xMidYMid meet"/>`,
      );
      cursorX += box.logoW;
      previousSegment = true;
    }
    if (box.titleW > 0) {
      divideBefore();
      const baseline = midY + box.titleFont * 0.34;
      flowExtras.push(
        `<text x="${cursorX.toFixed(1)}" y="${baseline.toFixed(1)}" ` +
          `font-family="${escapeXml(editorialCapsStyle.fontFamily)}" ` +
          `font-weight="${editorialCapsStyle.fontWeight}" font-size="${box.titleFont.toFixed(1)}" ` +
          `letter-spacing="${((editorialCapsStyle.letterSpacingEm ?? 0.045) * box.titleFont).toFixed(2)}" ` +
          `fill="${color}" style="white-space:pre;font-feature-settings:'ordn' 1">${escapeXml(box.titleText)}</text>`,
      );
      cursorX += box.titleW;
      previousSegment = true;
    }
    if (box.captionLines.length > 0) {
      divideBefore();
      const captionH = box.captionLines.length * box.captionLineH;
      const captionTop = midY - captionH / 2;
      const fontAttrs =
        `font-family="'Rework Micro', 'Inter Variable', sans-serif" font-weight="600" ` +
        `font-size="${box.captionFont.toFixed(1)}" letter-spacing="${(box.captionFont * 0.16).toFixed(2)}"`;
      box.captionLines.forEach((line, index) => {
        const baseline =
          captionTop + box.captionLineH * index + box.captionLineH / 2 + box.captionFont * 0.34;
        flowExtras.push(
          `<text x="${cursorX.toFixed(1)}" y="${baseline.toFixed(1)}" ${fontAttrs} fill="${color}" style="white-space:pre">${escapeXml(line)}</text>`,
        );
      });
    }
  };

  const placeStack = (options2: {
    blocks: (FlowKind | "logo")[];
    /** Gap after block i (parallel to blocks); falls back to the base gap. */
    gapAfter?: number[];
    width?: number;
    x: number;
    y: number;
  }): number => {
    const zoneWidth = options2.width ?? textWidth;
    let cursor = options2.y;
    options2.blocks.forEach((kind, index) => {
      const height2 = blockHeight(kind);
      if (height2 <= 0) {
        return;
      }
      if (kind === "logo") {
        // In-flow logo: aligned within the block like the text, at this row.
        logoX = alignedX(values.layoutAlign, options2.x, zoneWidth, logoWidth);
        logoY = cursor;
      } else if (kind === "cta") {
        drawCta(options2.x, cursor, zoneWidth);
      } else if (kind === "divider") {
        drawDivider(options2.x, cursor, zoneWidth);
      } else if (kind === "list") {
        drawList(options2.x, cursor, zoneWidth);
      } else if (kind === "lockup") {
        drawLockup(options2.x, cursor, zoneWidth);
      } else if (kind === "masthead") {
        drawMasthead(options2.x, cursor, zoneWidth);
      } else {
        const block = measured[kind]!;
        placedTexts.push({
          align: toSvgAlign(alignFor(kind)),
          block,
          colorId: colorFor(kind),
          style: styleFor(kind),
          width: zoneWidth,
          x: options2.x,
          y: cursor,
        });
      }
      cursor += height2 + (options2.gapAfter?.[index] ?? (kind === "logo" ? logoGap : gap));
    });
    return Math.max(0, cursor - options2.y - gap);
  };

  /**
   * Place the flow stack inside a zone under the Layout controls:
   *  • anchorX positions a wrap-column-width block left / center / right;
   *  • anchorY positions the block top / middle / bottom (Stack distribution);
   *  • Spread fills the zone height with equal gaps; Grouped fills it too but
   *    keeps grouped-together elements tight and only opens the group seams.
   */
  const placeStackInZone = (options2: {
    blocks: (FlowKind | "logo")[];
    position: Exclude<TextPosition, "auto">;
    width?: number;
    zone: Region;
  }): void => {
    const placeable = options2.blocks.filter((kind) => blockHeight(kind) > 0);
    if (placeable.length === 0) {
      return;
    }

    // Horizontal: a block sized to the wrap column, positioned by anchorX.
    const blockWidth = Math.min(options2.width ?? textWidth, options2.zone.width);
    const freeX = Math.max(0, options2.zone.width - blockWidth);
    const blockX =
      options2.zone.x + Math.round(freeX * ANCHOR_X_FRACTION[values.layoutAnchorX]);

    // Per-element add-only spacing. Inter-element: each seam grows by the bottom
    // of the element above + the top of the one below (separating them). Outer:
    // space above the first element pushes the whole block DOWN and space below
    // the last pulls it UP — a translation off the anchor, so even a lone element
    // can be nudged off its placement (rather than the margin collapsing at the
    // aligned edge).
    const seams = placeable.length - 1;
    const seamExtra = new Array<number>(placeable.length).fill(0);
    for (let i = 0; i < seams; i += 1) {
      seamExtra[i] = spaceBottomFor(placeable[i]!) + spaceTopFor(placeable[i + 1]!);
    }
    const seamTotal = seamExtra.reduce((sum, value) => sum + value, 0);
    // Outer translation: per-element edge spacing PLUS the global block spacing
    // (space above the block pushes it down, space below pulls it up). Inner
    // seams are untouched, so the elements keep their own rhythm.
    const outerOffset =
      spaceTopFor(placeable[0]!) -
      spaceBottomFor(placeable[placeable.length - 1]!) +
      blockTop -
      blockBottom;

    // Vertical: distribute the free space (after inter-element spacing) per mode.
    const freeY = Math.max(0, options2.zone.height - stackHeight(placeable) - seamTotal);
    const gapAfter = new Array<number>(placeable.length).fill(gap);
    for (let i = 0; i < seams; i += 1) {
      gapAfter[i] += seamExtra[i];
    }
    let startY =
      options2.zone.y + outerOffset + Math.round(freeY * ANCHOR_Y_FRACTION[values.layoutAnchorY]);

    // Grouping is universal: only "open" seams (between elements NOT joined
    // downward) ever expand; grouped elements always stay tight, in any mode.
    const openSeams: number[] = [];
    for (let i = 0; i < seams; i += 1) {
      if (!values.layoutGroupWithNext.includes(placeable[i]!)) {
        openSeams.push(i);
      }
    }
    if (values.layoutDistribution === "spread" && openSeams.length > 0) {
      // Fill: split all free height evenly across the open seams (block spans
      // the zone top-to-bottom, inside any lead/tail padding).
      const extra = Math.round(freeY / openSeams.length);
      for (const i of openSeams) {
        gapAfter[i] += extra;
      }
      startY = options2.zone.y + outerOffset;
    } else if (values.layoutDistribution === "spaced" && openSeams.length > 0) {
      // Recommended separation: a comfortable fixed gap on each open seam
      // (~6% of the zone), capped by the free space — the block still sits at
      // the placement anchor rather than stretching to the edges.
      const recommended = Math.round(options2.zone.height * 0.06);
      const extra = Math.min(recommended, Math.floor(freeY / openSeams.length));
      for (const i of openSeams) {
        gapAfter[i] += extra;
      }
      const used = extra * openSeams.length;
      const rest = Math.max(0, freeY - used);
      startY =
        options2.zone.y + outerOffset + Math.round(rest * ANCHOR_Y_FRACTION[values.layoutAnchorY]);
    }

    // A stacked logo keeps its extra breathing room below, on top of whatever
    // the distribution mode already opened on that seam.
    const logoIdx = placeable.indexOf("logo");
    if (logoIdx >= 0 && logoIdx < placeable.length - 1) {
      gapAfter[logoIdx] += logoGap - gap;
    }

    placeStack({ blocks: placeable, gapAfter, width: blockWidth, x: blockX, y: startY });
  };

  // No automatic legibility scrim: darkening is applied only through the Overlay
  // selector (overlay.style), so nothing tints behind the text unless the user
  // asks for it. (Bleed text still forces a light color for contrast.)

  if (collageActive) {
    const count = collageAssets.length;
    const columns =
      values.collageColumns === "auto"
        ? count <= 2
          ? count
          : count <= 4
            ? 2
            : 3
        : Math.max(1, Math.min(Number(values.collageColumns), count));
    // Gated per-cell captions (product grids); off unless the comp sets them.
    const collageCaptionArgs = values.collageShowCaptions
      ? {
          captionColor: colorHex(brand, values.contentColorId ?? (bleed ? "bone" : values.bodyColorId)),
          captionFontFamily: bodyStyle.fontFamily,
          captionSize: width * 0.026,
          captions: values.collageCaptions,
        }
      : {};
    if (bleed) {
      // House style: the grid owns the whole canvas, text sits on the scrim.
      const gutter = Math.max(2, Math.round(Math.min(width, height) * 0.008 * spacing));
      imageRegions.push(
        collageCellsSvg({
          assets: collageAssets,
          columns,
          gutter,
          height,
          radius: values.imageRadius,
          width,
          x: 0,
          y: 0,
          ...collageCaptionArgs,
        }),
      );
      const position = resolveTextPosition("bottom");
      ensureTextFits(region.height, 0);
      placeStackInZone({ blocks: includedKeys, position, zone: region });
    } else {
      // Framed collage: grid and text stack share the content region.
      const gutter = Math.max(2, Math.round(Math.min(width, height) * 0.012 * spacing));
      const minImage = Math.round(region.height * 0.3);
      const maxImage = Math.round(region.height * 0.66);
      ensureTextFits(region.height - minImage - gapL, 0);
      const textHeight = stackHeight(includedKeys);
      const hasText = textHeight > 0;
      const imageHeight = hasText
        ? Math.min(maxImage, Math.max(minImage, region.height - textHeight - gapL))
        : region.height;
      const imageFirst = values.layoutOrder === "image";
      imageRegions.push(
        collageCellsSvg({
          assets: collageAssets,
          columns,
          gutter,
          height: imageHeight,
          radius: values.imageRadius,
          width: region.width,
          x: region.x,
          y: imageFirst ? region.y : region.y + region.height - imageHeight,
          ...collageCaptionArgs,
        }),
      );
      if (hasText) {
        placeStackInZone({
          blocks: includedKeys,
          position: resolveTextPosition(imageFirst ? "top" : "bottom"),
          zone: imageFirst
            ? {
                height: region.height - imageHeight - gapL,
                width: region.width,
                x: region.x,
                y: region.y + imageHeight + gapL,
              }
            : {
                height: region.height - imageHeight - gapL,
                width: region.width,
                x: region.x,
                y: region.y,
              },
        });
      }
    }
  } else if (bleed && asset) {
    const position = resolveTextPosition("bottom");
    imageRegions.push(coverImage({ asset, height, width, x: 0, y: 0 }));
    ensureTextFits(region.height, 0);
    placeStackInZone({ blocks: includedKeys, position, zone: region });
  } else {
    switch (pattern) {
      case "poster": {
        if (asset) {
          const minImage = Math.round(region.height * 0.24);
          const maxImage = Math.round(region.height * 0.58);
          ensureTextFits(region.height - minImage - gapL, 0);
          const textHeight = stackHeight(includedKeys);
          const imageHeight = Math.min(
            maxImage,
            Math.max(minImage, region.height - textHeight - gapL),
          );
          const imageFirst = values.layoutOrder === "image";
          imageRegions.push(
            coverImage({
              asset,
              height: imageHeight,
              width: region.width,
              x: region.x,
              y: imageFirst ? region.y : region.y + region.height - imageHeight,
            }),
          );
          const zone: Region = imageFirst
            ? {
                height: region.height - imageHeight - gapL,
                width: region.width,
                x: region.x,
                y: region.y + imageHeight + gapL,
              }
            : {
                height: region.height - imageHeight - gapL,
                width: region.width,
                x: region.x,
                y: region.y,
              }
          placeStackInZone({
            blocks: includedKeys,
            position: resolveTextPosition(imageFirst ? "top" : "bottom"),
            zone,
          });
        } else {
          ensureTextFits(region.height, 0);
          placeStackInZone({
            blocks: includedKeys,
            position: resolveTextPosition("top"),
            zone: region,
          });
        }
        break;
      }
      case "split": {
        if (wide) {
          const columnGap = Math.round(width * 0.04);
          const columnWidth = Math.round((region.width - columnGap) / 2);
          const imageFirst = values.layoutOrder === "image";
          const imageX = imageFirst ? region.x : region.x + columnWidth + columnGap;
          const textX = imageFirst ? region.x + columnWidth + columnGap : region.x;
          if (asset) {
            imageRegions.push(
              coverImage({
                asset,
                height: region.height,
                width: columnWidth,
                x: imageX,
                y: region.y,
              }),
            );
          }
          ensureTextFits(region.height, 0);
          placeStackInZone({
            blocks: includedKeys,
            position: resolveTextPosition("middle"),
            width: columnWidth,
            zone: { height: region.height, width: columnWidth, x: textX, y: region.y },
          });
        } else {
          // Portrait split: heading+subhead group and body bookend the image.
          const imageFirst = values.layoutOrder === "image";
          // Elements before the first body copy sit above the image; body and
          // everything after it bookend the bottom (classic portrait split).
          const bodyIndex = includedKeys.indexOf("body");
          const topKeys = bodyIndex >= 0 ? includedKeys.slice(0, bodyIndex) : includedKeys;
          const bodyKeys = bodyIndex >= 0 ? includedKeys.slice(bodyIndex) : [];
          if (asset) {
            const minImage = Math.round(region.height * 0.3);
            const maxImage = Math.round(region.height * 0.55);
            const gapsPx =
              gapM * (topKeys.length > 0 ? 1 : 0) + gapM * (bodyKeys.length > 0 ? 1 : 0);
            ensureTextFits(region.height - minImage - gapsPx, gap * 1);
            const topHeight = stackHeight(topKeys);
            const bodyHeight = stackHeight(bodyKeys);
            const imageHeight = Math.min(
              maxImage,
              Math.max(minImage, region.height - topHeight - bodyHeight - gapsPx),
            );
            const slack = Math.max(
              0,
              region.height - imageHeight - topHeight - bodyHeight - gapsPx,
            );
            if (imageFirst) {
              imageRegions.push(
                coverImage({
                  asset,
                  height: imageHeight,
                  width: region.width,
                  x: region.x,
                  y: region.y,
                }),
              );
              placeStackInZone({
                blocks: topKeys,
                position: resolveTextPosition("top"),
                zone: {
                  height: topHeight + slack,
                  width: region.width,
                  x: region.x,
                  y: region.y + imageHeight + gapM,
                },
              });
            } else {
              placeStackInZone({
                blocks: topKeys,
                position: resolveTextPosition("top"),
                zone: {
                  height: topHeight + slack,
                  width: region.width,
                  x: region.x,
                  y: region.y,
                },
              });
              imageRegions.push(
                coverImage({
                  asset,
                  height: imageHeight,
                  width: region.width,
                  x: region.x,
                  y: region.y + topHeight + slack + gapM,
                }),
              );
            }
            if (bodyKeys.length > 0) {
              placeStack({
                blocks: bodyKeys,
                x: region.x,
                y: region.y + region.height - bodyHeight,
              });
            }
          } else {
            ensureTextFits(region.height, 0);
            placeStackInZone({
              blocks: includedKeys,
              position: resolveTextPosition("top"),
              zone: region,
            });
          }
        }
        break;
      }
      case "banded": {
        // Banded: the first element is the top band; the rest sit below the image.
        const headingKeys = includedKeys.slice(0, 1);
        const lowerKeys = includedKeys.slice(1);
        if (asset) {
          const minImage = Math.round(region.height * 0.24);
          const maxImage = Math.round(region.height * 0.5);
          const bandGaps =
            gapM * (headingKeys.length > 0 ? 1 : 0) + gapM * (lowerKeys.length > 0 ? 1 : 0);
          ensureTextFits(region.height - minImage - bandGaps, gap);
          const headingHeight = stackHeight(headingKeys);
          const lowerHeight = stackHeight(lowerKeys);
          const imageHeight = Math.min(
            maxImage,
            Math.max(minImage, region.height - headingHeight - lowerHeight - bandGaps),
          );
          const imageFirst = values.layoutOrder === "image";
          let cursor = region.y;
          const drawImage = (): void => {
            imageRegions.push(
              coverImage({
                asset,
                height: imageHeight,
                width: region.width,
                x: region.x,
                y: cursor,
              }),
            );
            cursor += imageHeight + (lowerKeys.length > 0 || headingKeys.length > 0 ? gapM : 0);
          };
          const drawHeading = (): void => {
            if (headingKeys.length > 0) {
              placeStack({ blocks: headingKeys, x: region.x, y: cursor });
              cursor += headingHeight + gapM;
            }
          };
          if (imageFirst) {
            drawImage();
            drawHeading();
          } else {
            drawHeading();
            drawImage();
          }
          if (lowerKeys.length > 0) {
            placeStackInZone({
              blocks: lowerKeys,
              position: resolveTextPosition("top"),
              zone: {
                height: Math.max(lowerHeight, region.y + region.height - cursor),
                width: region.width,
                x: region.x,
                y: cursor,
              },
            });
          }
        } else {
          ensureTextFits(region.height, 0);
          placeStackInZone({
            blocks: includedKeys,
            position: resolveTextPosition("top"),
            zone: region,
          });
        }
        break;
      }
      case "collage": {
        // Collage with no resolvable photos: render the text stack alone.
        ensureTextFits(region.height, 0);
        placeStackInZone({
          blocks: includedKeys,
          position: resolveTextPosition("top"),
          zone: region,
        });
        break;
      }
      case "edge": {
        let zone = region;
        if (asset) {
          const imageWidth = Math.round(width * 0.44);
          const imageHeight = Math.round(height * 0.52);
          imageRegions.push(
            coverImage({
              asset,
              height: imageHeight,
              width: imageWidth,
              x: width - imageWidth,
              y: 0,
            }),
          );
          // Text lives below the corner image so it never crosses the photo.
          const zoneTop = Math.max(region.y, imageHeight + gap);
          zone = {
            height: Math.max(0, region.y + region.height - zoneTop),
            width: region.width,
            x: region.x,
            y: zoneTop,
          };
        }
        ensureTextFits(zone.height, 0);
        placeStackInZone({
          blocks: includedKeys,
          position: resolveTextPosition("bottom"),
          zone,
        });
        break;
      }
    }
  }

  // Overlay treatment: shades/washes go under the text (legibility helpers),
  // keyline/grain go over everything. Paint-only — layout is already solved.
  const overlayLayers = buildOverlaySvg({
    height,
    margin,
    onImage: bleed || collageActive,
    strengthPct: values.overlayStrength,
    style: values.overlayStyle,
    surfaceHex: values.backgroundHex,
    width,
  });
  if (overlayLayers.under) {
    overlays.push(overlayLayers.under);
  }

  const textSvg = placedTexts
    .map((placed) =>
      textBlockSvg({
        align: placed.align,
        block: placed.block,
        color: colorHex(brand, placed.colorId),
        // Only headings carry flourished words; inert for other blocks. Each
        // flourished word uses its own override, else the heading default.
        flourishStyleFor: (wordIndex) =>
          values.headingFlourishStyles[wordIndex] ?? values.headingFlourishStyle,
        style: placed.style,
        width: placed.width,
        x: placed.x,
        y: placed.y,
      }),
    )
    .join("");

  // Logos are pre-whitened tight-cropped artwork (see logo-white.ts) — no CSS
  // filters here; WebKit drops filters inside SVG-as-image documents. The Studio
  // content colour picks a pre-baked recoloured variant so the mark matches the
  // copy; Email has no contentColorId, so it keeps the white variant.
  const logoUrl =
    logo && values.contentColorId
      ? (logo.colorVariants?.[values.contentColorId] ?? logo.url)
      : (logo?.url ?? "");
  const logoSvg = logo
    ? `<image href="${logoUrl}" x="${logoX}" y="${logoY}" ` +
      `width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`
    : "";

  const backgroundRect =
    values.backgroundHex === "transparent"
      ? ""
      : `<rect width="${width}" height="${height}" fill="${values.backgroundHex}"/>`;

  const fontStyle = options.fontFaceCss ? `<style>${options.fontFaceCss}</style>` : "";

  // Everything except the background is the "graphic". An overall scale < 100%
  // shrinks it toward center, leaving a margin of background (the background
  // rect itself stays full-bleed). At 100% there is no wrapper — byte-identical.
  const foreground =
    (options.omitBackgroundImage ? "" : imageRegions.join("")) +
    overlays.join("") +
    textSvg +
    flowExtras.join("") +
    logoSvg +
    overlayLayers.over;
  const scale = Math.min(1, Math.max(0.5, values.contentScale / 100));
  const scaledForeground =
    scale >= 1
      ? foreground
      : `<g transform="translate(${((width / 2) * (1 - scale)).toFixed(2)} ${((height / 2) * (1 - scale)).toFixed(2)}) scale(${scale.toFixed(4)})">${foreground}</g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    fontStyle +
    backgroundRect +
    scaledForeground +
    `</svg>`;

  return { height, svg, textScale, width };
}
