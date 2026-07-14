import * as React from "react";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { Button, Slider } from "@/toolcraft/ui";

import { getFormat } from "../data/formats";
import { useProject } from "../data/project-store";
import { setPlaying, useVideoPlayback } from "./video-playback";

/**
 * Media position pad — a single abstract surface in the Toolcraft design
 * language (user mock 2026-07-12): a faint grid, a draggable dot for the focal
 * point, and a ring that tightens as you zoom so the crop is legible at a
 * glance. No image preview, no frame outline, no second surface.
 *
 * The dot's position is stored relative to the source (focal 0–1), so it holds
 * across every format and batch export. Zoom is capped to what the source can
 * fill without visible upscaling (quality-aware — no warnings needed). Video
 * adds a play/scrub row whose moment is the design's still (image.posterTime).
 *
 * Custom control (documented builtInFitCheck): Toolcraft ships no 2D
 * position/pad primitive, and the value model spans focal X/Y + zoom + poster
 * time across sibling targets.
 */
export const MediaPositionControl: ToolcraftCustomControlRenderer = ({
  dispatch,
  setValue,
  state,
  value,
}) => {
  const project = useProject();
  const playback = useVideoPlayback();

  const readNumber = (target: string, fallback: number): number => {
    const raw = state.values[target];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  };
  const assetId =
    typeof state.values["image.assetId"] === "string"
      ? (state.values["image.assetId"] as string)
      : "";
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  const focalX = readNumber("image.focalX", 50) / 100;
  const focalY = readNumber("image.focalY", 42) / 100;
  const posterTime = readNumber("image.posterTime", 0);
  const formatId =
    typeof state.values["format.active"] === "string"
      ? (state.values["format.active"] as string)
      : "ig-post";
  const format = getFormat(formatId);

  const padRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef<number | null>(null);

  if (!asset) {
    return (
      <p className="text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        Pick a photo or video above to position it.
      </p>
    );
  }

  const naturalWidth = Math.max(1, asset.width);
  const naturalHeight = Math.max(1, asset.height);
  // Cover-fit at zoom 1; zoom multiplies. Cap zoom where the crop would start
  // upscaling past the source (quality-aware), but always allow a modest
  // creative push even on low-res footage, and never more than 4×.
  const baseCoverFit = Math.max(
    format.width / naturalWidth,
    format.height / naturalHeight,
  );
  const maxZoom = Math.min(4, Math.max(1.5, Math.round((1 / baseCoverFit) * 10) / 10));
  const zoom = Math.min(maxZoom, Math.max(1, (typeof value === "number" ? value : 100) / 100));

  // The crop window as a fraction of the pad (= fraction of the frame the dot
  // keeps in view). Shrinks as zoom grows — the ring makes that legible.
  const cropFraction = Math.min(1, 1 / zoom);
  // The pad is always SQUARE (standardized — a 9:16 pad ran too tall in the
  // panel). To stay intuitive, the crop ring instead carries the OUTPUT
  // format's aspect, fit inside the square: portrait formats read as a tall
  // ring, landscape as a wide one, at zoom 1 filling the square's long axis.
  const formatAspect = format.width / format.height;
  const ringWidth = (formatAspect >= 1 ? 1 : formatAspect) * cropFraction;
  const ringHeight = (formatAspect >= 1 ? 1 / formatAspect : 1) * cropFraction;

  const setFocalFromPointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    const pad = padRef.current;
    if (!pad) {
      return;
    }
    const rect = pad.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    dispatch({
      history: "merge",
      historyGroup: "media-position",
      target: "image.focalX",
      type: "controls.setValue",
      value: Math.round(nx * 100),
    });
    dispatch({
      history: "merge",
      historyGroup: "media-position",
      target: "image.focalY",
      type: "controls.setValue",
      value: Math.round(ny * 100),
    });
  };

  const durationSec = asset.durationSec || playback.duration || 0;
  const isVideo = asset.kind === "video";
  const scrubTime = playback.playing ? playback.currentTime : posterTime;

  return (
    <div className="flex flex-col gap-3">
      {/* Position pad: grid + draggable focal dot + zoom ring. */}
      <div
        className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-lg bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"
        onPointerDown={(event) => {
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Capture can fail on synthetic pointers — dragging still works.
          }
          draggingRef.current = event.pointerId;
          setFocalFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current === event.pointerId) {
            setFocalFromPointer(event);
          }
        }}
        onPointerUp={(event) => {
          if (draggingRef.current === event.pointerId) {
            draggingRef.current = null;
          }
        }}
        ref={padRef}
        style={{ aspectRatio: "1 / 1" }}
        title="Drag the dot to position the focus"
      >
        {/* Rule-of-thirds grid */}
        <div className="pointer-events-none absolute inset-0">
          {[1, 2].map((n) => (
            <React.Fragment key={n}>
              <span
                className="absolute top-0 bottom-0 w-px bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
                style={{ left: `${(n / 3) * 100}%` }}
              />
              <span
                className="absolute left-0 right-0 h-px bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
                style={{ top: `${(n / 3) * 100}%` }}
              />
            </React.Fragment>
          ))}
        </div>

        {/* Zoom ring — the crop window centered on the focal point. */}
        <span
          className="pointer-events-none absolute rounded-sm ring-1 ring-[color:color-mix(in_oklab,var(--foreground)_28%,transparent)]"
          style={{
            height: `${ringHeight * 100}%`,
            left: `${focalX * 100}%`,
            top: `${focalY * 100}%`,
            transform: "translate(-50%, -50%)",
            width: `${ringWidth * 100}%`,
          }}
        />

        {/* Focal dot */}
        <span
          className="pointer-events-none absolute h-3 w-3 rounded-full bg-[color:var(--accent)] ring-2 ring-[color:var(--background)]"
          style={{
            left: `${focalX * 100}%`,
            top: `${focalY * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>

      <Slider
        max={maxZoom}
        min={1}
        name="Zoom"
        onValueChange={(next) => setValue(Math.round(Number(next) * 100))}
        showFill
        step={0.1}
        unit="×"
        value={Math.round(zoom * 10) / 10}
      />

      {/* Video: scrub to judge the layout at any moment; the chosen moment is
          the design's still for thumbnails and image exports. */}
      {isVideo && durationSec > 0 ? (
        <div className="flex items-end gap-2">
          <Button
            className="w-10 shrink-0"
            onClick={() => setPlaying(!playback.playing)}
            size="sm"
            title={playback.playing ? "Pause" : "Play the clip on the canvas"}
            variant="outline"
          >
            {playback.playing ? "❚❚" : "▶"}
          </Button>
          <div className="min-w-0 flex-1">
            <Slider
              max={Math.max(0.1, Math.round((durationSec - 0.05) * 10) / 10)}
              min={0}
              name="Moment"
              onValueChange={(next) => {
                setPlaying(false);
                dispatch({
                  history: "merge",
                  historyGroup: "media-poster-time",
                  target: "image.posterTime",
                  type: "controls.setValue",
                  value: Number(next),
                });
              }}
              showFill
              step={0.05}
              unit="s"
              value={Math.round(Math.min(scrubTime, durationSec) * 20) / 20}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
