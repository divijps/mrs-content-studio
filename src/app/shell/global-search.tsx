import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  requestLibraryAsset,
  requestLibraryBoard,
  setActiveArtboard,
  useProject,
} from "../data/project-store";
import { type Collection, TASK_STATUS_LABELS } from "../data/types";
import { StatusDot } from "../library/status-dot";

interface Hit {
  id: string;
  meta: string;
  onOpen: () => void;
  status?: import("../data/types").ReviewStatus;
  /** Preview thumbnail (assets) — otherwise the status dot leads the row. */
  thumbUrl?: string;
  title: string;
}

interface Group {
  hits: Hit[];
  label: string;
  total: number;
}

const PER_GROUP = 5;

function boardPathName(collections: Collection[], id: string | null): string {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const names: string[] = [];
  let cursor = id;
  while (cursor) {
    const board = byId.get(cursor);
    if (!board) break;
    names.unshift(board.name);
    cursor = board.parentId;
  }
  return names.join(" / ");
}

/**
 * App-wide search in the top bar. Types are matched live and results are
 * grouped by category (Assets, Artboards, Boards, Tasks) so the user sees the
 * shape of what matched as they type; picking a result jumps to it.
 */
export function GlobalSearch(): React.JSX.Element {
  const project = useProject();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const groups = React.useMemo<Group[]>(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 1) {
      return [];
    }
    const go = (fn: () => void): (() => void) => () => {
      fn();
      setOpen(false);
      setQuery("");
    };

    const assetHits = project.assets
      .filter(
        (asset) =>
          asset.name.toLowerCase().includes(needle) ||
          asset.filename.toLowerCase().includes(needle) ||
          asset.tags.some((tag) => tag.includes(needle)) ||
          asset.status.includes(needle) ||
          boardPathName(project.collections, asset.collectionId)
            .toLowerCase()
            .includes(needle),
      )
      .map(
        (asset): Hit => ({
          id: asset.id,
          meta: `${asset.kind === "video" ? "Video" : "Photo"}${asset.tags.length ? ` · ${asset.tags.join(", ")}` : ""}`,
          onOpen: go(() => {
            requestLibraryAsset(asset.id);
            void navigate({ to: "/library" });
          }),
          status: asset.status,
          thumbUrl: asset.thumbUrl,
          title: asset.name,
        }),
      );

    const compHits = project.comps
      .filter((comp) => comp.name.toLowerCase().includes(needle))
      .map(
        (comp): Hit => ({
          id: comp.id,
          meta: "Artboard",
          onOpen: go(() => {
            setActiveArtboard(comp.id);
            void navigate({ to: "/" });
          }),
          status: comp.status,
          title: comp.name,
        }),
      );

    const boardHits = project.collections
      .filter((board) => board.name.toLowerCase().includes(needle))
      .map(
        (board): Hit => ({
          id: board.id,
          meta: "Board",
          onOpen: go(() => {
            requestLibraryBoard(board.id);
            void navigate({ to: "/library" });
          }),
          title: boardPathName(project.collections, board.id),
        }),
      );

    const taskHits = project.tasks
      .filter(
        (task) =>
          task.title.toLowerCase().includes(needle) ||
          task.tags.some((tag) => tag.includes(needle)) ||
          (task.assignee?.toLowerCase().includes(needle) ?? false),
      )
      .map(
        (task): Hit => ({
          id: task.id,
          meta: `${TASK_STATUS_LABELS[task.status]}${task.tags.length ? ` · ${task.tags.join(", ")}` : ""}`,
          onOpen: go(() => {
            void navigate({ to: "/tasks" });
          }),
          title: task.title,
        }),
      );

    const journalHits = project.journal
      .filter(
        (entry) =>
          entry.title.toLowerCase().includes(needle) ||
          entry.body.toLowerCase().includes(needle),
      )
      .map(
        (entry): Hit => ({
          id: entry.id,
          meta: entry.kind === "copy" ? "Copy" : "Journal",
          onOpen: go(() => {
            void navigate({ to: "/copy" });
          }),
          title: entry.title,
        }),
      );

    return [
      { hits: assetHits.slice(0, PER_GROUP), label: "Assets", total: assetHits.length },
      { hits: compHits.slice(0, PER_GROUP), label: "Artboards", total: compHits.length },
      { hits: boardHits.slice(0, PER_GROUP), label: "Boards", total: boardHits.length },
      { hits: taskHits.slice(0, PER_GROUP), label: "Tasks", total: taskHits.length },
      {
        hits: journalHits.slice(0, PER_GROUP),
        label: "Copy & journal",
        total: journalHits.length,
      },
    ].filter((group) => group.total > 0);
  }, [
    project.assets,
    project.comps,
    project.collections,
    project.tasks,
    project.journal,
    query,
    navigate,
  ]);

  const firstHit = groups[0]?.hits[0];

  // Empty-focus browse rails: most-used tags + the latest media.
  const recentTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of project.assets) {
      for (const tag of asset.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [project.assets]);

  const latestAssets = React.useMemo(
    () =>
      [...project.assets]
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .slice(0, 8),
    [project.assets],
  );

  return (
    <div className="relative w-36 sm:w-64" ref={rootRef}>
      <input
        className="h-8 w-full rounded-lg bg-[color:var(--surface-inactive)] px-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:bg-[color:var(--surface-active)]"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && firstHit) firstHit.onOpen();
        }}
        placeholder="Search everything…"
        value={query}
      />
      {open ? (
        <div className="absolute right-0 top-9 z-50 max-h-[70vh] w-[min(22rem,92vw)] overflow-y-auto rounded-lg border border-border bg-[color:var(--popover)] py-1.5 shadow-2xl">
          {query.trim().length > 0 ? (
            groups.length === 0 ? (
              <p className="px-3 py-2 text-2xs text-muted-foreground">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              groups.map((group) => (
                <div className="pb-1" key={group.label}>
                  <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                    <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                      {group.label}
                    </span>
                    {group.total > group.hits.length ? (
                      <span className="text-2xs text-muted-foreground">{group.total}</span>
                    ) : null}
                  </div>
                  {group.hits.map((hit) => (
                    <button
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                      key={hit.id}
                      onClick={hit.onOpen}
                      type="button"
                    >
                      {hit.thumbUrl ? (
                        <img
                          alt=""
                          className="h-8 w-8 shrink-0 rounded object-cover"
                          decoding="async"
                          loading="lazy"
                          src={hit.thumbUrl}
                        />
                      ) : hit.status ? (
                        <StatusDot size={7} status={hit.status} />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs-plus">{hit.title}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {hit.meta}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )
          ) : (
            // Empty focus: browse by recent tag or jump into the latest media.
            <div className="flex flex-col gap-2.5 px-2 py-1">
              {recentTags.length > 0 ? (
                <div>
                  <span className="mb-1.5 block text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                    Recent tags
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {recentTags.map((tag) => (
                      <button
                        className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] px-2.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
                        key={tag}
                        onClick={() => setQuery(tag)}
                        type="button"
                      >
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {latestAssets.length > 0 ? (
                <div>
                  <span className="mb-1.5 block text-2xs uppercase tracking-[0.14em] text-muted-foreground">
                    Latest
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {latestAssets.map((asset) => (
                      <button
                        aria-label={asset.name}
                        className="relative aspect-square overflow-hidden rounded-md border border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)]"
                        key={asset.id}
                        onClick={() => {
                          requestLibraryAsset(asset.id);
                          void navigate({ to: "/library" });
                          setOpen(false);
                        }}
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
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="px-1 py-2 text-2xs text-muted-foreground">
                  Type to search assets, boards, artboards, tasks, and copy.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
