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
  HEADING_SIZE_MULTIPLIERS,
  LEADING_MULTIPLIERS,
  LOGO_SIZE_MULTIPLIERS,
  SIZE_MULTIPLIERS,
  type FlowKind,
  type OverlayStyle,
  type StudioValues,
  type TextAlign,
  type TextPosition,
} from "./comp-layout";

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
  width: number;
  x: number;
  y: number;
}): string {
  const { asset, height, width, x, y } = options;
  const focalX = options.focalX ?? asset.focalPoint.x;
  const focalY = options.focalY ?? asset.focalPoint.y;
  const naturalWidth = Math.max(1, asset.width);
  const naturalHeight = Math.max(1, asset.height);
  const scale = Math.max(width / naturalWidth, height / naturalHeight);
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
  return (
    `<svg x="${x}" y="${y}" width="${width}" height="${height}" ` +
    `viewBox="${sourceX.toFixed(1)} ${sourceY.toFixed(1)} ${sourceWidth.toFixed(1)} ${sourceHeight.toFixed(1)}" ` +
    `preserveAspectRatio="none">` +
    `<image href="${asset.url}" width="${naturalWidth}" height="${naturalHeight}"/>` +
    `</svg>`
  );
}

/**
 * Buzz-style collage: cover-crop a photo set into a grid of cells. Rows are
 * filled left-to-right; a short last row stretches its cells to full width so
 * the grid always reads as one composed block.
 */
function collageCellsSvg(options: {
  assets: readonly Asset[];
  columns: number;
  gutter: number;
  height: number;
  width: number;
  x: number;
  y: number;
}): string {
  const { assets, columns, gutter, height, width, x, y } = options;
  const count = assets.length;
  const rows = Math.ceil(count / columns);
  const cellHeight = (height - gutter * (rows - 1)) / rows;
  const parts: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const rowAssets = assets.slice(row * columns, (row + 1) * columns);
    const cellWidth = (width - gutter * (rowAssets.length - 1)) / rowAssets.length;
    for (const [column, asset] of rowAssets.entries()) {
      parts.push(
        coverImageSvg({
          asset,
          height: Math.round(cellHeight),
          width: Math.round(cellWidth),
          x: Math.round(x + column * (cellWidth + gutter)),
          y: Math.round(y + row * (cellHeight + gutter)),
        }),
      );
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
  style: BrandTextStyle;
  width: number;
  x: number;
  y: number;
}): string {
  const { align, block, color, style, width, x, y } = options;
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
        // Whole word goes italic; the swash feature rides only the first and
        // last glyph (entry + terminal swash), never the middle.
        const open = `<tspan style="font-feature-settings:${FLOURISH_FEATURES}">`;
        const text = word.text;
        const inner =
          text.length === 1
            ? `${open}${escapeXml(text)}</tspan>`
            : `${open}${escapeXml(text[0]!)}</tspan>` +
              `${escapeXml(text.slice(1, -1))}` +
              `${open}${escapeXml(text.slice(-1))}</tspan>`;
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

type TextKey = "heading" | "subhead" | "body";

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
    coverImageSvg({ ...opts, focalX: values.imageFocalX, focalY: values.imageFocalY });

  const headingStyle =
    brand.textStyles.find((style) => style.id === values.headingStyleId) ??
    brand.textStyles[0]!;
  const subheadStyle =
    brand.textStyles.find((style) => style.role === "subhead") ?? brand.textStyles[0]!;
  const bodyStyle =
    brand.textStyles.find((style) => style.role === "body") ?? brand.textStyles[0]!;

  // On a bleed image, force light text over the scrim for legibility.
  const headingColorId = bleed ? "bone" : values.headingColorId;
  const subheadColorId = bleed ? "bone" : values.subheadColorId;
  const bodyColorId = bleed ? "bone" : values.bodyColorId;

  const leading = LEADING_MULTIPLIERS[values.typeLeading];
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
    key === "heading" ? headingStyle : key === "subhead" ? subheadStyle : bodyStyle;
  const colorFor = (key: TextKey): string =>
    key === "heading" ? headingColorId : key === "subhead" ? subheadColorId : bodyColorId;
  const alignFor = (key: FlowKind): TextAlign =>
    key === "heading"
      ? values.headingAlign
      : key === "subhead"
        ? values.subheadAlign
        : key === "cta"
          ? values.ctaAlign
          : values.bodyAlign;
  const baseSizeFor = (key: TextKey): number => {
    const style = styleFor(key);
    if (key === "heading") {
      return style.sizeFactor * width * HEADING_SIZE_MULTIPLIERS[values.headingSize];
    }
    const step = key === "subhead" ? values.subheadSize : values.bodySize;
    return style.sizeFactor * width * SIZE_MULTIPLIERS[step];
  };

  /** ---- Flow stack: the user-ordered element list. ------------------------ */
  const TEXT_KINDS: readonly TextKey[] = ["heading", "subhead", "body"];
  const isTextKind = (kind: FlowKind): kind is TextKey =>
    (TEXT_KINDS as readonly string[]).includes(kind);

  const ctaColor = colorHex(brand, bleed ? "bone" : values.ctaColorId);
  const dividerColor = colorHex(brand, bleed ? "bone" : values.dividerColorId);
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
    }
  };

  const includedKeys: FlowKind[] = values.elementsOrder.filter(presentInFlow);
  const includedTextKeys = includedKeys.filter(isTextKind);

  interface CtaBox {
    boxHeight: number;
    boxWidth: number;
    fontSize: number;
    label: string;
  }

  const measureCta = (scale: number): CtaBox => {
    const fontSize = width * 0.019 * SIZE_MULTIPLIERS[values.ctaSize] * scale;
    const label = values.ctaText.trim().toUpperCase();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    let labelWidth = label.length * fontSize * 0.72;
    if (context) {
      context.font = `600 ${fontSize}px 'Rework Micro', 'Inter Variable', sans-serif`;
      const spacing = fontSize * 0.08;
      try {
        (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
          `${spacing}px`;
        labelWidth = context.measureText(label).width;
      } catch {
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

  type MeasuredMap = Partial<Record<TextKey, MeasuredTextBlock>>;
  const measureAll = (scale: number): MeasuredMap => {
    const map: MeasuredMap = {};
    for (const key of includedTextKeys) {
      const style = styleFor(key);
      map[key] = measureTextBlock({
        flourishWordIndexes: key === "heading" ? values.headingFlourish : [],
        lineHeight: style.lineHeight * leading,
        maxWidthPx: textWidth,
        sizePx: baseSizeFor(key) * scale,
        style,
        text:
          key === "heading"
            ? values.headingText
            : key === "subhead"
              ? values.subheadText
              : values.bodyText,
      });
    }
    return map;
  };

  let measured = measureAll(1);
  let ctaBox = includedKeys.includes("cta") ? measureCta(1) : null;
  let textScale = 1;

  const blockHeight = (kind: FlowKind): number => {
    if (kind === "cta") {
      return ctaBox?.boxHeight ?? 0;
    }
    if (kind === "divider") {
      return dividerHeight;
    }
    const block = measured[kind];
    return block && block.lines.length > 0 ? block.heightPx : 0;
  };

  const stackHeight = (keys: FlowKind[]): number => {
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
    }
  };

  /** ---- Logo: pre-whitened artwork, sized, anchored in the content box. --- */
  const logo = values.logoInclude
    ? (brand.logos.find((candidate) => candidate.id === values.logoVariantId) ??
      brand.logos[0])
    : undefined;
  const logoHeight = logo
    ? Math.round(Math.min(width, height) * 0.085 * LOGO_SIZE_MULTIPLIERS[values.logoSize])
    : 0;
  const logoWidth = logo ? Math.round(logoHeight * logo.aspectRatio) : 0;
  const anchor = values.logoAnchor;
  const logoX = logo
    ? anchor.endsWith("right")
      ? content.x + content.width - logoWidth
      : anchor.endsWith("center") || anchor === "center"
        ? content.x + Math.round((content.width - logoWidth) / 2)
        : content.x
    : 0;
  const logoY = logo
    ? anchor.startsWith("bottom")
      ? content.y + content.height - logoHeight
      : anchor.startsWith("center") || anchor === "center"
        ? content.y + Math.round((content.height - logoHeight) / 2)
        : content.y
    : 0;

  // Reserve the logo's horizontal band so text and image never collide with it.
  const reservedTop = logo && anchor.startsWith("top") ? logoHeight + gap : 0;
  const reservedBottom = logo && anchor.startsWith("bottom") ? logoHeight + gap : 0;
  const region: Region = {
    height: content.height - reservedTop - reservedBottom,
    width: content.width,
    x: content.x,
    y: content.y + reservedTop,
  };

  const resolveTextPosition = (
    fallback: Exclude<TextPosition, "auto">,
  ): Exclude<TextPosition, "auto"> =>
    values.layoutTextPosition === "auto" ? fallback : values.layoutTextPosition;

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
    const boxX = alignedX(values.ctaAlign, x, zoneWidth, ctaBox.boxWidth);
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
    const rect = filled
      ? `<rect x="${boxX}" y="${y}" width="${ctaBox.boxWidth}" height="${ctaBox.boxHeight}" fill="${ctaColor}"/>`
      : `<rect x="${(boxX + strokeWidth / 2).toFixed(1)}" y="${(y + strokeWidth / 2).toFixed(1)}" width="${(ctaBox.boxWidth - strokeWidth).toFixed(1)}" height="${(ctaBox.boxHeight - strokeWidth).toFixed(1)}" fill="none" stroke="${ctaColor}" stroke-width="${strokeWidth.toFixed(1)}"/>`;
    const labelX = boxX + ctaBox.boxWidth / 2;
    const labelY = y + ctaBox.boxHeight / 2 + fontSize * 0.34;
    flowExtras.push(
      rect +
        `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" ${fontAttrs} fill="${labelColor}" style="white-space:pre">${escapeXml(ctaBox.label)}</text>`,
    );
  };

  const drawDivider = (x: number, y: number, zoneWidth: number): void => {
    const length =
      values.dividerLength === "full" ? zoneWidth : Math.max(48, Math.round(width * 0.085));
    const lineX = alignedX(values.headingAlign, x, zoneWidth, length);
    flowExtras.push(
      `<rect x="${lineX}" y="${y}" width="${length}" height="${dividerHeight}" fill="${dividerColor}"/>`,
    );
  };

  const placeStack = (options2: {
    blocks: FlowKind[];
    width?: number;
    x: number;
    y: number;
  }): number => {
    const zoneWidth = options2.width ?? textWidth;
    let cursor = options2.y;
    for (const kind of options2.blocks) {
      const height2 = blockHeight(kind);
      if (height2 <= 0) {
        continue;
      }
      if (kind === "cta") {
        drawCta(options2.x, cursor, zoneWidth);
      } else if (kind === "divider") {
        drawDivider(options2.x, cursor, zoneWidth);
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
      cursor += height2 + gap;
    }
    return Math.max(0, cursor - options2.y - gap);
  };

  /** Place the full flow stack inside a zone at the resolved vertical position. */
  const placeStackInZone = (options2: {
    blocks: FlowKind[];
    position: Exclude<TextPosition, "auto">;
    width?: number;
    zone: Region;
  }): void => {
    const textHeight = stackHeight(options2.blocks);
    const free = Math.max(0, options2.zone.height - textHeight);
    const y =
      options2.position === "top"
        ? options2.zone.y
        : options2.position === "middle"
          ? options2.zone.y + free / 2
          : options2.zone.y + free;
    placeStack({
      blocks: options2.blocks,
      // Anchor alignment across the zone the viewer sees, not the (possibly
      // narrower) wrap column — otherwise center/right sit left of where they
      // should whenever textWidth < zone width (edge pattern, Max width < 100).
      width: options2.width ?? options2.zone.width,
      x: options2.zone.x,
      y,
    });
  };

  // Scrim follows the text: dark where the words sit, clear elsewhere.
  const pushScrim = (position: Exclude<TextPosition, "auto">): void => {
    const scrimStops =
      position === "top"
        ? `<stop offset="0" stop-color="#111110" stop-opacity="0.62"/>` +
          `<stop offset="0.42" stop-color="#111110" stop-opacity="0.05"/>` +
          `<stop offset="1" stop-color="#111110" stop-opacity="0.14"/>`
        : position === "middle"
          ? `<stop offset="0" stop-color="#111110" stop-opacity="0.2"/>` +
            `<stop offset="0.5" stop-color="#111110" stop-opacity="0.45"/>` +
            `<stop offset="1" stop-color="#111110" stop-opacity="0.2"/>`
          : `<stop offset="0" stop-color="#111110" stop-opacity="0.14"/>` +
            `<stop offset="0.42" stop-color="#111110" stop-opacity="0"/>` +
            `<stop offset="0.6" stop-color="#111110" stop-opacity="0.05"/>` +
            `<stop offset="1" stop-color="#111110" stop-opacity="0.66"/>`;
    overlays.push(
      `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">${scrimStops}</linearGradient></defs>` +
        `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#scrim)"/>`,
    );
  };

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
    if (bleed) {
      // House style: the grid owns the whole canvas, text sits on the scrim.
      const gutter = Math.max(2, Math.round(Math.min(width, height) * 0.008 * spacing));
      imageRegions.push(
        collageCellsSvg({ assets: collageAssets, columns, gutter, height, width, x: 0, y: 0 }),
      );
      const position = resolveTextPosition("bottom");
      pushScrim(position);
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
          width: region.width,
          x: region.x,
          y: imageFirst ? region.y : region.y + region.height - imageHeight,
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
    pushScrim(position);
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
        style: placed.style,
        width: placed.width,
        x: placed.x,
        y: placed.y,
      }),
    )
    .join("");

  // Logos are pre-whitened tight-cropped artwork (see logo-white.ts) — no
  // CSS filters here; WebKit drops filters inside SVG-as-image documents.
  const logoSvg = logo
    ? `<image href="${logo.url}" x="${logoX}" y="${logoY}" ` +
      `width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`
    : "";

  const backgroundRect =
    values.backgroundHex === "transparent"
      ? ""
      : `<rect width="${width}" height="${height}" fill="${values.backgroundHex}"/>`;

  const fontStyle = options.fontFaceCss ? `<style>${options.fontFaceCss}</style>` : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    fontStyle +
    backgroundRect +
    imageRegions.join("") +
    overlays.join("") +
    textSvg +
    flowExtras.join("") +
    logoSvg +
    overlayLayers.over +
    `</svg>`;

  return { height, svg, textScale, width };
}
