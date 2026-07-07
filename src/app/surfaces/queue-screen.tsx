import * as React from "react";

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@/toolcraft/ui";
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
import { downloadFromUrl } from "../data/download";
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
  STUDIO_BOARD_NAME,
} from "../studio/save-to-library";
import type { Asset, Comp, QueueItem } from "../data/types";

/** Output encoding options surfaced on each card. */
const ENCODINGS: { id: "jpeg" | "png" | "webp"; label: string }[] = [
  { id: "jpeg", label: "JPG" },
  { id: "png", label: "PNG" },
  { id: "webp", label: "WebP" },
];

/** Resolution tiers → pixel scale over each format's base size. */
const RESOLUTIONS: { label: string; scale: number }[] = [
  { label: "1K", scale: 1 },
  { label: "2K", scale: 2 },
  { label: "4K", scale: 4 },
];

type ExportOverrides = { encoding: "jpeg" | "png" | "webp"; scale: number };

/** Comp name shown as a title — first letter capitalized, schema kept intact. */
function displayTitle(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Untitled";
}

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
  baseBoard: string = STUDIO_BOARD_NAME,
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
    await saveImagesToLibrary([file], exportDestination(format, baseBoard));
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
  onExport: (overrides: ExportOverrides) => void;
  onToggleSelect: () => void;
  progress: number;
  selected: boolean;
}): React.JSX.Element {
  const { comp, item } = props;
  const project = useProject();
  const [saving, setSaving] = React.useState(false);
  const [encoding, setEncoding] = React.useState<"jpeg" | "png" | "webp">("jpeg");
  const [scale, setScale] = React.useState(2);
  const [destBoard, setDestBoard] = React.useState(STUDIO_BOARD_NAME);
  const fileCount = item.formatIds.length;
  const resLabel = RESOLUTIONS.find((option) => option.scale === scale)?.label ?? "2K";
  const topLevelBoards = project.collections.filter((collection) => !collection.parentId);

  const saveToLibrary = async (): Promise<void> => {
    setSaving(true);
    const toastId = toast.loading("Saving to Library…");
    try {
      const saved = await saveQueueItemToLibrary(
        item,
        comp,
        (done, total) => toast.loading(`Saving ${done}/${total} to Library…`, { id: toastId }),
        destBoard,
      );
      toast.success(
        saved === 1
          ? `Saved to “${destBoard}”`
          : `Saved ${saved} formats to “${destBoard}” — one sub-board per type`,
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
      <div className="flex flex-col gap-2.5 p-3">
        <span className="truncate text-sm font-medium">{displayTitle(comp.name)}</span>

        {/* Status + platform formats */}
        <div className="grid grid-cols-2 gap-1.5">
          <StatusSelect
            onChange={(status) => setCompStatus(comp.id, status)}
            status={comp.status}
            triggerClassName="h-9 w-full justify-between"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="flex h-9 w-full items-center justify-between gap-1 rounded-lg bg-[color:var(--surface-inactive)] px-3 text-sm hover:bg-[color:var(--surface-active)]"
                  type="button"
                >
                  <span className="truncate">
                    {fileCount} Format{fileCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-muted-foreground">⌄</span>
                </button>
              }
            />
            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
              {PLATFORM_FORMATS.map((format) => {
                const active = item.formatIds.includes(format.id);
                return (
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs-plus hover:bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)]"
                    key={format.id}
                    onClick={(event) => {
                      event.preventDefault();
                      toggleQueueItemFormat(item.id, format.id);
                    }}
                    type="button"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--accent)]">
                      {active ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {format.platformLabel} {format.label}
                    </span>
                  </button>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Save to Library + destination board */}
        <div className="flex items-center rounded-lg bg-[color:var(--surface-inactive)]">
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2.5 text-left text-xs-plus hover:text-foreground disabled:opacity-60"
            disabled={saving}
            onClick={() => void saveToLibrary()}
            type="button"
          >
            <span className="shrink-0">{saving ? "Saving…" : "Save to Library"}</span>
            <span className="min-w-0 truncate text-muted-foreground">/ {destBoard}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label="Change destination board"
                  className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  ⌄
                </button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDestBoard(STUDIO_BOARD_NAME)}>
                {STUDIO_BOARD_NAME}
              </DropdownMenuItem>
              {topLevelBoards.map((board) => (
                <DropdownMenuItem key={board.id} onClick={() => setDestBoard(board.name)}>
                  {board.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Output encoding + resolution */}
        <div className="flex items-center gap-1.5">
          {ENCODINGS.map((option) => (
            <button
              className="ds-seg !px-2 flex-1"
              data-active={encoding === option.id}
              key={option.id}
              onClick={() => setEncoding(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-[color:var(--surface-inactive)] px-2.5 text-sm hover:bg-[color:var(--surface-active)]"
                  type="button"
                >
                  {resLabel}
                  <span className="text-muted-foreground">⌄</span>
                </button>
              }
            />
            <DropdownMenuContent align="end">
              {RESOLUTIONS.map((option) => (
                <DropdownMenuItem key={option.label} onClick={() => setScale(option.scale)}>
                  {option.label} · {option.scale}×
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Export */}
        <button
          className="mt-0.5 flex w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--foreground)] py-2.5 text-sm font-medium text-[color:var(--background)] transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={props.exporting}
          onClick={() => props.onExport({ encoding, scale })}
          type="button"
        >
          {props.isExporting ? (
            `${Math.round(props.progress * 100)}%`
          ) : (
            <>
              Export
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
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
            </>
          )}
        </button>
      </div>
    </li>
  );
}

/** A queued raw asset — exported/downloaded as its original file, not rendered. */
function AssetQueueCard(props: {
  asset: Asset;
  item: QueueItem;
  onToggleSelect: () => void;
  selected: boolean;
}): React.JSX.Element {
  const { asset, item } = props;
  const [downloading, setDownloading] = React.useState(false);

  const download = async (): Promise<void> => {
    setDownloading(true);
    const ext = asset.filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
    const toastId = toast.loading(`Downloading ${asset.name}…`);
    try {
      await downloadFromUrl(asset.url, `${asset.name}.${ext}`);
      toast.success(`Downloaded ${asset.name}`, { id: toastId });
    } catch {
      toast.error("Download failed.", { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-lg border bg-[color:var(--card)] ${
        props.selected ? "border-[color:var(--accent)]" : "border-border"
      }`}
    >
      <div className="relative">
        {asset.kind === "video" ? (
          <video
            className="w-full object-cover"
            muted
            playsInline
            poster={asset.thumbUrl}
            src={asset.url}
            style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
          />
        ) : (
          <img
            alt={asset.name}
            className="w-full object-cover"
            decoding="async"
            loading="lazy"
            src={asset.thumbUrl}
            style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
          />
        )}
        <span
          className={`absolute left-1.5 top-1.5 transition-opacity ${props.selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <Checkbox
            checked={props.selected}
            name={`Select ${asset.name}`}
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
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-white/90">
          Original
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        <span className="truncate text-xs-plus">{asset.name}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusDot status={asset.status} withLabel />
        </span>
        <Button
          className="w-full"
          disabled={downloading}
          onClick={() => void download()}
          size="sm"
          title="Download the original file"
          type="button"
          variant="outline"
        >
          {downloading ? "Downloading…" : "Download"}
        </Button>
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

  const totalRenders = project.queue.reduce(
    (sum, item) => sum + (item.assetId ? 1 : item.formatIds.length),
    0,
  );
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
    async (items: QueueItem[] | null, overrides?: ExportOverrides): Promise<void> => {
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
          // Per-card overrides pick the encoding + resolution; batch defaults to
          // the highest standard (2× pixels, per-format encoding).
          encoding: overrides?.encoding,
          quality: "highest",
          scale: overrides?.scale,
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
            selected format lands here. Raw photos and videos can be queued from the Library
            too. One click then exports the whole batch, named and foldered by platform with a
            manifest.
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
          {project.queue.length} item{project.queue.length === 1 ? "" : "s"} ·{" "}
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
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {project.queue.map((item) => {
              if (item.assetId) {
                const asset = project.assets.find(
                  (candidate) => candidate.id === item.assetId,
                );
                if (!asset) {
                  return null;
                }
                return (
                  <AssetQueueCard
                    asset={asset}
                    item={item}
                    key={item.id}
                    onToggleSelect={() => toggleSelect(item.id)}
                    selected={selectedIds.has(item.id)}
                  />
                );
              }
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
                  onExport={(overrides) => void exportItems([item], overrides)}
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
