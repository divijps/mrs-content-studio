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
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from "@/toolcraft/ui";
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
  deleteAssets,
  getProjectSnapshot,
  LIBRARY_ASSET_EVENT,
  requestStudioImage,
  toggleAssetFavorite,
  useProject,
} from "../data/project-store";
import { importFiles } from "../data/import-assets";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  type Asset,
  type Collection,
  type ReviewStatus,
} from "../data/types";

type SortOrder = "newest" | "oldest" | "name";
type StatusFilter = "all" | ReviewStatus;

function formatTotalSize(assets: Asset[]): string | null {
  const total = assets.reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0);
  if (total === 0) return null;
  return total < 1024 * 1024
    ? `${Math.round(total / 1024)} KB`
    : `${(total / (1024 * 1024)).toFixed(1)} MB`;
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
              className="block w-full object-cover"
              decoding="async"
              loading="lazy"
              src={asset.thumbUrl}
              style={{ aspectRatio: String(ratio) }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

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
              aria-label={asset.favorite ? "Unfavorite" : "Favorite"}
              className="absolute right-2 top-2 text-sm text-white drop-shadow"
              onClick={(event) => {
                event.stopPropagation();
                toggleAssetFavorite(asset.id);
              }}
              type="button"
            >
              {asset.favorite ? "★" : "☆"}
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
            {asset.favorite ? "Remove favorite" : "Favorite"}
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

  // A notification (account menu) may ask for a specific asset's viewer —
  // honor it on mount (cross-route) and via event (already on this screen).
  React.useEffect(() => {
    const openPending = (): void => {
      const pending = consumeLibraryAsset();
      if (pending) {
        setOpenAssetId(pending);
      }
    };
    openPending();
    window.addEventListener(LIBRARY_ASSET_EVENT, openPending);
    return () => window.removeEventListener(LIBRARY_ASSET_EVENT, openPending);
  }, []);

  const useInStudio = React.useCallback(
    (assetId: string) => {
      requestStudioImage(assetId);
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
      const progressToast = files.length > 4 ? toast.loading(`Importing 0/${files.length}…`) : null;
      try {
        const snapshot = getProjectSnapshot();
        const boardId = activeId && activeId !== FAVORITES ? activeId : null;
        const board = boardId
          ? snapshot.collections.find((entry) => entry.id === boardId)
          : null;
        const result = await importFiles({
          collectionId: boardId,
          collectionName: board?.name ?? "import",
          existing: snapshot.assets,
          files,
          onProgress: (processed, total) => {
            if (progressToast) {
              toast.loading(`Importing ${processed}/${total}…`, { id: progressToast });
            }
          },
        });
        if (snapshot.source === "cloud" && result.assets.length > 0) {
          // Team workspace: push originals + web derivatives to storage so the
          // whole team sees them; assets land with storage-backed URLs.
          const { uploadAssets } = await import("../data/backend/supabase-backend");
          const uploaded = await uploadAssets(result.assets, result.sources, (done, total) => {
            if (progressToast) {
              toast.loading(`Uploading ${done}/${total}…`, { id: progressToast });
            }
          });
          addAssets(uploaded);
        } else {
          addAssets(result.assets);
        }
        const parts = [`${result.assets.length} imported`];
        if (result.duplicates) parts.push(`${result.duplicates} duplicate skipped`);
        if (result.skipped) parts.push(`${result.skipped} not an image`);
        if (progressToast) {
          toast.success(parts.join(" · "), { id: progressToast });
        } else {
          toast.success(parts.join(" · "));
        }
      } finally {
        setImporting(false);
      }
    },
    [activeId],
  );

  const assets = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const scopeIds =
      activeId && activeId !== FAVORITES
        ? descendantIds(project.collections, activeId)
        : null;
    const filtered = project.assets.filter((asset) => {
      if (activeId === FAVORITES && !asset.favorite) return false;
      if (scopeIds && !(asset.collectionId && scopeIds.has(asset.collectionId))) return false;
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return (
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.tags.some((tag) => tag.includes(normalizedQuery)) ||
        asset.filename.toLowerCase().includes(normalizedQuery)
      );
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

          <div className="ml-auto flex items-center gap-2">
            <Input
              className="w-44"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets…"
              value={query}
            />
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
              accept="image/*"
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

        {/* Board header: title, counts, filter, sort — Air-style separated bar */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] px-4 py-2">
          <h1 className="text-sm font-medium leading-none">
            {activeId === FAVORITES
              ? "Favorites"
              : (path[path.length - 1]?.name ?? "All assets")}
          </h1>
          <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
            {assets.length} asset{assets.length === 1 ? "" : "s"}
            {formatTotalSize(assets) ? ` · ${formatTotalSize(assets)}` : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <select
              aria-label="Filter by status"
              className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-transparent px-2 py-1 text-2xs outline-none focus:border-[color:var(--accent)]"
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              {REVIEW_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {REVIEW_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort"
              className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-transparent px-2 py-1 text-2xs outline-none focus:border-[color:var(--accent)]"
              onChange={(event) => setSort(event.target.value as SortOrder)}
              value={sort}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name</option>
            </select>
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
                    ? "Try a different search."
                    : "Drag photos in or press + Add. Files are renamed to your convention and filed here."}
                </EmptyDescription>
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
                  key={asset.id}
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
          onNavigate={setOpenAssetId}
          onUseInStudio={useInStudio}
        />
      ) : null}
    </div>
  );
}
