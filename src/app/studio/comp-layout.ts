/**
 * Studio value model: typed reading of runtime state plus shuffle space.
 * The visual builder lives in comp-svg.ts (one SVG for preview and export).
 */

import { DEFAULT_FORMAT_ID } from "../data/formats";

export type LayoutPatternId = "poster" | "split" | "banded" | "edge" | "collage";
export type CollageColumns = "auto" | "1" | "2" | "3";
export type ContentOrder = "image" | "text";
export type TextPosition = "auto" | "top" | "middle" | "bottom";
export type TextAlign = "left" | "center" | "right";
export type SizeStep = "s" | "m" | "l";
export type LeadingStep = "tight" | "normal" | "airy";
/** Elements that live in the reorderable flow stack. */
export type FlowKind =
  | "heading"
  | "subhead"
  | "body"
  | "cta"
  | "divider"
  | "eyebrow"
  | "list"
  | "lockup";
export type CtaStyle = "outline" | "filled" | "underline";
/** How flourished heading words render: swashes on both end letters, on the
 * first or last letter only (rest plain italic), or plain italic throughout. */
export type FlourishStyle = "swash" | "swash-first" | "swash-last" | "italic";
/** Full-canvas overlay treatments (paint-only; never affect layout). */
export type OverlayStyle =
  | "none"
  | "shade-bottom"
  | "shade-top"
  | "shade-frame"
  | "shade-left"
  | "shade-right"
  | "vignette"
  | "wash-ink"
  | "wash-bone"
  | "keyline"
  | "grain";

export const OVERLAY_STYLES: readonly OverlayStyle[] = [
  "none",
  "shade-bottom",
  "shade-top",
  "shade-frame",
  "shade-left",
  "shade-right",
  "vignette",
  "wash-ink",
  "wash-bone",
  "keyline",
  "grain",
];
export type DividerWeight = "hairline" | "regular" | "bold";
export type DividerLength = "full" | "short";

/** Where the text block sits in its zone (25-way 5×5 placement grid). The two
 * in-between stops (lc/rc, tm/bm) anchor the block at the quarter points. */
export type LayoutAnchorX = "left" | "lc" | "center" | "rc" | "right";
export type LayoutAnchorY = "top" | "tm" | "middle" | "bm" | "bottom";
/** How stacked elements share the zone's vertical space. */
export type LayoutDistribution = "stack" | "spaced" | "spread";

/** The 5 placement stops in order (left→right, top→bottom) and the fraction of
 * the free space each anchors at. Shared by the grid control and the renderer. */
export const ANCHOR_XS: readonly LayoutAnchorX[] = ["left", "lc", "center", "rc", "right"];
export const ANCHOR_YS: readonly LayoutAnchorY[] = ["top", "tm", "middle", "bm", "bottom"];
export const ANCHOR_X_FRACTION: Record<LayoutAnchorX, number> = {
  center: 0.5,
  lc: 0.25,
  left: 0,
  rc: 0.75,
  right: 1,
};
export const ANCHOR_Y_FRACTION: Record<LayoutAnchorY, number> = {
  bm: 0.75,
  bottom: 1,
  middle: 0.5,
  tm: 0.25,
  top: 0,
};

/** Element kinds that carry per-element top/bottom spacing overrides. */
export const SPACING_KINDS: readonly (FlowKind | "logo")[] = [
  "heading",
  "subhead",
  "body",
  "cta",
  "divider",
  "lockup",
  "logo",
];
/** Max per-side element spacing, canvas px. */
export const ELEMENT_SPACING_MAX = 640;

export const FLOW_KINDS: readonly FlowKind[] = [
  "heading",
  "subhead",
  "body",
  "cta",
  "divider",
  "eyebrow",
  "list",
  "lockup",
];

export const FLOW_KIND_LABELS: Record<FlowKind, string> = {
  body: "Body",
  cta: "Button",
  divider: "Divider",
  eyebrow: "Eyebrow",
  heading: "Headline",
  list: "List",
  lockup: "Lockup",
  subhead: "Subheading",
};
export type LogoAnchor =
  // "stack" (default) = the logo is a normal element in the flow stack at its
  // Elements-list position, sharing the text's placement + alignment. "auto" =
  // the renderer pins it to the edge opposite the text. The center row is
  // legacy-only (older comps); the panel no longer offers it and the renderer
  // resolves it to a safe edge.
  | "stack"
  | "auto"
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "center-left"
  | "center-right"
  | "top-center"
  | "top-left"
  | "top-right";

export interface StudioValues {
  backgroundHex: string;
  bodyAlign: TextAlign;
  bodyColorId: string;
  /** Studio only: the single content colour, applied to every element even over
   * a full-bleed image. Absent on Email values, which keep per-element colours
   * and the bleed-bone legibility default. */
  contentColorId?: string;
  bodyInclude: boolean;
  /** Type/logo size as a percentage of the design baseline (100 = the old "M"). */
  bodySize: number;
  bodyText: string;
  ctaAlign: TextAlign;
  ctaColorId: string;
  ctaInclude: boolean;
  ctaSize: number;
  ctaStyle: CtaStyle;
  ctaText: string;
  /** Collage grid column count ("auto" solves from the photo count). */
  collageColumns: CollageColumns;
  dividerColorId: string;
  dividerInclude: boolean;
  /** Divider length as a percentage of its zone width (100 = full width). */
  dividerLength: number;
  dividerWeight: DividerWeight;
  /** Ordered element rows shown in the panel. Flow elements stack in this
   * order; "logo" may appear too (it's anchor-positioned, so the renderer
   * ignores its position — it's here only so the panel row is reorderable). */
  elementsOrder: (FlowKind | "logo")[];
  /** Spacing rhythm between stacked elements, percent of the base gap. */
  elementsSpacing: number;
  formatId: string;
  guides: boolean;
  headingAlign: TextAlign;
  headingColorId: string;
  headingFlourish: number[];
  /** Per-word flourish style overrides, keyed by word index. Words not listed
   * fall back to `headingFlourishStyle` (the heading default). */
  headingFlourishStyles: Record<number, FlourishStyle>;
  /** How flourished words render: Romie italic with entry/terminal swashes, or
   * plain italic without the special swash glyphs. */
  headingFlourishStyle: FlourishStyle;
  headingInclude: boolean;
  headingSize: number;
  headingStyleId: string;
  headingText: string;
  imageAssetId: string;
  /** Photos used by the Collage pattern, in cell order. */
  imageAssetIds: string[];
  imageBleed: boolean;
  /** Per-comp focal point (0..1) the crop centers on, held across formats. */
  imageFocalX: number;
  imageFocalY: number;
  /** Crop zoom past cover-fit (1 = none), relative so it holds across formats. */
  imageZoom: number;
  imageInclude: boolean;
  /** The clip moment (seconds) the design's still previews/exports use.
   * 0 = auto (the import-time poster). */
  videoPosterTime: number;
  layoutOrder: ContentOrder;
  layoutPattern: LayoutPatternId;
  layoutTextPosition: TextPosition;
  /** Lockup: the brand motif flanked by two tracked-caps texts
   * ("MONACO ✳ SUMMER '26"). Either side may be empty. */
  lockupInclude: boolean;
  lockupLeftText: string;
  /** Motif / text scale, percent of the design baseline (independent sliders). */
  lockupMotifSize: number;
  lockupRightText: string;
  lockupTextSize: number;
  logoAnchor: LogoAnchor;
  logoInclude: boolean;
  logoSize: number;
  logoVariantId: string;
  /** Overlay intensity, percent (10–100). */
  overlayStrength: number;
  overlayStyle: OverlayStyle;
  subheadAlign: TextAlign;
  subheadColorId: string;
  subheadInclude: boolean;
  subheadSize: number;
  subheadText: string;
  /** Legacy shared leading — the per-element fields below fall back to it, so
   * comps saved before per-element leading keep their look. */
  typeLeading: LeadingStep;
  /** Per-element line-spacing rhythm (each text element's Content menu). */
  headingLeading: LeadingStep;
  subheadLeading: LeadingStep;
  bodyLeading: LeadingStep;
  /** Global max width of the text column, percent of the content zone (40–100).
   * The Layout control — applies to every element. */
  typeWidthPct: number;
  /** Per-element text width, percent of the global {@link typeWidthPct}
   * baseline (40–100). 100 follows the Layout width; lower trims just that
   * element's column so it wraps sooner. */
  headingWidthPct: number;
  subheadWidthPct: number;
  bodyWidthPct: number;
  /** Overall scale of the composed graphic within the canvas (50–100%). At 100
   * nothing changes; below 100 the whole element shrinks toward center, leaving
   * a margin of background. */
  contentScale: number;

  /* ---- Layout: placement + alignment + distribution of the text stack. ---- */
  /** 9-way placement of the whole text block within its zone. */
  layoutAnchorX: LayoutAnchorX;
  layoutAnchorY: LayoutAnchorY;
  /** Global text alignment applied to every flow element. */
  layoutAlign: TextAlign;
  /** How stacked elements share the zone's height. */
  layoutDistribution: LayoutDistribution;
  /** Flow elements joined to the element below them — kept tight when the
   * distribution spreads groups apart. */
  layoutGroupWithNext: (FlowKind | "logo")[];
  /** Per-element extra spacing above/below the element in the flow stack, in
   * canvas px (add-only, 0 = none). Keyed by element kind. A lone element's
   * top/bottom still offsets it from its anchor, so it works without neighbors. */
  elementSpacing: Record<string, { bottom: number; top: number }>;
  /** Global spacing added above/below EVERY stacked element at once (canvas px),
   * on top of each element's own {@link elementSpacing}. The Layout-panel
   * counterpart to the per-element control. */
  layoutSpaceAll: { bottom: number; top: number };

  /* ---- Email pro elements (gated; default off/neutral so Studio comps that
   * never set these render byte-identically). ---- */
  /** Small uppercase tracked overline above a heading/body. */
  eyebrowAlign: TextAlign;
  eyebrowColorId: string;
  eyebrowInclude: boolean;
  eyebrowSize: SizeStep;
  eyebrowText: string;
  /** Destination captured for the CTA (image slices carry it in the manifest). */
  ctaHref: string;
  /** Render the CTA as a full pill (radius = height/2). */
  ctaPill: boolean;
  /** Corner radius (px, native units) applied to the main cover image. */
  imageRadius: number;
  /** Hairline-separated list of short lines (values/benefits block). */
  listAlign: TextAlign;
  listColorId: string;
  listInclude: boolean;
  listItems: string[];
  listSize: SizeStep;
  /** Per-cell captions for the collage/product grid (parallel to imageAssetIds). */
  collageCaptions: { name: string; note: string }[];
  collageShowCaptions: boolean;
}

export const STUDIO_DEFAULTS: StudioValues = {
  backgroundHex: "#000000",
  bodyAlign: "left",
  bodyColorId: "bone",
  bodyInclude: false,
  bodySize: 100,
  bodyText: "Cut from washed linen in the July light.",
  ctaAlign: "left",
  ctaColorId: "bone",
  ctaInclude: false,
  ctaSize: 100,
  ctaStyle: "outline",
  ctaText: "Shop now",
  collageColumns: "auto",
  dividerColorId: "bone",
  dividerInclude: false,
  dividerLength: 15,
  dividerWeight: "regular",
  elementsOrder: ["logo", "subhead", "heading"],
  elementsSpacing: 100,
  formatId: DEFAULT_FORMAT_ID,
  guides: false,
  headingAlign: "left",
  headingColorId: "bone",
  // No flourish by default (user directive 2026-07-13) — flourish is an
  // opt-in accent, tapped on per word in the Flourish control.
  headingFlourish: [],
  headingFlourishStyle: "swash",
  headingFlourishStyles: {},
  headingInclude: true,
  headingSize: 100,
  headingStyleId: "display",
  headingText: "Summer arrives quietly",
  imageAssetId: "demo-asset-1",
  imageAssetIds: ["demo-asset-1", "demo-asset-2", "demo-asset-3", "demo-asset-4"],
  // Bleed is the house style (user directive 2026-07-03); Framed is the
  // explicit secondary option.
  imageBleed: true,
  imageFocalX: 0.5,
  imageFocalY: 0.42,
  imageZoom: 1,
  imageInclude: true,
  videoPosterTime: 0,
  layoutOrder: "image",
  layoutPattern: "poster",
  layoutTextPosition: "auto",
  // Lockup is opt-in via Add element (old comps stay byte-identical).
  lockupInclude: false,
  lockupLeftText: "MONACO",
  lockupMotifSize: 100,
  lockupRightText: "SUMMER '26",
  lockupTextSize: 100,
  logoAnchor: "stack",
  logoInclude: true,
  logoSize: 100,
  logoVariantId: "motif",
  overlayStrength: 60,
  overlayStyle: "none",
  subheadAlign: "left",
  subheadColorId: "bone",
  subheadInclude: true,
  subheadSize: 100,
  subheadText: "The July drop · linen & silk",
  typeLeading: "normal",
  headingLeading: "normal",
  subheadLeading: "normal",
  bodyLeading: "normal",
  // 70 wraps headlines sooner — full-width columns read too wide as a default
  // (user directive 2026-07-11).
  typeWidthPct: 70,
  // Per-element width: 100 = follow the Layout width exactly.
  headingWidthPct: 100,
  subheadWidthPct: 100,
  bodyWidthPct: 100,
  contentScale: 100,
  layoutAnchorX: "center",
  layoutAnchorY: "middle",
  layoutAlign: "center",
  layoutDistribution: "stack",
  layoutGroupWithNext: [],
  elementSpacing: {},
  layoutSpaceAll: { bottom: 0, top: 0 },
  // Email pro elements — off/neutral by default.
  eyebrowAlign: "center",
  eyebrowColorId: "bone",
  eyebrowInclude: false,
  eyebrowSize: "s",
  eyebrowText: "",
  ctaHref: "",
  ctaPill: false,
  imageRadius: 0,
  listAlign: "left",
  listColorId: "bone",
  listInclude: false,
  listItems: [],
  listSize: "m",
  collageCaptions: [],
  collageShowCaptions: false,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value as string[];
  }
  return fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Element size as a percentage of the design baseline (100 = the former "M").
 * Accepts the new numeric slider value, or migrates a legacy "s"|"m"|"l" step
 * through its multiplier table so older comps (and Email sections, which still
 * store steps) keep their size.
 */
function readSizePercent(
  value: unknown,
  legacy: Record<SizeStep, number>,
  base: number,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value in legacy) {
    return Math.round((legacy[value as SizeStep] / base) * 100);
  }
  return fallback;
}

/** Divider length as a percentage of its zone (100 = full). Migrates the legacy
 * "full"|"short" steps. */
function readDividerLength(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === "full") {
    return 100;
  }
  if (value === "short") {
    return 15;
  }
  return fallback;
}

/** Clamp one spacing side into the add-only range. */
function clampSpace(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(ELEMENT_SPACING_MAX, Math.round(value)))
    : 0;
}

/** Read a single `{top, bottom}` spacing value (clamped to the add-only range),
 * falling back when the key is absent. */
function readSpace(
  value: unknown,
  fallback: { bottom: number; top: number },
): { bottom: number; top: number } {
  if (value && typeof value === "object") {
    const entry = value as { bottom?: unknown; top?: unknown };
    return { bottom: clampSpace(entry.bottom), top: clampSpace(entry.top) };
  }
  return fallback;
}

/** Read the per-element spacing map from the flat `${kind}.space` runtime keys,
 * keeping only sides that carry a non-zero override. */
function readElementSpacing(
  values: Record<string, unknown>,
): Record<string, { bottom: number; top: number }> {
  const out: Record<string, { bottom: number; top: number }> = {};
  for (const kind of SPACING_KINDS) {
    const raw = values[`${kind}.space`];
    if (raw && typeof raw === "object") {
      const entry = raw as { bottom?: unknown; top?: unknown };
      const top = clampSpace(entry.top);
      const bottom = clampSpace(entry.bottom);
      if (top !== 0 || bottom !== 0) {
        out[kind] = { bottom, top };
      }
    }
  }
  return out;
}

function readNumberArray(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return value as number[];
  }
  return fallback;
}

const FLOURISH_STYLES: FlourishStyle[] = ["swash", "swash-first", "swash-last", "italic"];

/** Per-word flourish style map: { [wordIndex]: FlourishStyle }, tolerant of
 * the JSON round-trip (numeric keys arrive as strings). */
function readFlourishStyles(
  value: unknown,
  fallback: Record<number, FlourishStyle>,
): Record<number, FlourishStyle> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const out: Record<number, FlourishStyle> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const index = Number(key);
    if (Number.isInteger(index) && FLOURISH_STYLES.includes(entry as FlourishStyle)) {
      out[index] = entry as FlourishStyle;
    }
  }
  return out;
}

function readCaptions(
  value: unknown,
  fallback: { name: string; note: string }[],
): { name: string; note: string }[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.map((entry) => {
    const record = (entry ?? {}) as { name?: unknown; note?: unknown };
    return {
      name: typeof record.name === "string" ? record.name : "",
      note: typeof record.note === "string" ? record.note : "",
    };
  });
}

function readColorHex(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "hex" in value) {
    const hex = (value as { hex?: unknown }).hex;
    if (typeof hex === "string") {
      return hex;
    }
  }
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

const SIZE_STEPS: readonly SizeStep[] = ["s", "m", "l"];
const ALIGNS: readonly TextAlign[] = ["left", "center", "right"];
const ANCHORS: readonly LogoAnchor[] = [
  "stack",
  "auto",
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "center",
  "center-left",
  "center-right",
  "top-center",
  "top-left",
  "top-right",
];

function readFlowOrder(
  value: unknown,
  includes: Record<FlowKind, boolean>,
): (FlowKind | "logo")[] {
  const valid = new Set<string>([...FLOW_KINDS, "logo"]);
  if (Array.isArray(value)) {
    // Keep valid entries (flow kinds + the anchored "logo" row), de-duped in
    // order. Tolerant: unknown entries are dropped rather than voiding the
    // whole order.
    const kept = value.filter(
      (entry): entry is FlowKind | "logo" =>
        typeof entry === "string" && valid.has(entry),
    );
    if (kept.length > 0) {
      return [...new Set(kept)];
    }
  }
  // Older snapshots predate elements.order: derive it from the include flags.
  return FLOW_KINDS.filter((kind) => includes[kind]);
}

export function readStudioValues(values: Record<string, unknown>): StudioValues {
  const defaults = STUDIO_DEFAULTS;
  const includes: Record<FlowKind, boolean> = {
    body: readBoolean(values["body.include"], defaults.bodyInclude),
    cta: readBoolean(values["cta.include"], defaults.ctaInclude),
    divider: readBoolean(values["divider.include"], defaults.dividerInclude),
    eyebrow: readBoolean(values["eyebrow.include"], defaults.eyebrowInclude),
    heading: readBoolean(values["heading.include"], defaults.headingInclude),
    list: readBoolean(values["list.include"], defaults.listInclude),
    lockup: readBoolean(values["lockup.include"], defaults.lockupInclude),
    subhead: readBoolean(values["subhead.include"], defaults.subheadInclude),
  };
  // The Studio uses one colour for every content element. Read the single
  // content.color — falling back to the legacy per-element heading.color for
  // comps saved before the consolidation — and fan it out to all elements.
  const contentColorId = readString(
    values["content.color"],
    readString(values["heading.color"], defaults.headingColorId),
  );
  return {
    backgroundHex: readColorHex(values["appearance.background"], defaults.backgroundHex),
    contentColorId,
    bodyAlign: readOneOf(values["body.align"], ALIGNS, defaults.bodyAlign),
    bodyColorId: contentColorId,
    bodyInclude: includes.body,
    bodySize: readSizePercent(
      values["body.size"],
      SIZE_MULTIPLIERS,
      SIZE_MULTIPLIERS.m,
      defaults.bodySize,
    ),
    bodyText: readString(values["body.text"], defaults.bodyText),
    ctaAlign: readOneOf(values["cta.align"], ALIGNS, defaults.ctaAlign),
    ctaColorId: contentColorId,
    ctaInclude: includes.cta,
    ctaSize: readSizePercent(
      values["cta.size"],
      SIZE_MULTIPLIERS,
      SIZE_MULTIPLIERS.m,
      defaults.ctaSize,
    ),
    ctaStyle: readOneOf(
      values["cta.style"],
      ["outline", "filled", "underline"],
      defaults.ctaStyle,
    ),
    ctaText: readString(values["cta.text"], defaults.ctaText),
    collageColumns: readOneOf(
      values["layout.collageColumns"],
      ["auto", "1", "2", "3"],
      defaults.collageColumns,
    ),
    dividerColorId: contentColorId,
    dividerInclude: includes.divider,
    dividerLength: readDividerLength(
      values["divider.length"],
      defaults.dividerLength,
    ),
    dividerWeight: readOneOf(
      values["divider.weight"],
      ["hairline", "regular", "bold"],
      defaults.dividerWeight,
    ),
    elementsOrder: readFlowOrder(values["elements.order"], includes),
    elementsSpacing: readNumber(values["elements.spacing"], defaults.elementsSpacing),
    formatId: readString(values["format.active"], defaults.formatId),
    guides: readBoolean(values["format.guides"], defaults.guides),
    headingAlign: readOneOf(values["heading.align"], ALIGNS, defaults.headingAlign),
    headingColorId: contentColorId,
    headingFlourish: readNumberArray(values["heading.flourish"], defaults.headingFlourish),
    headingFlourishStyle: readOneOf(
      values["heading.flourishStyle"],
      ["swash", "swash-first", "swash-last", "italic"],
      defaults.headingFlourishStyle,
    ),
    headingFlourishStyles: readFlourishStyles(
      values["heading.flourishStyles"],
      defaults.headingFlourishStyles,
    ),
    headingInclude: includes.heading,
    headingSize: readSizePercent(
      values["heading.size"],
      HEADING_SIZE_MULTIPLIERS,
      HEADING_SIZE_MULTIPLIERS.m,
      defaults.headingSize,
    ),
    headingStyleId: readString(values["heading.style"], defaults.headingStyleId),
    headingText: readString(values["heading.text"], defaults.headingText),
    imageAssetId: readString(values["image.assetId"], defaults.imageAssetId),
    imageAssetIds: readStringArray(values["image.assetIds"], defaults.imageAssetIds),
    // Runtime stores focal as a 0–100 percent (slider); the renderer wants 0–1.
    imageFocalX: readNumber(values["image.focalX"], defaults.imageFocalX * 100) / 100,
    imageFocalY: readNumber(values["image.focalY"], defaults.imageFocalY * 100) / 100,
    // Zoom rides the runtime as a percent too (100 = cover-fit).
    imageZoom: Math.max(1, readNumber(values["image.zoom"], defaults.imageZoom * 100) / 100),
    videoPosterTime: Math.max(
      0,
      readNumber(values["image.posterTime"], defaults.videoPosterTime),
    ),
    imageBleed:
      values["image.style"] === "framed"
        ? false
        : values["image.style"] === "bleed"
          ? true
          : readBoolean(values["image.bleed"], defaults.imageBleed),
    imageInclude: readBoolean(values["image.include"], defaults.imageInclude),
    layoutOrder: readOneOf(values["layout.order"], ["image", "text"], defaults.layoutOrder),
    layoutPattern: readOneOf(
      values["layout.pattern"],
      ["poster", "split", "banded", "edge", "collage"],
      defaults.layoutPattern,
    ),
    layoutTextPosition: readOneOf(
      values["layout.textPosition"],
      ["auto", "top", "middle", "bottom"],
      defaults.layoutTextPosition,
    ),
    lockupInclude: includes.lockup,
    lockupLeftText: readString(values["lockup.left"], defaults.lockupLeftText),
    lockupMotifSize: readSizePercent(
      values["lockup.motifSize"],
      SIZE_MULTIPLIERS,
      SIZE_MULTIPLIERS.m,
      defaults.lockupMotifSize,
    ),
    lockupRightText: readString(values["lockup.right"], defaults.lockupRightText),
    lockupTextSize: readSizePercent(
      values["lockup.textSize"],
      SIZE_MULTIPLIERS,
      SIZE_MULTIPLIERS.m,
      defaults.lockupTextSize,
    ),
    logoAnchor: readOneOf(values["logo.anchor"], ANCHORS, defaults.logoAnchor),
    logoInclude: readBoolean(values["logo.include"], defaults.logoInclude),
    logoSize: readSizePercent(
      values["logo.size"],
      LOGO_SIZE_MULTIPLIERS,
      LOGO_SIZE_MULTIPLIERS.m,
      defaults.logoSize,
    ),
    logoVariantId: readString(values["logo.variant"], defaults.logoVariantId),
    overlayStrength: readNumber(values["overlay.strength"], defaults.overlayStrength),
    overlayStyle: readOneOf(values["overlay.style"], OVERLAY_STYLES, defaults.overlayStyle),
    subheadAlign: readOneOf(values["subhead.align"], ALIGNS, defaults.subheadAlign),
    subheadColorId: contentColorId,
    subheadInclude: includes.subhead,
    subheadSize: readSizePercent(
      values["subhead.size"],
      SIZE_MULTIPLIERS,
      SIZE_MULTIPLIERS.m,
      defaults.subheadSize,
    ),
    subheadText: readString(values["subhead.text"], defaults.subheadText),
    typeLeading: readOneOf(
      values["type.leading"],
      ["tight", "normal", "airy"],
      defaults.typeLeading,
    ),
    // Per-element leading falls back to the legacy shared type.leading, so
    // comps saved before the per-element controls keep their exact rhythm.
    headingLeading: readOneOf(
      values["heading.leading"],
      ["tight", "normal", "airy"],
      readOneOf(values["type.leading"], ["tight", "normal", "airy"], defaults.headingLeading),
    ),
    subheadLeading: readOneOf(
      values["subhead.leading"],
      ["tight", "normal", "airy"],
      readOneOf(values["type.leading"], ["tight", "normal", "airy"], defaults.subheadLeading),
    ),
    bodyLeading: readOneOf(
      values["body.leading"],
      ["tight", "normal", "airy"],
      readOneOf(values["type.leading"], ["tight", "normal", "airy"], defaults.bodyLeading),
    ),
    typeWidthPct: readNumber(values["type.width"], defaults.typeWidthPct),
    headingWidthPct: readNumber(values["heading.width"], defaults.headingWidthPct),
    subheadWidthPct: readNumber(values["subhead.width"], defaults.subheadWidthPct),
    bodyWidthPct: readNumber(values["body.width"], defaults.bodyWidthPct),
    contentScale: readNumber(values["layout.scale"], defaults.contentScale),
    layoutAnchorX: readOneOf(values["layout.anchorX"], ANCHOR_XS, defaults.layoutAnchorX),
    layoutAnchorY: readOneOf(values["layout.anchorY"], ANCHOR_YS, defaults.layoutAnchorY),
    layoutAlign: readOneOf(values["layout.align"], ALIGNS, defaults.layoutAlign),
    // Legacy "grouped" comps map to "spread" — grouping is now honored in every
    // mode, so the old grouped behavior is just spread-that-respects-groups.
    layoutDistribution: readOneOf(
      values["layout.distribution"] === "grouped" ? "spread" : values["layout.distribution"],
      ["stack", "spaced", "spread"],
      defaults.layoutDistribution,
    ),
    layoutGroupWithNext: readStringArray(
      values["layout.groupWithNext"],
      defaults.layoutGroupWithNext,
    ).filter((kind): kind is FlowKind | "logo" =>
      kind === "logo" || (FLOW_KINDS as readonly string[]).includes(kind),
    ),
    elementSpacing: readElementSpacing(values),
    layoutSpaceAll: readSpace(values["layout.spaceAll"], defaults.layoutSpaceAll),
    eyebrowAlign: readOneOf(values["eyebrow.align"], ALIGNS, defaults.eyebrowAlign),
    eyebrowColorId: contentColorId,
    eyebrowInclude: includes.eyebrow,
    eyebrowSize: readOneOf(values["eyebrow.size"], SIZE_STEPS, defaults.eyebrowSize),
    eyebrowText: readString(values["eyebrow.text"], defaults.eyebrowText),
    ctaHref: readString(values["cta.href"], defaults.ctaHref),
    ctaPill: readBoolean(values["cta.pill"], defaults.ctaPill),
    imageRadius: readNumber(values["image.radius"], defaults.imageRadius),
    listAlign: readOneOf(values["list.align"], ALIGNS, defaults.listAlign),
    listColorId: contentColorId,
    listInclude: includes.list,
    listItems: readStringArray(values["list.items"], defaults.listItems),
    listSize: readOneOf(values["list.size"], SIZE_STEPS, defaults.listSize),
    collageCaptions: readCaptions(values["layout.collageCaptions"], defaults.collageCaptions),
    collageShowCaptions: readBoolean(
      values["layout.collageShowCaptions"],
      defaults.collageShowCaptions,
    ),
  };
}

/**
 * Inverse of readStudioValues: turn a StudioValues object into the runtime
 * target/value pairs the controls dispatch. Used to LOAD a saved artboard
 * (comp.sourceValues) back into the live editor. Order is fixed, so
 * `JSON.stringify` of the result is a stable identity key for an artboard.
 */
export function studioValuesToRuntime(values: StudioValues): Array<[string, unknown]> {
  return [
    ["appearance.background", { hex: values.backgroundHex }],
    ["body.align", values.bodyAlign],
    ["body.color", values.bodyColorId],
    ["body.include", values.bodyInclude],
    ["body.size", values.bodySize],
    ["body.text", values.bodyText],
    ["cta.align", values.ctaAlign],
    ["cta.color", values.ctaColorId],
    ["cta.include", values.ctaInclude],
    ["cta.size", values.ctaSize],
    ["cta.style", values.ctaStyle],
    ["cta.text", values.ctaText],
    ["layout.collageColumns", values.collageColumns],
    ["divider.color", values.dividerColorId],
    ["divider.include", values.dividerInclude],
    ["divider.length", values.dividerLength],
    ["divider.weight", values.dividerWeight],
    ["elements.order", values.elementsOrder],
    ["elements.spacing", values.elementsSpacing],
    ["format.active", values.formatId],
    ["format.guides", values.guides],
    // Single content colour (its control lives in Format). All element colours
    // are kept equal, so the heading colour represents the shared value.
    ["content.color", values.headingColorId],
    ["heading.align", values.headingAlign],
    ["heading.color", values.headingColorId],
    ["heading.flourish", values.headingFlourish],
    ["heading.flourishStyle", values.headingFlourishStyle],
    ["heading.flourishStyles", values.headingFlourishStyles],
    ["heading.include", values.headingInclude],
    ["heading.size", values.headingSize],
    ["heading.style", values.headingStyleId],
    ["heading.text", values.headingText],
    ["image.assetId", values.imageAssetId],
    ["image.assetIds", values.imageAssetIds],
    ["image.focalX", Math.round(values.imageFocalX * 100)],
    ["image.focalY", Math.round(values.imageFocalY * 100)],
    ["image.zoom", Math.round(values.imageZoom * 100)],
    ["image.posterTime", values.videoPosterTime],
    ["image.include", values.imageInclude],
    ["image.style", values.imageBleed ? "bleed" : "framed"],
    ["layout.order", values.layoutOrder],
    ["layout.pattern", values.layoutPattern],
    ["layout.textPosition", values.layoutTextPosition],
    ["lockup.include", values.lockupInclude],
    ["lockup.left", values.lockupLeftText],
    ["lockup.motifSize", values.lockupMotifSize],
    ["lockup.right", values.lockupRightText],
    ["lockup.textSize", values.lockupTextSize],
    ["logo.anchor", values.logoAnchor],
    ["logo.include", values.logoInclude],
    ["logo.size", values.logoSize],
    ["logo.variant", values.logoVariantId],
    ["overlay.strength", values.overlayStrength],
    ["overlay.style", values.overlayStyle],
    ["subhead.align", values.subheadAlign],
    ["subhead.color", values.subheadColorId],
    ["subhead.include", values.subheadInclude],
    ["subhead.size", values.subheadSize],
    ["subhead.text", values.subheadText],
    ["type.leading", values.typeLeading],
    ["heading.leading", values.headingLeading],
    ["subhead.leading", values.subheadLeading],
    ["body.leading", values.bodyLeading],
    ["type.width", values.typeWidthPct],
    ["heading.width", values.headingWidthPct],
    ["subhead.width", values.subheadWidthPct],
    ["body.width", values.bodyWidthPct],
    ["layout.scale", values.contentScale],
    ["layout.anchorX", values.layoutAnchorX],
    ["layout.anchorY", values.layoutAnchorY],
    ["layout.align", values.layoutAlign],
    ["layout.distribution", values.layoutDistribution],
    ["layout.groupWithNext", values.layoutGroupWithNext],
    ["layout.spaceAll", values.layoutSpaceAll],
    ...SPACING_KINDS.map(
      (kind): [string, unknown] => [
        `${kind}.space`,
        values.elementSpacing[kind] ?? { bottom: 0, top: 0 },
      ],
    ),
    ["eyebrow.align", values.eyebrowAlign],
    ["eyebrow.color", values.eyebrowColorId],
    ["eyebrow.include", values.eyebrowInclude],
    ["eyebrow.size", values.eyebrowSize],
    ["eyebrow.text", values.eyebrowText],
    ["cta.href", values.ctaHref],
    ["cta.pill", values.ctaPill],
    ["image.radius", values.imageRadius],
    ["list.align", values.listAlign],
    ["list.color", values.listColorId],
    ["list.include", values.listInclude],
    ["list.items", values.listItems],
    ["list.size", values.listSize],
    ["layout.collageCaptions", values.collageCaptions],
    ["layout.collageShowCaptions", values.collageShowCaptions],
  ];
}

/** Stable identity key for a set of Studio values (fixed field order). */
export function studioValuesKey(values: StudioValues): string {
  return JSON.stringify(studioValuesToRuntime(values));
}

/** Swiss modular scale steps applied to each text element's base size. */
export const SIZE_MULTIPLIERS: Record<SizeStep, number> = {
  l: 1.28,
  m: 1,
  s: 0.78,
};

/**
 * Headlines run on a reduced scale; the other elements keep the standard
 * steps. Trimmed twice on user feedback (2026-07-05, then ~15% further on
 * 2026-07-10: all three steps still felt too big overall).
 */
export const HEADING_SIZE_MULTIPLIERS: Record<SizeStep, number> = {
  l: 0.88,
  m: 0.68,
  s: 0.5,
};

/** Leading (line-spacing) rhythm steps — applied per text element. */
export const LEADING_MULTIPLIERS: Record<LeadingStep, number> = {
  airy: 1.14,
  normal: 1,
  tight: 0.92,
};

export const LOGO_SIZE_MULTIPLIERS: Record<SizeStep, number> = {
  l: 1.5,
  m: 1,
  s: 0.7,
};

/**
 * Per-variant logo scale, multiplied on top of the S/M/L step. The wordmark is
 * set in full letters, so at a shared height it reads far larger and heavier
 * than the icon marks — shrink it so every variant feels balanced at the same
 * size step. Variants absent here render at 1× (the icon marks).
 */
export const LOGO_VARIANT_SCALE: Record<string, number> = {
  "wordmark-white": 0.55,
};

/** Approved on-brand combinations used by Shuffle. */
export const SHUFFLE_SPACE = {
  anchors: ["bottom-left", "bottom-right", "top-left", "top-right"] as LogoAnchor[],
  headingStyles: ["display", "editorial-caps"],
  // "none" repeated: most rolls stay clean; treatments appear occasionally.
  overlays: ["none", "none", "none", "shade-bottom", "vignette", "keyline"] as OverlayStyle[],
  pairings: [
    { background: "#f5f2ec", text: "ink" },
    { background: "#e0d5c3", text: "ink" },
    { background: "#111110", text: "bone" },
  ],
  // The Studio is full-bleed-only now (2026-07-11) — patterns only shape the
  // retired Framed style, so Shuffle no longer rolls them.
  patterns: ["poster"] as LayoutPatternId[],
  textPositions: ["auto", "top", "middle", "bottom"] as TextPosition[],
} as const;
