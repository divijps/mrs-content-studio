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
export type FlowKind = "heading" | "subhead" | "body" | "cta" | "divider";
export type CtaStyle = "outline" | "filled" | "underline";
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

export const FLOW_KINDS: readonly FlowKind[] = [
  "heading",
  "subhead",
  "body",
  "cta",
  "divider",
];

export const FLOW_KIND_LABELS: Record<FlowKind, string> = {
  body: "Body copy",
  cta: "Button",
  divider: "Divider",
  heading: "Headline",
  subhead: "Subheading",
};
export type LogoAnchor =
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
  bodyInclude: boolean;
  bodySize: SizeStep;
  bodyText: string;
  ctaAlign: TextAlign;
  ctaColorId: string;
  ctaInclude: boolean;
  ctaSize: SizeStep;
  ctaStyle: CtaStyle;
  ctaText: string;
  /** Collage grid column count ("auto" solves from the photo count). */
  collageColumns: CollageColumns;
  dividerColorId: string;
  dividerInclude: boolean;
  dividerLength: DividerLength;
  dividerWeight: DividerWeight;
  /** Ordered flow stack (which elements exist, and in what order). */
  elementsOrder: FlowKind[];
  /** Spacing rhythm between stacked elements, percent of the base gap. */
  elementsSpacing: number;
  formatId: string;
  guides: boolean;
  headingAlign: TextAlign;
  headingColorId: string;
  headingFlourish: number[];
  headingInclude: boolean;
  headingSize: SizeStep;
  headingStyleId: string;
  headingText: string;
  imageAssetId: string;
  /** Photos used by the Collage pattern, in cell order. */
  imageAssetIds: string[];
  imageBleed: boolean;
  imageInclude: boolean;
  layoutOrder: ContentOrder;
  layoutPattern: LayoutPatternId;
  layoutTextPosition: TextPosition;
  logoAnchor: LogoAnchor;
  logoInclude: boolean;
  logoSize: SizeStep;
  logoVariantId: string;
  /** Overlay intensity, percent (10–100). */
  overlayStrength: number;
  overlayStyle: OverlayStyle;
  subheadAlign: TextAlign;
  subheadColorId: string;
  subheadInclude: boolean;
  subheadSize: SizeStep;
  subheadText: string;
  typeLeading: LeadingStep;
  /** Max width of the text column, percent of the content zone (40–100). */
  typeWidthPct: number;
}

export const STUDIO_DEFAULTS: StudioValues = {
  backgroundHex: "#f5f2ec",
  bodyAlign: "left",
  bodyColorId: "ink",
  bodyInclude: false,
  bodySize: "m",
  bodyText: "Cut from washed linen in the July light.",
  ctaAlign: "left",
  ctaColorId: "ink",
  ctaInclude: false,
  ctaSize: "m",
  ctaStyle: "outline",
  ctaText: "Shop now",
  collageColumns: "auto",
  dividerColorId: "ink",
  dividerInclude: false,
  dividerLength: "short",
  dividerWeight: "regular",
  elementsOrder: ["heading", "subhead"],
  elementsSpacing: 100,
  formatId: DEFAULT_FORMAT_ID,
  guides: true,
  headingAlign: "left",
  headingColorId: "ink",
  // "quietly" (ends in y) carries a Romie terminal swash; word 0 "Summer" has
  // no swash glyph, so flourishing it would look like plain italic.
  headingFlourish: [2],
  headingInclude: true,
  headingSize: "m",
  headingStyleId: "display",
  headingText: "Summer arrives quietly",
  imageAssetId: "demo-asset-1",
  imageAssetIds: ["demo-asset-1", "demo-asset-2", "demo-asset-3", "demo-asset-4"],
  // Bleed is the house style (user directive 2026-07-03); Framed is the
  // explicit secondary option.
  imageBleed: true,
  imageInclude: true,
  layoutOrder: "image",
  layoutPattern: "poster",
  layoutTextPosition: "auto",
  logoAnchor: "bottom-left",
  logoInclude: true,
  logoSize: "m",
  logoVariantId: "motif",
  overlayStrength: 60,
  overlayStyle: "none",
  subheadAlign: "left",
  subheadColorId: "ink",
  subheadInclude: true,
  subheadSize: "m",
  subheadText: "The July drop · linen & silk",
  typeLeading: "normal",
  typeWidthPct: 100,
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

function readNumberArray(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return value as number[];
  }
  return fallback;
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
): FlowKind[] {
  if (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string" && (FLOW_KINDS as string[]).includes(entry),
    )
  ) {
    // De-dupe while preserving order.
    return [...new Set(value as FlowKind[])];
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
    heading: readBoolean(values["heading.include"], defaults.headingInclude),
    subhead: readBoolean(values["subhead.include"], defaults.subheadInclude),
  };
  return {
    backgroundHex: readColorHex(values["appearance.background"], defaults.backgroundHex),
    bodyAlign: readOneOf(values["body.align"], ALIGNS, defaults.bodyAlign),
    bodyColorId: readString(values["body.color"], defaults.bodyColorId),
    bodyInclude: includes.body,
    bodySize: readOneOf(values["body.size"], SIZE_STEPS, defaults.bodySize),
    bodyText: readString(values["body.text"], defaults.bodyText),
    ctaAlign: readOneOf(values["cta.align"], ALIGNS, defaults.ctaAlign),
    ctaColorId: readString(values["cta.color"], defaults.ctaColorId),
    ctaInclude: includes.cta,
    ctaSize: readOneOf(values["cta.size"], SIZE_STEPS, defaults.ctaSize),
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
    dividerColorId: readString(values["divider.color"], defaults.dividerColorId),
    dividerInclude: includes.divider,
    dividerLength: readOneOf(
      values["divider.length"],
      ["full", "short"],
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
    headingColorId: readString(values["heading.color"], defaults.headingColorId),
    headingFlourish: readNumberArray(values["heading.flourish"], defaults.headingFlourish),
    headingInclude: includes.heading,
    headingSize: readOneOf(values["heading.size"], SIZE_STEPS, defaults.headingSize),
    headingStyleId: readString(values["heading.style"], defaults.headingStyleId),
    headingText: readString(values["heading.text"], defaults.headingText),
    imageAssetId: readString(values["image.assetId"], defaults.imageAssetId),
    imageAssetIds: readStringArray(values["image.assetIds"], defaults.imageAssetIds),
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
    logoAnchor: readOneOf(values["logo.anchor"], ANCHORS, defaults.logoAnchor),
    logoInclude: readBoolean(values["logo.include"], defaults.logoInclude),
    logoSize: readOneOf(values["logo.size"], SIZE_STEPS, defaults.logoSize),
    logoVariantId: readString(values["logo.variant"], defaults.logoVariantId),
    overlayStrength: readNumber(values["overlay.strength"], defaults.overlayStrength),
    overlayStyle: readOneOf(values["overlay.style"], OVERLAY_STYLES, defaults.overlayStyle),
    subheadAlign: readOneOf(values["subhead.align"], ALIGNS, defaults.subheadAlign),
    subheadColorId: readString(values["subhead.color"], defaults.subheadColorId),
    subheadInclude: includes.subhead,
    subheadSize: readOneOf(values["subhead.size"], SIZE_STEPS, defaults.subheadSize),
    subheadText: readString(values["subhead.text"], defaults.subheadText),
    typeLeading: readOneOf(
      values["type.leading"],
      ["tight", "normal", "airy"],
      defaults.typeLeading,
    ),
    typeWidthPct: readNumber(values["type.width"], defaults.typeWidthPct),
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
    ["heading.align", values.headingAlign],
    ["heading.color", values.headingColorId],
    ["heading.flourish", values.headingFlourish],
    ["heading.include", values.headingInclude],
    ["heading.size", values.headingSize],
    ["heading.style", values.headingStyleId],
    ["heading.text", values.headingText],
    ["image.assetId", values.imageAssetId],
    ["image.assetIds", values.imageAssetIds],
    ["image.include", values.imageInclude],
    ["image.style", values.imageBleed ? "bleed" : "framed"],
    ["layout.order", values.layoutOrder],
    ["layout.pattern", values.layoutPattern],
    ["layout.textPosition", values.layoutTextPosition],
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
    ["type.width", values.typeWidthPct],
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
 * Headlines run on a reduced scale (user feedback 2026-07-05: all three
 * heading steps felt too big); the other elements keep the standard steps.
 */
export const HEADING_SIZE_MULTIPLIERS: Record<SizeStep, number> = {
  l: 1.02,
  m: 0.8,
  s: 0.6,
};

/** Global leading (line-spacing) rhythm applied to every text style. */
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
  patterns: ["poster", "split", "banded", "edge"] as LayoutPatternId[],
  textPositions: ["auto", "top", "middle", "bottom"] as TextPosition[],
} as const;
