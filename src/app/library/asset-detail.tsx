import * as React from "react";

import {
  DownloadSimpleIcon,
  FolderIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  StarIcon,
  XIcon,
} from "@phosphor-icons/react";

import { Button } from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";
import { toast } from "sonner";

import {
  addAssetComment,
  isAssetFavorite,
  resolveAssetComment,
  setAssetAssignee,
  setAssetCollection,
  setAssetStatus,
  setAssetTags,
  toggleAssetFavorite,
  useProject,
} from "../data/project-store";
import type { Asset, Collection } from "../data/types";
import { downloadFromUrl } from "../data/download";
import { shareLibraryLink } from "./share-link";
import { MentionInput } from "./mention-input";
import { renderWithMentions, useTeamRoster } from "./mentions";
import { StatusDot } from "./status-dot";
import { StatusSelect } from "./status-select";

/** Sentinel value for "no board" in the board Select (empty string is unsafe). */
const UNFILED = "__unfiled__";

/** Sentinel for "no assignee" in the Assigned-to Select. */
const UNASSIGNED = "__unassigned__";

/** Filled control style shared by the sidebar fields (status, board, tags,
 * note) so they all read as clearly-tappable inputs. */
const FIELD_CLASS =
  "h-auto w-full rounded-lg border-0 bg-[color:var(--surface-inactive)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]";

/** Tags are stored lowercase (for dedupe) but shown in sentence case. */
function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Content-level override so a dropdown's options match the trigger's text
 * size (FIELD_CLASS is text-sm; the popup default is smaller). */
const MENU_MATCH_CLASS = "[&_[data-slot=select-item]]:!text-sm";

function formatBytes(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(asset: Asset): string {
  const match = asset.filename.match(/\.([a-z0-9]+)$/i);
  return (match?.[1] ?? "img").toUpperCase();
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function boardPathNames(collections: Collection[], id: string | null): string[] {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const names: string[] = [];
  let cursor = id;
  while (cursor) {
    const board = byId.get(cursor);
    if (!board) break;
    names.unshift(board.name);
    cursor = board.parentId;
  }
  return names;
}

/** Trailing sequence number in a schema name — e.g. `…_generated_035` → 35. */
function assetIndex(name: string): number | null {
  const match = name.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

/** Prettify a schema filename for a fallback heading: drop the date prefix,
 * turn separators into spaces, and title-case. `20260706_generated_035` →
 * `Generated 035`. */
function prettifyName(name: string): string {
  const words = name.replace(/^\d{6,8}[_-]?/, "").replace(/[_-]+/g, " ").trim();
  return words ? words.replace(/\b\w/g, (char) => char.toUpperCase()) : name;
}

/**
 * A human heading for an asset, read from its "title schema": the board path
 * when it's filed (boards are named nicely), else a prettified name. The raw
 * schema filename becomes a `#index` chip instead of the title.
 */
function assetHeading(asset: Asset, collections: Collection[]): string {
  const path = boardPathNames(collections, asset.collectionId);
  return path.length > 0 ? path.join(" / ") : prettifyName(asset.name);
}

/**
 * Progressive stage image. The cached grid thumbnail shows instantly (so
 * opening and swiping never blank out), then the crisp original fades in — but
 * only when the display actually has more pixels than the thumbnail. On phones
 * and laptops the thumbnail is already sharp, so the multi-megabyte original is
 * never fetched: the single biggest load-time win on a high-res library.
 */
function StageImage(props: { asset: Asset }): React.JSX.Element {
  const { asset } = props;
  const [hiResSrc, setHiResSrc] = React.useState<string | null>(null);

  // Reset whenever the asset changes (navigation reuses this component).
  React.useEffect(() => {
    setHiResSrc(null);
  }, [asset.id]);

  const considerUpgrade = React.useCallback(
    (img: HTMLImageElement) => {
      // No distinct original (small imports / demo assets share one URL).
      if (asset.url === asset.thumbUrl) return;
      const rendered = img.getBoundingClientRect().width * (window.devicePixelRatio || 1);
      // The thumbnail already resolves this display — don't pull the original.
      if (img.naturalWidth >= rendered - 1) return;
      const full = new Image();
      full.decoding = "async";
      full.onload = () => setHiResSrc(asset.url);
      full.src = asset.url;
    },
    [asset.url, asset.thumbUrl],
  );

  return (
    <>
      <img
        alt={asset.name}
        className="block max-h-[74vh] max-w-full rounded-sm object-contain"
        draggable={false}
        onLoad={(event) => considerUpgrade(event.currentTarget)}
        src={asset.thumbUrl}
      />
      {hiResSrc ? (
        <img
          aria-hidden
          alt=""
          className="absolute inset-0 h-full w-full rounded-sm object-contain"
          draggable={false}
          src={hiResSrc}
          style={{ animation: "stage-fade 300ms var(--ease-out) both" }}
        />
      ) : null}
    </>
  );
}

export function AssetDetail(props: {
  assetId: string;
  /** Ordered visible asset ids for prev/next navigation. */
  assetIds?: string[];
  onClose: () => void;
  onEditInStudio?: (assetId: string) => void;
  onNavigate?: (assetId: string) => void;
  /** When set, shows a "Resolve" action (used by the assignment review flow). */
  onResolve?: (assetId: string) => void;
  onUseInStudio?: (assetId: string) => void;
}): React.JSX.Element | null {
  const project = useProject();
  const roster = useTeamRoster();
  // Existing tags across the library — offered as quick-add so categorization
  // stays consistent instead of drifting into near-duplicate tags.
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const candidate of project.assets) {
      for (const tag of candidate.tags) {
        set.add(tag);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.assets]);
  const asset = project.assets.find((candidate) => candidate.id === props.assetId);
  const [draft, setDraft] = React.useState<{
    h?: number;
    w?: number;
    x: number;
    y: number;
  } | null>(null);
  const [commentText, setCommentText] = React.useState("");
  const [noteDraft, setNoteDraft] = React.useState("");
  const [tagDraft, setTagDraft] = React.useState("");
  const [openCommentId, setOpenCommentId] = React.useState<string | null>(null);
  const noteRef = React.useRef<HTMLFormElement>(null);
  // Mobile: the details panel is a bottom drawer (peek → expanded). No effect
  // on desktop, where it's a static side panel.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // Live drag offset of the mobile drawer (null = resting, class-driven).
  const [sheetDragY, setSheetDragY] = React.useState<number | null>(null);
  // Live horizontal offset while swiping the photo to navigate (touch only).
  const [swipeDx, setSwipeDx] = React.useState(0);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ moved: boolean; x0: number; y0: number } | null>(null);
  const swipeRef = React.useRef<{
    decided: "annotate" | "cancel" | "swipe" | null;
    touch: boolean;
    t0: number;
    x0: number;
    y0: number;
  } | null>(null);
  const sheetRef = React.useRef<{ base: number; moved: boolean; peek: number; t0: number; y0: number } | null>(
    null,
  );

  const order = props.assetIds ?? [];
  const position = order.indexOf(props.assetId);
  const previousId = position > 0 ? order[position - 1] : null;
  const nextId = position >= 0 && position < order.length - 1 ? order[position + 1] : null;
  const { onClose, onNavigate } = props;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && previousId && onNavigate) onNavigate(previousId);
      if (event.key === "ArrowRight" && nextId && onNavigate) onNavigate(nextId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, previousId, nextId]);

  // Warm the neighbours' thumbnails so prev/next (and swipe) paint instantly.
  React.useEffect(() => {
    for (const id of [previousId, nextId]) {
      if (!id) continue;
      const neighbour = project.assets.find((candidate) => candidate.id === id);
      if (neighbour && neighbour.kind !== "video") {
        const image = new Image();
        image.src = neighbour.thumbUrl;
      }
    }
  }, [previousId, nextId, project.assets]);

  if (!asset) return null;

  const favorited = isAssetFavorite(asset, project.settings.userId);
  const isVideo = asset.kind === "video";
  const author = project.settings.displayName ?? "You";
  const size = formatBytes(asset.sizeBytes);
  const heading = assetHeading(asset, project.collections);
  const index = assetIndex(asset.name);
  const attribution = asset.addedBy
    ? `Added by ${asset.addedBy}`
    : `Added ${relativeTime(asset.createdAt)}`;
  const unresolved = asset.comments.filter((comment) => !comment.resolved).length;

  const goPrev = (): void => {
    if (previousId) onNavigate?.(previousId);
  };
  const goNext = (): void => {
    if (nextId) onNavigate?.(nextId);
  };

  const handleDownload = (): void => {
    const filename = `${asset.name}.${extensionOf(asset).toLowerCase()}`;
    const done = toast.loading(`Downloading ${asset.name}…`);
    void downloadFromUrl(asset.url, filename)
      .then(() => toast.success(`Downloaded ${filename}`, { id: done }))
      .catch(() => toast.error("Download failed.", { id: done }));
  };

  const normalize = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
      x: Number(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)).toFixed(3)),
      y: Number(Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)).toFixed(3)),
    };
  };

  // Annotation is the default gesture on a pointer device: click drops a pin,
  // drag marks a region. On touch, a horizontal drag navigates (swipe) and a
  // tap drops a pin — region marking is a precision gesture kept to the mouse.
  // Videos keep native playback controls, so the stage is inert there.
  const stagePointerDown = (event: React.PointerEvent): void => {
    if (isVideo) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setOpenCommentId(null);
    const touch = event.pointerType === "touch" || event.pointerType === "pen";
    swipeRef.current = {
      decided: touch ? null : "annotate",
      touch,
      t0: Date.now(),
      x0: event.clientX,
      y0: event.clientY,
    };
    const point = normalize(event.clientX, event.clientY);
    dragRef.current = { moved: false, x0: point.x, y0: point.y };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* no active pointer to capture — safe to ignore */
    }
  };

  const stagePointerMove = (event: React.PointerEvent): void => {
    const swipe = swipeRef.current;
    if (!swipe) return;

    if (swipe.touch) {
      const dx = event.clientX - swipe.x0;
      const dy = event.clientY - swipe.y0;
      if (swipe.decided === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // still a tap
        swipe.decided = Math.abs(dx) > Math.abs(dy) ? "swipe" : "cancel";
        if (swipe.decided === "swipe") {
          dragRef.current = null;
          setDraft(null);
        }
      }
      if (swipe.decided === "swipe") {
        // Rubber-band when there's no neighbour that way.
        let offset = dx;
        if ((dx > 0 && !previousId) || (dx < 0 && !nextId)) offset *= 0.3;
        setSwipeDx(offset);
      }
      return;
    }

    // Mouse: region-drag composer (unchanged behaviour).
    const drag = dragRef.current;
    if (!drag) return;
    const point = normalize(event.clientX, event.clientY);
    const width = Math.abs(point.x - drag.x0);
    const height = Math.abs(point.y - drag.y0);
    if (drag.moved || width > 0.015 || height > 0.015) {
      drag.moved = true;
      setDraft({
        h: Number(height.toFixed(3)),
        w: Number(width.toFixed(3)),
        x: Number(Math.min(drag.x0, point.x).toFixed(3)),
        y: Number(Math.min(drag.y0, point.y).toFixed(3)),
      });
    }
  };

  const stagePointerUp = (event: React.PointerEvent): void => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!swipe) return;

    if (swipe.touch) {
      if (swipe.decided === "swipe") {
        const dx = event.clientX - swipe.x0;
        const elapsed = Math.max(1, Date.now() - swipe.t0);
        const velocity = Math.abs(dx) / elapsed; // px per ms
        const width = stageRef.current?.getBoundingClientRect().width ?? 1;
        const passed = Math.abs(dx) > width * 0.22 || velocity > 0.5;
        setSwipeDx(0); // settle; the destination thumbnail is already warm
        if (passed && dx > 0) goPrev();
        else if (passed && dx < 0) goNext();
        return;
      }
      if (swipe.decided === null) {
        // Touch: a tap pins the spot and opens the drawer's note field — the
        // on-image composer is a desktop-only, precise-pointer affordance.
        const point = normalize(event.clientX, event.clientY);
        setDraft({ x: point.x, y: point.y });
        setNoteDraft("");
        setSheetOpen(true);
        requestAnimationFrame(() => noteRef.current?.querySelector("input")?.focus());
      }
      return;
    }

    // Mouse: a plain click (no drag) drops a point pin.
    if (!drag) return;
    if (!drag.moved) {
      const point = normalize(event.clientX, event.clientY);
      setDraft({ x: point.x, y: point.y });
    }
    setCommentText("");
  };

  /** Composer position, clamped so it never leaves the image. */
  const composerStyle = (annotation: {
    h?: number;
    w?: number;
    x: number;
    y: number;
  }): React.CSSProperties => ({
    left: `${Math.min(72, Math.max(2, annotation.x * 100)) }%`,
    top: `${Math.min(86, (annotation.y + (annotation.h ?? 0)) * 100 + 3)}%`,
  });

  // ---- Mobile drawer drag (peek ⇆ expanded) --------------------------------
  const peekOffset = (): number => Math.max(0, (drawerRef.current?.offsetHeight ?? 0) - 52);

  const drawerPointerDown = (event: React.PointerEvent): void => {
    const peek = peekOffset();
    sheetRef.current = {
      base: sheetOpen ? 0 : peek,
      moved: false,
      peek,
      t0: Date.now(),
      y0: event.clientY,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* no active pointer to capture — safe to ignore */
    }
  };

  const drawerPointerMove = (event: React.PointerEvent): void => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const dy = event.clientY - sheet.y0;
    if (Math.abs(dy) > 3) sheet.moved = true;
    let next = sheet.base + dy;
    if (next < 0) next *= 0.3; // rubber-band past fully-open
    if (next > sheet.peek) next = sheet.peek + (next - sheet.peek) * 0.3;
    setSheetDragY(next);
  };

  const drawerPointerUp = (event: React.PointerEvent): void => {
    const sheet = sheetRef.current;
    sheetRef.current = null;
    setSheetDragY(null);
    if (!sheet) return;
    if (!sheet.moved) {
      setSheetOpen((open) => !open); // treat as a tap
      return;
    }
    const dy = event.clientY - sheet.y0;
    const velocity = dy / Math.max(1, Date.now() - sheet.t0);
    if (velocity < -0.4 || sheet.base + dy < sheet.peek * 0.5) setSheetOpen(true);
    else setSheetOpen(false);
  };

  // The pencil opens this asset in the Studio: a Studio-made export reopens its
  // exact design (Edit); anything else is placed onto a fresh comp (Use).
  const studioAction =
    props.onEditInStudio && asset.sourceValues
      ? { label: "Edit in Studio", run: () => props.onEditInStudio?.(asset.id) }
      : props.onUseInStudio
        ? { label: "Use in Studio", run: () => props.onUseInStudio?.(asset.id) }
        : null;

  const iconBtnClass =
    "flex h-9 w-9 items-center justify-center rounded-md text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] transition-transform hover:text-[color:var(--foreground)] active:scale-90";

  // Shared header cluster: favorite · share link (iPad share sheet) · open in
  // Studio. Sits on the right of both the mobile top bar and the sidebar header.
  const headerActions = (
    <>
      <button
        aria-label={favorited ? "Unfavorite" : "Favorite"}
        className={iconBtnClass}
        onClick={() => toggleAssetFavorite(asset.id)}
        type="button"
      >
        <StarIcon
          className={favorited ? "text-[color:var(--accent)]" : undefined}
          size={18}
          weight={favorited ? "fill" : "regular"}
        />
      </button>
      <button
        aria-label="Share a link"
        className={iconBtnClass}
        onClick={() => shareLibraryLink("asset", asset.id, heading)}
        title="Share a link — teammates can open it"
        type="button"
      >
        <ShareNetworkIcon size={18} />
      </button>
      {studioAction ? (
        <button
          aria-label={studioAction.label}
          className={iconBtnClass}
          onClick={studioAction.run}
          title={studioAction.label}
          type="button"
        >
          <PencilSimpleIcon size={18} />
        </button>
      ) : null}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-xl"
      onClick={(event) => {
        // Click on the dimmed backdrop (not the image, panel, or a control)
        // returns to the previous view.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* Mobile top bar — on desktop these fold into the sidebar header. */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-2 md:hidden">
        <button aria-label="Close" className={iconBtnClass} onClick={props.onClose} type="button">
          <XIcon size={18} />
        </button>
        {order.length > 1 && position >= 0 ? (
          <span className="tabular-nums text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
            {position + 1} / {order.length}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">{headerActions}</div>
      </div>

      <div
        className="relative flex min-h-0 flex-1"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {/* Stage */}
        <div
          className="relative flex min-w-0 flex-1 items-center justify-center p-4 md:p-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div
            className={`relative max-h-full touch-none select-none ${isVideo ? "" : "cursor-crosshair"}`}
            onPointerDown={stagePointerDown}
            onPointerMove={stagePointerMove}
            onPointerUp={stagePointerUp}
            ref={stageRef}
            style={{
              transform: `translateX(${swipeDx}px)`,
              transition: swipeDx ? "none" : "transform 300ms var(--ease-drawer)",
            }}
          >
            {isVideo ? (
              <video
                className="max-h-[74vh] max-w-full rounded-sm object-contain"
                controls
                // Only a real still poster — never the video URL itself, which
                // can't decode as a poster image (a broken frame on iOS).
                poster={asset.thumbUrl && asset.thumbUrl !== asset.url ? asset.thumbUrl : undefined}
                playsInline
                preload="metadata"
                src={asset.url}
              />
            ) : (
              <StageImage asset={asset} />
            )}
            {/* Existing annotations: pins and region boxes */}
            {asset.comments.map((comment, index) => {
              const isBox = comment.w != null && comment.h != null && comment.w > 0.01;
              const tone = comment.resolved ? "#3d6b4a" : "var(--accent)";
              return (
                <React.Fragment key={comment.id}>
                  {isBox ? (
                    <span
                      className="absolute cursor-pointer rounded-sm"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenCommentId(openCommentId === comment.id ? null : comment.id);
                      }}
                      style={{
                        border: `2px solid ${tone}`,
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                        height: `${(comment.h ?? 0) * 100}%`,
                        left: `${comment.x * 100}%`,
                        top: `${comment.y * 100}%`,
                        width: `${(comment.w ?? 0) * 100}%`,
                      }}
                    />
                  ) : null}
                  <button
                    className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xs font-semibold text-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.4)]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenCommentId(openCommentId === comment.id ? null : comment.id);
                      setSheetOpen(true);
                    }}
                    style={{
                      backgroundColor: comment.resolved ? "#3d6b4a" : "var(--accent)",
                      left: `${comment.x * 100}%`,
                      top: `${comment.y * 100}%`,
                    }}
                    type="button"
                  >
                    {index + 1}
                  </button>
                  {openCommentId === comment.id ? (
                    <div
                      className="absolute z-10 hidden w-[240px] rounded-lg border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:var(--popover)] p-2.5 shadow-xl md:block"
                      onPointerDown={(event) => event.stopPropagation()}
                      style={composerStyle(comment)}
                    >
                      <p className={`text-xs-plus ${comment.resolved ? "line-through opacity-60" : ""}`}>
                        {renderWithMentions(comment.text, roster)}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                          {comment.author} · {relativeTime(comment.createdAt)}
                        </span>
                        <Button
                          onClick={() => resolveAssetComment(asset.id, comment.id)}
                          size="sm"
                          variant="ghost"
                        >
                          {comment.resolved ? "Reopen" : "Resolve"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}

            {/* Draft annotation + inline composer */}
            {draft ? (
              <>
                {draft.w != null && draft.h != null ? (
                  <span
                    className="pointer-events-none absolute rounded-sm border-2 border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_12%,transparent)]"
                    style={{
                      height: `${draft.h * 100}%`,
                      left: `${draft.x * 100}%`,
                      top: `${draft.y * 100}%`,
                      width: `${draft.w * 100}%`,
                    }}
                  />
                ) : (
                  <span
                    className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[color:color-mix(in_oklab,var(--accent)_70%,transparent)] shadow-[0_0_0_1.5px_rgba(0,0,0,0.4)]"
                    style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                  />
                )}
                <form
                  className="absolute z-10 hidden w-[260px] items-center gap-1.5 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:var(--popover)] p-1.5 shadow-xl md:flex"
                  onPointerDown={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!commentText.trim()) return;
                    addAssetComment(asset.id, {
                      author,
                      h: draft.h,
                      text: commentText.trim(),
                      w: draft.w,
                      x: draft.x,
                      y: draft.y,
                    });
                    setDraft(null);
                    setCommentText("");
                  }}
                  style={composerStyle(draft)}
                >
                  <MentionInput
                    autoFocus
                    onCancel={() => {
                      setDraft(null);
                      setCommentText("");
                    }}
                    onChange={setCommentText}
                    placeholder={draft.w != null ? "Note on this area — @mention…" : "Leave a note — @mention…"}
                    roster={roster}
                    value={commentText}
                  />
                  <Button size="sm" type="submit" variant="secondary">
                    Post
                  </Button>
                  <Button
                    onClick={() => {
                      setDraft(null);
                      setCommentText("");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    ✕
                  </Button>
                </form>
              </>
            ) : null}
          </div>

          {/* Edge navigation — large, easy targets that beat tiny top-bar arrows */}
          {onNavigate && previousId ? (
            <button
              aria-label="Previous asset"
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_70%,transparent)] text-base text-[color:color-mix(in_oklab,var(--foreground)_80%,transparent)] backdrop-blur transition-transform hover:text-[color:var(--foreground)] active:scale-90 md:left-4"
              onClick={goPrev}
              type="button"
            >
              ‹
            </button>
          ) : null}
          {onNavigate && nextId ? (
            <button
              aria-label="Next asset"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_70%,transparent)] text-base text-[color:color-mix(in_oklab,var(--foreground)_80%,transparent)] backdrop-blur transition-transform hover:text-[color:var(--foreground)] active:scale-90 md:right-4"
              onClick={goNext}
              type="button"
            >
              ›
            </button>
          ) : null}

          {/* Hint (stills, desktop) — non-interactive so clicks pass through */}
          {isVideo ? null : (
            <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center rounded-lg border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_85%,transparent)] px-2.5 py-1 backdrop-blur sm:flex">
              <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                Click to pin a note · drag to mark an area
              </span>
            </div>
          )}
        </div>

        {/* Unified details panel: metadata, status, board, tags, comments.
         * Mobile: a bottom drawer that peeks and slides up (draggable handle).
         * Desktop: a static side panel. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[82vh] flex-col rounded-t-2xl border border-border bg-[color:var(--card)] shadow-2xl duration-300 md:static md:inset-auto md:z-auto md:order-first md:max-h-none md:w-[360px] md:shrink-0 md:translate-y-0 md:rounded-none md:border-0 md:border-r md:border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] md:shadow-none md:transition-none ${
            sheetDragY == null ? "transition-transform" : ""
          } ${
            sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-3.25rem)] md:translate-y-0"
          }`}
          ref={drawerRef}
          style={{
            transform: sheetDragY != null ? `translateY(${sheetDragY}px)` : undefined,
            transitionTimingFunction: "var(--ease-drawer)",
          }}
        >
          {/* Sidebar header — close + counter on the left, actions on the right */}
          <div className="hidden h-12 shrink-0 items-center gap-1 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-2 md:flex">
            <button aria-label="Close" className={iconBtnClass} onClick={props.onClose} type="button">
              <XIcon size={18} />
            </button>
            {order.length > 1 && position >= 0 ? (
              <span className="ml-1 tabular-nums text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                {position + 1} / {order.length}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">{headerActions}</div>
          </div>

          {/* Mobile grab handle / peek toggle — draggable and tappable */}
          <button
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? "Collapse details" : "Expand details"}
            className="flex shrink-0 touch-none flex-col items-center gap-1 px-4 pb-1 pt-2 md:hidden"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSheetOpen((open) => !open);
              }
            }}
            onPointerDown={drawerPointerDown}
            onPointerMove={drawerPointerMove}
            onPointerUp={drawerPointerUp}
            type="button"
          >
            <span className="h-1 w-9 rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_25%,transparent)]" />
            <span className="flex w-full items-center gap-2">
              <StatusDot status={asset.status} />
              <span className="truncate text-xs-plus">{heading}</span>
              <span className="ml-auto text-2xs text-muted-foreground">
                {asset.comments.length > 0 ? `${asset.comments.length} 💬` : ""}
                {sheetOpen ? " ▾" : " ▴"}
              </span>
            </span>
          </button>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0 md:pt-4">
            {/* Title */}
            <p className="hidden text-xl font-semibold leading-tight md:block">{heading}</p>

            {/* Meta + board + tags — chips that read at a glance. The board is a
             * changeable chip dropdown; it and the tags share one wrap row. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {index != null ? (
                <span className="inline-flex items-center rounded-full bg-[color:var(--surface-inactive)] px-2.5 py-1 text-xs tabular-nums text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
                  #{index}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-inactive)] px-2.5 py-1 text-xs text-[color:color-mix(in_oklab,var(--foreground)_72%,transparent)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]" />
                {attribution}
              </span>
              <Select
                items={[
                  { label: "Unfiled", value: UNFILED },
                  ...project.collections.map((collection) => ({
                    label: boardPathNames(project.collections, collection.id).join(" / "),
                    value: collection.id,
                  })),
                ]}
                onValueChange={(next) =>
                  setAssetCollection(asset.id, next === UNFILED ? null : next)
                }
                value={asset.collectionId ?? UNFILED}
              >
                <SelectTrigger className="inline-flex h-auto w-auto items-center gap-1.5 rounded-full border-0 bg-[color:var(--surface-inactive)] py-1 pl-2.5 pr-1.5 text-xs text-[color:color-mix(in_oklab,var(--foreground)_82%,transparent)] outline-none transition-colors hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]">
                  <FolderIcon size={12} />
                  <SelectValue>
                    {() =>
                      asset.collectionId
                        ? boardPathNames(project.collections, asset.collectionId).join(" / ")
                        : "Unfiled"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className={MENU_MATCH_CLASS}>
                  <SelectGroup>
                    <SelectItem value={UNFILED}>Unfiled</SelectItem>
                    {project.collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {boardPathNames(project.collections, collection.id).join(" / ")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {asset.tags.map((tag) => (
                <button
                  className="group/tag inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-inactive)] py-1 pl-3 pr-2.5 text-xs text-[color:color-mix(in_oklab,var(--foreground)_82%,transparent)] transition-colors hover:bg-[color:var(--surface-active)]"
                  key={tag}
                  onClick={() =>
                    setAssetTags(asset.id, asset.tags.filter((entry) => entry !== tag))
                  }
                  title={`Remove ${sentenceCase(tag)}`}
                  type="button"
                >
                  {sentenceCase(tag)}
                  <span className="text-[color:var(--text-muted)] transition-colors group-hover/tag:text-[color:var(--foreground)]">
                    ✕
                  </span>
                </button>
              ))}
            </div>

            {/* Add tag */}
            <div className="flex flex-col gap-2">
              <input
                className={FIELD_CLASS}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && tagDraft.trim()) {
                    const next = tagDraft.trim().toLowerCase();
                    if (!asset.tags.includes(next)) {
                      setAssetTags(asset.id, [...asset.tags, next]);
                    }
                    setTagDraft("");
                  }
                }}
                placeholder="Add tag + Enter"
                value={tagDraft}
              />
              {(() => {
                const query = tagDraft.trim().toLowerCase();
                const suggestions = allTags
                  .filter(
                    (tag) =>
                      !asset.tags.includes(tag) && (query ? tag.includes(query) : true),
                  )
                  .slice(0, 8);
                return suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 opacity-45 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100">
                    {suggestions.map((tag) => (
                      <button
                        className="rounded-full border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-transparent hover:bg-[color:var(--surface-active)] hover:text-foreground"
                        key={tag}
                        onClick={() => {
                          setAssetTags(asset.id, [...asset.tags, tag]);
                          setTagDraft("");
                        }}
                        title={`Add ${sentenceCase(tag)}`}
                        type="button"
                      >
                        + {sentenceCase(tag)}
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>

            {/* Download the original — prominent, right under the title + tags */}
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-black transition hover:opacity-90 active:scale-[0.99]"
              onClick={handleDownload}
              type="button"
            >
              <DownloadSimpleIcon size={17} weight="bold" />
              Download
            </button>

            {/* Comments — list, then status + assign side by side, then the box.
             * Clicking the image still pins a spatial note (see the stage hint). */}
            <div className="flex flex-col gap-2.5 border-t border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] pt-4">
              <span className="ds-label">
                Comments{unresolved > 0 ? ` · ${unresolved} open` : ""}
              </span>
              {asset.comments.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {asset.comments.map((comment, index) => (
                    <li
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                        openCommentId === comment.id
                          ? "border-[color:var(--accent)]"
                          : "border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_32%,transparent)]"
                      }`}
                      key={comment.id}
                      onClick={() =>
                        setOpenCommentId(openCommentId === comment.id ? null : comment.id)
                      }
                    >
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: comment.resolved ? "#3d6b4a" : "var(--accent)" }}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs-plus ${comment.resolved ? "text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] line-through" : ""}`}
                        >
                          {renderWithMentions(comment.text, roster)}
                        </p>
                        <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                          {comment.author} · {relativeTime(comment.createdAt)}
                          {comment.w != null ? " · area" : ""}
                        </span>
                      </div>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          resolveAssetComment(asset.id, comment.id);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        {comment.resolved ? "Reopen" : "Resolve"}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Status + Assign — sit side by side just above the note box, so
               * triaging a comment (set status, hand off) lives with the thread. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <span className="ds-label">Status</span>
                  <StatusSelect
                    contentClassName={MENU_MATCH_CLASS}
                    onChange={(status) => setAssetStatus(asset.id, status)}
                    status={asset.status}
                    triggerClassName={`${FIELD_CLASS} justify-between`}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="ds-label">Assign</span>
                  <Select
                    items={[
                      { label: "Unassigned", value: UNASSIGNED },
                      ...roster.map((name) => ({ label: name, value: name })),
                    ]}
                    onValueChange={(next) =>
                      setAssetAssignee(asset.id, next === UNASSIGNED ? null : next)
                    }
                    value={asset.assignedTo ?? UNASSIGNED}
                  >
                    <SelectTrigger className={`${FIELD_CLASS} justify-between`}>
                      <SelectValue>{() => asset.assignedTo ?? "Unassigned"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className={MENU_MATCH_CLASS}>
                      <SelectGroup>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {roster.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {props.onResolve ? (
                <button
                  className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--accent)] text-sm font-medium text-[color:var(--accent-foreground)] transition-opacity hover:opacity-90"
                  onClick={() => props.onResolve?.(asset.id)}
                  type="button"
                >
                  ✓ Resolve &amp; next
                </button>
              ) : null}

              {/* MentionInput (not a plain input) so @-mentions autocomplete
                * here too — videos only have this composer, since pinned
                * on-image notes are a photo affordance. Enter still submits:
                * MentionInput bubbles it whenever the roster popup is closed. */}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!noteDraft.trim()) {
                    return;
                  }
                  addAssetComment(asset.id, {
                    author,
                    h: draft?.h,
                    text: noteDraft.trim(),
                    w: draft?.w,
                    x: draft?.x ?? 0.5,
                    y: draft?.y ?? 0.5,
                  });
                  setNoteDraft("");
                  setDraft(null);
                }}
                ref={noteRef}
              >
                <MentionInput
                  className={FIELD_CLASS}
                  onChange={setNoteDraft}
                  placeholder={
                    draft ? "Note on this spot — @mention…" : "+ New note — @mention…"
                  }
                  roster={roster}
                  value={noteDraft}
                />
              </form>
            </div>

            <div className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_38%,transparent)]">
              {extensionOf(asset)} · {asset.width} × {asset.height}
              {size ? ` · ${size}` : ""}
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-2">
            <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
              Esc to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
