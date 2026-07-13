import * as React from "react";

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
import { studioValuesToComp } from "./studio-actions";
import { useVideoPosterAssets } from "./video-poster";

const RAIL_OPEN_KEY = "mrs-studio.session-rail-open";

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
 * design into a matrix. Open state persists across reloads.
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
  const listRef = React.useRef<HTMLDivElement>(null);

  const toggleOpen = (): void => {
    setOpen((prev) => {
      const next = !prev;
      storeRailOpen(next);
      return next;
    });
  };

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

  const remove = (comp: Comp): void => {
    if (!window.confirm(`Delete “${comp.name}”?`)) {
      return;
    }
    if (comp.id === activeId) {
      const index = comps.findIndex((candidate) => candidate.id === comp.id);
      const neighbor = comps[index + 1] ?? comps[index - 1];
      setActiveArtboard(neighbor?.id ?? null);
    }
    deleteComp(comp.id);
  };

  const openVariations = (): void => {
    const active = getProjectSnapshot().comps.find((comp) => comp.id === activeId);
    props.onVariations({
      ...STUDIO_DEFAULTS,
      ...((active?.sourceValues as Partial<StudioValues> | undefined) ?? {}),
    });
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
          ›
        </button>
        <span className="mt-1 text-2xs tabular-nums text-muted-foreground">{comps.length}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-40 shrink-0 flex-col border-r border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))]">
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
          ‹
        </button>
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 pb-2">
        <button
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_25%,transparent)] text-xs-plus text-foreground transition-colors hover:border-[color:var(--accent)]"
          onClick={openVariations}
          type="button"
        >
          Variations
        </button>
      </div>

      <div
        className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3"
        ref={listRef}
      >
        {comps.map((comp) => {
          const active = comp.id === activeId;
          return (
            <div
              className={`group relative shrink-0 overflow-hidden rounded-md transition-shadow ${
                active
                  ? "ring-2 ring-[color:var(--accent)]"
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
                  onClick={() => remove(comp)}
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
    </div>
  );
}
