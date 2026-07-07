import * as React from "react";

import { getFormat } from "../data/formats";
import {
  createId,
  deleteComp,
  setActiveArtboard,
  upsertComp,
  useProject,
} from "../data/project-store";
import { StatusDot } from "../library/status-dot";
import type { Comp } from "../data/types";
import { STUDIO_DEFAULTS, type StudioValues } from "./comp-layout";
import { buildCompSvg } from "./comp-svg";
import { studioValuesToComp } from "./studio-actions";

/** Small live preview of an artboard at its first format. */
function ArtboardThumb(props: { comp: Comp }): React.JSX.Element {
  const project = useProject();
  const values: StudioValues = {
    ...STUDIO_DEFAULTS,
    ...(props.comp.sourceValues as Partial<StudioValues> | undefined),
  };
  const format = getFormat(values.formatId);
  const svg = React.useMemo(
    () => buildCompSvg({ assets: project.assets, brand: project.brand, values }).svg,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), project.assets, project.brand],
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
 * Slim artboard strip beneath the Studio canvas: just thumbnails — no labels.
 * Click to load, hover for duplicate/delete, arrows appear when it overflows.
 * Names live in the tooltip; the status dot rides the corner of each tile.
 */
export function ArtboardTray(): React.JSX.Element {
  const project = useProject();
  const activeId = project.activeArtboardId;
  const comps = project.comps;
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = React.useState({ left: false, right: false });

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
      status: "draft",
    };
    upsertComp(copy);
    setActiveArtboard(copy.id);
  };

  return (
    <div className="relative flex h-16 shrink-0 items-center gap-1 border-t border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))] px-2">
      {canScroll.left ? (
        <button
          aria-label="Scroll artboards left"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground"
          onClick={() => scrollBy(-280)}
          type="button"
        >
          ‹
        </button>
      ) : null}

      <div
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1"
        onScroll={refreshArrows}
        ref={stripRef}
      >
        {comps.map((comp) => {
          const active = comp.id === activeId;
          return (
            <div
              className={`group relative h-12 shrink-0 overflow-hidden rounded transition-shadow ${
                active
                  ? "ring-2 ring-[color:var(--accent)]"
                  : "ring-1 ring-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:ring-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
              }`}
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
              <span className="pointer-events-none absolute left-0.5 top-0.5">
                <StatusDot onImage size={5} status={comp.status} />
              </span>
              <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                <button
                  aria-label="Duplicate artboard"
                  className="flex h-4 w-4 items-center justify-center rounded bg-black/65 text-[10px] text-white hover:bg-black/85"
                  onClick={() => duplicate(comp)}
                  title="Duplicate"
                  type="button"
                >
                  ⧉
                </button>
                <button
                  aria-label="Delete artboard"
                  className="flex h-4 w-4 items-center justify-center rounded bg-black/65 text-[10px] text-white hover:bg-[color:var(--destructive)]"
                  onClick={() => {
                    if (window.confirm(`Delete “${comp.name}”?`)) {
                      deleteComp(comp.id);
                    }
                  }}
                  title="Delete"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* New artboard — a small dashed tile at the end of the strip */}
        <button
          aria-label="New artboard"
          className="flex h-12 w-9 shrink-0 items-center justify-center rounded border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] text-base text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] hover:text-foreground"
          onClick={() => scrollBy(280)}
          type="button"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
