import * as React from "react";

import { Button, Input, Textarea } from "@/toolcraft/ui";
import { toast } from "sonner";

import {
  addCopyFolder,
  addJournalEntry,
  deleteCopyFolder,
  deleteJournalEntry,
  renameCopyFolder,
  updateJournalEntry,
  useProject,
} from "../data/project-store";
import type { JournalEntry } from "../data/types";

const ALL = "__all__";
const UNFILED = "__unfiled__";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** ---- Left: folders ------------------------------------------------------ */

function FolderRow(props: {
  active: boolean;
  count: number;
  label: string;
  onDelete?: () => void;
  onRename?: (name: string) => void;
  onSelect: () => void;
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(props.label);

  if (editing && props.onRename) {
    return (
      <input
        autoFocus
        className="w-full rounded-md border border-[color:var(--accent)] bg-transparent px-2 py-1 text-xs-plus outline-none"
        onBlur={() => {
          if (draft.trim()) props.onRename?.(draft.trim());
          setEditing(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (draft.trim()) props.onRename?.(draft.trim());
            setEditing(false);
          }
          if (event.key === "Escape") {
            setDraft(props.label);
            setEditing(false);
          }
        }}
        value={draft}
      />
    );
  }

  return (
    <div
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${props.active ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
    >
      <button
        className="min-w-0 flex-1 truncate text-left text-xs-plus"
        onClick={props.onSelect}
        onDoubleClick={() => props.onRename && setEditing(true)}
        type="button"
      >
        {props.label}
      </button>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{props.count}</span>
      {props.onDelete ? (
        <button
          className="shrink-0 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
          onClick={props.onDelete}
          title="Delete folder"
          type="button"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

/** ---- Middle: gallery card ----------------------------------------------- */

function CopyCard(props: {
  active: boolean;
  entry: JournalEntry;
  onSelect: () => void;
}): React.JSX.Element {
  const { entry } = props;
  return (
    <button
      className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${props.active ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_8%,transparent)]" : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_30%,transparent)]"}`}
      onClick={props.onSelect}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {entry.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs-plus">
          {entry.title || "Untitled"}
        </span>
      </div>
      <p
        className={`line-clamp-3 text-2xs leading-relaxed text-muted-foreground ${entry.kind === "copy" ? "font-serif" : ""}`}
      >
        {entry.body || "Empty"}
      </p>
    </button>
  );
}

/** ---- Right: editor ------------------------------------------------------ */

function Editor(props: { entry: JournalEntry }): React.JSX.Element {
  const { entry } = props;
  const { copyFolders } = useProject();
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] p-0.5">
          {(["copy", "journal"] as const).map((kind) => (
            <button
              className={`rounded px-2 py-0.5 text-2xs capitalize transition-colors ${entry.kind === kind ? "bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              key={kind}
              onClick={() => updateJournalEntry(entry.id, { kind })}
              type="button"
            >
              {kind}
            </button>
          ))}
        </div>
        <select
          className="h-7 rounded-md border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-transparent px-2 text-2xs outline-none"
          onChange={(event) =>
            updateJournalEntry(entry.id, {
              folderId: event.target.value === UNFILED ? null : event.target.value,
            })
          }
          value={entry.folderId ?? UNFILED}
        >
          <option value={UNFILED}>Unfiled</option>
          {copyFolders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            onClick={() => {
              void navigator.clipboard?.writeText(entry.body);
              toast.success("Copied to clipboard");
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Copy text
          </Button>
          <Button
            onClick={() => deleteJournalEntry(entry.id)}
            size="sm"
            type="button"
            variant="outline"
          >
            Delete
          </Button>
        </div>
      </div>
      <Input
        className="text-sm"
        onChange={(event) => updateJournalEntry(entry.id, { title: event.target.value })}
        placeholder="Title"
        value={entry.title}
      />
      <Textarea
        className={`min-h-0 flex-1 resize-none leading-relaxed ${entry.kind === "copy" ? "font-serif text-sm" : "text-xs-plus"}`}
        onChange={(event) => updateJournalEntry(entry.id, { body: event.target.value })}
        placeholder="Write the copy…"
        value={entry.body}
      />
      <p className="text-2xs text-muted-foreground">
        {wordCount(entry.body)} words · {entry.body.length} characters
      </p>
    </div>
  );
}

/** ---- Screen ------------------------------------------------------------- */

export function CopyScreen(): React.JSX.Element {
  const project = useProject();
  const [folderId, setFolderId] = React.useState<string>(ALL);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const countFor = (id: string): number =>
    id === ALL
      ? project.journal.length
      : id === UNFILED
        ? project.journal.filter((entry) => entry.folderId === null).length
        : project.journal.filter((entry) => entry.folderId === id).length;

  const entries = React.useMemo(() => {
    if (folderId === ALL) return project.journal;
    if (folderId === UNFILED) return project.journal.filter((entry) => entry.folderId === null);
    return project.journal.filter((entry) => entry.folderId === folderId);
  }, [project.journal, folderId]);

  const selected = project.journal.find((entry) => entry.id === selectedId) ?? null;

  const createEntry = (): void => {
    const target = folderId === ALL || folderId === UNFILED ? null : folderId;
    const id = addJournalEntry("copy", "Untitled copy", "", target);
    setSelectedId(id);
  };

  const unfiledCount = countFor(UNFILED);

  return (
    <div className="grid h-full min-h-0 grid-cols-[200px_minmax(240px,320px)_1fr] divide-x divide-[color:color-mix(in_oklab,var(--border)_10%,transparent)]">
      {/* Column 1 — folders */}
      <aside className="flex min-h-0 flex-col overflow-y-auto p-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
            Folders
          </span>
          <button
            className="text-sm leading-none text-muted-foreground hover:text-foreground"
            onClick={() => {
              const id = addCopyFolder("New folder");
              setFolderId(id);
            }}
            title="New folder"
            type="button"
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          <FolderRow
            active={folderId === ALL}
            count={countFor(ALL)}
            label="All copy"
            onSelect={() => setFolderId(ALL)}
          />
          {project.copyFolders.map((folder) => (
            <FolderRow
              active={folderId === folder.id}
              count={countFor(folder.id)}
              key={folder.id}
              label={folder.name}
              onDelete={() => {
                deleteCopyFolder(folder.id);
                if (folderId === folder.id) setFolderId(ALL);
              }}
              onRename={(name) => renameCopyFolder(folder.id, name)}
              onSelect={() => setFolderId(folder.id)}
            />
          ))}
          {unfiledCount > 0 ? (
            <FolderRow
              active={folderId === UNFILED}
              count={unfiledCount}
              label="Unfiled"
              onSelect={() => setFolderId(UNFILED)}
            />
          ) : null}
        </div>
      </aside>

      {/* Column 2 — gallery */}
      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">
            {folderId === ALL
              ? "All copy"
              : folderId === UNFILED
                ? "Unfiled"
                : (project.copyFolders.find((folder) => folder.id === folderId)?.name ?? "Copy")}
          </span>
          <Button onClick={createEntry} size="sm" type="button">
            + New copy
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {entries.length === 0 ? (
            <p className="px-1 text-2xs text-muted-foreground">
              Nothing here yet — add a copy block.
            </p>
          ) : (
            entries.map((entry) => (
              <CopyCard
                active={entry.id === selectedId}
                entry={entry}
                key={entry.id}
                onSelect={() => setSelectedId(entry.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Column 3 — editor */}
      <section className="min-h-0 overflow-y-auto p-4">
        {selected ? (
          <Editor entry={selected} key={selected.id} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-2xs text-muted-foreground">
              Select a copy block to edit, or add a new one.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
