import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import { getFormat } from "../data/formats";
import {
  consumeStudioDesign,
  consumeStudioImage,
  getProjectSnapshot,
  setActiveArtboard,
  setStudioCompOrigin,
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
import {
  reportDuration,
  reportPlayhead,
  setPlaying,
  useVideoPlayback,
} from "./video-playback";
import type { Asset } from "../data/types";
import type { PlatformFormat } from "../data/formats";

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

  const prevActiveRef = React.useRef<string | null>(activeId);
  const valuesRef = React.useRef(values);
  valuesRef.current = values;
  const runtimeKey = studioValuesKey(values);

  // Keep the editor BOUND to a real artboard at all times. The binding is not
  // persisted across reloads (and a bound comp can vanish via a remote
  // delete), and an unbound editor silently saves nowhere — the "my design
  // only saved when I added a new artboard" trap. Whenever the active id is
  // missing or stale: bind to the comp whose stored values match the canvas
  // exactly (the usual case after a reload — autosave wrote it last session),
  // else adopt the current canvas as a new artboard so the work is kept.
  React.useEffect(() => {
    const snap = getProjectSnapshot();
    if (
      snap.activeArtboardId &&
      snap.comps.some((comp) => comp.id === snap.activeArtboardId)
    ) {
      return;
    }
    const mine = snap.comps.filter(
      (comp) => !comp.ownerId || comp.ownerId === snap.settings.userId,
    );
    const currentKey = studioValuesKey(valuesRef.current);
    const match = mine.find(
      (comp) =>
        studioValuesKey({
          ...STUDIO_DEFAULTS,
          ...(comp.sourceValues as Partial<StudioValues> | undefined),
        }) === currentKey,
    );
    if (match) {
      // Binding to the matching comp is a no-op visually — same values, so
      // skip the switch-effect's reload by pre-setting prevActiveRef.
      prevActiveRef.current = match.id;
      setActiveArtboard(match.id);
      return;
    }
    // An untouched default canvas isn't work worth adopting — on a fresh
    // device a user with existing artboards should land on their first one
    // (loaded via the switch effect), not gain a duplicate default comp.
    if (mine.length > 0 && currentKey === studioValuesKey({ ...STUDIO_DEFAULTS })) {
      setActiveArtboard(mine[0]!.id);
      return;
    }
    const comp = studioValuesToComp(valuesRef.current);
    upsertComp(comp);
    prevActiveRef.current = comp.id;
    setActiveArtboard(comp.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, comps]);

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

  // Debounced autosave: whenever the live values differ from what the active
  // comp has stored, write them back (0.5s after the last change). Comparing
  // against the STORE — not a "load just happened" flag — cannot get stuck:
  // the load echo is equal by definition, and every divergence (a user edit,
  // or a normalization sweep right after load) is a real difference worth
  // persisting. The old flag-based skip wedged shut when normalization changed
  // values before the echo matched, which silently disabled autosave until the
  // next artboard switch — "edits only save when you add a new artboard".
  const activeComp = comps.find((comp) => comp.id === activeId);
  const storedKey = activeComp
    ? studioValuesKey({
        ...STUDIO_DEFAULTS,
        ...(activeComp.sourceValues as Partial<StudioValues> | undefined),
      })
    : null;
  React.useEffect(() => {
    if (!activeId || storedKey === null || runtimeKey === storedKey) {
      return;
    }
    const timer = setTimeout(() => {
      upsertComp(studioValuesToComp(valuesRef.current, activeId));
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeKey, storedKey, activeId]);

  // Flush any pending debounced save on unmount. Leaving Studio for another
  // section (or a remount) before the 0.5s debounce fires would otherwise drop
  // the last edit, so the comp — and its rail thumbnail — reads stale until the
  // next change. Runs only on unmount; reads the latest values via the ref.
  React.useEffect(() => {
    return () => {
      const snap = getProjectSnapshot();
      const id = snap.activeArtboardId;
      if (!id) {
        return;
      }
      const comp = snap.comps.find((candidate) => candidate.id === id);
      if (!comp) {
        return;
      }
      const key = studioValuesKey({
        ...STUDIO_DEFAULTS,
        ...(comp.sourceValues as Partial<StudioValues> | undefined),
      });
      if (studioValuesKey(valuesRef.current) !== key) {
        upsertComp(studioValuesToComp(valuesRef.current, id));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

/**
 * Live video on the design surface: the raw clip, cover-cropped with the same
 * focal/zoom math as the renderer, playing UNDER the design overlay (scrim +
 * text + logo). Playback/scrubbing is driven from the Media panel's pad via
 * the shared playback store; the paused position is the design's still moment.
 */
function LiveVideoLayer(props: {
  asset: Asset;
  format: PlatformFormat;
  posterTime: number;
  values: StudioValues;
}): React.JSX.Element {
  const { asset, format, posterTime, values } = props;
  const playback = useVideoPlayback();
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const naturalWidth = Math.max(1, asset.width);
  const naturalHeight = Math.max(1, asset.height);
  const scale =
    Math.max(format.width / naturalWidth, format.height / naturalHeight) *
    Math.max(1, values.imageZoom);
  const cropWidth = format.width / scale;
  const cropHeight = format.height / scale;
  const cropX = Math.min(
    Math.max(values.imageFocalX * naturalWidth - cropWidth / 2, 0),
    naturalWidth - cropWidth,
  );
  const cropY = Math.min(
    Math.max(values.imageFocalY * naturalHeight - cropHeight / 2, 0),
    naturalHeight - cropHeight,
  );

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playback.playing) {
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [playback.playing]);

  // While paused, the canvas sits on the design's chosen still moment.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || playback.playing) {
      return;
    }
    if (Math.abs(video.currentTime - posterTime) > 0.05) {
      video.currentTime = posterTime;
    }
  }, [posterTime, playback.playing]);

  React.useEffect(() => () => setPlaying(false), []);

  return (
    <div style={{ inset: 0, overflow: "hidden", position: "absolute" }}>
      <video
        loop
        muted
        onDurationChange={(event) => reportDuration(event.currentTarget.duration)}
        onLoadedMetadata={(event) => reportDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => reportPlayhead(event.currentTarget.currentTime)}
        playsInline
        preload="auto"
        ref={videoRef}
        src={asset.url}
        style={{
          height: `${(naturalHeight / cropHeight) * 100}%`,
          left: `${(-cropX / cropWidth) * 100}%`,
          maxWidth: "none",
          position: "absolute",
          top: `${(-cropY / cropHeight) * 100}%`,
          width: `${(naturalWidth / cropWidth) * 100}%`,
        }}
      />
    </div>
  );
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

  // Consume an "Edit in Studio" request: create the fresh artboard HERE (while
  // the editor is mounted) so useArtboardSync's switch effect loads it — the
  // whole design (layout + image + format) recalls into a new comp, and the
  // outgoing artboard keeps its own design. Creating it on the Library side
  // instead let the stale canvas autosave over the wrong comp.
  React.useEffect(() => {
    const design = consumeStudioDesign();
    if (!design) {
      return;
    }
    const comp = studioValuesToComp({
      ...STUDIO_DEFAULTS,
      ...(design.values as Partial<StudioValues>),
    } as StudioValues);
    upsertComp(comp);
    // Remember the asset this design came from, so re-saving versions it.
    if (design.originAssetId) {
      setStudioCompOrigin(comp.id, design.originAssetId);
    }
    setActiveArtboard(comp.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const renderAssets = useVideoPosterAssets(
    project.assets,
    [values.imageAssetId, ...values.imageAssetIds],
    { [values.imageAssetId]: values.videoPosterTime },
  );

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
    // The Background Include (transparent export) switch is retired too —
    // exports always carry the background now.
    if (state.values["export.includeBackground"] === false) {
      dispatch({
        history: "skip",
        target: "export.includeBackground",
        type: "controls.setValue",
        value: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePattern, liveStyle, liveInclude, liveFormat, state.values["export.includeBackground"]]);

  const includeBackground = shouldIncludeToolcraftPreviewBackground({ state });
  // videoPosterTime never reaches buildCompSvg directly — the chosen moment
  // shows via the live <video> (seeked from the prop) and via the debounced
  // poster in renderAssets. Excluding it keeps scrubbing the Moment slider from
  // rebuilding the SVG on every tick.
  const valuesKey = JSON.stringify({ ...values, videoPosterTime: 0 });
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

  // Video comps design over the LIVE clip: a real <video> under the design
  // overlay (scrim + text + logo on transparent), so play/scrub shows the
  // layout against any moment of the footage — exports are unaffected.
  const overlaySvg = React.useMemo(() => {
    if (!fontsReady || !isVideo) {
      return null;
    }
    return buildCompSvg({
      assets: renderAssets,
      brand: project.brand,
      format,
      omitBackgroundImage: true,
      values: { ...values, backgroundHex: "transparent" },
    }).svg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, renderAssets, project.brand, format.id, fontsReady, isVideo]);

  // The comp is authored at the format's native size; if the user overrides the
  // canvas size in Setup, scale the artwork to fill the current canvas.
  const scaleX = state.canvas.size.width / format.width;
  const scaleY = state.canvas.size.height / format.height;
  const artworkStyle: React.CSSProperties = {
    height: format.height,
    left: 0,
    position: "absolute",
    top: 0,
    transform: `scale(${scaleX}, ${scaleY})`,
    transformOrigin: "top left",
    width: format.width,
  };

  return (
    <div
      className="absolute inset-0 select-none overflow-hidden"
      data-toolcraft-product-output=""
      // iOS Safari can otherwise select/long-press the SVG design copy during a
      // touch drag and flash it as a big blob of selected text on the canvas.
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      {svg && isVideo && backgroundAsset && overlaySvg ? (
        <div style={artworkStyle}>
          <LiveVideoLayer
            asset={backgroundAsset}
            format={format}
            posterTime={values.videoPosterTime}
            values={values}
          />
          <div
            dangerouslySetInnerHTML={{ __html: overlaySvg }}
            style={{ inset: 0, position: "absolute" }}
          />
        </div>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} style={artworkStyle} />
      ) : null}
      {values.guides ? <SafeZoneGuides formatId={values.formatId} /> : null}
    </div>
  );
}
