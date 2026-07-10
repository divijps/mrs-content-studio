import * as React from "react";
import { createPortal } from "react-dom";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

import { useProject } from "../data/project-store";
import type { Asset } from "../data/types";
import { StatusDot } from "../library/status-dot";

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
  const [browsing, setBrowsing] = React.useState(false);
  // Photos and videos both allowed: a still comp uses the image, a video comp
  // designs over the poster frame and exports a branded video.
  const images = project.assets;
  const selected =
    typeof value === "string"
      ? (images.find((asset) => asset.id === value) ?? null)
      : null;

  if (images.length === 0) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        No photos yet — import some in the Library.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {selected ? (
        <button
          className="group flex items-center gap-2.5 rounded-md border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] p-1.5 text-left transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)]"
          onClick={() => setBrowsing(true)}
          title="Change photo"
          type="button"
        >
          <span className="relative h-12 w-12 shrink-0">
            <img
              alt=""
              className="h-12 w-12 rounded object-cover"
              decoding="async"
              src={selected.thumbUrl}
              style={{
                objectPosition: `${selected.focalPoint.x * 100}% ${selected.focalPoint.y * 100}%`,
              }}
            />
            {selected.kind === "video" ? (
              <span className="absolute bottom-0.5 left-0.5 flex h-4 items-center rounded-sm bg-black/65 px-1 text-[9px] font-medium text-white">
                ▶ video
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <StatusDot size={6} status={selected.status} />
              <span className="truncate text-xs-plus">{selected.name}</span>
            </span>
            <span className="text-2xs text-muted-foreground">
              {selected.width}×{selected.height}
            </span>
          </span>
          <span className="pr-1 text-2xs text-muted-foreground group-hover:text-foreground">
            Change
          </span>
        </button>
      ) : (
        <button
          className="rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] px-2 py-3 text-xs-plus text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          onClick={() => setBrowsing(true)}
          type="button"
        >
          Choose from Library…
        </button>
      )}
      {browsing ? (
        <LibraryBrowseDialog
          assets={images}
          onClose={() => setBrowsing(false)}
          onPick={(id) => {
            setValue(id);
            setBrowsing(false);
          }}
          selectedIds={selected ? [selected.id] : []}
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
  /** When set, the dialog is a toggle-select (multi) picker and stays open. */
  maxSelected?: number;
  onClose: () => void;
  onPick: (id: string) => void;
  selectedIds: string[];
}): React.JSX.Element {
  const multi = typeof props.maxSelected === "number";
  const [query, setQuery] = React.useState("");
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE_SIZE);

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
    return props.assets.filter((asset) => {
      if (activeTag && !asset.tags.includes(activeTag)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        asset.name.toLowerCase().includes(needle) ||
        asset.filename.toLowerCase().includes(needle) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [props.assets, query, activeTag]);

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
            {multi ? "Choose photos" : "Choose a photo"}
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
              {activeTag ? `No photos tagged “${activeTag}”.` : `Nothing matches “${query}”.`}
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
                    {asset.status === "approved" ? (
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
