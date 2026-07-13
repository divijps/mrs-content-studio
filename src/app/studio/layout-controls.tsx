import * as React from "react";

import type { ToolcraftCommand } from "@/toolcraft/runtime";
import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { ControlFieldLabel } from "@/toolcraft/ui";

import type { LayoutAnchorX, LayoutAnchorY, LayoutDistribution } from "./comp-layout";

/** The 9 placement cells, in reading order, with their directional glyph. */
const CELLS: { glyph: string; x: LayoutAnchorX; y: LayoutAnchorY }[] = [
  { glyph: "↖", x: "left", y: "top" },
  { glyph: "↑", x: "center", y: "top" },
  { glyph: "↗", x: "right", y: "top" },
  { glyph: "←", x: "left", y: "middle" },
  { glyph: "•", x: "center", y: "middle" },
  { glyph: "→", x: "right", y: "middle" },
  { glyph: "↙", x: "left", y: "bottom" },
  { glyph: "↓", x: "center", y: "bottom" },
  { glyph: "↘", x: "right", y: "bottom" },
];

/**
 * Placement grid — a 3×3 anchor picker (ref: the directional pad). Tapping a
 * cell moves the whole text block to that corner/edge/center AND sets the text
 * alignment to match the horizontal direction (so it "just reads right"); the
 * Alignment control below can still override alignment on its own.
 *
 * Hook-free — reads anchorX/anchorY from runtime values and dispatches all three
 * targets under one history group, so it's safe flattened into ControlsPanel.
 */
export const PlacementControl: ToolcraftCustomControlRenderer = ({
  dispatch,
  name,
  state,
}) => {
  const title = typeof name === "string" && name ? name : "Placement";
  const anchorX = (state.values["layout.anchorX"] as LayoutAnchorX) ?? "left";
  const anchorY = (state.values["layout.anchorY"] as LayoutAnchorY) ?? "bottom";

  const choose = (x: LayoutAnchorX, y: LayoutAnchorY): void => {
    const group = `placement-${x}-${y}`;
    const set = (target: string, value: string): void =>
      dispatch({
        history: "merge",
        historyGroup: group,
        label: "Placement",
        target,
        type: "controls.setValue",
        value,
      } as ToolcraftCommand);
    set("layout.anchorX", x);
    set("layout.anchorY", y);
    // Alignment follows the chosen direction; the Alignment control overrides.
    set("layout.align", x);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {CELLS.map((cell) => {
          const active = cell.x === anchorX && cell.y === anchorY;
          return (
            <button
              aria-label={`${cell.y} ${cell.x}`}
              aria-pressed={active}
              className={`flex aspect-square items-center justify-center rounded-lg border text-lg transition-colors ${
                active
                  ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--background)]"
                  : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:border-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] hover:text-foreground"
              }`}
              key={`${cell.x}-${cell.y}`}
              onClick={() => choose(cell.x, cell.y)}
              type="button"
            >
              {cell.glyph}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Mini bar-diagram for a distribution mode (ref: the distribution swatches). */
function DistributionGlyph({ mode }: { mode: LayoutDistribution }): React.JSX.Element {
  // Three bars whose vertical positions illustrate the spacing behavior.
  const ys =
    mode === "stack"
      ? [9, 12.5, 16]
      : mode === "spread"
        ? [5, 12.5, 20]
        : [6, 9.5, 19]; // grouped: two tight + one apart
  return (
    <svg aria-hidden height="25" viewBox="0 0 34 25" width="34">
      {ys.map((y, index) => (
        <rect
          fill="currentColor"
          height="2.4"
          key={index}
          rx="1.2"
          width={index === 1 && mode !== "stack" ? 22 : 16}
          x={(34 - (index === 1 && mode !== "stack" ? 22 : 16)) / 2}
          y={y}
        />
      ))}
    </svg>
  );
}

const MODES: { label: string; mode: LayoutDistribution }[] = [
  { label: "Stack", mode: "stack" },
  { label: "Spread", mode: "spread" },
  { label: "Grouped", mode: "grouped" },
];

/**
 * Distribution — how stacked elements share the zone's height. Stack keeps them
 * tight at the placement anchor; Spread fills the zone evenly; Grouped fills it
 * but keeps grouped elements (see the Elements panel) tight.
 *
 * Hook-free.
 */
export const DistributionControl: ToolcraftCustomControlRenderer = ({
  name,
  setValue,
  value,
}) => {
  const title = typeof name === "string" && name ? name : "Distribution";
  const current = (typeof value === "string" ? value : "stack") as LayoutDistribution;
  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {MODES.map((option) => {
          const active = current === option.mode;
          return (
            <button
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors ${
                active
                  ? "border-[color:var(--foreground)] text-foreground"
                  : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-muted-foreground hover:border-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] hover:text-foreground"
              }`}
              key={option.mode}
              onClick={() => setValue(option.mode)}
              type="button"
            >
              <DistributionGlyph mode={option.mode} />
              <span className="text-2xs">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
