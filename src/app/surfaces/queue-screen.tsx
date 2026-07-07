import * as React from "react";

import { Button, Checkbox, Input, Label } from "@/toolcraft/ui";
import { toast } from "sonner";

import { getFormat, PLATFORM_FORMATS } from "../data/formats";
import {
  clearQueue,
  getProjectSnapshot,
  removeFromQueue,
  setCompStatus,
  toggleQueueItemFormat,
  useProject,
} from "../data/project-store";
import { StatusDot } from "../library/status-dot";
import { StatusSelect } from "../library/status-select";
import { runBatchExport } from "../studio/batch-export";
import { buildCompSvg } from "../studio/comp-svg";
import { STUDIO_DEFAULTS, type StudioValues } from "../studio/comp-layout";
import { downloadBlob } from "../studio/export";
import {
  exportDestination,
  renderCompToFile,
  saveImagesToLibrary,
} from "../studio/save-to-library";
import type { Comp, QueueItem } from "../data/types";

/** Live SVG preview of a queued comp; scales to the card width via viewBox. */
function CompThumb(props: { comp: Comp; formatId: string }): React.JSX.Element {
  const project = useProject();
  const values: StudioValues = {
    ...STUDIO_DEFAULTS,
    ...(props.comp.sourceValues as Partial<StudioValues> | undefined),
    formatId: props.formatId,
  };
  const svg = React.useMemo(
    () => buildCompSvg({ assets: project.assets, brand: project.brand, values }).svg,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), project.assets, project.brand],
  );
  const format = getFormat(props.formatId);
  return (
    <div
      className="w-full overflow-hidden bg-background [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ aspectRatio: `${format.width} / ${format.height}` }}
    />
  );
}

/** Render every selected format of a queued comp into its per-type sub-board. */
async function saveQueueItemToLibrary(
  item: QueueItem,
  comp: Comp,
  onStep?: (saved: number, total: number) => void,
): Promise<number> {
  const formatIds = item.formatIds.length > 0 ? item.formatIds : ["ig-post"];
  const project = getProjectSnapshot();
  let saved = 0;
  for (const formatId of formatIds) {
    const format = getFormat(formatId);
    const file = await renderCompToFile({
      assets: project.assets,
      brand: project.brand,
      comp,
      formatId,
    });
    await saveImagesToLibrary([file], exportDestination(format));
    saved += 1;
    onStep?.(saved, formatIds.length);
  }
  return saved;
}

/**
 * One queued comp. Collapsed by default — preview, name, and a compact
 * status + format-count summary; details (status dropdown + per-format
 * toggles) expand on demand. Select via the corner checkbox; remove via the
 * hover ✕ on the preview.
 */
function QueueCard(props: {
  comp: Comp;
  exporting: boolean;
  isExporting: boolean;
  item: QueueItem;
  onExport: () => void;
  onToggleSelect: () => void;
  progress: number;
  selected: boolean;
}): React.JSX.Element {
  const { comp, item } = props;
  const [expanded, setExpanded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fileCount = item.formatIds.length;

  const saveToLibrary = async (): Promise<void> => {
    setSaving(true);
    const toastId = toast.loading("Saving to Library…");
    try {
      const saved = await saveQueueItemToLibrary(item, comp, (done, total) =>
        toast.loading(`Saving ${done}/${total} to Library…`, { id: toastId }),
      );
      toast.success(
        saved === 1
          ? `Saved to “Studio exports”`
          : `Saved ${saved} formats to “Studio exports” — one sub-board per type`,
        { id: toastId },
      );
    } catch (error) {
      toast.error(`Save failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-lg border bg-[color:var(--card)] ${
        props.selected ? "border-[color:var(--accent)]" : "border-border"
      }`}
    >
      <div className="relative">
        <CompThumb comp={comp} formatId={item.formatIds[0] ?? "ig-post"} />
        <span
          className={`absolute left-1.5 top-1.5 transition-opacity ${props.selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <Checkbox
            checked={props.selected}
            name={`Select ${comp.name}`}
            onCheckedChange={props.onToggleSelect}
            showLabel={false}
          />
        </span>
        <button
          aria-label="Remove from queue"
          className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/65 text-2xs text-white hover:bg-black/85 group-hover:flex"
          onClick={() => removeFromQueue(item.id)}
          title="Remove from queue"
          type="button"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        <span className="truncate text-xs-plus">{comp.name}</span>

        {/* Summary — expands to full status + format controls */}
        <button
          aria-expanded={expanded}
          className="flex items-center justify-between gap-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <StatusDot status={comp.status} withLabel />
          </span>
          <span className="flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
            {fileCount} format{fileCount === 1 ? "" : "s"}
            <span>{expanded ? "▾" : "▸"}</span>
          </span>
        </button>

        {expanded ? (
          <>
            <StatusSelect
              onChange={(status) => setCompStatus(comp.id, status)}
              status={comp.status}
              triggerClassName="h-7 w-full justify-between text-2xs"
            />
            <div className="flex flex-wrap gap-1">
              {PLATFORM_FORMATS.map((format) => {
                const active = item.formatIds.includes(format.id);
                return (
                  <button
                    className={`rounded-full border px-2 py-0.5 text-2xs transition-colors ${active ? "border-accent bg-[color:color-mix(in_oklab,var(--accent)_16%,transparent)] text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                    key={format.id}
                    onClick={() => toggleQueueItemFormat(item.id, format.id)}
                    type="button"
                  >
                    {format.platformLabel} {format.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Button
            className="w-full"
            disabled={saving}
            onClick={() => void saveToLibrary()}
            size="sm"
            title="Render every selected format into the Library"
            type="button"
            variant="outline"
          >
            {saving ? "Saving…" : "To Library"}
          </Button>
          <Button
            className="w-full"
            disabled={props.exporting}
            onClick={props.onExport}
            size="sm"
            type="button"
          >
            {props.isExporting ? `${Math.round(props.progress * 100)}%` : "Export"}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function QueueScreen(): React.JSX.Element {
  const project = useProject();
  const [approvedOnly, setApprovedOnly] = React.useState(false);
  const [campaign, setCampaign] = React.useState("july-drop");
  const [exporting, setExporting] = React.useState(false);
  const [exportingItemId, setExportingItemId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = React.useState(false);

  const totalRenders = project.queue.reduce((sum, item) => sum + item.formatIds.length, 0);
  const selectedItems = project.queue.filter((item) => selectedIds.has(item.id));

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportItems = React.useCallback(
    async (items: QueueItem[] | null): Promise<void> => {
      const single = items !== null && items.length === 1;
      setExporting(true);
      setExportingItemId(single ? items[0]!.id : null);
      setProgress(0);
      try {
        const snapshot = getProjectSnapshot();
        const result = await runBatchExport({
          approvedOnly: single ? false : approvedOnly,
          assets: snapshot.assets,
          brand: snapshot.brand,
          campaign,
          comps: snapshot.comps,
          // Always export at the highest standard: 2× pixels, top encode quality.
          quality: "highest",
          queue: items ?? snapshot.queue,
          reportProgress: setProgress,
        });
        if (result.rendered === 0) {
          toast.error(
            approvedOnly && !single
              ? "Nothing to export — no queued comps are Approved."
              : "Nothing to export.",
          );
          return;
        }
        downloadBlob(result.zip, result.filename);
        const parts = [`${result.rendered} exported`];
        if (result.skipped) parts.push(`${result.skipped} unapproved skipped`);
        toast.success(`${parts.join(" · ")} → ${result.filename}`);
      } catch (error) {
        toast.error(`Export failed: ${(error as Error).message}`);
      } finally {
        setExporting(false);
        setExportingItemId(null);
        setProgress(0);
      }
    },
    [approvedOnly, campaign],
  );

  const bulkToLibrary = async (): Promise<void> => {
    setBulkSaving(true);
    const toastId = toast.loading(`Saving ${selectedItems.length} comps to Library…`);
    try {
      let files = 0;
      for (const [index, item] of selectedItems.entries()) {
        const comp = project.comps.find((candidate) => candidate.id === item.compId);
        if (!comp) continue;
        files += await saveQueueItemToLibrary(item, comp);
        toast.loading(`Saving comp ${index + 1}/${selectedItems.length}…`, { id: toastId });
      }
      toast.success(`Saved ${files} files to “Studio exports”`, { id: toastId });
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(`Save failed: ${(error as Error).message}`, { id: toastId });
    } finally {
      setBulkSaving(false);
    }
  };

  if (project.queue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium">Export queue</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing queued yet. In the Studio, press “Add to queue” on any comp — every
            selected format lands here, then one click exports the whole batch, named and
            foldered by platform with a manifest.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-2.5">
        <span className="text-sm font-medium">Export queue</span>
        <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
          {project.queue.length} comp{project.queue.length === 1 ? "" : "s"} ·{" "}
          {totalRenders} file{totalRenders === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            Campaign
            <Input
              className="h-8 w-28 text-xs-plus"
              onChange={(event) => setCampaign(event.target.value)}
              value={campaign}
            />
          </Label>
          <button
            className={`rounded-full border px-2.5 py-1 text-2xs transition-colors ${approvedOnly ? "border-accent bg-[color:color-mix(in_oklab,var(--accent)_16%,transparent)] text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={() => setApprovedOnly((value) => !value)}
            type="button"
          >
            Approved only
          </button>
          <Button onClick={() => clearQueue()} size="sm" type="button" variant="outline">
            Clear
          </Button>
          <Button
            disabled={exporting}
            onClick={() => void exportItems(null)}
            size="sm"
            type="button"
          >
            {exporting && exportingItemId === null
              ? `Exporting ${Math.round(progress * 100)}%`
              : "Export all"}
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--accent)_8%,transparent)] px-4 py-1.5">
          <span className="text-2xs">{selectedIds.size} selected</span>
          <Button
            disabled={bulkSaving}
            onClick={() => void bulkToLibrary()}
            size="xs"
            type="button"
            variant="outline"
          >
            {bulkSaving ? "Saving…" : "To Library"}
          </Button>
          <Button
            disabled={exporting}
            onClick={() => void exportItems(selectedItems)}
            size="xs"
            type="button"
            variant="outline"
          >
            Export selected
          </Button>
          <Button
            onClick={() => {
              for (const id of selectedIds) removeFromQueue(id);
              setSelectedIds(new Set());
            }}
            size="xs"
            type="button"
            variant="outline"
          >
            Remove
          </Button>
          <button
            className="ml-auto text-2xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedIds(new Set(project.queue.map((item) => item.id)))}
            type="button"
          >
            Select all
          </button>
          <button
            className="text-2xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedIds(new Set())}
            type="button"
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {exporting ? (
        <div className="h-0.5 w-full bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-[1160px]">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {project.queue.map((item) => {
              const comp = project.comps.find(
                (candidate) => candidate.id === item.compId,
              );
              if (!comp) {
                return null;
              }
              return (
                <QueueCard
                  comp={comp}
                  exporting={exporting}
                  isExporting={exporting && exportingItemId === item.id}
                  item={item}
                  key={item.id}
                  onExport={() => void exportItems([item])}
                  onToggleSelect={() => toggleSelect(item.id)}
                  progress={progress}
                  selected={selectedIds.has(item.id)}
                />
              );
            })}
          </ul>
          <p className="mt-4 text-center text-2xs text-muted-foreground">
            Export produces a ZIP with platform folders (JPEG for Instagram &amp;
            Pinterest, WebP for Shopify/web) plus a manifest.csv listing every file — all
            at 2× resolution.
          </p>
        </div>
      </div>
    </div>
  );
}
