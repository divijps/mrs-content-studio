import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import { getFormat } from "../data/formats";
import {
  consumeStudioImage,
  getProjectSnapshot,
  setActiveArtboard,
  upsertComp,
  useProject,
} from "../data/project-store";
import {
  readStudioValues,
  STUDIO_DEFAULTS,
  studioValuesKey,
  studioValuesToRuntime,
  type StudioValues,
} from "./comp-layout";
import { buildCompSvg } from "./comp-svg";
import { studioValuesToComp } from "./studio-actions";
import { useVideoPosterAssets } from "./video-poster";

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

/**
 * Buzz-style artboard sync. Artboards are comps; `activeArtboardId` says which
 * one the editor is bound to. When it changes we save the outgoing artboard's
 * latest edits and load the incoming one into the runtime; ongoing edits
 * autosave (debounced) back to the active comp so its tray thumbnail stays live.
 */
function useArtboardSync(values: StudioValues): void {
  const { dispatch } = useToolcraft();
  const project = useProject();
  const activeId = project.activeArtboardId;
  const comps = project.comps;

  const loadingRef = React.useRef(false);
  const justLoadedKeyRef = React.useRef<string | null>(null);
  const prevActiveRef = React.useRef<string | null>(activeId);
  const valuesRef = React.useRef(values);
  valuesRef.current = values;
  const runtimeKey = studioValuesKey(values);

  // No artboards of MINE yet → adopt the current canvas as my first one. Each
  // teammate keeps their own set; others' comps stay out of my Studio.
  React.useEffect(() => {
    const snap = getProjectSnapshot();
    const mine = snap.comps.filter(
      (comp) => !comp.ownerId || comp.ownerId === snap.settings.userId,
    );
    if (mine.length === 0) {
      const comp = studioValuesToComp(valuesRef.current);
      upsertComp(comp);
      justLoadedKeyRef.current = studioValuesKey(valuesRef.current);
      setActiveArtboard(comp.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active artboard switched → persist the old one, load the new one.
  React.useEffect(() => {
    if (activeId === prevActiveRef.current) {
      return;
    }
    const outgoing = prevActiveRef.current;
    prevActiveRef.current = activeId;
    if (outgoing && getProjectSnapshot().comps.some((comp) => comp.id === outgoing)) {
      upsertComp(studioValuesToComp(valuesRef.current, outgoing));
    }
    if (!activeId) {
      return;
    }
    const comp = getProjectSnapshot().comps.find((candidate) => candidate.id === activeId);
    if (!comp) {
      return;
    }
    const full: StudioValues = {
      ...STUDIO_DEFAULTS,
      ...(comp.sourceValues as Partial<StudioValues> | undefined),
    };
    loadingRef.current = true;
    justLoadedKeyRef.current = studioValuesKey(full);
    for (const [target, value] of studioValuesToRuntime(full)) {
      dispatch({
        history: "merge",
        historyGroup: `load-artboard-${activeId}`,
        target,
        type: "controls.setValue",
        value,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Debounced autosave of edits to the active artboard (skips the load echo).
  React.useEffect(() => {
    if (!activeId) {
      return;
    }
    if (loadingRef.current) {
      if (runtimeKey === justLoadedKeyRef.current) {
        loadingRef.current = false;
      }
      return;
    }
    if (runtimeKey === justLoadedKeyRef.current) {
      return;
    }
    if (!comps.some((comp) => comp.id === activeId)) {
      return;
    }
    const timer = setTimeout(() => {
      upsertComp(studioValuesToComp(valuesRef.current, activeId));
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeKey, activeId]);
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
  useArtboardSync(values);

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

  // Videos preview as a guaranteed poster frame (the stored thumb can be the
  // raw video file when import-time poster capture failed — unrenderable in
  // the SVG). Posters resolve async and swap in when ready.
  const renderAssets = useVideoPosterAssets(project.assets, [
    values.imageAssetId,
    ...values.imageAssetIds,
  ]);

  // Publish whether the background media is a video so the schema can swap
  // export sections (Export PNG ↔ Export MP4). Runtime state, not a user edit.
  const backgroundAsset = values.imageInclude
    ? project.assets.find((candidate) => candidate.id === values.imageAssetId)
    : undefined;
  const isVideo = backgroundAsset?.kind === "video";
  React.useEffect(() => {
    if (state.values["media.isVideo"] !== isVideo) {
      dispatch({
        history: "skip",
        target: "media.isVideo",
        type: "controls.setValue",
        value: isVideo,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  // The Studio is full-bleed-only (2026-07-11): the Framed style, layout
  // patterns, and the Media Include switch lost their controls, so normalize
  // any stale live values (persisted state or an old artboard) — otherwise a
  // user is stuck on a collage/framed/no-media comp with no way out. Saved
  // comps in Queue/Planner still render their stored values through the
  // shared SVG builder.
  const livePattern = state.values["layout.pattern"];
  const liveStyle = state.values["image.style"];
  const liveInclude = state.values["image.include"];
  const liveFormat = state.values["format.active"];
  React.useEffect(() => {
    if (livePattern !== undefined && livePattern !== "poster") {
      dispatch({
        history: "skip",
        target: "layout.pattern",
        type: "controls.setValue",
        value: "poster",
      });
    }
    if (liveStyle !== undefined && liveStyle !== "bleed") {
      dispatch({
        history: "skip",
        target: "image.style",
        type: "controls.setValue",
        value: "bleed",
      });
    }
    if (liveInclude === false) {
      dispatch({
        history: "skip",
        target: "image.include",
        type: "controls.setValue",
        value: true,
      });
    }
    // Email formats left the Studio's Format select (Email surface only) —
    // land any stale selection back on the social default. All email format
    // ids share the "email-" prefix by convention (formats.ts).
    if (typeof liveFormat === "string" && liveFormat.startsWith("email-")) {
      dispatch({
        history: "skip",
        target: "format.active",
        type: "controls.setValue",
        value: "ig-post",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePattern, liveStyle, liveInclude, liveFormat]);

  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });
  const valuesKey = JSON.stringify(values);
  const svg = React.useMemo(() => {
    if (!fontsReady) {
      return null;
    }
    return buildCompSvg({
      assets: renderAssets,
      brand: project.brand,
      format,
      values: includeBackground ? values : { ...values, backgroundHex: "transparent" },
    }).svg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, renderAssets, project.brand, format.id, includeBackground, fontsReady]);

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
