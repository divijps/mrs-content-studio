import * as React from "react";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";

import type { ToolcraftCommand } from "@/toolcraft/runtime";
import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { ControlFieldLabel } from "@/toolcraft/ui";

import { ELEMENT_SPACING_MAX } from "./comp-layout";

const STEP = 8; // canvas px per click
const HOLD_DELAY = 350; // ms before repeat kicks in
const HOLD_INTERVAL = 70; // ms between repeats

type Edge = "top" | "bottom";
type Space = { bottom?: number; top?: number };

// Press-and-hold auto-repeat lives in module scope (only one arrow is ever held
// at a time) so this control stays hook-free — a hard requirement in the element
// Content menu, which mounts/unmounts with selection.
let holdTimeout: ReturnType<typeof setTimeout> | null = null;
let holdInterval: ReturnType<typeof setInterval> | null = null;
function stopHold(): void {
  if (holdTimeout) {
    clearTimeout(holdTimeout);
  }
  if (holdInterval) {
    clearInterval(holdInterval);
  }
  holdTimeout = null;
  holdInterval = null;
}
// Latest committed values per `${kind}.${edge}` so rapid repeats accumulate even
// before React re-renders with the new value.
const live = new Map<string, number>();

const clamp = (value: number): number => Math.max(0, Math.min(ELEMENT_SPACING_MAX, value));

/**
 * Per-element spacing — "Above" / "Below" steppers (canvas px) in the element
 * Content menu. Add-only: nudges one element within the flow; a lone element's
 * top/bottom still offsets it from its placement anchor. Hold an arrow to keep
 * stepping. Reads the focused element from ui.selectedElement and writes the
 * `${kind}.space` object.
 */
export const ElementSpacingControl: ToolcraftCustomControlRenderer = ({ dispatch, state }) => {
  const selected = state.values["ui.selectedElement"];
  const kind = typeof selected === "string" ? selected : "";
  if (!kind) {
    return <></>;
  }

  const target = `${kind}.space`;
  const raw = state.values[target];
  const space: Space = raw && typeof raw === "object" ? (raw as Space) : {};
  const top = clamp(typeof space.top === "number" ? space.top : 0);
  const bottom = clamp(typeof space.bottom === "number" ? space.bottom : 0);
  live.set(`${kind}.top`, top);
  live.set(`${kind}.bottom`, bottom);

  const step = (edge: Edge, dir: 1 | -1): void => {
    const key = `${kind}.${edge}`;
    const current = live.get(key) ?? 0;
    const next = clamp(current + dir * STEP);
    if (next === current) {
      return;
    }
    live.set(key, next);
    const nextSpace = {
      bottom: edge === "bottom" ? next : bottom,
      top: edge === "top" ? next : top,
    };
    dispatch({
      history: "merge",
      historyGroup: `element-space-${kind}-${edge}`,
      label: "Element spacing",
      target,
      type: "controls.setValue",
      value: nextSpace,
    } as ToolcraftCommand);
  };

  const startHold = (edge: Edge, dir: 1 | -1): void => {
    stopHold();
    step(edge, dir); // immediate first step
    window.addEventListener("pointerup", stopHold, { once: true });
    holdTimeout = setTimeout(() => {
      holdInterval = setInterval(() => step(edge, dir), HOLD_INTERVAL);
    }, HOLD_DELAY);
  };

  const arrowClass =
    "flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--border)_25%,transparent)] text-foreground transition-colors hover:border-[color:var(--accent)] active:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] disabled:opacity-35";

  const row = (label: string, edge: Edge, value: number): React.JSX.Element => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-2xs uppercase tracking-[0.12em] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          aria-label={`Decrease space ${label.toLowerCase()}`}
          className={arrowClass}
          disabled={value <= 0}
          onPointerDown={() => startHold(edge, -1)}
          onPointerLeave={stopHold}
          onPointerUp={stopHold}
          type="button"
        >
          <CaretDownIcon />
        </button>
        <span className="w-10 text-center text-xs-plus tabular-nums text-foreground">{value}</span>
        <button
          aria-label={`Increase space ${label.toLowerCase()}`}
          className={arrowClass}
          disabled={value >= ELEMENT_SPACING_MAX}
          onPointerDown={() => startHold(edge, 1)}
          onPointerLeave={stopHold}
          onPointerUp={stopHold}
          type="button"
        >
          <CaretUpIcon />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>Spacing</ControlFieldLabel>
      <div className="flex flex-col gap-2 rounded-lg border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] p-2.5">
        {row("Above", "top", top)}
        {row("Below", "bottom", bottom)}
      </div>
    </div>
  );
};
