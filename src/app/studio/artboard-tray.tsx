import * as React from "react";

import { Button } from "@/toolcraft/ui";

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
    <div className="flex h-[104px] shrink-0 items-stretch gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] px-3 py-2">
      <div className="flex shrink-0 flex-col justify-between py-0.5">
        <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
          Artboards ({comps.length})
        </span>
        <Button onClick={addBlank} size="sm" type="button" variant="outline">
          + New artboard
        </Button>
      </div>

      <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto">
        {comps.length === 0 ? (
          <div className="flex items-center px-2 text-2xs text-muted-foreground">
            No artboards yet — “New artboard” starts one.
          </div>
        ) : (
          comps.map((comp) => {
            const active = comp.id === activeId;
            return (
              <div
                className={`group relative flex h-full shrink-0 overflow-hidden rounded-md border transition-colors ${
                  active
                    ? "border-[color:var(--accent)] ring-1 ring-[color:color-mix(in_oklab,var(--accent)_45%,transparent)]"
                    : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_40%,transparent)]"
                }`}
                key={comp.id}
              >
                <button
                  aria-label={`Edit ${comp.name}`}
                  aria-pressed={active}
                  className="flex h-full items-stretch"
                  onClick={() => setActiveArtboard(comp.id)}
                  title={comp.name}
                  type="button"
                >
                  <ArtboardThumb comp={comp} />
                </button>
                {/* Status + hover controls */}
                <span className="pointer-events-none absolute left-1 top-1">
                  <StatusDot onImage size={7} status={comp.status} />
                </span>
                <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                  <button
                    aria-label="Duplicate artboard"
                    className="flex h-4 w-4 items-center justify-center rounded bg-black/60 text-[10px] text-white hover:bg-black/80"
                    onClick={() => duplicate(comp)}
                    title="Duplicate"
                    type="button"
                  >
                    ⧉
                  </button>
                  <button
                    aria-label="Delete artboard"
                    className="flex h-4 w-4 items-center justify-center rounded bg-black/60 text-[10px] text-white hover:bg-[color:var(--destructive)]"
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
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-0.5 pt-2 text-[10px] text-white">
                  {comp.name}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
