import * as React from "react";

import { inputVariants } from "@/toolcraft/ui";

/**
 * Text input with `@`-mention autocomplete. Typing `@` opens a roster
 * dropdown; arrows navigate, Enter/Tab select. When the dropdown is closed,
 * Enter bubbles so the surrounding form still submits the comment.
 *
 * Uses a native input (not the kit Input) so we can drive the caret directly
 * when inserting a picked name.
 */
export function MentionInput(props: {
  autoFocus?: boolean;
  className?: string;
  onCancel?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  roster: string[];
  value: string;
}): React.JSX.Element {
  const ref = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const matches = React.useMemo(() => {
    if (!open) {
      return [];
    }
    const needle = query.toLowerCase();
    return props.roster
      .filter((name) => name.toLowerCase().replace(/\s+/g, "").startsWith(needle))
      .slice(0, 6);
  }, [open, query, props.roster]);

  // Recompute the active @token from the text left of the caret.
  const refresh = (value: string, caret: number): void => {
    const match = value.slice(0, caret).match(/@([\p{L}\p{N}]*)$/u);
    if (match) {
      setQuery(match[1] ?? "");
      setActive(0);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const pick = (name: string): void => {
    const el = ref.current;
    const caret = el?.selectionStart ?? props.value.length;
    const before = props.value.slice(0, caret);
    const after = props.value.slice(caret);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      return;
    }
    const next = `${before.slice(0, at)}@${name} ${after}`;
    props.onChange(next);
    setOpen(false);
    const caretAfter = at + name.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caretAfter, caretAfter);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        autoFocus={props.autoFocus}
        className={inputVariants({ className: props.className })}
        onChange={(event) => {
          props.onChange(event.target.value);
          refresh(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyDown={(event) => {
          if (open && matches.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => (current + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => (current - 1 + matches.length) % matches.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              event.stopPropagation();
              pick(matches[active]!);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              return;
            }
          } else if (event.key === "Escape") {
            props.onCancel?.();
          }
        }}
        onKeyUp={(event) => {
          // Caret moves (arrows/click) can change the active token.
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            const target = event.currentTarget;
            refresh(target.value, target.selectionStart ?? target.value.length);
          }
        }}
        placeholder={props.placeholder}
        ref={ref}
        value={props.value}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute bottom-full left-0 z-20 mb-1 w-44 overflow-hidden rounded-md border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] bg-[color:var(--popover)] py-1 shadow-xl">
          {matches.map((name, index) => (
            <li key={name}>
              <button
                className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs-plus ${
                  index === active
                    ? "bg-[color:color-mix(in_oklab,var(--accent)_18%,transparent)]"
                    : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                }`}
                // Mouse down (not click) so the input doesn't blur first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(name);
                }}
                type="button"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-[9px] font-semibold">
                  {name[0]?.toUpperCase()}
                </span>
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
