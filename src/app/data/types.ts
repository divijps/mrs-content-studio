/**
 * Core entity types for the Mrs Content Studio project data layer.
 *
 * Every entity is stored as one small JSON file inside the shared project
 * folder (Google Drive-synced), so concurrent teammates rarely touch the
 * same file. See docs/BUILD_PLAN.md §2.
 */

export type ReviewStatus = "draft" | "in-review" | "changes-requested" | "approved";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  approved: "Approved",
  "changes-requested": "Changes requested",
  draft: "Draft",
  "in-review": "In review",
};

export const REVIEW_STATUS_ORDER: readonly ReviewStatus[] = [
  "draft",
  "in-review",
  "changes-requested",
  "approved",
];

/** A comment pinned to a point on an asset or comp preview. */
export interface PinnedComment {
  author: string;
  createdAt: string;
  id: string;
  resolved: boolean;
  text: string;
  /** Normalized 0..1 position of the pin on the preview. */
  x: number;
  y: number;
}

/** Focal point used to solve crops across aspect ratios. Normalized 0..1. */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface AssetMeta {
  collectionId: string | null;
  comments: PinnedComment[];
  createdAt: string;
  favorite: boolean;
  /** Original filename at import time, before renaming. */
  filename: string;
  focalPoint: FocalPoint;
  height: number;
  id: string;
  /** Content fingerprint for dedupe on import (undefined for seed/demo assets). */
  importFingerprint?: string;
  /** Original file size in bytes when known (imports; used for board totals). */
  sizeBytes?: number;
  /** Renamed per brand convention, e.g. 20260703_julydrop_004. */
  name: string;
  status: ReviewStatus;
  tags: string[];
  updatedAt: string;
  width: number;
}

/** A runtime asset joins metadata with a resolvable image URL. */
export interface Asset extends AssetMeta {
  /** Object URL or data URI for the full image. */
  url: string;
  /** Smaller preview URL when available; falls back to url. */
  thumbUrl: string;
}

/** A board (Air-style). Boards nest via parentId to form folders. */
export interface Collection {
  createdAt: string;
  id: string;
  name: string;
  /** Parent board id, or null for a top-level board. */
  parentId: string | null;
}

/** ---- Brand kit ------------------------------------------------------- */

export interface BrandTextStyle {
  /** Plain-language name shown to users, e.g. "Big Heading". */
  label: string;
  id: string;
  fontFamily: string;
  fontStyle: "normal" | "italic";
  fontWeight: number;
  /** Size expressed relative to canvas width (fraction), so styles scale per format. */
  sizeFactor: number;
  letterSpacingEm: number;
  lineHeight: number;
  textTransform: "none" | "uppercase" | "lowercase";
  /** Element roles this style may be applied to. */
  role: "heading" | "subhead" | "body";
}

export interface BrandLogo {
  id: string;
  label: string;
  /** SVG markup or image URL. */
  url: string;
  aspectRatio: number;
}

export interface BrandColor {
  hex: string;
  id: string;
  label: string;
  /** Whether text may be set in this color. */
  text: boolean;
  /** Whether backgrounds/scrims may use this color. */
  surface: boolean;
}

export interface BrandKit {
  colors: BrandColor[];
  /** Approved special characters/ornaments for the palette. */
  specialCharacters: string[];
  logos: BrandLogo[];
  name: string;
  /** Filename naming template for exports. */
  namingTemplate: string;
  textStyles: BrandTextStyle[];
  /** Font family that supports the Flourish (italic + swash) treatment. */
  flourishFontFamily: string | null;
}

/** ---- Comp (a composed layout) ---------------------------------------- */

export type ElementKind = "heading" | "subhead" | "body" | "logo" | "image" | "divider";

/** A character range within a text element that has Flourish applied. */
export interface FlourishRun {
  start: number;
  end: number;
}

export interface CompElementBase {
  id: string;
  kind: ElementKind;
  /** Grid region the element occupies (row index in the vertical flow). */
  locked: boolean;
  /** Horizontal alignment within the grid columns. */
  align: "start" | "center" | "end";
  /** Grid column span 1..6. */
  span: number;
  /** Scale step: 0 = S, 1 = M, 2 = L. */
  scaleStep: 0 | 1 | 2;
}

export interface TextElement extends CompElementBase {
  kind: "heading" | "subhead" | "body";
  text: string;
  styleId: string;
  colorId: string;
  flourishRuns: FlourishRun[];
  /** Bound copy deck, if any. */
  deckId: string | null;
  deckIndex: number;
}

export interface LogoElement extends CompElementBase {
  kind: "logo";
  logoId: string;
  colorId: string | null;
}

export interface ImageElement extends CompElementBase {
  kind: "image";
  assetId: string | null;
  /** Bleed makes the image fill the full canvas behind other elements. */
  bleed: boolean;
}

export interface DividerElement extends CompElementBase {
  kind: "divider";
  colorId: string;
}

export type CompElement = TextElement | LogoElement | ImageElement | DividerElement;

/** Per-format tweak applied on top of the master layout. */
export interface FormatOverride {
  /** Element id -> partial placement overrides. */
  elements: Record<string, Partial<Pick<CompElementBase, "align" | "span" | "scaleStep">>>;
}

export interface Comp {
  backgroundColorId: string;
  comments: PinnedComment[];
  createdAt: string;
  elements: CompElement[];
  /** Format ids this comp targets. */
  formats: string[];
  id: string;
  /** Layout pattern id from the Swiss template set. */
  layoutId: string;
  name: string;
  overrides: Record<string, FormatOverride>;
  /**
   * Flat Studio runtime snapshot used to re-render this comp at any format
   * during batch export. Shape matches studio/comp-layout StudioValues; kept as
   * a record here to avoid a data→studio import cycle.
   */
  sourceValues?: Record<string, unknown>;
  status: ReviewStatus;
  updatedAt: string;
}

/** ---- Copy decks ------------------------------------------------------- */

export interface CopyDeck {
  createdAt: string;
  id: string;
  name: string;
  variants: string[];
}

/** ---- Export queue ----------------------------------------------------- */

export interface QueueItem {
  addedAt: string;
  compId: string;
  formatIds: string[];
  id: string;
}

/** ---- Planner ---------------------------------------------------------- */

export interface PlannerGridSlot {
  id: string;
  /** Either a comp, a raw asset, or an empty planned placeholder. */
  compId: string | null;
  assetId: string | null;
  label: string | null;
}

export interface PlannerState {
  gridSlots: PlannerGridSlot[];
  storySlots: PlannerGridSlot[];
}

/** ---- Project ----------------------------------------------------------- */

export interface ProjectSettings {
  displayName: string | null;
}

export interface ProjectSnapshot {
  assets: Asset[];
  brand: BrandKit;
  collections: Collection[];
  comps: Comp[];
  decks: CopyDeck[];
  planner: PlannerState;
  queue: QueueItem[];
  settings: ProjectSettings;
  /** "demo" until a real folder is connected. */
  source: "demo" | "folder";
  folderName: string | null;
}
