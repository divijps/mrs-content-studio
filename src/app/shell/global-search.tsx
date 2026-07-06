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
          asset.status.includes(needle),
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

  return (
    <div className="relative w-64" ref={rootRef}>
      <input
        className="h-7 w-full rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)] px-2.5 text-[12px] outline-none placeholder:text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)] focus:border-[color:var(--accent)]"
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
      {open && query.trim().length > 0 ? (
        <div className="absolute right-0 top-9 z-50 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-border bg-[color:var(--popover)] py-1.5 shadow-2xl">
          {groups.length === 0 ? (
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
                    <span className="text-2xs text-muted-foreground">
                      {group.total}
                    </span>
                  ) : null}
                </div>
                {group.hits.map((hit) => (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                    key={hit.id}
                    onClick={hit.onOpen}
                    type="button"
                  >
                    {hit.status ? <StatusDot size={7} status={hit.status} /> : null}
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
          )}
        </div>
      ) : null}
    </div>
  );
}
