import * as React from "react";

import { ControlFieldLabel, inputVariants } from "@/toolcraft/ui";

import { CopyPickButton } from "./copy-pick-control";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

/** The brand's mid-dot separator (interpunct, U+00B7). */
const DOT = "·";

/**
 * Text input with a one-tap "·" insert. The subheading routinely reads like
 * "The July drop · linen & silk"; typing the interpunct is fiddly, so this
 * drops it (space-padded, no doubling) at the caret.
 *
 * Hook-free by design: the runtime invokes custom control renderers as plain
 * functions inside ControlsPanel's render, so any hook here would join that
 * component's hook list and break hook order when this (visibleWhen-gated)
 * control mounts/unmounts. We reach the input through the DOM instead.
 */
export const SeparatorTextControl: ToolcraftCustomControlRenderer = ({
  control,
  dispatch,
  setValue,
  value,
}) => {
  const text = typeof value === "string" ? value : "";
  const label = typeof control.label === "string" ? control.label : "Text";

  const insertDot = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const input = event.currentTarget.previousElementSibling;
    const el = input instanceof HTMLInputElement ? input : null;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const lead = before.length > 0 && !before.endsWith(" ") ? " " : "";
    const trail = after.startsWith(" ") ? "" : " ";
    const insert = `${lead}${DOT}${trail}`;
    setValue(`${before}${insert}${after}`);
    const pos = before.length + insert.length;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ControlFieldLabel>{label}</ControlFieldLabel>
      <div className="flex items-center gap-1.5">
        <input
          className={inputVariants({ className: "min-w-0 flex-1" })}
          onChange={(event) => setValue(event.target.value)}
          value={text}
        />
        <button
          aria-label="Insert · separator"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] text-sm text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
          onClick={insertDot}
          title="Insert · separator"
          type="button"
        >
          {DOT}
        </button>
      </div>
      {/* Fill from saved Copy (real component — hooks live in its own fiber). */}
      <CopyPickButton
        dispatch={dispatch}
        onPickText={(picked) => setValue(picked)}
        target={typeof control.target === "string" ? control.target : ""}
      />
    </div>
  );
};
