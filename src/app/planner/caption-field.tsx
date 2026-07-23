import * as React from "react";
import { createPortal } from "react-dom";

import { TextTIcon } from "@phosphor-icons/react";

import { useProject } from "../data/project-store";
import type { CopySnippet, PlannerChannel } from "../data/types";

/** Platform caption ceilings (characters). Instagram-family + TikTok sit at
 * 2200; Pinterest descriptions cap at 500. */
const CAPTION_LIMIT: Record<PlannerChannel, number> = {
  grid: 2200,
  pinterest: 500,
  reel: 2200,
  story: 2200,
  tiktok: 2200,
};

const ROLE_LABEL: Record<CopySnippet["role"], string> = {
  body: "Description",
  headline: "Headline",
  subhead: "Subheading",
};

/**
 * The post's caption workspace: an auto-growing text area with a quiet
 * per-platform character count and an "insert from Copy" popover, so captions
 * get finished here instead of pasted from elsewhere. Edits commit on blur
 * (typing never spams the backend); inserts commit immediately.
 */
export function CaptionField(props: {
  channel: PlannerChannel;
  disabled?: boolean;
  onCommit: (value: string) => void;
  value: string;
}): React.JSX.Element {
  const project = useProject();
  const [draft, setDraft] = React.useState(props.value);
  const [pickerRect, setPickerRect] = React.useState<{ left: number; top: number } | null>(null);
  const [query, setQuery] = React.useState("");
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const anchorRef = React.useRef<HTMLButtonElement>(null);

  // Auto-grow to fit content (bounded so the sidebar keeps its rhythm).
  const autosize = (): void => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(220, Math.max(42, area.scrollHeight))}px`;
  };
  React.useLayoutEffect(autosize, [draft]);

  const commit = (next: string): void => {
    setDraft(next);
    props.onCommit(next);
  };

  const insert = (snippet: CopySnippet): void => {
    const base = draft.trimEnd();
    commit(base ? `${base}\n\n${snippet.text}` : snippet.text);
    setPickerRect(null);
    setQuery("");
    areaRef.current?.focus();
  };

  const limit = CAPTION_LIMIT[props.channel];
  const over = draft.length > limit;

  const needle = query.trim().toLowerCase();
  const snippets = React.useMemo(
    () =>
      [...project.copySnippets]
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
        .filter(
          (snippet) =>
            !needle ||
            snippet.text.toLowerCase().includes(needle) ||
            (snippet.title ?? "").toLowerCase().includes(needle) ||
            snippet.tags.some((tag) => tag.includes(needle)),
        )
        .slice(0, 40),
    [project.copySnippets, needle],
  );

  const openPicker = (): void => {
    const box = anchorRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = 300;
    setPickerRect({
      left: Math.min(box.left, window.innerWidth - width - 12),
      top: Math.min(box.bottom + 6, window.innerHeight - 320),
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="w-full resize-none rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)] disabled:opacity-50"
        disabled={props.disabled}
        onBlur={() => {
          if (draft !== props.value) props.onCommit(draft);
        }}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Write the caption…"
        ref={areaRef}
        rows={1}
        value={draft}
      />
      <div className="flex items-center justify-between px-0.5">
        {props.disabled ? (
          <span />
        ) : (
          <button
            className="flex items-center gap-1 rounded-md px-1 py-0.5 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)] transition-colors hover:bg-[color:var(--surface-active)] hover:text-[color:var(--foreground)]"
            onClick={() => (pickerRect ? setPickerRect(null) : openPicker())}
            ref={anchorRef}
            type="button"
          >
            <TextTIcon size={12} />
            Insert from Copy
          </button>
        )}
        <span
          className={`text-2xs tabular-nums ${
            over
              ? "text-[#e5675f]"
              : "text-[color:color-mix(in_oklab,var(--foreground)_38%,transparent)]"
          }`}
          title={`Character limit for this platform: ${limit}`}
        >
          {draft.length} / {limit}
        </span>
      </div>
      {pickerRect
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[80]" onMouseDown={() => setPickerRect(null)} />
              <div
                className="fixed z-[81] flex max-h-[300px] w-[300px] flex-col gap-1 overflow-hidden rounded-xl border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-[color:var(--popover)] p-2 shadow-2xl"
                style={{ left: pickerRect.left, top: pickerRect.top }}
              >
                <input
                  autoFocus
                  className="h-8 w-full shrink-0 rounded-lg bg-[color:var(--surface-inactive)] px-2.5 text-sm outline-none focus:bg-[color:var(--surface-active)]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search copy…"
                  value={query}
                />
                <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
                  {snippets.length === 0 ? (
                    <p className="px-1 py-4 text-center text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                      {project.copySnippets.length === 0
                        ? "No copy yet — write some on the Copy page."
                        : "Nothing matches."}
                    </p>
                  ) : (
                    snippets.map((snippet) => (
                      <button
                        className="flex flex-col gap-0.5 rounded-lg bg-[color:var(--surface-inactive)] px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--surface-active)]"
                        key={snippet.id}
                        onClick={() => insert(snippet)}
                        type="button"
                      >
                        <span className="text-[10px] uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                          {ROLE_LABEL[snippet.role]}
                          {snippet.title ? ` · ${snippet.title}` : ""}
                        </span>
                        <span className="line-clamp-2 text-xs-plus text-[color:color-mix(in_oklab,var(--foreground)_85%,transparent)]">
                          {snippet.text}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
