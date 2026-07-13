import * as React from "react";

import { toast } from "sonner";

import type { ToolcraftCustomControlRenderer } from "@/toolcraft/runtime/react";
import { ControlFieldLabel } from "@/toolcraft/ui";

import { addCopySnippet } from "../data/project-store";
import type { CopyRole } from "../data/types";

/** ui.selectedElement kind → CopySnippet role. Only text elements can be saved. */
const ROLE_BY_ELEMENT: Record<string, CopyRole> = {
  body: "body",
  heading: "headline",
  subhead: "subhead",
};

const TEXT_KEY: Record<CopyRole, string> = {
  body: "body.text",
  headline: "heading.text",
  subhead: "subhead.text",
};

/**
 * "Save copy" — a hook-free button in the Headline / Subheading / Body sections
 * that files the current text into the shared Copy library so it can be reused
 * and dropped into variations. Headlines also capture their flourish preset
 * (which words + style). Hook-free because the element sections mount/unmount
 * with selection.
 */
export const SaveCopyControl: ToolcraftCustomControlRenderer = ({ state }) => {
  const selected = state.values["ui.selectedElement"];
  const role = typeof selected === "string" ? ROLE_BY_ELEMENT[selected] : undefined;
  if (!role) {
    return <></>;
  }
  const text =
    typeof state.values[TEXT_KEY[role]] === "string"
      ? (state.values[TEXT_KEY[role]] as string)
      : "";

  const save = (): void => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Add some text first.");
      return;
    }
    const flourish =
      role === "headline"
        ? {
            style: state.values["heading.flourishStyle"],
            styles: state.values["heading.flourishStyles"],
            words: state.values["heading.flourish"],
          }
        : undefined;
    addCopySnippet({ flourish, role, text: trimmed });
    toast.success("Saved to the Copy library");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ControlFieldLabel>Copy</ControlFieldLabel>
      <button
        className="flex h-9 w-full items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--border)_25%,transparent)] text-sm text-foreground transition-colors hover:border-[color:var(--accent)]"
        onClick={save}
        type="button"
      >
        Save as copy
      </button>
    </div>
  );
};
