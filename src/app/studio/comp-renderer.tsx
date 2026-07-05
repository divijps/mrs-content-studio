import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import { getFormat } from "../data/formats";
import { consumeStudioImage, useProject } from "../data/project-store";
import { readStudioValues } from "./comp-layout";
import { buildCompSvg } from "./comp-svg";

/**
 * Keeps runtime canvas size in sync with the selected platform format.
 * Users can still override via Setup; picking a format re-asserts its native size.
 */
function useFormatCanvasSync(formatId: string): void {
  const { dispatch, state } = useToolcraft();
  const canvasWidth = state.canvas.size.width;
  const canvasHeight = state.canvas.size.height;

  // Continuous reconcile: the Format select owns canvas size. Undoing a format
  // change restores the select value AND this effect re-syncs the canvas, so
  // the two can never drift apart.
  React.useEffect(() => {
    const format = getFormat(formatId);
    if (canvasWidth === format.width && canvasHeight === format.height) {
      return;
    }
    dispatch({
      size: { height: format.height, unit: "px", width: format.width },
      type: "canvas.setSize",
    });
  }, [dispatch, formatId, canvasWidth, canvasHeight]);
}

function useBrandFontsReady(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      document.fonts.load("400 24px Romie"),
      document.fonts.load("italic 400 24px Romie"),
      document.fonts.load("600 24px 'Rework Micro'"),
      document.fonts.load("400 24px 'Onsite Standard'"),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

/** Safe-zone shading: preview-only guide, never part of export output. */
function SafeZoneGuides(props: { formatId: string }): React.JSX.Element | null {
  const format = getFormat(props.formatId);
  const zones = format.safeZones;
  if (!zones.top && !zones.bottom && !zones.left && !zones.right) {
    return null;
  }
  const shade = "rgba(12,140,233,0.14)";
  const line = "rgba(12,140,233,0.55)";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {zones.top > 0 ? (
        <div
          style={{
            background: shade,
            borderBottom: `1px dashed ${line}`,
            height: zones.top,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
      ) : null}
      {zones.bottom > 0 ? (
        <div
          style={{
            background: shade,
            borderTop: `1px dashed ${line}`,
            bottom: 0,
            height: zones.bottom,
            left: 0,
            position: "absolute",
            right: 0,
          }}
        />
      ) : null}
      {zones.left > 0 ? (
        <div
          style={{
            background: shade,
            bottom: zones.bottom,
            left: 0,
            position: "absolute",
            top: zones.top,
            width: zones.left,
          }}
        />
      ) : null}
      {zones.right > 0 ? (
        <div
          style={{
            background: shade,
            bottom: zones.bottom,
            position: "absolute",
            right: 0,
            top: zones.top,
            width: zones.right,
          }}
        />
      ) : null}
    </div>
  );
}

export function CompRenderer(): React.JSX.Element {
  const { dispatch, state } = useToolcraft();
  const project = useProject();
  const fontsReady = useBrandFontsReady();
  const values = readStudioValues(state.values);
  const format = getFormat(values.formatId);

  useFormatCanvasSync(values.formatId);

  // Consume a "Use in Studio" request from the Library.
  React.useEffect(() => {
    const assetId = consumeStudioImage();
    if (!assetId) {
      return;
    }
    dispatch({ target: "image.include", type: "controls.setValue", value: true });
    dispatch({
      history: "merge",
      historyGroup: "use-in-studio",
      target: "image.assetId",
      type: "controls.setValue",
      value: assetId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });
  const valuesKey = JSON.stringify(values);
  const svg = React.useMemo(() => {
    if (!fontsReady) {
      return null;
    }
    return buildCompSvg({
      assets: project.assets,
      brand: project.brand,
      format,
      values: includeBackground ? values : { ...values, backgroundHex: "transparent" },
    }).svg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, project.assets, project.brand, format.id, includeBackground, fontsReady]);

  // The comp is authored at the format's native size; if the user overrides the
  // canvas size in Setup, scale the artwork to fill the current canvas.
  const scaleX = state.canvas.size.width / format.width;
  const scaleY = state.canvas.size.height / format.height;

  return (
    <div className="absolute inset-0 overflow-hidden" data-toolcraft-product-output="">
      {svg ? (
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{
            height: format.height,
            left: 0,
            position: "absolute",
            top: 0,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: "top left",
            width: format.width,
          }}
        />
      ) : null}
      {values.guides ? <SafeZoneGuides formatId={values.formatId} /> : null}
    </div>
  );
}
