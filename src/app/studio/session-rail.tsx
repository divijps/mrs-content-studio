import * as React from "react";
import { createPortal } from "react-dom";

import {
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  SidebarSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import { getFormat } from "../data/formats";
import {
  createId,
  deleteComp,
  getProjectSnapshot,
  setActiveArtboard,
  upsertComp,
  useProject,
} from "../data/project-store";
import type { Comp } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import { buildCompSvg } from "./comp-svg";
import { compFormatId, exportCompsZip } from "./rail-export";
import { studioValuesToComp } from "./studio-actions";
import { useVideoPosterAssets } from "./video-poster";

const RAIL_OPEN_KEY = "mrs-studio.session-rail-open";
/** Sentinel value for the "All formats" filter option (Select needs a value). */
const ALL_FORMATS = "__all_formats__";

function loadRailOpen(): boolean {
  try {
    return window.localStorage.getItem(RAIL_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function storeRailOpen(open: boolean): void {
  try {
    window.localStorage.setItem(RAIL_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private mode: session-only.
  }
}

/** Live preview of an artboard at its first format. */
function ArtboardThumb(props: { comp: Comp }): React.JSX.Element {
  const project = useProject();
  const values: StudioValues = {
    ...STUDIO_DEFAULTS,
    ...(props.comp.sourceValues as Partial<StudioValues> | undefined),
  };
  const format = getFormat(values.formatId);
  const renderAssets = useVideoPosterAssets(
    project.assets,
    [values.imageAssetId, ...values.imageAssetIds],
    { [values.imageAssetId]: values.videoPosterTime },
  );
  const svg = React.useMemo(
    () => buildCompSvg({ assets: renderAssets, brand: project.brand, values }).svg,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), renderAssets, project.brand],
  );
  return (
    <div
      className="w-full overflow-hidden bg-background [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ aspectRatio: `${format.width} / ${format.height}` }}
    />
  );
}

/**
 * Session rail — the per-session experiment shelf that replaced the bottom
 * artboard tray. A collapsible left column of live comp thumbnails (the photos
 * + copy the teammate is trying out): click to load, hover for
 * duplicate/delete, "+" starts a blank one, and Variations spins the active
 * design into a matrix. A checkbox on each tile plus per-format chips drive a
 * one-click ZIP export (all, a format, or an arbitrary pick) — the scale lever.
 * Open state persists across reloads.
 */
export function SessionRail(props: {
  onVariations: (base: StudioValues) => void;
}): React.JSX.Element {
  const project = useProject();
  const activeId = project.activeArtboardId;
  const userId = project.settings.userId;
  // Each teammate's Studio shows only their own artboards; unowned (legacy)
  // comps stay visible to everyone.
  const comps = project.comps.filter(
    (comp) => !comp.ownerId || comp.ownerId === userId,
  );
  const [open, setOpen] = React.useState<boolean>(loadRailOpen);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [exporting, setExporting] = React.useState(false);
  // null = every format; else only comps of this format are shown/acted on.
  const [formatFilter, setFormatFilter] = React.useState<string | null>(null);
  // Ids queued for deletion, awaiting the confirmation dialog (null = closed).
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // The rail can be scoped to a single format via the "All formats" dropdown;
  // Select-all and the delete/download actions operate on what's visible.
  const visibleComps = formatFilter
    ? comps.filter((comp) => compFormatId(comp) === formatFilter)
    : comps;

  const toggleOpen = (): void => {
    setOpen((prev) => {
      const next = !prev;
      storeRailOpen(next);
      return next;
    });
  };

  const compIds = comps.map((comp) => comp.id).join(",");
  // If the filtered format runs out of comps (e.g. its last one was deleted),
  // fall back to All formats so the rail never shows a stale, empty filter.
  React.useEffect(() => {
    if (formatFilter && !comps.some((comp) => compFormatId(comp) === formatFilter)) {
      setFormatFilter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compIds, formatFilter]);
  // Drop selections for comps that vanished (deleted/regenerated) or that the
  // format filter now hides — you can only act on what you can see.
  const visibleIds = visibleComps.map((comp) => comp.id).join(",");
  React.useEffect(() => {
    setSelected((prev) => {
      const vis = new Set(visibleComps.map((comp) => comp.id));
      const next = new Set([...prev].filter((id) => vis.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);

  // Keep the tile being edited in view — bindings can change without a click.
  React.useEffect(() => {
    if (!open || !activeId) {
      return;
    }
    const tile = listRef.current?.querySelector<HTMLElement>(
      `[data-artboard-id="${activeId}"]`,
    );
    tile?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeId, open]);

  const addBlank = (): void => {
    // A blank uses the default format; clear the filter so it's visible.
    setFormatFilter(null);
    const comp = studioValuesToComp({ ...STUDIO_DEFAULTS });
    upsertComp(comp);
    setActiveArtboard(comp.id);
  };

  const duplicate = (comp: Comp): void => {
    const copy: Comp = {
      ...comp,
      comments: [],
      createdAt: new Date().toISOString(),
      id: createId("comp"),
      name: `${comp.name} copy`,
      ownerId: userId ?? comp.ownerId ?? null,
      status: "draft",
    };
    upsertComp(copy);
    setActiveArtboard(copy.id);
  };

  // Delete is always confirmed via the dialog — queue the ids, then commit.
  const requestDelete = (ids: string[]): void => {
    if (ids.length > 0) {
      setConfirmDelete(ids);
    }
  };

  const confirmRemove = (): void => {
    const ids = confirmDelete ?? [];
    if (ids.length === 0) {
      setConfirmDelete(null);
      return;
    }
    const removing = new Set(ids);
    // If the open artboard is going away, hop to the first survivor. When
    // NOTHING survives (select all + delete), bind a fresh BLANK first: an
    // unbound editor still shows the doomed design on canvas, and the
    // keep-bound guard in useArtboardSync would adopt it as a new comp —
    // resurrecting exactly what was just deleted ("delete made a variant").
    if (activeId && removing.has(activeId)) {
      const neighbor = comps.find((comp) => !removing.has(comp.id));
      if (neighbor) {
        setActiveArtboard(neighbor.id);
      } else {
        setFormatFilter(null);
        const blank = studioValuesToComp({ ...STUDIO_DEFAULTS });
        upsertComp(blank);
        setActiveArtboard(blank.id);
      }
    }
    for (const id of ids) {
      deleteComp(id);
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.delete(id);
      }
      return next;
    });
    setConfirmDelete(null);
    toast.success(`Deleted ${ids.length} artboard${ids.length === 1 ? "" : "s"}`);
  };

  const openVariations = (): void => {
    const active = getProjectSnapshot().comps.find((comp) => comp.id === activeId);
    props.onVariations({
      ...STUDIO_DEFAULTS,
      ...((active?.sourceValues as Partial<StudioValues> | undefined) ?? {}),
    });
  };

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select-all toggles the visible set (robust to the filter-prune timing).
  const allSelected =
    visibleComps.length > 0 && visibleComps.every((comp) => selected.has(comp.id));
  const toggleAll = (): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (visibleComps.every((comp) => prev.has(comp.id))) {
        for (const comp of visibleComps) next.delete(comp.id);
      } else {
        for (const comp of visibleComps) next.add(comp.id);
      }
      return next;
    });
  };

  // Distinct formats present in the rail — the "All formats" filter options.
  const formatGroups = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const comp of comps) {
      const id = compFormatId(comp);
      if (!seen.has(id)) {
        seen.set(id, getFormat(id).label);
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [compIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const runExport = async (): Promise<void> => {
    const targets = comps.filter((comp) => selected.has(comp.id));
    if (targets.length === 0) {
      return;
    }
    setExporting(true);
    const id = toast.loading(`Exporting ${targets.length} artboard${targets.length === 1 ? "" : "s"}…`);
    try {
      const snapshot = getProjectSnapshot();
      const result = await exportCompsZip({
        assets: snapshot.assets,
        brand: snapshot.brand,
        comps: targets,
        onProgress: (done, total) =>
          toast.loading(`Exporting ${done}/${total}…`, { id }),
      });
      toast.success(`Exported ${result.count} artboards → studio-export.zip`, { id });
    } catch (error) {
      toast.error(`Export failed: ${(error as Error).message}`, { id });
    } finally {
      setExporting(false);
    }
  };

  if (!open) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center gap-2 border-r border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))] py-2">
        <button
          aria-label="Open session"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground"
          onClick={toggleOpen}
          title="Open session"
          type="button"
        >
          <SidebarSimpleIcon />
        </button>
        <span className="mt-1 text-2xs tabular-nums text-muted-foreground">{comps.length}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))]">
      <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
        <span className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Session
        </span>
        <button
          aria-label="Collapse session"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground"
          onClick={toggleOpen}
          title="Collapse"
          type="button"
        >
          <SidebarSimpleIcon />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 pb-2">
        {/* Make variants — opens the matrix builder for the active artboard. */}
        <button
          className="flex h-9 items-center justify-between rounded-lg border border-[color:color-mix(in_oklab,var(--border)_25%,transparent)] px-3 text-xs-plus text-foreground transition-colors hover:border-[color:var(--accent)]"
          onClick={openVariations}
          type="button"
        >
          Make variants
          <CaretRightIcon className="text-muted-foreground" />
        </button>

        {comps.length > 0 ? (
          <>
            {/* Format filter — scopes the rail and the actions to one format. */}
            <Select
              items={[
                { label: "All formats", value: ALL_FORMATS },
                ...formatGroups.map((group) => ({
                  label: group.label,
                  value: group.id,
                })),
              ]}
              onValueChange={(next) =>
                setFormatFilter(next === ALL_FORMATS ? null : next)
              }
              value={formatFilter ?? ALL_FORMATS}
            >
              <SelectTrigger className="h-9 w-full rounded-lg border border-[color:color-mix(in_oklab,var(--border)_25%,transparent)] bg-transparent px-3 text-xs-plus text-foreground outline-none transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_45%,transparent)]">
                <SelectValue>
                  {() =>
                    formatFilter ? getFormat(formatFilter).label : "All formats"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  <SelectItem value={ALL_FORMATS}>All formats</SelectItem>
                  {formatGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {/* Select-all + delete + download, all driven by the selection. */}
            <div className="flex items-center gap-1.5">
              <button
                className="flex h-9 flex-1 items-center justify-center rounded-lg bg-[color:var(--surface-inactive)] text-xs-plus text-foreground transition-colors hover:bg-[color:var(--surface-active)]"
                onClick={toggleAll}
                type="button"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <button
                aria-label={`Delete ${selected.size} selected`}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:hover:bg-white"
                disabled={selected.size === 0}
                onClick={() => requestDelete([...selected])}
                title={
                  selected.size === 0
                    ? "Select artboards to delete"
                    : `Delete ${selected.size} selected`
                }
                type="button"
              >
                <XIcon weight="bold" />
              </button>
              <button
                aria-label={`Download ${selected.size} selected`}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:hover:bg-white"
                disabled={selected.size === 0 || exporting}
                onClick={() => void runExport()}
                title={
                  selected.size === 0
                    ? "Select artboards to download"
                    : `Download ${selected.size} selected`
                }
                type="button"
              >
                <DownloadSimpleIcon weight="bold" />
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div
        className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3"
        ref={listRef}
      >
        {visibleComps.map((comp) => {
          const active = comp.id === activeId;
          const checked = selected.has(comp.id);
          return (
            <div
              className={`group relative shrink-0 overflow-hidden rounded-md transition-shadow ${
                active
                  ? "ring-2 ring-[color:var(--accent)]"
                  : checked
                    ? "ring-2 ring-[color:color-mix(in_oklab,var(--accent)_60%,transparent)]"
                    : "ring-1 ring-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:ring-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
              }`}
              data-artboard-id={comp.id}
              key={comp.id}
            >
              <button
                aria-label={`Edit ${comp.name}`}
                aria-pressed={active}
                className="block w-full"
                onClick={() => setActiveArtboard(comp.id)}
                title={comp.name}
                type="button"
              >
                <ArtboardThumb comp={comp} />
              </button>
              {/* Selection checkbox (top-left) */}
              <button
                aria-label={checked ? `Deselect ${comp.name}` : `Select ${comp.name}`}
                aria-pressed={checked}
                className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                  checked
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                    : "border-white/70 bg-black/40 text-transparent group-hover:text-white/40"
                }`}
                onClick={() => toggleSelect(comp.id)}
                type="button"
              >
                <CheckIcon weight="bold" />
              </button>
              <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                <button
                  aria-label="Duplicate artboard"
                  className="flex h-5 w-5 items-center justify-center rounded bg-black/65 text-xs text-white hover:bg-black/85"
                  onClick={() => duplicate(comp)}
                  title="Duplicate"
                  type="button"
                >
                  ⧉
                </button>
                <button
                  aria-label="Delete artboard"
                  className="flex h-5 w-5 items-center justify-center rounded bg-black/65 text-xs text-white hover:bg-[color:var(--destructive)]"
                  onClick={() => requestDelete([comp.id])}
                  title="Delete"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* New artboard — a dashed tile at the end of the list */}
        <button
          aria-label="New artboard"
          className="flex h-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] text-lg text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
          onClick={addBlank}
          title="New artboard"
          type="button"
        >
          +
        </button>
      </div>

      {confirmDelete
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
              onClick={() => setConfirmDelete(null)}
            >
              <div
                className="w-[280px] rounded-xl border border-border bg-[color:var(--popover)] p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <p className="text-sm font-medium text-foreground">
                  Delete{" "}
                  {confirmDelete.length === 1
                    ? "this artboard"
                    : `these ${confirmDelete.length} artboards`}
                  ?
                </p>
                <p className="mt-1 text-xs-plus text-muted-foreground">
                  This can’t be undone.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="rounded-md px-3 py-1.5 text-xs-plus text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setConfirmDelete(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-md bg-[color:var(--destructive)] px-3 py-1.5 text-xs-plus font-medium text-white transition-opacity hover:opacity-90"
                    onClick={confirmRemove}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
