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
 * Buzz-style artboard rail beneath the Studio canvas. Each tile is a live
 * comp; clicking one loads it into the editor (via activeArtboardId, which
 * CompRenderer syncs). New / Duplicate / Delete manage the set.
 */
export function ArtboardTray(): React.JSX.Element {
  const project = useProject();
  const activeId = project.activeArtboardId;
  const comps = project.comps;

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
    <div className="flex h-[124px] shrink-0 items-stretch gap-3 border-t border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))] px-4 py-3">
      <div className="flex w-24 shrink-0 flex-col justify-center gap-0.5">
        <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
          Artboards
        </span>
        <span className="text-sm font-medium leading-none">{comps.length}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-3 overflow-x-auto pb-1">
        {/* New artboard — a dashed add tile matching the thumbnails */}
        <button
          className="flex h-[76px] w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_40%,transparent)] text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
          onClick={addBlank}
          title="New artboard"
          type="button"
        >
          <span className="text-lg leading-none">+</span>
          <span className="text-[10px] leading-none">New</span>
        </button>

        {comps.map((comp) => {
          const active = comp.id === activeId;
          return (
            <div className="group flex shrink-0 flex-col gap-1" key={comp.id}>
              <div
                className={`relative h-[76px] overflow-hidden rounded-md transition-shadow ${
                  active
                    ? "ring-2 ring-[color:var(--accent)]"
                    : "ring-1 ring-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:ring-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
                }`}
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
                <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
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
              {/* Caption below the thumbnail — status dot + name, never over the art */}
              <div className="flex max-w-[112px] items-center gap-1.5 px-0.5">
                <StatusDot size={6} status={comp.status} />
                <span
                  className={`truncate text-[10px] ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {comp.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
