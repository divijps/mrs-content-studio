import * as React from "react";
import { createPortal } from "react-dom";
import { FolderIcon, PlayIcon } from "@phosphor-icons/react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import { useProject } from "../data/project-store";
import type { Asset, Collection } from "../data/types";

/** Thumbnails mounted per "Show more" click — bounds decode memory. */
const PAGE_SIZE = 24;
/** Collage cell ceiling: keeps grids composed and export weight sane. */
const MAX_COLLAGE_PHOTOS = 6;

/**
 * Library-fed photo picker.
 *
 * Custom control (documented builtInFitCheck): the built-in imagePicker takes a
 * static `items` list resolved when the schema module loads, but the Library is
 * a living collection — imports, board filing, and Supabase sync must appear
 * here instantly. It also must NOT render the whole library inline: the panel
 * shows only the current selection, and browsing happens in a dialog that
 * searches and pages thumbnails so large libraries never decode all at once.
 */
export const LibraryImageControl: ToolcraftCustomControlRenderer = ({
  setValue,
  value,
}) => {
  const project = useProject();
  // Which media kind is being browsed; null = closed. A still comp uses a
  // photo; a video designs over its poster frame and exports a branded video.
  const [browsing, setBrowsing] = React.useState<"photo" | "video" | null>(null);
  const photos = project.assets.filter((asset) => asset.kind !== "video");
  const videos = project.assets.filter((asset) => asset.kind === "video");
  const selected =
    typeof value === "string"
      ? (project.assets.find((asset) => asset.id === value) ?? null)
      : null;

  if (project.assets.length === 0) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        No media yet — import photos or videos in the Library.
      </p>
    );
  }

  const isVideo = selected?.kind === "video";

  // The set the ‹ › arrows cycle through: media of the same kind in the
  // selected asset's folder (or all of that kind when it's unfiled), so a quick
  // swap stays within the same shoot.
  const kindPool = isVideo ? videos : photos;
  const folderPool =
    selected && selected.collectionId
      ? kindPool.filter((asset) => asset.collectionId === selected.collectionId)
      : [];
  const pool = folderPool.length > 1 ? folderPool : kindPool;
  const poolIndex = selected ? pool.findIndex((asset) => asset.id === selected.id) : -1;
  const step = (delta: number): void => {
    if (poolIndex < 0 || pool.length < 2) return;
    const next = pool[(poolIndex + delta + pool.length) % pool.length];
    if (next) setValue(next.id);
  };
  const edgeArrow =
    "absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--popover)_80%,transparent)] text-sm text-[color:color-mix(in_oklab,var(--foreground)_85%,transparent)] backdrop-blur transition-transform hover:text-[color:var(--foreground)] active:scale-90";

  return (
    <div className="flex flex-col gap-2">
      {selected ? (
        // Simple preview: just the media, with prev/next arrows to swap in place
        // and a tap to open the full picker. No title, dimensions, or Change row.
        <div className="relative overflow-hidden rounded-lg border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)]">
          <button
            aria-label="Browse media"
            className="block w-full"
            onClick={() => setBrowsing(isVideo ? "video" : "photo")}
            title="Browse media"
            type="button"
          >
            <img
              alt=""
              className="h-28 w-full object-cover"
              decoding="async"
              src={selected.thumbUrl}
              style={{
                objectPosition: `${selected.focalPoint.x * 100}% ${selected.focalPoint.y * 100}%`,
              }}
            />
            {isVideo ? (
              <span className="absolute bottom-1 left-1 flex h-4 items-center gap-0.5 rounded-sm bg-black/65 px-1 text-[9px] font-medium text-white">
                <PlayIcon size={9} weight="fill" /> video
              </span>
            ) : null}
          </button>
          {pool.length > 1 ? (
            <>
              <button
                aria-label="Previous media"
                className={`${edgeArrow} left-1.5`}
                onClick={() => step(-1)}
                type="button"
              >
                ‹
              </button>
              <button
                aria-label="Next media"
                className={`${edgeArrow} right-1.5`}
                onClick={() => step(1)}
                type="button"
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <button
          className="flex-1 rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] px-2 py-2 text-xs-plus text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          onClick={() => setBrowsing("photo")}
          type="button"
        >
          Add photo
        </button>
        <button
          className="flex-1 rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] px-2 py-2 text-xs-plus text-muted-foreground transition-colors hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          disabled={videos.length === 0}
          onClick={() => setBrowsing("video")}
          title={videos.length === 0 ? "No videos in the Library yet" : undefined}
          type="button"
        >
          Add video
        </button>
      </div>
      {browsing ? (
        <LibraryBrowseDialog
          assets={browsing === "video" ? videos : photos}
          kind={browsing}
          onClose={() => setBrowsing(null)}
          onPick={(id) => {
            setValue(id);
            setBrowsing(null);
          }}
          selectedIds={selected ? [selected.id] : []}
          startCollectionId={selected?.collectionId ?? null}
        />
      ) : null}
    </div>
  );
};

/**
 * Multi-photo picker for the Collage pattern. Same dialog, toggle-select mode:
 * selection order is cell order, capped so grids stay composed.
 */
export const LibraryImagesControl: ToolcraftCustomControlRenderer = ({
  setValue,
  value,
}) => {
  const project = useProject();
  const [browsing, setBrowsing] = React.useState(false);
  const images = project.assets.filter((asset) => asset.kind !== "video");
  const ids = Array.isArray(value)
    ? (value as string[]).filter((id) => typeof id === "string")
    : [];
  const chosen = ids
    .map((id) => images.find((asset) => asset.id === id))
    .filter((asset): asset is Asset => Boolean(asset));

  if (images.length === 0) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        No photos yet — import some in the Library.
      </p>
    );
  }

  const toggle = (id: string): void => {
    if (ids.includes(id)) {
      setValue(ids.filter((entry) => entry !== id));
    } else if (ids.length < MAX_COLLAGE_PHOTOS) {
      setValue([...ids, id]);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {chosen.length > 0 ? (
        <div className="grid grid-cols-6 gap-1">
          {chosen.map((asset, index) => (
            <button
              aria-label={`Remove ${asset.name}`}
              className="group relative aspect-square overflow-hidden rounded border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)]"
              key={asset.id}
              onClick={() => toggle(asset.id)}
              title={`${asset.name} — click to remove`}
              type="button"
            >
              <img
                alt=""
                className="h-full w-full object-cover transition-opacity group-hover:opacity-40"
                decoding="async"
                loading="lazy"
                src={asset.thumbUrl}
              />
              <span className="absolute left-0.5 top-0.5 rounded-sm bg-black/60 px-1 text-[9px] leading-3 text-white">
                {index + 1}
              </span>
              <span className="absolute inset-0 hidden items-center justify-center text-xs text-foreground group-hover:flex">
                ✕
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        className="rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] px-2 py-2 text-xs-plus text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
        onClick={() => setBrowsing(true)}
        type="button"
      >
        {chosen.length > 0
          ? `Edit photos (${chosen.length}/${MAX_COLLAGE_PHOTOS})…`
          : "Choose photos…"}
      </button>
      {browsing ? (
        <LibraryBrowseDialog
          assets={images}
          maxSelected={MAX_COLLAGE_PHOTOS}
          onClose={() => setBrowsing(false)}
          onPick={toggle}
          selectedIds={ids}
        />
      ) : null}
    </div>
  );
};

function LibraryBrowseDialog(props: {
  assets: Asset[];
  /** What the list contains — titles and empty states adapt. */
  kind?: "photo" | "video";
  /** When set, the dialog is a toggle-select (multi) picker and stays open. */
  maxSelected?: number;
  onClose: () => void;
  onPick: (id: string) => void;
  selectedIds: string[];
  /** Folder the picker opens into (the current media's board); else latest. */
  startCollectionId?: string | null;
}): React.JSX.Element {
  const multi = typeof props.maxSelected === "number";
  const noun = props.kind === "video" ? "video" : "photo";
  const project = useProject();
  const [query, setQuery] = React.useState("");
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [folderFilter, setFolderFilter] = React.useState<string | null>(
    props.startCollectionId ?? null,
  );
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const collectionsById = React.useMemo(
    () => new Map<string, Collection>(project.collections.map((c) => [c.id, c])),
    [project.collections],
  );
  // Full board path for an asset — powers folder search and the folder chip.
  const folderPath = React.useCallback(
    (collectionId: string | null): string => {
      const names: string[] = [];
      let cursor = collectionId;
      while (cursor) {
        const collection = collectionsById.get(cursor);
        if (!collection) break;
        names.unshift(collection.name);
        cursor = collection.parentId;
      }
      return names.join(" / ");
    },
    [collectionsById],
  );
  // True when an asset sits in `folderId` or any board nested under it.
  const inFolder = React.useCallback(
    (assetCollectionId: string | null, folderId: string): boolean => {
      let cursor = assetCollectionId;
      while (cursor) {
        if (cursor === folderId) return true;
        cursor = collectionsById.get(cursor)?.parentId ?? null;
      }
      return false;
    },
    [collectionsById],
  );
  // Top-level board an id lives under — splits the filter into board / sub-board.
  const rootOf = React.useCallback(
    (id: string | null): string | null => {
      let cursor = id;
      let root: string | null = null;
      while (cursor) {
        const collection = collectionsById.get(cursor);
        if (!collection) break;
        root = cursor;
        cursor = collection.parentId;
      }
      return root;
    },
    [collectionsById],
  );

  const ALL_BOARDS = "__all__";
  const boardId = rootOf(folderFilter);
  const subId = folderFilter && folderFilter !== boardId ? folderFilter : null;
  const topBoards = project.collections.filter((collection) => !collection.parentId);
  const subBoards = boardId
    ? project.collections.filter((collection) => collection.parentId === boardId)
    : [];

  // Most-used tags across the library, as one-click filter chips.
  const allTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of props.assets) {
      for (const tag of asset.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [props.assets]);

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Latest-first, so an empty search reads as "most recent".
    const ordered = [...props.assets].sort((first, second) =>
      second.createdAt.localeCompare(first.createdAt),
    );
    return ordered.filter((asset) => {
      if (activeTag && !asset.tags.includes(activeTag)) {
        return false;
      }
      if (needle) {
        // Search spans name, file, tags, and the asset's folder path.
        return (
          asset.name.toLowerCase().includes(needle) ||
          asset.filename.toLowerCase().includes(needle) ||
          asset.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          folderPath(asset.collectionId).toLowerCase().includes(needle)
        );
      }
      // No search: open into the current media's folder, else show everything.
      if (folderFilter) {
        return inFolder(asset.collectionId, folderFilter);
      }
      return true;
    });
  }, [props.assets, query, activeTag, folderFilter, folderPath, inFolder]);

  const visible = matches.slice(0, limit);
  const remaining = matches.length - visible.length;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Portal: the control lives inside the panel, whose transformed ancestors
  // would otherwise trap `position: fixed` and clip the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-[color:var(--popover)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="shrink-0 text-sm font-medium">
            {multi ? `Choose ${noun}s` : `Choose a ${noun}`}
          </span>
          <input
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs-plus outline-none focus:border-accent"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search name, file, or tag…"
            value={query}
          />
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={props.onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        {!query.trim() ? (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <FolderIcon className="shrink-0 text-muted-foreground" size={13} />
            <Select
              items={[
                { label: "All boards", value: ALL_BOARDS },
                ...topBoards.map((board) => ({ label: board.name, value: board.id })),
              ]}
              onValueChange={(next) => setFolderFilter(next === ALL_BOARDS ? null : next)}
              value={boardId ?? ALL_BOARDS}
            >
              <SelectTrigger className="h-8 min-w-0 flex-1 rounded-md border-0 bg-[color:var(--surface-inactive)] px-2.5 text-xs-plus text-foreground outline-none transition-colors hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]">
                <SelectValue>
                  {() => {
                    const board = topBoards.find((entry) => entry.id === boardId);
                    return board ? board.name : "All boards";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  <SelectItem value={ALL_BOARDS}>All boards</SelectItem>
                  {topBoards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {boardId && subBoards.length > 0 ? (
              <Select
                items={[
                  { label: "All", value: ALL_BOARDS },
                  ...subBoards.map((board) => ({ label: board.name, value: board.id })),
                ]}
                onValueChange={(next) => setFolderFilter(next === ALL_BOARDS ? boardId : next)}
                value={subId ?? ALL_BOARDS}
              >
                <SelectTrigger className="h-8 min-w-0 flex-1 rounded-md border-0 bg-[color:var(--surface-inactive)] px-2.5 text-xs-plus text-foreground outline-none transition-colors hover:bg-[color:var(--surface-active)] focus:bg-[color:var(--surface-active)]">
                  <SelectValue>
                    {() => {
                      const board = subBoards.find((entry) => entry.id === subId);
                      return board ? board.name : "All";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectItem value={ALL_BOARDS}>All</SelectItem>
                    {subBoards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ) : null}

        {allTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
            {allTags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  className={`rounded-full px-2.5 py-0.5 text-2xs transition-colors ${
                    active
                      ? "bg-[color:var(--accent)] text-black"
                      : "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] text-muted-foreground hover:text-foreground"
                  }`}
                  key={tag}
                  onClick={() => {
                    setActiveTag(active ? null : tag);
                    setLimit(PAGE_SIZE);
                  }}
                  type="button"
                >
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="overflow-y-auto p-3">
          {visible.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs-plus text-muted-foreground">
              {props.assets.length === 0
                ? `No ${noun}s in the Library yet — import some first.`
                : activeTag
                  ? `No ${noun}s tagged “${activeTag}”.`
                  : query.trim()
                    ? `Nothing matches “${query}”.`
                    : folderFilter
                      ? "This folder has no matching media."
                      : `No ${noun}s yet.`}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {visible.map((asset) => {
                const orderIndex = props.selectedIds.indexOf(asset.id);
                const active = orderIndex >= 0;
                return (
                  <button
                    aria-label={asset.name}
                    aria-pressed={active}
                    className={`relative aspect-square overflow-hidden rounded-md border transition-colors ${
                      active
                        ? "border-[color:var(--accent)] ring-1 ring-[color:color-mix(in_oklab,var(--accent)_45%,transparent)]"
                        : "border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)]"
                    }`}
                    key={asset.id}
                    onClick={() => props.onPick(asset.id)}
                    title={asset.name}
                    type="button"
                  >
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      decoding="async"
                      loading="lazy"
                      src={asset.thumbUrl}
                      style={{
                        objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%`,
                      }}
                    />
                    {multi && active ? (
                      <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[10px] font-semibold text-black">
                        {orderIndex + 1}
                      </span>
                    ) : null}
                    {asset.kind === "video" ? (
                      <span className="absolute bottom-1 left-1 flex h-4 items-center gap-0.5 rounded-sm bg-black/65 px-1 text-[9px] font-medium text-white">
                        <PlayIcon size={9} weight="fill" />
                        {asset.durationSec ? `${Math.round(asset.durationSec)}s` : ""}
                      </span>
                    ) : null}
                    {asset.status === "approve" ? (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#4caf7d]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {remaining > 0 ? (
            <button
              className="mt-2 w-full rounded-md border border-border py-1.5 text-xs-plus text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
              type="button"
            >
              Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
            </button>
          ) : null}
        </div>

        {multi ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <span className="text-2xs text-muted-foreground">
              {props.selectedIds.length}/{props.maxSelected} selected — order is cell
              order
            </span>
            <button
              className="rounded-md bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] px-3 py-1 text-xs-plus transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_18%,transparent)]"
              onClick={props.onClose}
              type="button"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
