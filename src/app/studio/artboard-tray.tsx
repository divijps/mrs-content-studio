import * as React from "react";

import { getFormat } from "../data/formats";
import {
  createId,
  deleteComp,
  setActiveArtboard,
  upsertComp,
  useProject,
} from "../data/project-store";
import type { Comp } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import { buildCompSvg } from "./comp-svg";
import { studioValuesToComp } from "./studio-actions";
import { useVideoPosterAssets } from "./video-poster";

/** Live preview of an artboard at its first format. */
function ArtboardThumb(props: { comp: Comp }): React.JSX.Element {
  const project = useProject();
  const values: StudioValues = {
    ...STUDIO_DEFAULTS,
    ...(props.comp.sourceValues as Partial<StudioValues> | undefined),
  };
  const format = getFormat(values.formatId);
  // Video backgrounds need a guaranteed poster still for the SVG preview.
  const renderAssets = useVideoPosterAssets(project.assets, [
    values.imageAssetId,
    ...values.imageAssetIds,
  ]);
  const svg = React.useMemo(
    () => buildCompSvg({ assets: renderAssets, brand: project.brand, values }).svg,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), renderAssets, project.brand],
  );
  return (
    <div
      className="h-full overflow-hidden bg-background [&_svg]:block [&_svg]:h-full [&_svg]:w-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ aspectRatio: `${format.width} / ${format.height}` }}
    />
  );
}

/**
 * Artboard strip beneath the Studio canvas: generous live thumbnails — no
 * labels, no status chrome (review status lives in the Queue/Library, not
 * here). Click to load, hover for duplicate/delete, arrows appear when it
 * overflows. Names live in the tooltip.
 */
export function ArtboardTray(): React.JSX.Element {
  const project = useProject();
  const activeId = project.activeArtboardId;
  const userId = project.settings.userId;
  // Each teammate's Studio shows only their own artboards; unowned (legacy)
  // comps stay visible to everyone. The Planner/Queue remain shared and can
  // still reference any comp by id.
  const comps = project.comps.filter(
    (comp) => !comp.ownerId || comp.ownerId === userId,
  );
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = React.useState({ left: false, right: false });

  // Keep the tile being edited visible — bindings can change without a click
  // (adopting a canvas, delete hand-off), and with the larger tiles fewer fit.
  React.useEffect(() => {
    if (!activeId) {
      return;
    }
    const tile = stripRef.current?.querySelector<HTMLElement>(
      `[data-artboard-id="${activeId}"]`,
    );
    tile?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  const refreshArrows = React.useCallback((): void => {
    const strip = stripRef.current;
    if (!strip) return;
    setCanScroll({
      left: strip.scrollLeft > 4,
      right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4,
    });
  }, []);

  React.useEffect(() => {
    refreshArrows();
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(refreshArrows);
    observer.observe(strip);
    window.addEventListener("resize", refreshArrows);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refreshArrows);
    };
  }, [refreshArrows, comps.length]);

  const scrollBy = (delta: number): void => {
    stripRef.current?.scrollBy({ behavior: "smooth", left: delta });
  };

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

  /** Delete a tile; if it was the one being edited, hand off to a neighbor so
   * the editor never sits unbound (edits would silently save nowhere). */
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

  return (
    <div className="relative flex h-28 shrink-0 items-center gap-1 border-t border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))] px-2">
      {canScroll.left ? (
        <button
          aria-label="Scroll artboards left"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground"
          onClick={() => scrollBy(-400)}
          type="button"
        >
          ‹
        </button>
      ) : null}

      <div
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto px-1"
        onScroll={refreshArrows}
        ref={stripRef}
      >
        {comps.map((comp) => {
          const active = comp.id === activeId;
          return (
            <div
              className={`group relative h-[88px] shrink-0 overflow-hidden rounded-md transition-shadow ${
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
                className="block h-full"
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

        {/* New artboard — a dashed tile at the end of the strip */}
        <button
          aria-label="New artboard"
          className="flex h-[88px] w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] text-lg text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
          onClick={addBlank}
          title="New artboard"
          type="button"
        >
          +
        </button>
      </div>

      {canScroll.right ? (
        <button
          aria-label="Scroll artboards right"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground"
          onClick={() => scrollBy(400)}
          type="button"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
