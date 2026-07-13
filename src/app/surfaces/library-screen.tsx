import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";
import { toast } from "sonner";

import { AssetDetail } from "../library/asset-detail";
import { BoardsTree } from "../library/boards-tree";
import { KanbanBoard } from "../library/kanban-board";
import { StatusDot } from "../library/status-dot";
import {
  addAssets,
  addCollection,
  addPlannerGridSlot,
  addPlannerStorySlot,
  bulkAddAssetTag,
  bulkSetAssetCollection,
  bulkSetAssetFavorite,
  bulkSetAssetStatus,
  consumeLibraryAsset,
  consumeLibraryBoard,
  deleteAssets,
  getProjectSnapshot,
  isAssetFavorite,
  LIBRARY_ASSET_EVENT,
  LIBRARY_BOARD_EVENT,
  requestStudioDesign,
  requestStudioImage,
  toggleAssetFavorite,
  useProject,
} from "../data/project-store";
import {
  beginUpload,
  failUpload,
  finishUpload,
  updateUpload,
} from "../data/upload-store";
import { importFiles } from "../data/import-assets";
import { dateStampNow, downloadBlob } from "../studio/export";
import { createZip, type ZipEntry } from "../studio/zip";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  type Asset,
  type Collection,
  type ReviewStatus,
} from "../data/types";

type SortOrder = "newest" | "oldest" | "name";
type StatusFilter = "all" | ReviewStatus;

const STATUS_FILTER_ITEMS: { label: string; value: StatusFilter }[] = [
  { label: "All statuses", value: "all" },
  ...REVIEW_STATUS_ORDER.map((status) => ({
    label: REVIEW_STATUS_LABELS[status],
    value: status as StatusFilter,
  })),
];

const SORT_ITEMS: { label: string; value: SortOrder }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Name", value: "name" },
];

/** Seconds → m:ss (e.g. 0:18, 1:42). */
function formatDuration(seconds?: number): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const mins = Math.floor(total / 60);
  return `${mins}:${String(total % 60).padStart(2, "0")}`;
}

const FAVORITES = "★favorites";

/** Ancestor path (root → board) for the breadcrumb. */
function boardPath(collections: Collection[], id: string | null): Collection[] {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const path: Collection[] = [];
  let cursor = id;
  while (cursor) {
    const board = byId.get(cursor);
    if (!board) break;
    path.unshift(board);
    cursor = board.parentId;
  }
  return path;
}

/** Descendant board ids (inclusive) so a board view includes its sub-boards. */
function descendantIds(collections: Collection[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const collection of collections) {
      if (collection.parentId && ids.has(collection.parentId) && !ids.has(collection.id)) {
        ids.add(collection.id);
        added = true;
      }
    }
  }
  return ids;
}

function boardFullName(collections: Collection[], id: string): string {
  return boardPath(collections, id)
    .map((board) => board.name)
    .join(" / ");
}

function AssetCard(props: {
  asset: Asset;
  boards: Collection[];
  checked: boolean;
  favorited: boolean;
  onEditInStudio: (assetId: string) => void;
  onOpen: (assetId: string) => void;
  onToggleCheck: (assetId: string, checked: boolean) => void;
  onUseInStudio: (assetId: string) => void;
  selectionActive: boolean;
  viewerOpen: boolean;
}): React.JSX.Element {
  const { asset } = props;
  const unresolved = asset.comments.filter((comment) => !comment.resolved).length;
  const ratio = asset.width && asset.height ? asset.width / asset.height : 0.8;

  return (
    <div className="mb-3 break-inside-avoid">
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-colors ${
              props.checked || props.viewerOpen
                ? "border-[color:var(--accent)]"
                : "border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)]"
            }`}
            draggable
            onClick={() => {
              if (props.selectionActive) {
                props.onToggleCheck(asset.id, !props.checked);
              } else {
                props.onOpen(asset.id);
              }
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-asset-id", asset.id);
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <img
              alt={asset.name}
              className="block w-full bg-[color:var(--muted)] object-cover"
              decoding="async"
              loading="lazy"
              src={asset.thumbUrl}
              style={{ aspectRatio: String(ratio) }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            {/* Video affordance: play glyph + duration badge */}
            {asset.kind === "video" ? (
              <>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-sm text-white backdrop-blur-sm">
                    ▶
                  </span>
                </span>
                <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
                  {formatDuration(asset.durationSec)}
                </span>
              </>
            ) : null}

            {/* Select check — visible on hover or while a selection exists */}
            <button
              aria-label={props.checked ? "Deselect" : "Select"}
              className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border text-2xs transition-opacity ${
                props.checked
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white opacity-100"
                  : `border-white/70 bg-black/40 text-transparent hover:text-white ${props.selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
              }`}
              onClick={(event) => {
                event.stopPropagation();
                props.onToggleCheck(asset.id, !props.checked);
              }}
              type="button"
            >
              ✓
            </button>

            <button
              aria-label={props.favorited ? "Unfavorite" : "Favorite"}
              className="absolute right-2 top-2 text-sm text-white drop-shadow"
              onClick={(event) => {
                event.stopPropagation();
                toggleAssetFavorite(asset.id);
              }}
              type="button"
            >
              {props.favorited ? "★" : "☆"}
            </button>

            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="truncate text-2xs text-white drop-shadow">{asset.name}</span>
              <span className="flex items-center gap-1">
                {unresolved > 0 ? <Badge variant="secondary">{unresolved}</Badge> : null}
                <StatusDot onImage status={asset.status} />
              </span>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => props.onOpen(asset.id)}>Open</ContextMenuItem>
          <ContextMenuItem onClick={() => props.onUseInStudio(asset.id)}>
            Use in Studio
          </ContextMenuItem>
          {asset.sourceValues ? (
            <ContextMenuItem onClick={() => props.onEditInStudio(asset.id)}>
              Edit in Studio
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem
            onClick={() => {
              addPlannerGridSlot({ assetId: asset.id });
              toast.success("Added to the Planner feed grid");
            }}
          >
            Send to feed grid
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              addPlannerStorySlot({ assetId: asset.id });
              toast.success("Added to the Planner stories");
            }}
          >
            Send to stories
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>Move to board</ContextMenuLabel>
            <ContextMenuItem onClick={() => bulkSetAssetCollection([asset.id], null)}>
              Unfiled
            </ContextMenuItem>
            {props.boards.map((board) => (
              <ContextMenuItem
                key={board.id}
                onClick={() => bulkSetAssetCollection([asset.id], board.id)}
              >
                {boardFullName(props.boards, board.id)}
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => toggleAssetFavorite(asset.id)}>
            {props.favorited ? "Remove favorite" : "Favorite"}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (window.confirm(`Delete ${asset.name}? This cannot be undone.`)) {
                deleteAssets([asset.id]);
                toast.success("Deleted");
              }
            }}
            variant="destructive"
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

/** Floating bulk-action bar shown while a selection exists. */
function BulkBar(props: {
  boards: Collection[];
  onClear: () => void;
  onSelectAll: () => void;
  onUseInStudio: (assetId: string) => void;
  selected: string[];
  total: number;
}): React.JSX.Element {
  const { selected } = props;
  const [zipping, setZipping] = React.useState(false);

  /** Download every selected asset's original file as one ZIP. */
  const exportZip = async (): Promise<void> => {
    setZipping(true);
    const toastId = toast.loading(`Zipping ${selected.length} assets…`);
    try {
      const { assets } = getProjectSnapshot();
      const entries: ZipEntry[] = [];
      const usedNames = new Set<string>();
      let failed = 0;
      let done = 0;
      for (const id of selected) {
        const asset = assets.find((candidate) => candidate.id === id);
        if (!asset) {
          continue;
        }
        try {
          const response = await fetch(asset.url, { mode: "cors" });
          if (!response.ok) {
            throw new Error(String(response.status));
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          const ext =
            asset.filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
          let name = `${asset.name}.${ext}`;
          for (let version = 2; usedNames.has(name); version += 1) {
            name = `${asset.name}_v${version}.${ext}`;
          }
          usedNames.add(name);
          entries.push({ bytes, path: name });
        } catch {
          failed += 1; // skip what can't be fetched; the rest still exports
        }
        done += 1;
        toast.loading(`Zipping ${done}/${selected.length}…`, { id: toastId });
      }
      if (entries.length === 0) {
        throw new Error("none of the files could be fetched");
      }
      downloadBlob(
        createZip(entries),
        `${dateStampNow()}_library_${entries.length}-assets.zip`,
      );
      toast.success(
        failed
          ? `${entries.length} exported · ${failed} failed`
          : `${entries.length} exported as ZIP`,
        { id: toastId },
      );
    } catch (error) {
      toast.error(`Export failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_92%,transparent)] px-2 py-1.5 shadow-xl backdrop-blur">
      <span className="px-1 text-xs-plus">
        {selected.length} selected
      </span>
      {selected.length < props.total ? (
        <Button onClick={props.onSelectAll} size="sm" variant="ghost">
          All {props.total}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="outline">
              Status
            </Button>
          }
        />
        <DropdownMenuContent>
          {REVIEW_STATUS_ORDER.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => {
                bulkSetAssetStatus(selected, status as ReviewStatus);
                toast.success(`${selected.length} → ${REVIEW_STATUS_LABELS[status]}`);
              }}
            >
              {REVIEW_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="outline">
              Move to
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => bulkSetAssetCollection(selected, null)}
          >
            Unfiled
          </DropdownMenuItem>
          {props.boards.map((board) => (
            <DropdownMenuItem
              key={board.id}
              onClick={() => {
                bulkSetAssetCollection(selected, board.id);
                toast.success(`Moved ${selected.length} to ${board.name}`);
              }}
            >
              {boardFullName(props.boards, board.id)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        onClick={() => {
          const tag = window.prompt("Add tag to selection");
          if (tag?.trim()) {
            bulkAddAssetTag(selected, tag);
            toast.success(`Tagged ${selected.length} with “${tag.trim().toLowerCase()}”`);
          }
        }}
        size="sm"
        variant="outline"
      >
        Tag
      </Button>
      <Button
        onClick={() => {
          bulkSetAssetFavorite(selected, true);
          toast.success(`${selected.length} favorited`);
        }}
        size="sm"
        variant="outline"
      >
        ★
      </Button>
      {selected.length === 1 ? (
        <Button
          onClick={() => props.onUseInStudio(selected[0]!)}
          size="sm"
          variant="outline"
        >
          Use in Studio
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="outline">
              Planner
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => {
              for (const id of selected) addPlannerGridSlot({ assetId: id });
              toast.success(`${selected.length} added to the feed grid`);
            }}
          >
            Send to feed grid
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              for (const id of selected) addPlannerStorySlot({ assetId: id });
              toast.success(`${selected.length} added to stories`);
            }}
          >
            Send to stories
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        disabled={zipping}
        onClick={() => void exportZip()}
        size="sm"
        title="Download the selected originals as one ZIP"
        variant="outline"
      >
        {zipping ? "Zipping…" : "Export ZIP"}
      </Button>
      <Button
        onClick={() => {
          if (
            window.confirm(
              `Delete ${selected.length} asset${selected.length === 1 ? "" : "s"}? This cannot be undone.`,
            )
          ) {
            deleteAssets(selected);
            props.onClear();
            toast.success("Deleted");
          }
        }}
        size="sm"
        variant="destructive"
      >
        Delete
      </Button>
      <Button onClick={props.onClear} size="sm" variant="ghost">
        ✕
      </Button>
    </div>
  );
}

export function LibraryScreen(): React.JSX.Element {
  const project = useProject();
  const navigate = useNavigate();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"grid" | "board">("grid");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOrder>("newest");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [openAssetId, setOpenAssetId] = React.useState<string | null>(null);
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  const [importing, setImporting] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  // A notification or global-search hit may ask for a specific asset's viewer
  // or board — honor it on mount (cross-route) and via event (already here).
  React.useEffect(() => {
    const openPending = (): void => {
      const pendingAsset = consumeLibraryAsset();
      if (pendingAsset) {
        setOpenAssetId(pendingAsset);
      }
      const pendingBoard = consumeLibraryBoard();
      if (pendingBoard !== undefined) {
        setActiveId(pendingBoard);
      }
    };
    openPending();
    window.addEventListener(LIBRARY_ASSET_EVENT, openPending);
    window.addEventListener(LIBRARY_BOARD_EVENT, openPending);
    return () => {
      window.removeEventListener(LIBRARY_ASSET_EVENT, openPending);
      window.removeEventListener(LIBRARY_BOARD_EVENT, openPending);
    };
  }, []);

  const useInStudio = React.useCallback(
    (assetId: string) => {
      requestStudioImage(assetId);
      void navigate({ to: "/" });
    },
    [navigate],
  );

  // "Edit in Studio": reopen the exact design a Studio-made asset was exported
  // from. The Studio renderer creates + loads the fresh artboard on mount (via
  // the pending-design channel) so the switch effect actually loads it.
  const editInStudio = React.useCallback(
    (assetId: string) => {
      const asset = getProjectSnapshot().assets.find((entry) => entry.id === assetId);
      if (!asset?.sourceValues) {
        toast.error("This asset has no editable Studio design.");
        return;
      }
      requestStudioDesign(asset.sourceValues);
      void navigate({ to: "/" });
    },
    [navigate],
  );

  const toggleCheck = React.useCallback((assetId: string, checked: boolean) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(assetId);
      } else {
        next.delete(assetId);
      }
      return next;
    });
  }, []);

  const runImport = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setImporting(true);
      // Always surface a persistent, app-wide indicator (the old flow only did
      // so for >4 files, so a single large video looked like nothing happened).
      const hasVideo = files.some((file) => file.type.startsWith("video/"));
      const uploadId = beginUpload({
        kind: hasVideo ? (files.length > 1 ? "mixed" : "video") : "image",
        label: files.length === 1 ? (files[0]?.name ?? "Upload") : `${files.length} files`,
      });
      try {
        const snapshot = getProjectSnapshot();
        const boardId = activeId && activeId !== FAVORITES ? activeId : null;
        const board = boardId
          ? snapshot.collections.find((entry) => entry.id === boardId)
          : null;
        // Reading/decoding + video poster capture is the first slice of work.
        const result = await importFiles({
          addedBy: snapshot.settings.displayName ?? null,
          collectionId: boardId,
          collectionName: board?.name ?? "import",
          existing: snapshot.assets,
          files,
          onProgress: (processed, total) => {
            updateUpload(uploadId, {
              detail: total > 1 ? `Reading ${processed}/${total}` : undefined,
              fraction: total ? (processed / total) * 0.15 : 0,
              phase: "preparing",
            });
          },
        });
        if (snapshot.source === "cloud" && result.assets.length > 0) {
          // Team workspace: push originals + web derivatives to storage so the
          // whole team sees them; assets land with storage-backed URLs.
          const { uploadAssets } = await import("../data/backend/supabase-backend");
          const uploaded = await uploadAssets(
            result.assets,
            result.sources,
            (progress) => {
              updateUpload(uploadId, {
                detail:
                  progress.total > 1 ? `${progress.done}/${progress.total} files` : undefined,
                fraction: 0.15 + progress.fraction * 0.85,
                phase: "uploading",
              });
            },
            result.posters,
          );
          addAssets(uploaded);
        } else {
          addAssets(result.assets);
        }
        finishUpload(uploadId);
        const parts = [`${result.assets.length} imported`];
        if (result.duplicates) parts.push(`${result.duplicates} duplicate skipped`);
        if (result.skipped) parts.push(`${result.skipped} not a supported file`);
        toast.success(parts.join(" · "));
      } catch (error) {
        failUpload(uploadId, (error as Error).message);
        toast.error(`Import failed: ${(error as Error).message}`);
      } finally {
        setImporting(false);
      }
    },
    [activeId],
  );

  const assets = React.useMemo(() => {
    // Intelligent search: every whitespace-separated term must match somewhere
    // (AND across terms), searching name, filename, tags, status, board path,
    // and comment text — so "linen approved" or "priya" both narrow correctly.
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const scopeIds =
      activeId && activeId !== FAVORITES
        ? descendantIds(project.collections, activeId)
        : null;
    const pathById = new Map<string, string>();
    for (const collection of project.collections) {
      pathById.set(
        collection.id,
        boardPath(project.collections, collection.id)
          .map((board) => board.name)
          .join(" ")
          .toLowerCase(),
      );
    }
    const filtered = project.assets.filter((asset) => {
      if (activeId === FAVORITES && !isAssetFavorite(asset, project.settings.userId)) return false;
      if (scopeIds && !(asset.collectionId && scopeIds.has(asset.collectionId))) return false;
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (terms.length === 0) return true;
      const haystack = [
        asset.name,
        asset.filename,
        asset.tags.join(" "),
        REVIEW_STATUS_LABELS[asset.status],
        asset.status,
        asset.collectionId ? (pathById.get(asset.collectionId) ?? "") : "",
        asset.comments.map((comment) => comment.text).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return filtered.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  }, [project.assets, project.collections, activeId, query, sort, statusFilter]);

  // Selection only tracks visible assets; prune when filters change.
  const visibleIds = React.useMemo(() => new Set(assets.map((asset) => asset.id)), [assets]);
  const checked = React.useMemo(
    () => [...checkedIds].filter((id) => visibleIds.has(id)),
    [checkedIds, visibleIds],
  );

  const path = boardPath(project.collections, activeId === FAVORITES ? null : activeId);

  return (
    <div className="flex h-full overflow-hidden">
      <BoardsTree activeId={activeId} onSelect={setActiveId} />

      <div
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragOver(false);
        }}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDrop={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragOver(false);
            void runImport(Array.from(event.dataTransfer.files));
          }
        }}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-2.5">
          {/* Mobile board switcher — the boards tree rail is desktop-only */}
          <select
            className="h-8 min-w-0 flex-1 rounded-lg bg-[color:var(--surface-inactive)] px-2 text-xs text-foreground outline-none md:hidden"
            onChange={(event) => setActiveId(event.target.value === "" ? null : event.target.value)}
            value={activeId ?? ""}
          >
            <option value="">All assets</option>
            <option value={FAVORITES}>★ Favorites</option>
            {project.collections.map((board) => (
              <option key={board.id} value={board.id}>
                {boardFullName(project.collections, board.id)}
              </option>
            ))}
          </select>
          <span className="hidden md:inline-flex">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {activeId === null ? (
                  <BreadcrumbPage>All assets</BreadcrumbPage>
                ) : (
                  <button
                    className="transition-colors hover:text-[color:var(--foreground)]"
                    onClick={() => setActiveId(null)}
                    type="button"
                  >
                    All assets
                  </button>
                )}
              </BreadcrumbItem>
              {activeId === FAVORITES ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Favorites</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : null}
              {path.map((board, index) => (
                <React.Fragment key={board.id}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {index === path.length - 1 ? (
                      <BreadcrumbPage>{board.name}</BreadcrumbPage>
                    ) : (
                      <button
                        className="transition-colors hover:text-[color:var(--foreground)]"
                        onClick={() => setActiveId(board.id)}
                        type="button"
                      >
                        {board.name}
                      </button>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Mobile: status + sort collapse into one filter menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label="Filter and sort"
                    className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--surface-inactive)] text-muted-foreground transition-colors hover:text-foreground md:hidden"
                    type="button"
                  >
                    <svg
                      aria-hidden
                      fill="none"
                      height="16"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="16"
                    >
                      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
                    </svg>
                    {statusFilter !== "all" || sort !== "newest" ? (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                    ) : null}
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  {STATUS_FILTER_ITEMS.map((item) => (
                    <DropdownMenuItem
                      key={item.value}
                      onClick={() => setStatusFilter(item.value)}
                    >
                      <span className="w-4 text-[color:var(--accent)]">
                        {statusFilter === item.value ? "✓" : ""}
                      </span>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Sort</DropdownMenuLabel>
                  {SORT_ITEMS.map((item) => (
                    <DropdownMenuItem key={item.value} onClick={() => setSort(item.value)}>
                      <span className="w-4 text-[color:var(--accent)]">
                        {sort === item.value ? "✓" : ""}
                      </span>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Desktop: status + sort inline */}
            <div className="hidden items-center gap-2 md:flex">
              <Select
                items={STATUS_FILTER_ITEMS}
                onValueChange={(next) => setStatusFilter(next as StatusFilter)}
                value={statusFilter}
              >
                <SelectTrigger aria-label="Filter by status" className="h-8 justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {STATUS_FILTER_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                items={SORT_ITEMS}
                onValueChange={(next) => setSort(next as SortOrder)}
                value={sort}
              >
                <SelectTrigger aria-label="Sort" className="h-8 justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {SORT_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <ToggleGroup
              onValueChange={(value: string[]) => {
                const next = value[value.length - 1];
                if (next === "grid" || next === "board") {
                  setView(next);
                }
              }}
              value={[view]}
            >
              <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
              <ToggleGroupItem value="board">Board</ToggleGroupItem>
            </ToggleGroup>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button disabled={importing} size="sm">
                    {importing ? "Importing…" : "+ Add"}
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  File upload
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                  Folder upload
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Boards</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      const parent = activeId && activeId !== FAVORITES ? activeId : null;
                      const name = window.prompt(
                        parent ? "New sub-board name" : "New board name",
                      );
                      if (name?.trim()) {
                        setActiveId(addCollection(name.trim(), parent));
                      }
                    }}
                  >
                    {activeId && activeId !== FAVORITES ? "Add sub-board" : "Add board"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              accept="image/*,video/*"
              className="hidden"
              multiple
              onChange={(event) => {
                void runImport(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <input
              className="hidden"
              multiple
              onChange={(event) => {
                void runImport(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
              ref={folderInputRef}
              type="file"
              // @ts-expect-error non-standard folder-picker attribute
              webkitdirectory=""
            />
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyContent>
                <EmptyTitle>
                  {query ? "Nothing matches" : "This board is empty"}
                </EmptyTitle>
                <EmptyDescription>
                  {query
                    ? "Try fewer or different words — search covers names, tags, status, and notes."
                    : "Drag photos in or import to get started. Files are renamed to your convention and filed here."}
                </EmptyDescription>
                {query ? (
                  <Button
                    className="mt-3"
                    onClick={() => setQuery("")}
                    size="sm"
                    variant="outline"
                  >
                    Clear search
                  </Button>
                ) : (
                  <Button
                    className="mt-3"
                    disabled={importing}
                    onClick={() => fileInputRef.current?.click()}
                    size="sm"
                  >
                    {importing ? "Importing…" : "Import photos"}
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          </div>
        ) : view === "grid" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
              {assets.map((asset) => (
                <AssetCard
                  asset={asset}
                  boards={project.collections}
                  checked={checkedIds.has(asset.id)}
                  favorited={isAssetFavorite(asset, project.settings.userId)}
                  key={asset.id}
                  onEditInStudio={editInStudio}
                  onOpen={setOpenAssetId}
                  onToggleCheck={toggleCheck}
                  onUseInStudio={useInStudio}
                  selectionActive={checked.length > 0}
                  viewerOpen={openAssetId === asset.id}
                />
              ))}
            </div>
          </div>
        ) : (
          <KanbanBoard assets={assets} onOpen={setOpenAssetId} />
        )}

        {/* Bottom status bar (Air-style item count) */}
        <div className="flex shrink-0 items-center border-t border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] px-4 py-1.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          {assets.length} item{assets.length === 1 ? "" : "s"}
          {checked.length > 0 ? ` · ${checked.length} selected` : ""}
        </div>

        {checked.length > 0 ? (
          <BulkBar
            boards={project.collections}
            onClear={() => setCheckedIds(new Set())}
            onSelectAll={() => setCheckedIds(new Set(assets.map((asset) => asset.id)))}
            onUseInStudio={useInStudio}
            selected={checked}
            total={assets.length}
          />
        ) : null}

        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)] backdrop-blur-[1px]">
            <span className="rounded-lg border border-[color:var(--accent)] bg-[color:var(--card)] px-4 py-2 text-sm">
              Drop to import
            </span>
          </div>
        ) : null}
      </div>

      {openAssetId ? (
        <AssetDetail
          assetId={openAssetId}
          assetIds={assets.map((asset) => asset.id)}
          onClose={() => setOpenAssetId(null)}
          onEditInStudio={editInStudio}
          onNavigate={setOpenAssetId}
          onUseInStudio={useInStudio}
        />
      ) : null}
    </div>
  );
}
