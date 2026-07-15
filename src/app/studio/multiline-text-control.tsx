import * as React from "react";

import { ControlFieldLabel, textareaVariants } from "@/toolcraft/ui";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

/**
 * Multi-line text input for headlines and body copy. Users can add explicit
 * line breaks (Enter) — the renderer honors them as hard line breaks on the
 * comp. Hook-free (the runtime calls control renderers as plain functions, so
 * a hook here would corrupt ControlsPanel's hook order).
 */
export const MultilineTextControl: ToolcraftCustomControlRenderer = ({
  control,
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
    </div>
  );
};
