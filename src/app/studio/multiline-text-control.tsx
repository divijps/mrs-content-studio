import * as React from "react";

import { ControlFieldLabel, textareaVariants } from "@/toolcraft/ui";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

import { CopyPickButton } from "./copy-pick-control";

/**
 * Multi-line text input for headlines and body copy. Users can add explicit
 * line breaks (Enter) — the renderer honors them as hard line breaks on the
 * comp. Hook-free (the runtime calls control renderers as plain functions, so
 * a hook here would corrupt ControlsPanel's hook order).
 */
export const MultilineTextControl: ToolcraftCustomControlRenderer = ({
  control,
  dispatch,
  setValue,
  value,
}) => {
  const text = typeof value === "string" ? value : "";
  const label = typeof control.label === "string" ? control.label : "Text";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ControlFieldLabel>{label}</ControlFieldLabel>
      <textarea
        className={textareaVariants({ className: "min-h-[2.25rem] w-full resize-y" })}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        value={text}
      />
      {/* Fill from saved Copy — CopyPickButton is a real component (own fiber),
       * so its hooks are safe even though this renderer must stay hook-free. */}
      <CopyPickButton
        dispatch={dispatch}
        onPickText={(picked) => setValue(picked)}
        target={typeof control.target === "string" ? control.target : ""}
      />
    </div>
  );
};
