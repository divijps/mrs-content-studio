import * as React from "react";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";

import { openCommandPalette } from "../search/command-palette";

/**
 * Top-bar search affordance. It's a trigger for the Cmd+K command palette — the
 * palette owns the actual searching (all entities, ranked, faceted, with
 * relationships and actions). Kept in the header so the box stays where users
 * expect it.
 */
export function GlobalSearch(): React.JSX.Element {
  const [isMac, setIsMac] = React.useState(true);
  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.userAgent));
  }, []);

  return (
    <button
      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[color:var(--surface-inactive)] px-2.5 text-xs text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-active)] sm:w-64 sm:flex-none"
      onClick={() => openCommandPalette()}
      type="button"
    >
      <MagnifyingGlassIcon size={14} />
      <span className="flex-1 text-left">Search everything…</span>
      <kbd className="hidden shrink-0 rounded bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-1.5 py-0.5 text-[0.625rem] sm:inline">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
