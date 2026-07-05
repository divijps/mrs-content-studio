import * as React from "react";

import { Button } from "@/toolcraft/ui";
import { toast } from "sonner";

import { getFormat, PLATFORM_FORMATS } from "../data/formats";
import {
  clearQueue,
  getProjectSnapshot,
  removeFromQueue,
  toggleQueueItemFormat,
  useProject,
} from "../data/project-store";
import { StatusDot } from "../library/status-dot";
import { runBatchExport, type ExportQuality } from "../studio/batch-export";
import { buildCompSvg } from "../studio/comp-svg";
import { STUDIO_DEFAULTS, type StudioValues } from "../studio/comp-layout";
import { downloadBlob } from "../studio/export";
import type { Comp } from "../data/types";

/** Small live SVG preview of a queued comp at its first format. */
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
      className="w-16 shrink-0 overflow-hidden rounded-md border border-border bg-background"
      style={{ aspectRatio: `${format.width} / ${format.height}` }}
    >
      <div
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{
          height: format.height,
          transform: `scale(${64 / format.width})`,
          transformOrigin: "top left",
          width: format.width,
        }}
      />
    </div>
  );
}

export function QueueScreen(): React.JSX.Element {
  const project = useProject();
  const [quality, setQuality] = React.useState<ExportQuality>("recommended");
  const [approvedOnly, setApprovedOnly] = React.useState(false);
  const [campaign, setCampaign] = React.useState("july-drop");
  const [exporting, setExporting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const totalRenders = project.queue.reduce((sum, item) => sum + item.formatIds.length, 0);

  const handleExport = React.useCallback(async () => {
    setExporting(true);
    setProgress(0);
    try {
      const snapshot = getProjectSnapshot();
      const result = await runBatchExport({
        approvedOnly,
        assets: snapshot.assets,
        brand: snapshot.brand,
        campaign,
        comps: snapshot.comps,
        quality,
        queue: snapshot.queue,
        reportProgress: setProgress,
      });
      if (result.rendered === 0) {
        toast.error(
          approvedOnly
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
      setProgress(0);
    }
  }, [approvedOnly, campaign, quality]);

  if (project.queue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-sm text-center">
          <p className="font-serif text-lg">Export queue</p>
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
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-xs-plus">
          {project.queue.length} comp{project.queue.length === 1 ? "" : "s"} ·{" "}
          {totalRenders} file{totalRenders === 1 ? "" : "s"}
        </span>
        <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          Campaign
          <input
            className="w-28 rounded-md border border-border bg-transparent px-2 py-1 text-xs-plus text-foreground outline-none focus:border-accent"
            onChange={(event) => setCampaign(event.target.value)}
            value={campaign}
          />
        </label>
        <div className="flex rounded-md border border-border text-xs-plus">
          <button
            className={`rounded-l-md px-2 py-1 ${quality === "recommended" ? "bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)]" : "text-muted-foreground"}`}
            onClick={() => setQuality("recommended")}
            type="button"
          >
            Platform
          </button>
          <button
            className={`rounded-r-md px-2 py-1 ${quality === "highest" ? "bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)]" : "text-muted-foreground"}`}
            onClick={() => setQuality("highest")}
            type="button"
          >
            Highest
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <input
            checked={approvedOnly}
            onChange={(event) => setApprovedOnly(event.target.checked)}
            type="checkbox"
          />
          Approved only
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="text-2xs text-muted-foreground hover:text-foreground"
            onClick={() => clearQueue()}
            type="button"
          >
            Clear
          </button>
          <Button disabled={exporting} onClick={handleExport} size="sm" type="button">
            {exporting ? `Exporting ${Math.round(progress * 100)}%` : "Export all"}
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
        <ul className="flex flex-col gap-2">
          {project.queue.map((item) => {
            const comp = project.comps.find((candidate) => candidate.id === item.compId);
            if (!comp) {
              return null;
            }
            return (
              <li
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                key={item.id}
              >
                <CompThumb comp={comp} formatId={item.formatIds[0] ?? "ig-post"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs-plus">{comp.name}</span>
                    <StatusDot status={comp.status} withLabel />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
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
                </div>
                <button
                  className="shrink-0 text-2xs text-muted-foreground hover:text-foreground"
                  onClick={() => removeFromQueue(item.id)}
                  type="button"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-2xs text-muted-foreground">
          Export produces a ZIP with platform folders (JPEG for Instagram &amp; Pinterest,
          WebP for Shopify/web) plus a manifest.csv listing every file.
        </p>
      </div>
    </div>
  );
}
