import * as React from "react";

import type { ToolcraftCommand } from "@/toolcraft/runtime";
import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { ControlFieldLabel } from "@/toolcraft/ui";

import {
  ANCHOR_XS,
  ANCHOR_X_FRACTION,
  ANCHOR_YS,
  type LayoutAnchorX,
  type LayoutAnchorY,
  type LayoutDistribution,
  type LogoAnchor,
} from "./comp-layout";

/**
 * Placement grid — a 5×5 anchor picker (ref: a fine directional pad). Tapping a
 * cell anchors the whole text block at that fraction of the free space both ways
 * (0 / 25 / 50 / 75 / 100%) AND sets the text alignment to match the horizontal
 * side (so it "just reads right"); the Alignment control below still overrides.
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
    // Alignment follows the chosen side; the Alignment control still overrides.
    const fx = ANCHOR_X_FRACTION[x];
    set("layout.align", fx < 0.5 ? "left" : fx > 0.5 ? "right" : "center");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <div className="grid grid-cols-5 gap-1">
        {ANCHOR_YS.map((y) =>
          ANCHOR_XS.map((x) => {
            const active = x === anchorX && y === anchorY;
            return (
              <button
                aria-label={`${y} ${x}`}
                aria-pressed={active}
                className={`flex aspect-square items-center justify-center rounded-md border transition-colors ${
                  active
                    ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-[color:var(--background)]"
                    : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_35%,transparent)] hover:border-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] hover:text-foreground"
                }`}
                key={`${x}-${y}`}
                onClick={() => choose(x, y)}
                type="button"
              >
                <span className="h-1 w-1 rounded-full bg-current" />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
};

/** Mini bar-diagram for a distribution mode (ref: the distribution swatches). */
function DistributionGlyph({ mode }: { mode: LayoutDistribution }): React.JSX.Element {
  // Three bars whose vertical positions illustrate the spacing behavior:
  // Stack = tight together, Spaced = comfortable gaps, Spread = pushed apart.
  const ys =
    mode === "stack" ? [9, 12.5, 16] : mode === "spaced" ? [7, 12.5, 18] : [5, 12.5, 20];
  return (
    <svg aria-hidden height="25" viewBox="0 0 34 25" width="34">
      {ys.map((y, index) => (
        <rect fill="currentColor" height="2.4" key={index} rx="1.2" width="18" x="8" y={y} />
      ))}
    </svg>
  );
}

const MODES: { label: string; mode: LayoutDistribution }[] = [
  { label: "Stack", mode: "stack" },
  { label: "Spaced", mode: "spaced" },
  { label: "Spread", mode: "spread" },
];

/**
 * Distribution — how stacked elements share the zone's height. Stack keeps them
 * tight at the placement anchor; Spaced opens a comfortable, recommended gap
 * between them (still anchored); Spread pushes them to fill the zone edge to
 * edge. In every mode, elements grouped together (Elements panel) stay tight.
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

/** A mini box with a dot marking where the logo sits. */
function LogoCornerGlyph({ x, y }: { x: LayoutAnchorX; y: "top" | "bottom" }): React.JSX.Element {
  const cx = x === "left" ? 5 : x === "right" ? 19 : 12;
  const cy = y === "top" ? 6 : 18;
  return (
    <svg aria-hidden height="24" viewBox="0 0 24 24" width="24">
      <rect
        fill="none"
        height="20"
        rx="3"
        stroke="currentColor"
        strokeOpacity="0.25"
        width="20"
        x="2"
        y="2"
      />
      <circle cx={cx} cy={cy} fill="currentColor" r="2.6" />
    </svg>
  );
}

/**
 * Logo position — an OVERRIDE over the automatic placement. The logo defaults to
 * "Auto" (the renderer drops it on the edge opposite the text, aligned with it),
 * and this control only surfaces positions on the edge(s) the text does not
 * occupy — so it can never place the logo somewhere that collides or reads
 * cramped against the copy. Center-row positions are gone entirely.
 *
 * Hook-free: the Logo section is conditionally mounted, so no React hooks here.
 */
export const LogoPlacementControl: ToolcraftCustomControlRenderer = ({
  dispatch,
  name,
  state,
  value,
}) => {
  const title = typeof name === "string" && name ? name : "Position";
  const anchorY = (state.values["layout.anchorY"] as LayoutAnchorY) ?? "bottom";
  const fills = ((state.values["layout.distribution"] as LayoutDistribution) ?? "stack") !== "stack";
  // The text's vertical band is off-limits (unless it fills, where the layout
  // reserves the logo's edge either way — so both edges stay available). With the
  // 5-step grid, the two upper/lower stops count as top/bottom-leaning.
  const nearTop = anchorY === "top" || anchorY === "tm";
  const nearBottom = anchorY === "bottom" || anchorY === "bm";
  const ends: ("top" | "bottom")[] = [];
  if (fills || !nearTop) {
    ends.push("top");
  }
  if (fills || !nearBottom) {
    ends.push("bottom");
  }
  const current = typeof value === "string" ? (value as LogoAnchor) : "stack";

  const set = (next: LogoAnchor): void =>
    dispatch({
      history: "merge",
      historyGroup: "logo-anchor",
      target: "logo.anchor",
      type: "controls.setValue",
      value: next,
    } as ToolcraftCommand);

  const xs: LayoutAnchorX[] = ["left", "center", "right"];
  const pillClass = (on: boolean): string =>
    `rounded-lg border py-1.5 text-xs-plus transition-colors ${
      on
        ? "border-[color:var(--foreground)] text-foreground"
        : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>{title}</ControlFieldLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          aria-pressed={current === "stack"}
          className={pillClass(current === "stack")}
          onClick={() => set("stack")}
          title="Keep the logo in the element stack, like everything else"
          type="button"
        >
          Stack
        </button>
        <button
          aria-pressed={current === "auto"}
          className={pillClass(current === "auto")}
          onClick={() => set("auto")}
          title="Pin the logo automatically, opposite the text"
          type="button"
        >
          Auto
        </button>
      </div>
      {ends.map((end) => (
        <div className="grid grid-cols-3 gap-1.5" key={end}>
          {xs.map((x) => {
            const anchor = `${end}-${x}` as LogoAnchor;
            const active = current === anchor;
            return (
              <button
                aria-label={`${end} ${x}`}
                aria-pressed={active}
                className={`flex items-center justify-center rounded-lg border py-1 transition-colors ${
                  active
                    ? "border-[color:var(--foreground)] text-foreground"
                    : "border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:text-foreground"
                }`}
                key={x}
                onClick={() => set(anchor)}
                type="button"
              >
                <LogoCornerGlyph x={x} y={end} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
