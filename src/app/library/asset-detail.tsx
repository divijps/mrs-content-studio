import * as React from "react";

import {
  Badge,
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/toolcraft/ui";

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
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  type Asset,
  type Collection,
  type ReviewStatus,
} from "../data/types";
import { StatusDot } from "./status-dot";

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
  const asset = project.assets.find((candidate) => candidate.id === props.assetId);
  const [mode, setMode] = React.useState<ViewerMode>("view");
  const [draft, setDraft] = React.useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = React.useState("");
  const [tagDraft, setTagDraft] = React.useState("");
  const stageRef = React.useRef<HTMLDivElement>(null);

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

  const author = project.settings.displayName ?? "You";
  const size = formatBytes(asset.sizeBytes);
  const path = boardPathNames(project.collections, asset.collectionId);
  const unresolved = asset.comments.filter((comment) => !comment.resolved).length;

  const stageClick = (event: React.MouseEvent): void => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Number(((event.clientX - rect.left) / rect.width).toFixed(3));
    const y = Number(((event.clientY - rect.top) / rect.height).toFixed(3));
    if (mode === "focal") {
      setAssetFocalPoint(asset.id, x, y);
    } else if (mode === "comment") {
      setDraft({ x, y });
      setCommentText("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[rgba(8,8,8,0.96)]">
      {/* Top bar: path + actions */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-3 text-xs-plus">
        <span className="text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
          {["All assets", ...path].join(" / ")} /
        </span>
        <span className="truncate font-medium">{asset.name}</span>
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
          {props.onUseInStudio ? (
            <Button onClick={() => props.onUseInStudio?.(asset.id)} size="sm">
              Use in Studio
            </Button>
          ) : null}
          <Button onClick={props.onClose} size="sm" variant="ghost">
            ✕
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Stage */}
        <div className="relative flex min-w-0 flex-1 items-center justify-center p-8">
          <div
            className={`relative max-h-full ${mode !== "view" ? "cursor-crosshair" : ""}`}
            onClick={stageClick}
            ref={stageRef}
          >
            <img
              alt={asset.name}
              className="max-h-[74vh] max-w-full rounded-sm object-contain"
              draggable={false}
              src={asset.url}
            />
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
            {/* Comment pins */}
            {asset.comments.map((comment, index) => (
              <span
                className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xs font-semibold text-white ${comment.resolved ? "bg-[#3d6b4a]" : "bg-[color:var(--accent)]"}`}
                key={comment.id}
                style={{ left: `${comment.x * 100}%`, top: `${comment.y * 100}%` }}
                title={comment.text}
              >
                {index + 1}
              </span>
            ))}
            {draft && mode === "comment" ? (
              <span
                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[color:color-mix(in_oklab,var(--accent)_60%,transparent)]"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
              />
            ) : null}
          </div>

          {/* Bottom toolbar */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_85%,transparent)] p-1 backdrop-blur">
            <Button
              onClick={() => setMode(mode === "focal" ? "view" : "focal")}
              size="sm"
              variant={mode === "focal" ? "secondary" : "ghost"}
            >
              Focal point
            </Button>
            <Button
              onClick={() => setMode(mode === "comment" ? "view" : "comment")}
              size="sm"
              variant={mode === "comment" ? "secondary" : "ghost"}
            >
              Comment
            </Button>
          </div>
          {mode !== "view" ? (
            <span className="absolute bottom-16 left-1/2 -translate-x-1/2 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
              {mode === "focal"
                ? "Click the subject — crops for every format keep it in frame."
                : "Click the image to pin a note."}
            </span>
          ) : null}
        </div>

        {/* Info / Comments panel */}
        <div className="flex w-[320px] shrink-0 flex-col border-l border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:var(--card)]">
          <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="info">
            <div className="border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-3 pt-3">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="comments">
                  Comments{unresolved > 0 ? ` (${unresolved})` : ""}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="min-h-0 flex-1 overflow-y-auto p-4" value="info">
              <div className="flex flex-col gap-4">
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

                <div className="flex flex-col gap-1.5">
                  <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                    Status
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {REVIEW_STATUS_ORDER.map((status) => (
                      <button
                        key={status}
                        onClick={() => setAssetStatus(asset.id, status as ReviewStatus)}
                        type="button"
                      >
                        <Badge
                          variant={asset.status === status ? "default" : "outline"}
                        >
                          {REVIEW_STATUS_LABELS[status]}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                    Board
                  </span>
                  <select
                    className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-transparent px-2 py-1.5 text-xs-plus outline-none focus:border-[color:var(--accent)]"
                    onChange={(event) => setAssetCollection(asset.id, event.target.value || null)}
                    value={asset.collectionId ?? ""}
                  >
                    <option value="">Unfiled</option>
                    {project.collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {boardPathNames(project.collections, collection.id).join(" / ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                    Tags
                  </span>
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
                </div>

                <div className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                  From {asset.filename} · added {relativeTime(asset.createdAt)}
                </div>
              </div>
            </TabsContent>

            <TabsContent
              className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
              value="comments"
            >
              {asset.comments.length === 0 && !draft ? (
                <p className="py-8 text-center text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                  No comments yet. Use the Comment tool to pin feedback on the image.
                </p>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {asset.comments.map((comment, index) => (
                  <li
                    className="flex items-start gap-2 rounded-md border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-2 py-1.5"
                    key={comment.id}
                  >
                    <span className="mt-0.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs-plus ${comment.resolved ? "text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] line-through" : ""}`}
                      >
                        {comment.text}
                      </p>
                      <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                        {comment.author} · {relativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <Button
                      onClick={() => resolveAssetComment(asset.id, comment.id)}
                      size="sm"
                      variant="ghost"
                    >
                      {comment.resolved ? "Reopen" : "Resolve"}
                    </Button>
                  </li>
                ))}
              </ul>
              {draft ? (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!commentText.trim()) return;
                    addAssetComment(asset.id, {
                      author,
                      text: commentText.trim(),
                      x: draft.x,
                      y: draft.y,
                    });
                    setDraft(null);
                    setCommentText("");
                    setMode("view");
                  }}
                >
                  <Input
                    autoFocus
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Leave a note…"
                    value={commentText}
                  />
                  <Button size="sm" type="submit" variant="secondary">
                    Post
                  </Button>
                </form>
              ) : null}
            </TabsContent>
          </Tabs>

          {/* Current status pill footer */}
          <div className="flex items-center justify-between border-t border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-2.5">
            <StatusDot status={asset.status} withLabel />
            <span className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
              Esc to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
