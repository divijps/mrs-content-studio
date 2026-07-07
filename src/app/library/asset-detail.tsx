import * as React from "react";

import { Badge, Button, Input } from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import {
  addAssetComment,
  resolveAssetComment,
  setAssetCollection,
  setAssetFocalPoint,
  setAssetStatus,
  setAssetTags,
  toggleAssetFavorite,
  useProject,
} from "../data/project-store";
import type { Asset, Collection } from "../data/types";
import { MentionInput } from "./mention-input";
import { renderWithMentions, useTeamRoster } from "./mentions";
import { StatusDot } from "./status-dot";
import { StatusSelect } from "./status-select";

/** Sentinel value for "no board" in the board Select (empty string is unsafe). */
const UNFILED = "__unfiled__";

type ViewerMode = "view" | "focal" | "comment";

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

export function AssetDetail(props: {
  assetId: string;
  /** Ordered visible asset ids for prev/next navigation. */
  assetIds?: string[];
  onClose: () => void;
  onNavigate?: (assetId: string) => void;
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
  const [mode, setMode] = React.useState<ViewerMode>("view");
  const [draft, setDraft] = React.useState<{
    h?: number;
    w?: number;
    x: number;
    y: number;
  } | null>(null);
  const [commentText, setCommentText] = React.useState("");
  const [tagDraft, setTagDraft] = React.useState("");
  const [openCommentId, setOpenCommentId] = React.useState<string | null>(null);
  // Mobile: the details panel is a bottom drawer (peek → expanded). No effect
  // on desktop, where it's a static side panel.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ moved: boolean; x0: number; y0: number } | null>(null);

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

  if (!asset) return null;

  const isVideo = asset.kind === "video";
  const author = project.settings.displayName ?? "You";
  const size = formatBytes(asset.sizeBytes);
  const path = boardPathNames(project.collections, asset.collectionId);
  const unresolved = asset.comments.filter((comment) => !comment.resolved).length;

  const normalize = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
      x: Number(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)).toFixed(3)),
      y: Number(Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)).toFixed(3)),
    };
  };

  // Annotation is the default gesture: click drops a pin, drag marks a region.
  // Videos keep native playback controls, so pin-on-frame is disabled there —
  // comments are added via the "Add note" button in the panel instead.
  const stagePointerDown = (event: React.PointerEvent): void => {
    if (event.button !== 0 || isVideo) return;
    const point = normalize(event.clientX, event.clientY);
    if (mode === "focal") {
      setAssetFocalPoint(asset.id, point.x, point.y);
      return;
    }
    setOpenCommentId(null);
    dragRef.current = { moved: false, x0: point.x, y0: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const stagePointerMove = (event: React.PointerEvent): void => {
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
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || mode === "focal") return;
    if (!drag.moved) {
      const point = normalize(event.clientX, event.clientY);
      setDraft({ x: point.x, y: point.y });
    }
    // Drag case: draft already holds the final region from pointermove.
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[rgba(8,8,8,0.96)]">
      {/* Top bar: path + actions */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-3 text-xs-plus">
        <span className="hidden shrink-0 text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] sm:inline">
          {["All assets", ...path].join(" / ")} /
        </span>
        <span className="hidden min-w-0 truncate font-medium sm:inline">{asset.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {props.onNavigate ? (
            <>
              <Button
                aria-label="Previous asset"
                disabled={!previousId}
                onClick={() => previousId && props.onNavigate?.(previousId)}
                size="sm"
                variant="ghost"
              >
                ←
              </Button>
              <Button
                aria-label="Next asset"
                disabled={!nextId}
                onClick={() => nextId && props.onNavigate?.(nextId)}
                size="sm"
                variant="ghost"
              >
                →
              </Button>
            </>
          ) : null}
          <Button
            onClick={() => toggleAssetFavorite(asset.id)}
            size="sm"
            variant="ghost"
          >
            {asset.favorite ? "★" : "☆"}
          </Button>
          <Button
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.download = `${asset.name}.${extensionOf(asset).toLowerCase()}`;
              anchor.href = asset.url;
              anchor.click();
            }}
            size="sm"
            variant="outline"
          >
            Download
          </Button>
          {props.onUseInStudio && !isVideo ? (
            <Button onClick={() => props.onUseInStudio?.(asset.id)} size="sm">
              Use in Studio
            </Button>
          ) : null}
          <Button onClick={props.onClose} size="sm" variant="ghost">
            ✕
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Stage */}
        <div className="relative flex min-w-0 flex-1 items-center justify-center p-4 md:p-8">
          <div
            className={`relative max-h-full touch-none select-none ${isVideo ? "" : "cursor-crosshair"}`}
            onPointerDown={stagePointerDown}
            onPointerMove={stagePointerMove}
            onPointerUp={stagePointerUp}
            ref={stageRef}
          >
            {isVideo ? (
              <video
                className="max-h-[74vh] max-w-full rounded-sm object-contain"
                controls
                playsInline
                poster={asset.thumbUrl}
                src={asset.url}
              />
            ) : (
              <img
                alt={asset.name}
                className="max-h-[74vh] max-w-full rounded-sm object-contain"
                draggable={false}
                src={asset.url}
              />
            )}
            {/* Focal marker */}
            {mode === "focal" ? (
              <span
                className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                style={{
                  backgroundColor: "rgba(12,140,233,0.55)",
                  left: `${asset.focalPoint.x * 100}%`,
                  top: `${asset.focalPoint.y * 100}%`,
                }}
              />
            ) : null}

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
                      className="absolute z-10 w-[240px] rounded-lg border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:var(--popover)] p-2.5 shadow-xl"
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
                  className="absolute z-10 flex w-[260px] items-center gap-1.5 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:var(--popover)] p-1.5 shadow-xl"
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

          {/* Bottom toolbar (stills only — videos use native playback) */}
          {isVideo ? null : (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_85%,transparent)] px-2 py-1 backdrop-blur">
              <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                {mode === "focal"
                  ? "Click the subject — crops for every format keep it in frame."
                  : "Click to pin a note · drag to mark an area"}
              </span>
              <Button
                onClick={() => setMode(mode === "focal" ? "view" : "focal")}
                size="sm"
                variant={mode === "focal" ? "secondary" : "ghost"}
              >
                Focal point
              </Button>
            </div>
          )}
        </div>

        {/* Unified details panel: metadata, status, board, tags, comments.
         * Mobile: a bottom drawer that peeks and slides up. Desktop: side panel. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[82vh] flex-col rounded-t-2xl border border-border bg-[color:var(--card)] shadow-2xl transition-transform duration-300 ease-out md:static md:inset-auto md:z-auto md:max-h-none md:w-[320px] md:shrink-0 md:translate-y-0 md:rounded-none md:border-0 md:border-l md:border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] md:shadow-none md:transition-none ${
            sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-3.25rem)] md:translate-y-0"
          }`}
        >
          {/* Mobile grab handle / peek toggle */}
          <button
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? "Collapse details" : "Expand details"}
            className="flex shrink-0 flex-col items-center gap-1 px-4 pb-1 pt-2 md:hidden"
            onClick={() => setSheetOpen((open) => !open)}
            type="button"
          >
            <span className="h-1 w-9 rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_25%,transparent)]" />
            <span className="flex w-full items-center gap-2">
              <StatusDot status={asset.status} />
              <span className="truncate text-xs-plus">{asset.name}</span>
              <span className="ml-auto text-2xs text-muted-foreground">
                {asset.comments.length > 0 ? `${asset.comments.length} 💬` : ""}
                {sheetOpen ? " ▾" : " ▴"}
              </span>
            </span>
          </button>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0 md:pt-4">
            {/* Header */}
            <div>
              <p className="text-sm font-medium">{asset.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
                <Badge variant="outline">{extensionOf(asset)}</Badge>
                <span>
                  {asset.width} × {asset.height}
                </span>
                {size ? <span>· {size}</span> : null}
              </div>
            </div>

            {/* Status — traffic-light dropdown */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                Status
              </span>
              <StatusSelect
                onChange={(status) => setAssetStatus(asset.id, status)}
                status={asset.status}
              />
            </div>

            {/* Board */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                Board
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
                <SelectTrigger className="w-full justify-between">
                  <SelectValue>
                    {() =>
                      asset.collectionId
                        ? boardPathNames(project.collections, asset.collectionId).join(" / ")
                        : "Unfiled"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
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
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                Tags
              </span>
              {asset.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {asset.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() =>
                        setAssetTags(asset.id, asset.tags.filter((entry) => entry !== tag))
                      }
                      title="Remove tag"
                      type="button"
                    >
                      <Badge variant="secondary">{tag} ✕</Badge>
                    </button>
                  ))}
                </div>
              ) : null}
              <Input
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
                  <div className="flex flex-wrap gap-1">
                    {suggestions.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setAssetTags(asset.id, [...asset.tags, tag]);
                          setTagDraft("");
                        }}
                        title="Add existing tag"
                        type="button"
                      >
                        <Badge variant="outline">+ {tag}</Badge>
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>

            {/* Comments — inline, always visible */}
            <div className="flex flex-col gap-1.5 border-t border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                  Comments{unresolved > 0 ? ` · ${unresolved} open` : ""}
                </span>
                <Button
                  onClick={() => {
                    setCommentText("");
                    setDraft({ x: 0.5, y: 0.5 });
                  }}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  + Note
                </Button>
              </div>
              {asset.comments.length === 0 && !draft ? (
                <p className="py-2 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                  {isVideo
                    ? "Add a note to leave feedback on this video."
                    : "Click the image to pin a note, or drag to mark an area."}
                </p>
              ) : (
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
              )}
            </div>

            <div className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
              From {asset.filename} · added {relativeTime(asset.createdAt)}
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
