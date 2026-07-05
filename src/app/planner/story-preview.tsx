import * as React from "react";

import { MRS_LOGO_URLS } from "../data/brand-kit";
import { getFormat } from "../data/formats";
import type { PlannerGridSlot } from "../data/types";
import { SlotVisual } from "./slot-visual";

/**
 * Story preview inside a phone frame with real Instagram chrome: segmented
 * progress bar (one per story), avatar + handle, and the reply bar. The story
 * safe zones are shaded so the team can see content stays clear of the UI —
 * proving the guarantee visually, not just in the export math.
 */
export function StoryPreview(props: {
  index: number;
  onStep: (index: number) => void;
  showSafeZones: boolean;
  slots: PlannerGridSlot[];
}): React.JSX.Element {
  const { index, slots } = props;
  const format = getFormat("ig-story");
  const active = slots[index];

  // Safe-zone insets as a percentage of the 1080×1920 story canvas.
  const topPct = (format.safeZones.top / format.height) * 100;
  const bottomPct = (format.safeZones.bottom / format.height) * 100;
  const sidePct = (format.safeZones.left / format.width) * 100;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative overflow-hidden rounded-[28px] border-[6px] border-[#111] bg-black shadow-2xl"
        style={{ aspectRatio: "9 / 16", width: 300 }}
      >
        {active ? (
          <SlotVisual formatId="ig-story" slot={active} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-2xs text-white/50">
            Add a story below
          </div>
        )}

        {/* Safe-zone shading */}
        {props.showSafeZones ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-[rgba(12,140,233,0.16)]" style={{ height: `${topPct}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-[rgba(12,140,233,0.16)]" style={{ height: `${bottomPct}%` }} />
            <div className="absolute bottom-0 left-0 top-0 bg-[rgba(12,140,233,0.1)]" style={{ width: `${sidePct}%` }} />
            <div className="absolute bottom-0 right-0 top-0 bg-[rgba(12,140,233,0.1)]" style={{ width: `${sidePct}%` }} />
          </div>
        ) : null}

        {/* IG chrome — progress segments */}
        <div className="absolute inset-x-0 top-0 flex gap-1 p-2">
          {slots.length > 0
            ? slots.map((slot, slotIndex) => (
                <span
                  className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35"
                  key={slot.id}
                >
                  <span
                    className="block h-full bg-white"
                    style={{ width: slotIndex <= index ? "100%" : "0%" }}
                  />
                </span>
              ))
            : null}
        </div>

        {/* Avatar + handle */}
        <div className="absolute left-2 top-4 flex items-center gap-2">
          <img
            alt=""
            className="h-6 w-6 rounded-full border border-white/70 bg-black object-cover p-0.5 invert"
            src={MRS_LOGO_URLS.motif}
          />
          <span className="text-2xs font-semibold text-white drop-shadow">mrs</span>
          <span className="text-2xs text-white/70">now</span>
        </div>

        {/* Reply bar */}
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-2">
          <span className="flex-1 rounded-full border border-white/40 px-3 py-1.5 text-2xs text-white/70">
            Send message
          </span>
          <span className="text-white/80">♡</span>
          <span className="text-white/80">➤</span>
        </div>

        {/* Tap zones to step */}
        <button
          aria-label="Previous story"
          className="absolute inset-y-0 left-0 w-1/3"
          onClick={() => props.onStep(Math.max(0, index - 1))}
          type="button"
        />
        <button
          aria-label="Next story"
          className="absolute inset-y-0 right-0 w-1/3"
          onClick={() => props.onStep(Math.min(slots.length - 1, index + 1))}
          type="button"
        />
      </div>
      <span className="text-2xs text-muted-foreground">
        {slots.length > 0 ? `Story ${index + 1} of ${slots.length}` : "No stories yet"} · tap
        edges to step
      </span>
    </div>
  );
}
