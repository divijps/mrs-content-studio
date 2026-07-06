import * as React from "react";

import {
  Button,
  Checkbox,
  Input,
  Label,
  ToggleGroup,
  ToggleGroupItem,
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
import { StatusDot } from "../library/status-dot";
import { StatusSelect } from "../library/status-select";
import { runBatchExport, type ExportQuality } from "../studio/batch-export";
import { buildCompSvg } from "../studio/comp-svg";
import { STUDIO_DEFAULTS, type StudioValues } from "../studio/comp-layout";
import { downloadBlob } from "../studio/export";
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

/**
 * One queued comp. Collapsed by default — shows the preview, name, and a
 * compact status + format-count summary — with details (status dropdown +
 * per-format toggles) revealed on demand so the grid isn't a wall of chips.
 */
function QueueCard(props: {
  comp: Comp;
  exporting: boolean;
  isExporting: boolean;
  item: QueueItem;
  onExport: () => void;
  progress: number;
}): React.JSX.Element {
  const { comp, item } = props;
  const [expanded, setExpanded] = React.useState(false);
  const fileCount = item.formatIds.length;

  return (
    <li className="group flex flex-col overflow-hidden rounded-lg border border-border bg-[color:var(--card)]">
      <CompThumb comp={comp} formatId={item.formatIds[0] ?? "ig-post"} />
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

        <div className="flex items-center justify-end gap-1.5">
          <Button
            disabled={props.exporting}
            onClick={props.onExport}
            size="xs"
            type="button"
            variant="outline"
          >
            {props.isExporting ? `${Math.round(props.progress * 100)}%` : "Export"}
          </Button>
          <Button
            aria-label="Remove from queue"
            onClick={() => removeFromQueue(item.id)}
            size="xs"
            type="button"
            variant="outline"
          >
            ✕
          </Button>
        </div>
      </div>
    </li>
  );
}

export function QueueScreen(): React.JSX.Element {
  const project = useProject();
  const [quality, setQuality] = React.useState<ExportQuality>("recommended");
  const [approvedOnly, setApprovedOnly] = React.useState(false);
  const [campaign, setCampaign] = React.useState("july-drop");
  const [exporting, setExporting] = React.useState(false);
  const [exportingItemId, setExportingItemId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);

  const totalRenders = project.queue.reduce((sum, item) => sum + item.formatIds.length, 0);

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
          quality,
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
    [approvedOnly, campaign, quality],
  );

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
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border px-4 py-2">
        <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
          {project.queue.length} comp{project.queue.length === 1 ? "" : "s"} ·{" "}
          {totalRenders} file{totalRenders === 1 ? "" : "s"}
        </span>
        <Label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          Campaign
          <Input
            className="h-6 w-28 text-xs-plus"
            onChange={(event) => setCampaign(event.target.value)}
            value={campaign}
          />
        </Label>
        <ToggleGroup
          onValueChange={(value: string[]) => {
            const next = value[value.length - 1];
            if (next === "recommended" || next === "highest") {
              setQuality(next);
            }
          }}
          value={[quality]}
        >
          <ToggleGroupItem value="recommended">Platform</ToggleGroupItem>
          <ToggleGroupItem value="highest">Highest</ToggleGroupItem>
        </ToggleGroup>
        <Checkbox
          checked={approvedOnly}
          name="Approved only"
          onCheckedChange={(checked) => setApprovedOnly(Boolean(checked))}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={() => clearQueue()}
            size="sm"
            type="button"
            variant="outline"
          >
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
                  progress={progress}
                />
              );
            })}
          </ul>
          <p className="mt-4 text-2xs text-muted-foreground">
            Export produces a ZIP with platform folders (JPEG for Instagram &amp;
            Pinterest, WebP for Shopify/web) plus a manifest.csv listing every file.
          </p>
        </div>
      </div>
    </div>
  );
}
