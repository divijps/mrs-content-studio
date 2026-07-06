import * as React from "react";

import { setAssetStatus, useProject } from "../data/project-store";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  type Asset,
  type ReviewStatus,
} from "../data/types";

// "Draft" is the implicit default for every asset before it's moved into review,
// so the board only tracks the active review stages.
const BOARD_STATUSES: readonly ReviewStatus[] = REVIEW_STATUS_ORDER.filter(
  (status) => status !== "draft",
);

/**
 * Review board: assets grouped by status. Drag a card to another column to
 * change its status — the approval workflow made physical.
 */
export function KanbanBoard(props: {
  assets: Asset[];
  onOpen: (assetId: string) => void;
}): React.JSX.Element {
  const project = useProject();
  const [dragOver, setDragOver] = React.useState<ReviewStatus | null>(null);

  const byStatus = React.useMemo(() => {
    const map = new Map<ReviewStatus, Asset[]>();
    for (const status of BOARD_STATUSES) {
      map.set(status, []);
    }
    for (const asset of props.assets) {
      map.get(asset.status)?.push(asset);
    }
    return map;
  }, [props.assets]);

  return (
    <div className="grid h-full grid-cols-3 gap-3 overflow-x-auto p-4">
      {BOARD_STATUSES.map((status) => {
        const items = byStatus.get(status) ?? [];
        return (
          <div
            className={`flex min-w-[180px] flex-col rounded-lg border transition-colors ${dragOver === status ? "border-accent bg-[color:color-mix(in_oklab,var(--accent)_8%,transparent)]" : "border-border"}`}
            key={status}
            onDragLeave={() => setDragOver((current) => (current === status ? null : current))}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(status);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const assetId = event.dataTransfer.getData("text/plain");
              if (assetId) {
                setAssetStatus(assetId, status);
              }
              setDragOver(null);
            }}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs-plus font-medium">{REVIEW_STATUS_LABELS[status]}</span>
              <span className="text-2xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
              {items.map((asset) => (
                <button
                  className="group flex flex-col gap-1.5 rounded-md border border-border bg-background p-1.5 text-left"
                  draggable
                  key={asset.id}
                  onClick={() => props.onOpen(asset.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", asset.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  type="button"
                >
                  <img
                    alt={asset.name}
                    className="aspect-[4/5] w-full rounded-sm object-cover"
                    decoding="async"
                    loading="lazy"
                    src={asset.thumbUrl}
                  />
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-2xs">{asset.name}</span>
                    {asset.comments.filter((comment) => !comment.resolved).length > 0 ? (
                      <span className="shrink-0 rounded-full bg-accent px-1 text-2xs text-accent-foreground">
                        {asset.comments.filter((comment) => !comment.resolved).length}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
              {items.length === 0 ? (
                <span className="px-1 py-4 text-center text-2xs text-muted-foreground">
                  {project.assets.length === 0 ? "" : "Drop here"}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
