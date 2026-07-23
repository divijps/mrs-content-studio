/**
 * Core entity types for the Mrs Content Studio project data layer.
 *
 * Every entity is stored as one small JSON file inside the shared project
 * folder (Google Drive-synced), so concurrent teammates rarely touch the
 * same file. See docs/BUILD_PLAN.md §2.
 */

export type ReviewStatus = "draft" | "edit" | "review" | "approve";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  approve: "Approve",
  draft: "Draft",
  edit: "Edit",
  review: "Review",
};

/** A single linear handoff pipeline: draft → edit → review → approve. */
export const REVIEW_STATUS_ORDER: readonly ReviewStatus[] = [
  "draft",
  "edit",
  "review",
  "approve",
];

/**
 * Coerce any stored status onto the current set. Earlier data used
 * "in-review" / "changes-requested" / "approved"; map those forward so loading
 * old rows keeps their meaning instead of silently resetting to draft.
 */
export function normalizeReviewStatus(value: unknown): ReviewStatus {
  switch (value) {
    case "draft":
    case "edit":
    case "review":
    case "approve":
      return value;
    case "in-review":
      return "review";
    case "changes-requested":
      return "edit";
    case "approved":
      return "approve";
    default:
      return "draft";
  }
}

/**
 * One recorded workflow change (a status flip or an assignment) on an asset or
 * planned post. A quiet audit trail — not shown as a log, but it lets surfaces
 * say "approved by Priya" or show who handed what to whom.
 */
export interface ActivityEvent {
  /** ISO timestamp. */
  at: string;
  /** Display name of whoever made the change (null when unknown). */
  by: string | null;
  /** Previous value: a ReviewStatus for "status", a person/null for "assign". */
  from: string | null;
  id: string;
  kind: "assign" | "status";
  /** Next value (same encoding as `from`). */
  to: string | null;
}

/** A comment pinned to a point — or, when w/h are set, a marked region. */
export interface PinnedComment {
  /** Another Library asset attached to the note ("swap in this one"). */
  attachmentAssetId?: string | null;
  author: string;
  createdAt: string;
  /** Normalized region size; absent for a point pin. */
  h?: number;
  id: string;
  resolved: boolean;
  text: string;
  /** The asset version this pin was placed on. Absent = legacy/unscoped, so it
   * shows on every version; version-scoped pins show only on their version. */
  versionId?: string;
  w?: number;
  /** Normalized 0..1 position (region top-left, or the pin point). */
  x: number;
  y: number;
}

/** Focal point used to solve crops across aspect ratios. Normalized 0..1. */
export interface FocalPoint {
  x: number;
  y: number;
}

export type AssetKind = "image" | "video";

/**
 * One version of an asset. An asset is a stable identity + a stack of these +
 * a currentVersionId pointer; the asset's flat fields (url, focalPoint, width,
 * …) are a *denormalized mirror* of whichever version is current, so every
 * `assets.find(id)` reference resolves to the current bytes with no change to
 * any consuming surface. A version owns the bytes and everything intrinsic to
 * them; the identity owns name/tags/board/status/comments (shared across versions).
 */
export interface AssetVersion {
  createdAt: string;
  /** Display name of whoever added this version. */
  createdBy?: string | null;
  /** Video length in seconds (videos only). */
  durationSec?: number;
  /** Original filename for this version's bytes. */
  filename: string;
  /** Per-version focal point — a recomposed version can crop differently. */
  focalPoint: FocalPoint;
  height: number;
  id: string;
  /** Stills or video. Mirrored onto the asset when this version is current, so
   * a video re-take of a photo flips every kind-keyed renderer with the bytes. */
  kind: AssetKind;
  /** Content fingerprint, so an unchanged re-save is recognized (no dup version). */
  importFingerprint?: string;
  /** Optional user label, e.g. "Retouched", "V2 crop". */
  label?: string;
  sizeBytes?: number;
  /** For Studio-made versions: the StudioValues design snapshot behind them. */
  sourceValues?: Record<string, unknown>;
  /** When this version was attributed from another Library asset (not uploaded),
   * the id of that source asset — it points at the same stored bytes (zero-copy). */
  sourcedFromAssetId?: string | null;
  /** Storage object path for the full bytes (cloud). Empty in demo mode, where
   * `url` is an object URL. Persisted in the versions jsonb. */
  storagePath: string;
  /** Storage object path for the thumbnail (cloud). */
  thumbPath: string;
  /** Resolved thumbnail URL — derived from thumbPath at hydrate, not persisted. */
  thumbUrl: string;
  /** Resolved full URL — derived from storagePath at hydrate, not persisted. */
  url: string;
  width: number;
}

export interface AssetMeta {
  /** Quiet audit trail of status/assignment changes (newest last, capped). */
  activity?: ActivityEvent[];
  /** Display name of whoever imported this asset (shown as "Added by …"). */
  addedBy?: string | null;
  /** Teammate (display name) this asset is handed off to for edits/review. */
  assignedTo?: string | null;
  collectionId: string | null;
  comments: PinnedComment[];
  createdAt: string;
  /** Names the version whose bytes/focal/dimensions the flat fields below mirror.
   * Every reference to this asset resolves to whichever version this points at. */
  currentVersionId: string;
  /** Video length in seconds (videos only). */
  durationSec?: number;
  /** Per-person favorites: the user ids (or "me" in demo) who starred this
   * asset. Each teammate's star is their own — not shared across the team. */
  favoritedBy: string[];
  /** Original filename at import time, before renaming. */
  filename: string;
  focalPoint: FocalPoint;
  height: number;
  id: string;
  /** Stills (default) or video. Videos are review-only, not composited. */
  kind: AssetKind;
  /** Content fingerprint for dedupe on import (undefined for seed/demo assets). */
  importFingerprint?: string;
  /**
   * For Studio-made assets: the full design snapshot (a StudioValues blob) that
   * produced this export, so "Edit in Studio" can reopen it exactly. Distinct
   * from importFingerprint, which is a one-way dedupe hash.
   */
  sourceValues?: Record<string, unknown>;
  /** Original file size in bytes when known (imports; used for board totals). */
  sizeBytes?: number;
  /** Renamed per brand convention, e.g. 20260703_julydrop_004. */
  name: string;
  status: ReviewStatus;
  tags: string[];
  updatedAt: string;
  /** Version stack (v1 first, newest appended last); the flat fields above mirror
   * the current version. Always ≥1 entry after hydration — a v1 is synthesized
   * for legacy/demo assets that predate versioning. */
  versions: AssetVersion[];
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
  /** SVG markup or image URL (white variant after logo normalization). */
  url: string;
  aspectRatio: number;
  /** Pre-baked recolored variants keyed by text-colour id (bone, ink, …), so
   * the Studio content colour can tint the mark. Filled by getWhiteLogoBrand. */
  colorVariants?: Record<string, string>;
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
  /** The Library asset this artboard was opened from ("Edit in Studio") —
   * PERSISTED so a re-save still files a version onto it after a reload
   * (the session-scoped origin map alone forgot this across refreshes). */
  originAssetId?: string | null;
  /** The teammate who owns this artboard — the Studio shows each person only
   * their own comps. Unset (legacy) comps are visible to everyone. */
  ownerId?: string | null;
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

/** ---- Copy snippets ---------------------------------------------------- */

/**
 * A reusable, team-shared piece of copy — the text equivalent of a Library
 * asset. Carries a role so it drops into the right element, and (for headlines)
 * an optional flourish preset captured alongside the exact words. `flourish` is
 * stored loosely (`{ words, style, styles }`) to avoid a types→studio import;
 * the studio casts it to its FlourishStyle union when applying.
 */
export type CopyRole = "headline" | "subhead" | "body";

export interface CopySnippet {
  createdAt: string;
  createdBy?: string | null;
  flourish?: Record<string, unknown>;
  id: string;
  role: CopyRole;
  tags: string[];
  text: string;
  /** Optional headline naming the snippet (the text itself IS the copy). */
  title?: string | null;
}

/** ---- Studio templates ------------------------------------------------- */

/**
 * A reusable, team-shared Studio layout. Captures a full StudioValues snapshot
 * (layout + image + format) under a user-given name; applying one recalls the
 * entire design into a fresh artboard.
 */
export interface Template {
  createdAt: string;
  /** Display name of whoever saved it. */
  createdBy?: string | null;
  /** Canvas format the template was authored at (drives the preview aspect). */
  formatId: string;
  id: string;
  name: string;
  /** The StudioValues blob (stored loosely, like Comp.sourceValues). */
  values: Record<string, unknown>;
}

/** ---- Export queue ----------------------------------------------------- */

export interface QueueItem {
  addedAt: string;
  /** A queued comp (rendered to every selected format). Null for a raw asset. */
  compId: string | null;
  /** A queued raw asset — its original file is downloaded/exported as-is. */
  assetId?: string | null;
  formatIds: string[];
  id: string;
}

/** ---- Planner ---------------------------------------------------------- */

/** Publishing channels the planner previews. */
export type PlannerChannel = "grid" | "story" | "pinterest" | "reel" | "tiktok";

export const PLANNER_CHANNEL_LABELS: Record<PlannerChannel, string> = {
  grid: "Feed grid",
  pinterest: "Pinterest",
  reel: "Reels",
  story: "Stories",
  tiktok: "TikTok",
};

/** One extra media frame in a carousel post (the slot itself is frame 1). */
export interface PlannerFrame {
  assetId: string | null;
  compId: string | null;
  /** Per-frame reframe of the frame's asset (same model as the cover's). */
  crop?: SlotCrop | null;
  id: string;
}

/**
 * Manual reframe of a slot's cover asset. `scale` ≥ 1 zooms into the cover
 * crop; `x`/`y` ∈ [0,1] align the overflow (0.5 = centered) — the CSS
 * object-position model, so the popup preview and the export canvas share
 * one formula.
 */
export interface SlotCrop {
  scale: number;
  x: number;
  y: number;
}

/**
 * A named planner (board) of one channel. Each teammate can keep SEVERAL
 * planners per channel ("July drop", "Evergreen") — slots point at one via
 * boardId; a null boardId means the owner's default "Main" planner of that
 * channel (all legacy slots land there without migration).
 */
export interface PlannerBoard {
  id: string;
  name: string;
  channel: PlannerChannel;
  /** Creator (display name). Follows the same ownership rules as slots. */
  owner: string | null;
  createdAt: string;
}

export interface PlannerGridSlot {
  id: string;
  /** Either a comp, a raw asset, or an empty planned placeholder. */
  compId: string | null;
  assetId: string | null;
  /** Quiet audit trail of status/assignment changes (newest last, capped). */
  activity?: ActivityEvent[];
  label: string | null;
  /** The planner (board) this post belongs to; null = the owner's Main. */
  boardId?: string | null;
  /** Reframe of the cover asset (null/absent = cover at the focal point). */
  crop?: SlotCrop | null;
  /** Review thread on this planned post. */
  comments: JournalComment[];
  /** Carousel frames after the cover (feed posts). */
  frames: PlannerFrame[];
  /** Review state: drafts start here, reviewers move it along. */
  status: ReviewStatus;
  /** Handoff target for this planned post (detail panel). */
  assignedTo?: string | null;
  /** Publish schedule shown in the detail panel (local YYYY-MM-DD / HH:MM). */
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  /** Creator (display name). Each teammate maintains their own planner —
   * editable only by them; everyone else has view + comment access. A null
   * owner (legacy slots) reads as the current user's. */
  owner?: string | null;
}

export interface PlannerState {
  gridSlots: PlannerGridSlot[];
  storySlots: PlannerGridSlot[];
  pinSlots: PlannerGridSlot[];
  reelSlots: PlannerGridSlot[];
  tiktokSlots: PlannerGridSlot[];
}

/** ---- Brand hub: links -------------------------------------------------- */

/** An important brand URL (Instagram, website, drive, etc.). */
export interface BrandLink {
  createdAt: string;
  id: string;
  label: string;
  url: string;
}

/** ---- Copy library: folders + entries ----------------------------------- */

/** A folder in the Copy library (e.g. Captions, Journal, Product). Nests via
 * parentId to form boards and sub-boards, like Library collections. */
export interface CopyFolder {
  createdAt: string;
  id: string;
  name: string;
  /** Parent folder id, or null for a top-level folder. */
  parentId: string | null;
}

/** A comment on a copy entry (a simple thread, no pinning). */
export interface JournalComment {
  /** Another Library asset attached to the note ("swap in this one"). */
  attachmentAssetId?: string | null;
  author: string;
  body: string;
  createdAt: string;
  id: string;
}

/** A saved copy block or journal post, viewable in a readable style. */
export interface JournalEntry {
  body: string;
  /** Discussion thread for this entry. */
  comments: JournalComment[];
  createdAt: string;
  /** Folder this entry lives in, or null for unfiled. */
  folderId: string | null;
  id: string;
  /** "copy" = reusable caption/copy; "journal" = a longer post/note. */
  kind: "copy" | "journal";
  /** Content-type tags (# in the editor). */
  tags: string[];
  title: string;
  updatedAt: string;
}

/** ---- Tasks (Kanban) ---------------------------------------------------- */

export type TaskStatus = "todo" | "doing" | "review" | "done";

export const TASK_STATUS_ORDER: readonly TaskStatus[] = [
  "todo",
  "doing",
  "review",
  "done",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  doing: "In progress",
  done: "Done",
  review: "Review",
  todo: "To do",
};

/** A checklist item inside a task. */
export interface Subtask {
  done: boolean;
  id: string;
  title: string;
}

export interface Task {
  assignee: string | null;
  createdAt: string;
  /** Display name of whoever created this task — manual adds stamp the current
   * user; comment-spawned tasks stamp the comment's author. Null on legacy rows
   * (the Tasks screen recovers comment-task authors via sourceCommentId). */
  createdBy?: string | null;
  /** Longer notes shown in the opened task view. */
  description?: string;
  id: string;
  /** Manual order within its column. */
  position: number;
  /** Checklist shown in the opened task view. */
  subtasks?: Subtask[];
  /** When this task was auto-created from a comment, the comment's id. */
  sourceCommentId?: string | null;
  /** Human-readable origin of an auto-created task, e.g. "Photo · IMG_4201". */
  sourceLabel?: string | null;
  /** Navigable origin: "asset:<id>" | "copy:<id>" | "planner:<channel>:<id>". */
  sourceRef?: string | null;
  status: TaskStatus;
  tags: string[];
  title: string;
  updatedAt: string;
}

/** ---- Team --------------------------------------------------------------- */

/** A teammate who has signed in to the workspace. */
export interface TeamMember {
  email: string;
  id: string;
  name: string;
}

/** ---- Email ------------------------------------------------------------ */

/** The kind of block a section represents (drives its curated editor). */
export type EmailSectionType =
  | "header"
  | "hero"
  | "editorial"
  | "split"
  | "product-grid"
  | "text"
  | "quote"
  | "footer"
  | "banner"
  | "list"
  | "cta"
  | "comp";

/**
 * One stacked block in an email. `values` is a flat Studio runtime snapshot
 * (shape matches studio/comp-layout StudioValues) carrying the block's email
 * `formatId`; kept as a record to avoid a data→studio import cycle. `alt` is the
 * accessibility text shipped alongside the rendered slice.
 */
export interface EmailSection {
  alt: string;
  id: string;
  type: EmailSectionType;
  values: Record<string, unknown>;
}

/** A composed email: a named, ordered stack of section blocks. */
export interface EmailDraft {
  createdAt: string;
  id: string;
  name: string;
  sections: EmailSection[];
  updatedAt: string;
}

/** ---- Project ----------------------------------------------------------- */

export interface ProjectSettings {
  displayName: string | null;
  /** The signed-in teammate's stable id (Supabase auth user id), used to scope
   * the Studio to their own artboards. Null in demo / single-user mode. */
  userId: string | null;
}

export interface ProjectSnapshot {
  /** The comp currently loaded in the Studio editor (Buzz-style artboards). */
  activeArtboardId: string | null;
  assets: Asset[];
  /** False until the first cloud snapshot lands — surfaces show grey skeleton
   * boxes instead of flashing the demo seed. Demo mode ignores it. */
  hydrated: boolean;
  brand: BrandKit;
  collections: Collection[];
  comps: Comp[];
  copyFolders: CopyFolder[];
  copySnippets: CopySnippet[];
  decks: CopyDeck[];
  emails: EmailDraft[];
  journal: JournalEntry[];
  links: BrandLink[];
  planner: PlannerState;
  /** Named planners (boards) per channel; slots reference them via boardId. */
  plannerBoards: PlannerBoard[];
  queue: QueueItem[];
  settings: ProjectSettings;
  tasks: Task[];
  /** Team-shared reusable Studio layouts. */
  templates: Template[];
  teamMembers: TeamMember[];
  /** "demo" until a backend is connected; "cloud" = Supabase team workspace. */
  source: "demo" | "folder" | "cloud";
  folderName: string | null;
}
