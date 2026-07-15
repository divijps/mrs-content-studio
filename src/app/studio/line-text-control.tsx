import * as React from "react";

import { ControlFieldLabel, inputVariants } from "@/toolcraft/ui";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";

/**
 * Single-line text input styled like the other content fields (the built-in
 * "text" control renders a mono code-style input, which reads foreign next to
 * the headline/sub-head fields). Used by the lockup texts and the button label.
 * Hook-free — the runtime calls control renderers as plain functions.
 */
export const LineTextControl: ToolcraftCustomControlRenderer = ({
  control,
  setValue,
  value,
}) => {
  const text = typeof value === "string" ? value : "";
  const label = typeof control.label === "string" ? control.label : "Text";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ControlFieldLabel>{label}</ControlFieldLabel>
      <input
        className={inputVariants({ className: "min-w-0 w-full" })}
        onChange={(event) => setValue(event.target.value)}
        value={text}
      />
    </div>
  );
};
