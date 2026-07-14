import * as React from "react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Separator,
} from "@/toolcraft/ui";

import {
  addCollection,
  deleteCollection,
  renameCollection,
  setAssetCollection,
  useProject,
} from "../data/project-store";
import type { Collection } from "../data/types";
import { copyLibraryShareLink } from "./share-link";

export interface BoardNode extends Collection {
  children: BoardNode[];
  count: number;
}

/** Build the nested board tree with per-board asset counts (incl. descendants). */
export function buildBoardTree(
  collections: Collection[],
  counts: Map<string | null, number>,
): { nodes: BoardNode[]; totalByBoard: Map<string, number> } {
  const byParent = new Map<string | null, Collection[]>();
  for (const collection of collections) {
    const list = byParent.get(collection.parentId) ?? [];
    list.push(collection);
    byParent.set(collection.parentId, list);
  }
  const totalByBoard = new Map<string, number>();

  const build = (parentId: string | null): BoardNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((collection) => {
        const children = build(collection.id);
        const own = counts.get(collection.id) ?? 0;
        const total = own + children.reduce((sum, child) => sum + child.count, 0);
        totalByBoard.set(collection.id, total);
        return { ...collection, children, count: total };
      });

  return { nodes: build(null), totalByBoard };
}

function BoardRow(props: {
  activeId: string | null;
  depth: number;
  node: BoardNode;
  onSelect: (id: string | null) => void;
}): React.JSX.Element {
  const { node } = props;
  // Boards start closed — an all-expanded tree buries the top level.
  const [expanded, setExpanded] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 ${
          props.activeId === node.id
            ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
            : dragOver
              ? "bg-[color:color-mix(in_oklab,var(--accent)_16%,transparent)]"
              : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"
        }`}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/x-asset-id")) {
            event.preventDefault();
            setDragOver(true);
          }
        }}
        onDrop={(event) => {
          const assetId = event.dataTransfer.getData("application/x-asset-id");
          if (assetId) {
            event.preventDefault();
            setAssetCollection(assetId, node.id);
          }
          setDragOver(false);
        }}
        style={{ paddingLeft: props.depth * 12 }}
      >
        <button
          aria-label={expanded ? "Collapse" : "Expand"}
          className={`flex h-5 w-4 items-center justify-center text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] ${hasChildren ? "" : "invisible"}`}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center py-1 text-left text-xs-plus"
          onClick={() => props.onSelect(node.id)}
          type="button"
        >
          <span className="truncate">{node.name}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                aria-label={`${node.name} board actions`}
                className="row-action flex h-5 w-4 shrink-0 items-center justify-center rounded text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:text-[color:var(--foreground)]"
                onClick={(event) => event.stopPropagation()}
                type="button"
              >
                ⋯
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => copyLibraryShareLink("board", node.id)}>
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const next = window.prompt(`Rename “${node.name}”`, node.name);
                if (next && next.trim() && next.trim() !== node.name) {
                  renameCollection(node.id, next.trim());
                }
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${node.name}”? Its photos become unfiled and any sub-boards move up a level. Photos are not deleted.`,
                  )
                ) {
                  if (props.activeId === node.id) {
                    props.onSelect(null);
                  }
                  deleteCollection(node.id);
                }
              }}
            >
              Delete board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          aria-label={`Add a sub-board to ${node.name}`}
          className="row-action flex h-5 w-4 shrink-0 items-center justify-center rounded text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:text-[color:var(--foreground)]"
          onClick={(event) => {
            event.stopPropagation();
            const name = window.prompt(`New sub-board in “${node.name}”`);
            if (name?.trim()) {
              setExpanded(true);
              props.onSelect(addCollection(name.trim(), node.id));
            }
          }}
          title="Add a sub-board"
          type="button"
        >
          +
        </button>
      </div>
      {expanded
        ? node.children.map((child) => (
            <BoardRow
              activeId={props.activeId}
              depth={props.depth + 1}
              key={child.id}
              node={child}
              onSelect={props.onSelect}
            />
          ))
        : null}
    </>
  );
}

export function BoardsTree(props: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}): React.JSX.Element {
  const project = useProject();

  const counts = React.useMemo(() => {
    const map = new Map<string | null, number>();
    for (const asset of project.assets) {
      map.set(asset.collectionId, (map.get(asset.collectionId) ?? 0) + 1);
    }
    return map;
  }, [project.assets]);

  const { nodes } = React.useMemo(
    () => buildBoardTree(project.collections, counts),
    [project.collections, counts],
  );

  return (
    <div className="hidden w-56 shrink-0 flex-col border-r border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] md:flex">
      <div className="flex flex-col gap-0.5 p-2">
        <button
          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs-plus ${props.activeId === null ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
          onClick={() => props.onSelect(null)}
          type="button"
        >
          <span>All assets</span>
          <Badge variant="outline">{project.assets.length}</Badge>
        </button>
        <button
          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs-plus ${props.activeId === "★favorites" ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
          onClick={() => props.onSelect("★favorites")}
          type="button"
        >
          <span>★ Favorites</span>
        </button>
      </div>
      <Separator />
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
          Boards
        </span>
        <button
          className="text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)] hover:text-[color:var(--foreground)]"
          onClick={() => {
            const name = window.prompt("New board name");
            if (name?.trim()) {
              props.onSelect(addCollection(name.trim(), null));
            }
          }}
          title="New board"
          type="button"
        >
          +
        </button>
      </div>
      <div className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {nodes.length === 0 ? (
          <p className="px-2 py-4 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
            No boards yet. Add one to organize your shoots.
          </p>
        ) : (
          nodes.map((node) => (
            <BoardRow
              activeId={props.activeId}
              depth={0}
              key={node.id}
              node={node}
              onSelect={props.onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
