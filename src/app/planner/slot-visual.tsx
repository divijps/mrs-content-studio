import * as React from "react";

import { useProject } from "../data/project-store";
import { STUDIO_DEFAULTS, type StudioValues } from "../studio/comp-layout";
import { buildCompSvg } from "../studio/comp-svg";
import type { PlannerGridSlot } from "../data/types";

/**
 * Renders a planner slot's visual: a comp (via buildCompSvg at the given
 * format) or a library asset (cover-cropped at its focal point), or a labelled
 * placeholder for planned-but-unmade content. Fills its container.
 */
export function SlotVisual(props: {
  formatId: string;
  slot: PlannerGridSlot;
}): React.JSX.Element {
  const project = useProject();
  const comp = props.slot.compId
    ? project.comps.find((candidate) => candidate.id === props.slot.compId)
    : undefined;
  const asset = props.slot.assetId
    ? project.assets.find((candidate) => candidate.id === props.slot.assetId)
    : undefined;

  const compValues: StudioValues | null = comp
    ? {
        ...STUDIO_DEFAULTS,
        ...(comp.sourceValues as Partial<StudioValues> | undefined),
        formatId: props.formatId,
      }
    : null;

  const svg = React.useMemo(() => {
    if (!compValues) {
      return null;
    }
    const built = buildCompSvg({
      assets: project.assets,
      brand: project.brand,
      values: compValues,
    }).svg;
    // Make the SVG fill its tile and cover-crop (matches how IG center-crops
    // posts into the square profile grid).
    return built
      .replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ')
      .replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compValues ? JSON.stringify(compValues) : null, project.assets, project.brand]);

  if (svg) {
    return (
      <div
        className="absolute inset-0 overflow-hidden [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  if (asset) {
    return (
      <img
        alt={asset.name}
        className="absolute inset-0 h-full w-full object-cover"
        src={asset.thumbUrl}
        style={{
          objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%`,
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] p-2">
      <span className="text-center text-2xs text-muted-foreground">
        {props.slot.label ?? "Planned"}
      </span>
    </div>
  );
}
