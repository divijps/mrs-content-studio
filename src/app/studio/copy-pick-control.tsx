import * as React from "react";
import { createPortal } from "react-dom";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";

import { useProject } from "../data/project-store";
import type { CopyRole, CopySnippet } from "../data/types";
import { flourishPatch } from "./studio-actions";

/** Which saved-copy role fills which element's text target. */
const ROLE_BY_TARGET: Record<string, CopyRole> = {
  "body.text": "body",
  "heading.text": "headline",
  "subhead.text": "subhead",
};

const ROLE_LABEL: Record<CopyRole, string> = {
  body: "Body",
  headline: "Headline",
  subhead: "Sub-head",
};

type Dispatch = ToolcraftCustomControlRendererProps["dispatch"];

/**
 * "Browse copy" under a Content text field — opens a Media-picker-style dialog
 * of saved Copy snippets for the element's role; picking one fills the text
 * (and, for headlines, applies the snippet's flourish preset).
 *
 * Rendered as JSX from the hook-free text-control renderers, so its hooks live
 * in their own fiber (the LibraryImageControl dialog trick).
 */
export function CopyPickButton(props: {
  dispatch: Dispatch;
  onPickText: (text: string) => void;
  target: string;
}): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false);
  const role = ROLE_BY_TARGET[props.target];
  if (!role) return null;

  const pick = (snippet: CopySnippet): void => {
    props.onPickText(snippet.text);
    if (role === "headline") {
      // Apply (or clear) the snippet's flourish so the headline recalls its
      // saved look. Plain record entries — the runtime's "merge" grouping only
      // supports repeated writes to ONE target (slider drags); merging across
      // targets drops keys from the undo patch.
      const patch = flourishPatch(snippet.flourish);
      const writes: [string, unknown][] = [
        ["heading.flourish", patch.headingFlourish ?? []],
        ["heading.flourishStyle", patch.headingFlourishStyle ?? "swash"],
        ["heading.flourishStyles", patch.headingFlourishStyles ?? {}],
      ];
      for (const [target, value] of writes) {
        props.dispatch({ target, type: "controls.setValue", value });
      }
    }
    setOpen(false);
  };

  return (
    <>
      <button
        className="flex h-8 items-center justify-center rounded-lg border border-dashed border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] text-xs text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
        onClick={() => setOpen(true)}
        type="button"
      >
        Browse copy
      </button>
      {open ? <CopyPickDialog onClose={() => setOpen(false)} onPick={pick} role={role} /> : null}
    </>
  );
}

function CopyPickDialog(props: {
  onClose: () => void;
  onPick: (snippet: CopySnippet) => void;
  role: CopyRole;
}): React.JSX.Element {
  const project = useProject();
  const { onClose } = props;
  const snippets = project.copySnippets.filter((snippet) => snippet.role === props.role);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        // Dismiss on backdrop press (mousedown, not click — a drag that ends
        // outside the card must not close it).
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-[color:var(--popover)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] px-4 py-3">
          <span className="text-sm font-medium">Saved copy — {ROLE_LABEL[props.role]}</span>
          <button
            aria-label="Close"
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          {snippets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No saved {ROLE_LABEL[props.role].toLowerCase()} copy yet — write some on the Copy
              screen.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {snippets.map((snippet) => (
                <button
                  className="flex min-h-[6.5rem] flex-col gap-1.5 rounded-2xl bg-[color:var(--surface-inactive)] p-3 text-left transition-colors hover:bg-[color:var(--surface-active)]"
                  key={snippet.id}
                  onClick={() => props.onPick(snippet)}
                  type="button"
                >
                  <span className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {ROLE_LABEL[props.role]}
                  </span>
                  <p className="line-clamp-3 text-sm leading-snug text-foreground">
                    {snippet.text}
                  </p>
                  {snippet.flourish ? (
                    <span
                      aria-label="Has a flourish preset"
                      className="mt-auto h-2 w-2 rounded-full bg-[#4caf7d]"
                      title="Flourish preset"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
