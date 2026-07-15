import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { ArrowRightIcon, XIcon } from "@phosphor-icons/react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/toolcraft/ui/components/composites/command";
import { favoriteKey, useProject } from "../data/project-store";
import { StatusDot } from "../library/status-dot";
import { buildCommands, filterCommands } from "./commands";
import { parseQuery, removeToken } from "./query";
import { runSearch } from "./rank";
import { relatedTo } from "./relationships";
import { buildSearchIndex } from "./search-index";
import { SMART_FILTERS } from "./smart-filters";
import type { SearchContext, SearchDoc, SearchKind } from "./types";

/** Scope carried by openCommandPalette (for "used in N places"). */
let pendingScope: { kind: SearchKind; id: string } | null = null;
const PALETTE_EVENT = "mrs:open-palette";

/** Open the palette — optionally scoped to an entity's relationships. */
export function openCommandPalette(scope?: { kind: SearchKind; id: string }): void {
  pendingScope = scope ?? null;
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

const KIND_ORDER: SearchKind[] = [
  "asset",
  "comp",
  "planner",
  "task",
  "journal",
  "snippet",
  "email",
  "board",
  "template",
  "deck",
  "link",
];

const KIND_LABEL: Record<SearchKind, string> = {
  asset: "Assets",
  board: "Boards",
  comp: "Artboards",
  deck: "Copy decks",
  email: "Emails",
  journal: "Copy & journal",
  link: "Links",
  planner: "Planner",
  snippet: "Copy snippets",
  task: "Tasks",
  template: "Templates",
};

const PER_GROUP = 6;

function DocRow(props: { doc: SearchDoc }): React.JSX.Element {
  const { doc } = props;
  return (
    <>
      {doc.thumbUrl ? (
        <img alt="" className="h-6 w-6 shrink-0 rounded object-cover" loading="lazy" src={doc.thumbUrl} />
      ) : doc.status ? (
        <span className="flex w-6 shrink-0 justify-center">
          <StatusDot size={7} status={doc.status} />
        </span>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{doc.title}</span>
        <span className="block truncate text-[0.6875rem] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
          {doc.subtitle}
        </span>
      </span>
    </>
  );
}

export function CommandPalette(): React.JSX.Element {
  const project = useProject();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  const [selected, setSelected] = React.useState("");
  const [scope, setScope] = React.useState<{ kind: SearchKind; id: string } | null>(null);
  const deferredRaw = React.useDeferredValue(raw);

  // Cmd/Ctrl+K toggles; openCommandPalette (+ scope) opens.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setScope(null);
        setRaw("");
        setOpen((value) => !value);
      }
    };
    const onOpen = (): void => {
      setScope(pendingScope);
      setRaw("");
      // Defer past the click that dispatched this event — opening a radix Dialog
      // synchronously inside a click lets that same click's outside-interaction
      // detection dismiss it immediately.
      setTimeout(() => setOpen(true), 0);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  const close = React.useCallback(() => setOpen(false), []);

  const ctx = React.useMemo<SearchContext>(
    () => ({
      navigate: (opts) => void navigate(opts),
      currentUser: project.settings.displayName,
      favoriteKey: favoriteKey(project.settings.userId),
      pathname,
      close,
    }),
    [navigate, project.settings.displayName, project.settings.userId, pathname, close],
  );

  // Only index while open — this memo re-runs on every store emit (each
  // keystroke in any editor), and a closed palette shouldn't pay for it.
  const index = React.useMemo(
    () => (open ? buildSearchIndex(project, ctx) : []),
    [project, ctx, open],
  );
  const parsed = React.useMemo(() => parseQuery(deferredRaw), [deferredRaw]);
  const hasQuery = deferredRaw.trim().length > 0;

  const commands = React.useMemo(() => buildCommands(ctx), [ctx]);
  const shownCommands = React.useMemo(
    () => filterCommands(commands, parsed.tokens).slice(0, hasQuery ? 5 : 12),
    [commands, parsed.tokens, hasQuery],
  );

  const results = React.useMemo(
    () => (hasQuery || parsed.filters.length ? runSearch(index, parsed, ctx).slice(0, 60) : []),
    [index, parsed, ctx, hasQuery],
  );

  const grouped = React.useMemo(() => {
    const byKind = new Map<SearchKind, SearchDoc[]>();
    for (const doc of results) {
      const list = byKind.get(doc.kind);
      if (list) list.push(doc);
      else byKind.set(doc.kind, [doc]);
    }
    return KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
      kind,
      docs: byKind.get(kind)!,
    }));
  }, [results]);

  // Scope view: show the relationships of a specific entity.
  const scopeDoc = scope ? index.find((d) => d.kind === scope.kind && d.id === scope.id) : null;
  const scopeRelated = React.useMemo(
    () => (scopeDoc && !hasQuery ? relatedTo(scopeDoc, index) : []),
    [scopeDoc, index, hasQuery],
  );

  // Related for the last-highlighted search RESULT. Pinned in state (not derived
  // from the live highlight) because moving the highlight into the Related
  // group's own `rel:` items must not unmount the group mid-interaction — the
  // items would vanish under the cursor and the click could land elsewhere.
  const [relatedFor, setRelatedFor] = React.useState<SearchDoc | null>(null);
  React.useEffect(() => {
    if (scopeDoc) {
      setRelatedFor(null);
      return;
    }
    if (selected.startsWith("rel:")) return; // browsing the group — keep it pinned
    if (selected.startsWith("r:")) {
      setRelatedFor(results.find((d) => `r:${d.kind}:${d.id}` === selected) ?? null);
    } else {
      setRelatedFor(null);
    }
  }, [selected, results, scopeDoc]);
  const selectedRelated = React.useMemo(
    () => (relatedFor ? relatedTo(relatedFor, index) : []),
    [relatedFor, index],
  );

  const runDoc = (doc: SearchDoc): void => doc.open();

  const showBrowse = !hasQuery && parsed.filters.length === 0 && !scopeDoc;

  return (
    <CommandDialog
      className="w-[min(38rem,94vw)]"
      onOpenChange={setOpen}
      open={open}
      title="Search everything"
    >
      <Command loop onValueChange={setSelected} shouldFilter={false} value={selected}>
        {parsed.filters.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {parsed.filters.map((filter) => (
              <button
                className="flex items-center gap-1 rounded-full bg-[color:color-mix(in_oklab,var(--accent)_22%,transparent)] px-2 py-0.5 text-[0.6875rem] font-medium text-[color:var(--foreground)]"
                key={filter.token}
                onClick={() => setRaw((value) => removeToken(value, filter.token))}
                type="button"
              >
                {filter.label}
                <XIcon size={11} />
              </button>
            ))}
          </div>
        ) : null}

        <CommandInput
          onValueChange={setRaw}
          placeholder={
            scopeDoc ? `Related to “${scopeDoc.title}”…` : "Search, or type a command…"
          }
          value={raw}
        />

        <CommandList>
          <CommandEmpty>No matches. Try fewer words or a different filter.</CommandEmpty>

          {showBrowse ? (
            <CommandGroup heading="Smart filters">
              {SMART_FILTERS.map((filter) => (
                <CommandItem
                  key={filter.id}
                  onSelect={() => setRaw(filter.query)}
                  value={`s:${filter.id}`}
                >
                  <span className="w-6" />
                  <span className="flex-1 truncate">{filter.label}</span>
                  <span className="text-[0.625rem] text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                    {filter.query}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {scopeDoc && scopeRelated.length > 0
            ? scopeRelated.map((group) => (
                <CommandGroup heading={group.label} key={group.label}>
                  {group.docs.map((doc) => (
                    <CommandItem key={doc.id} onSelect={() => runDoc(doc)} value={`r:${doc.kind}:${doc.id}`}>
                      <DocRow doc={doc} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            : null}

          {scopeDoc && scopeRelated.length === 0 && !hasQuery ? (
            <p className="px-4 py-6 text-center text-[0.75rem] text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)]">
              Not used anywhere yet.
            </p>
          ) : null}

          {shownCommands.length > 0 ? (
            <CommandGroup heading="Commands">
              {shownCommands.map((command) => (
                <CommandItem key={command.id} onSelect={command.run} value={`c:${command.id}`}>
                  <ArrowRightIcon className="opacity-60" />
                  <span className="flex-1 truncate">{command.title}</span>
                  <span className="text-[0.625rem] uppercase tracking-wide text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]">
                    {command.group}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {grouped.map((group) => (
            <CommandGroup
              heading={`${KIND_LABEL[group.kind]}${group.docs.length > PER_GROUP ? ` · ${group.docs.length}` : ""}`}
              key={group.kind}
            >
              {group.docs.slice(0, PER_GROUP).map((doc) => (
                <CommandItem key={doc.id} onSelect={() => runDoc(doc)} value={`r:${doc.kind}:${doc.id}`}>
                  <DocRow doc={doc} />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {relatedFor && selectedRelated.length > 0 ? (
            <CommandGroup heading={`Related to “${relatedFor.title}”`}>
              {selectedRelated.flatMap((group) =>
                group.docs.slice(0, 4).map((doc) => (
                  <CommandItem
                    key={`rel:${doc.kind}:${doc.id}`}
                    onSelect={() => runDoc(doc)}
                    value={`rel:${doc.kind}:${doc.id}`}
                  >
                    <DocRow doc={doc} />
                    <span className="text-[0.625rem] text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)]">
                      {group.label.replace(/ \d+ .*/, "")}
                    </span>
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
