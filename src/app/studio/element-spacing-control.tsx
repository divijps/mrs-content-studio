import * as React from "react";

import type { ToolcraftCommand } from "@/toolcraft/runtime";
import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { Slider } from "@/toolcraft/ui";

import { ELEMENT_SPACING_MAX } from "./comp-layout";

const STEP = 8; // canvas px per slider step

type Space = { bottom?: number; top?: number };

/**
 * One bipolar spacing slider centered at 0 (canvas px): drag left to add space
 * ABOVE, right to add space BELOW; the midpoint is no extra space. Stored as the
 * `{top, bottom}` object the renderer reads (only one side is ever non-zero).
 *
 * Renderer bodies that use this stay hook-free (a hard requirement in the
 * `visibleWhen`-gated element menu); the nested `<Slider>` is a real child
 * component and manages its own hooks.
 */
function SpacingSlider(props: {
  dispatch: React.Dispatch<ToolcraftCommand>;
  historyGroup: string;
  space: Space;
  target: string;
}): React.JSX.Element {
  const top = clamp(typeof props.space.top === "number" ? props.space.top : 0);
  const bottom = clamp(typeof props.space.bottom === "number" ? props.space.bottom : 0);
  // Collapse the two sides into one signed value: below is positive, above is
  // negative. (Legacy values with both set prefer below; the next drag resolves
  // it to one-sided.)
  const signed = bottom > 0 ? bottom : top > 0 ? -top : 0;
  const label =
    signed > 0 ? `Below ${signed}` : signed < 0 ? `Above ${Math.abs(signed)}` : "None";

  const apply = (next: number, meta?: { history: "merge"; historyGroup: string }): void => {
    const value = next >= 0 ? { bottom: next, top: 0 } : { bottom: 0, top: -next };
    props.dispatch({
      history: meta?.history ?? "merge",
      historyGroup: meta?.historyGroup ?? props.historyGroup,
      label: "Spacing",
      target: props.target,
      type: "controls.setValue",
      value,
    } as ToolcraftCommand);
  };

  return (
    <Slider
      baseValue={0}
      markerCount={3}
      max={ELEMENT_SPACING_MAX}
      min={-ELEMENT_SPACING_MAX}
      name="Spacing"
      onValueChange={(next, meta) =>
        apply(
          Math.round(Number(next)),
          meta?.historyGroup
            ? { history: "merge", historyGroup: meta.historyGroup }
            : undefined,
        )
      }
      step={STEP}
      value={signed}
      valueLabel={label}
    />
  );
}

/**
 * Per-element spacing (element Content menu) — adds space above/below the one
 * selected element, keyed by `${kind}.space`.
 */
export const ElementSpacingControl: ToolcraftCustomControlRenderer = ({ dispatch, state }) => {
  const selected = state.values["ui.selectedElement"];
  const kind = typeof selected === "string" ? selected : "";
  if (!kind) {
    return <></>;
  }
  const target = `${kind}.space`;
  const raw = state.values[target];
  return (
    <SpacingSlider
      dispatch={dispatch}
      historyGroup={`element-space-${kind}`}
      space={raw && typeof raw === "object" ? (raw as Space) : {}}
      target={target}
    />
  );
};

/**
 * Global spacing (Layout panel) — the same above/below slider, but the offset
 * is added to EVERY stacked element at once (on top of any per-element nudge).
 * Written to `layout.spaceAll`; the renderer folds it into every seam.
 */
export const LayoutSpacingControl: ToolcraftCustomControlRenderer = ({ dispatch, state }) => {
  const raw = state.values["layout.spaceAll"];
  return (
    <SpacingSlider
      dispatch={dispatch}
      historyGroup="layout-space-all"
      space={raw && typeof raw === "object" ? (raw as Space) : {}}
      target="layout.spaceAll"
    />
  );
};

function clamp(value: number): number {
  return Math.max(0, Math.min(ELEMENT_SPACING_MAX, Math.round(value)));
}
