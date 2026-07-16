import * as React from "react";

import { useProject } from "../data/project-store";
import { STUDIO_DEFAULTS, type StudioValues } from "../studio/comp-layout";
import { buildCompSvg } from "../studio/comp-svg";
import type { PlannerGridSlot, SlotCrop } from "../data/types";

/**
 * Percent-of-container geometry for a reframed cover: the object-position
 * model (left = (W - drawnW) · x) expressed in % so it needs no measured
 * pixels, and the export canvas can run the same formula in real pixels.
 */
export function cropGeometry(
  crop: SlotCrop,
  sourceAspect: number,
  boxAspect: number,
): { heightPct: number; leftPct: number; topPct: number; widthPct: number } {
  const widthPct =
    sourceAspect < boxAspect ? 100 * crop.scale : (100 * crop.scale * sourceAspect) / boxAspect;
  const heightPct =
    sourceAspect < boxAspect ? (100 * crop.scale * boxAspect) / sourceAspect : 100 * crop.scale;
  return {
    heightPct,
    leftPct: (100 - widthPct) * crop.x,
    topPct: (100 - heightPct) * crop.y,
    widthPct,
  };
}

/**
 * Renders a planner slot's visual: a comp (via buildCompSvg at the given
 * format) or a library asset (cover-cropped at its focal point — or at the
 * slot's manual reframe when one is set), or a labelled placeholder for
 * planned-but-unmade content. Fills its container. `playable` swaps a video
 * asset's poster for a real inline player (the feed pop-up stage).
 */
export function SlotVisual(props: {
  formatId: string;
  playable?: boolean;
  slot: Pick<PlannerGridSlot, "assetId" | "compId" | "label"> & { crop?: SlotCrop | null };
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
    if (props.playable && asset.kind === "video") {
      return (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          controls
          playsInline
          poster={asset.thumbUrl !== asset.url ? asset.thumbUrl : undefined}
          preload="metadata"
          src={asset.url}
          style={{
            objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%`,
          }}
        />
      );
    }
    const crop = props.slot.crop ?? null;
    if (crop && asset.width > 0 && asset.height > 0) {
      // Same crop model as the export, expressed as object-position (pan) +
      // scale about that point — algebraically identical to the percent
      // geometry when the box matches the format aspect, and when a layout
      // clamp deforms the box it degrades by CROPPING (object-cover), never
      // by stretching pixels or exposing gaps.
      return (
        <div className="absolute inset-0 overflow-hidden">
          <img
            alt={asset.name}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            src={asset.thumbUrl}
            style={{
              objectPosition: `${crop.x * 100}% ${crop.y * 100}%`,
              transform: crop.scale !== 1 ? `scale(${crop.scale})` : undefined,
              transformOrigin: `${crop.x * 100}% ${crop.y * 100}%`,
            }}
          />
        </div>
      );
    }
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
