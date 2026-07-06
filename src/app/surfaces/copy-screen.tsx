import * as React from "react";

import { toast } from "sonner";

import {
  addCopyFolder,
  addJournalComment,
  addJournalEntry,
  deleteCopyFolder,
  deleteJournalComment,
  deleteJournalEntry,
  renameCopyFolder,
  updateJournalEntry,
  useProject,
} from "../data/project-store";
import type { CopyFolder, JournalEntry } from "../data/types";

const ALL = "__all__";
const UNFILED = "__unfiled__";

interface FolderNode extends CopyFolder {
  children: FolderNode[];
  total: number;
}

/** Nested folder tree with per-folder counts including descendants. */
function buildFolderTree(folders: CopyFolder[], direct: Map<string, number>): FolderNode[] {
  const byParent = new Map<string | null, CopyFolder[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }
  const build = (parentId: string | null): FolderNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => {
        const children = build(folder.id);
        const total =
          (direct.get(folder.id) ?? 0) + children.reduce((sum, child) => sum + child.total, 0);
        return { ...folder, children, total };
      });
  return build(null);
}

/** A folder id plus every descendant id (for scoping the gallery). */
function subtreeIds(folders: CopyFolder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        added = true;
      }
    }
  }
  return ids;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** ---- Left: folders ------------------------------------------------------ */

/** Fixed row for the "All copy" / "Unfiled" pseudo-folders. */
function SimpleRow(props: {
  active: boolean;
  count: number;
  label: string;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${props.active ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
      onClick={props.onSelect}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate text-xs-plus">{props.label}</span>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{props.count}</span>
    </button>
  );
}

/** One folder in the nested tree (recurses into its children). */
function FolderTreeRow(props: {
  activeId: string;
  depth: number;
  node: FolderNode;
  onAddChild: (parentId: string) => void;
  onDelete: (folder: FolderNode) => void;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const { node } = props;
  const [expanded, setExpanded] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(node.name);
  const hasChildren = node.children.length > 0;
  const active = props.activeId === node.id;

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full rounded-md border border-[color:var(--accent)] bg-transparent px-2 py-1 text-xs-plus outline-none"
        onBlur={() => {
          if (draft.trim()) renameCopyFolder(node.id, draft.trim());
          setEditing(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (draft.trim()) renameCopyFolder(node.id, draft.trim());
            setEditing(false);
          }
          if (event.key === "Escape") {
            setDraft(node.name);
            setEditing(false);
          }
        }}
        style={{ marginLeft: props.depth * 12 }}
        value={draft}
      />
    );
  }

  return (
    <>
      <div
        className={`group flex items-center gap-0.5 rounded-md pr-1 transition-colors ${active ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
        style={{ paddingLeft: props.depth * 12 }}
      >
        <button
          aria-label={expanded ? "Collapse" : "Expand"}
          className={`flex h-5 w-4 items-center justify-center text-muted-foreground ${hasChildren ? "" : "invisible"}`}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <button
          className="min-w-0 flex-1 truncate py-1 text-left text-xs-plus"
          onClick={() => props.onSelect(node.id)}
          onDoubleClick={() => setEditing(true)}
          type="button"
        >
          {node.name}
        </button>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{node.total}</span>
        <button
          className="shrink-0 px-1 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          onClick={() => props.onAddChild(node.id)}
          title="Add sub-folder"
          type="button"
        >
          +
        </button>
        <button
          className="shrink-0 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
          onClick={() => props.onDelete(node)}
          title="Delete folder"
          type="button"
        >
          ✕
        </button>
      </div>
      {expanded
        ? node.children.map((child) => (
            <FolderTreeRow
              activeId={props.activeId}
              depth={props.depth + 1}
              key={child.id}
              node={child}
              onAddChild={props.onAddChild}
              onDelete={props.onDelete}
              onSelect={props.onSelect}
            />
          ))
        : null}
    </>
  );
}

/** ---- Middle: gallery block ---------------------------------------------- */

function CopyCard(props: {
  active: boolean;
  entry: JournalEntry;
  onSelect: () => void;
}): React.JSX.Element {
  const { entry } = props;
  const attributes = [entry.kind === "copy" ? "Copy" : "Journal", ...entry.tags.map((t) => `#${t}`)];
  return (
    <button
      className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${props.active ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]" : "border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_34%,transparent)]"}`}
      onClick={props.onSelect}
      type="button"
    >
      <span className="truncate text-sm">{entry.title || "Untitled"}</span>
      <span className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {attributes.join("  ·  ")}
      </span>
      <p className="line-clamp-3 text-2xs leading-relaxed text-muted-foreground">
        {entry.body || "Empty"}
      </p>
    </button>
  );
}

/** ---- Right: editor ------------------------------------------------------ */

function CommentsSection(props: { entry: JournalEntry }): React.JSX.Element {
  const { entry } = props;
  const [draft, setDraft] = React.useState("");
  return (
    <div className="flex flex-col gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] pt-3">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Comments {entry.comments.length > 0 ? `· ${entry.comments.length}` : ""}
      </span>
      {entry.comments.map((comment) => (
        <div className="group flex flex-col gap-0.5" key={comment.id}>
          <div className="flex items-baseline gap-2">
            <span className="text-2xs font-medium">{comment.author}</span>
            <span className="text-[10px] text-muted-foreground">{shortDate(comment.createdAt)}</span>
            <button
              className="ml-auto text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
              onClick={() => deleteJournalComment(entry.id, comment.id)}
              type="button"
            >
              Delete
            </button>
          </div>
          <p className="text-xs-plus leading-relaxed text-muted-foreground">{comment.body}</p>
        </div>
      ))}
      <input
        className="h-8 w-full rounded-md border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-transparent px-2 text-xs-plus outline-none placeholder:text-muted-foreground focus:border-[color:var(--accent)]"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && draft.trim()) {
            addJournalComment(entry.id, draft);
            setDraft("");
          }
        }}
        placeholder="Add a comment…"
        value={draft}
      />
    </div>
  );
}

function Editor(props: { entry: JournalEntry }): React.JSX.Element {
  const { entry } = props;
  const { copyFolders } = useProject();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [tagDraft, setTagDraft] = React.useState("");

  const toggleBullet = (): void => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const { selectionEnd, selectionStart, value } = textarea;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const before = value.slice(0, lineStart);
    const region = value.slice(lineStart, selectionEnd) || value.slice(lineStart);
    const regionEnd = lineStart + region.length;
    const after = value.slice(regionEnd);
    const lines = region.split("\n");
    const allBulleted = lines.filter((line) => line.trim()).every((line) => line.trimStart().startsWith("• "));
    const next = lines
      .map((line) => {
        if (!line.trim()) return line;
        return allBulleted ? line.replace(/^(\s*)• /, "$1") : `• ${line}`;
      })
      .join("\n");
    updateJournalEntry(entry.id, { body: before + next + after });
    requestAnimationFrame(() => textarea.focus());
  };

  const addTag = (): void => {
    const tag = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (tag && !entry.tags.includes(tag)) {
      updateJournalEntry(entry.id, { tags: [...entry.tags, tag] });
    }
    setTagDraft("");
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Attributes: kind · folder · actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] p-0.5">
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
          className="h-7 rounded-md border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-transparent px-2 text-2xs outline-none"
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
          <button
            className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2.5 py-1 text-2xs hover:border-[color:var(--accent)]"
            onClick={() => {
              void navigator.clipboard?.writeText(entry.body);
              toast.success("Copied to clipboard");
            }}
            type="button"
          >
            Copy text
          </button>
          <button
            className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2.5 py-1 text-2xs hover:border-[color:var(--destructive)] hover:text-[color:var(--destructive)]"
            onClick={() => deleteJournalEntry(entry.id)}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tags (#) */}
      <div className="flex flex-wrap items-center gap-1">
        {entry.tags.map((tag) => (
          <button
            className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            key={tag}
            onClick={() =>
              updateJournalEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) })
            }
            title="Remove tag"
            type="button"
          >
            #{tag} ✕
          </button>
        ))}
        <input
          className="w-28 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
          onBlur={addTag}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && addTag()}
          placeholder="# add tag"
          value={tagDraft}
        />
      </div>

      <input
        className="w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
        onChange={(event) => updateJournalEntry(entry.id, { title: event.target.value })}
        placeholder="Title"
        value={entry.title}
      />

      {/* Format toolbar */}
      <div className="flex items-center gap-1.5">
        <button
          className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2 py-0.5 text-2xs hover:border-[color:var(--accent)]"
          onClick={toggleBullet}
          title="Toggle bullet list on the selected lines"
          type="button"
        >
          • Bullets
        </button>
        <span className="text-[10px] text-muted-foreground">
          {wordCount(entry.body)} words · {entry.body.length} characters
        </span>
      </div>

      <textarea
        className="min-h-[8rem] flex-1 resize-none rounded-md border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_3%,transparent)] p-3 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)]"
        onChange={(event) => updateJournalEntry(entry.id, { body: event.target.value })}
        placeholder="Write the copy…  (select lines and press • Bullets)"
        ref={bodyRef}
        value={entry.body}
      />

      <CommentsSection entry={entry} />
    </div>
  );
}

/** ---- Screen ------------------------------------------------------------- */

export function CopyScreen(): React.JSX.Element {
  const project = useProject();
  const [folderId, setFolderId] = React.useState<string>(ALL);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const directCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of project.journal) {
      if (entry.folderId) map.set(entry.folderId, (map.get(entry.folderId) ?? 0) + 1);
    }
    return map;
  }, [project.journal]);

  const tree = React.useMemo(
    () => buildFolderTree(project.copyFolders, directCounts),
    [project.copyFolders, directCounts],
  );

  const countFor = (id: string): number =>
    id === ALL
      ? project.journal.length
      : project.journal.filter((entry) => entry.folderId === null).length;

  const entries = React.useMemo(() => {
    if (folderId === ALL) return project.journal;
    if (folderId === UNFILED) return project.journal.filter((entry) => entry.folderId === null);
    const scope = subtreeIds(project.copyFolders, folderId);
    return project.journal.filter((entry) => entry.folderId && scope.has(entry.folderId));
  }, [project.journal, project.copyFolders, folderId]);

  const addFolder = (parentId: string | null): void => {
    setFolderId(addCopyFolder("New folder", parentId));
  };

  const removeFolder = (folder: FolderNode): void => {
    deleteCopyFolder(folder.id);
    if (subtreeIds(project.copyFolders, folder.id).has(folderId)) setFolderId(ALL);
  };

  const selected = project.journal.find((entry) => entry.id === selectedId) ?? null;

  const createEntry = (): void => {
    const target = folderId === ALL || folderId === UNFILED ? null : folderId;
    const id = addJournalEntry("copy", "Untitled copy", "", target);
    setSelectedId(id);
  };

  const unfiledCount = countFor(UNFILED);

  return (
    <div className="grid h-full min-h-0 grid-cols-[200px_minmax(240px,320px)_1fr] divide-x divide-[color:color-mix(in_oklab,var(--border)_26%,transparent)]">
      {/* Column 1 — folders */}
      <aside className="flex min-h-0 flex-col overflow-y-auto p-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
            Folders
          </span>
          <button
            className="text-sm leading-none text-muted-foreground hover:text-foreground"
            onClick={() => addFolder(null)}
            title="New folder"
            type="button"
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          <SimpleRow
            active={folderId === ALL}
            count={countFor(ALL)}
            label="All copy"
            onSelect={() => setFolderId(ALL)}
          />
          {tree.map((node) => (
            <FolderTreeRow
              activeId={folderId}
              depth={0}
              key={node.id}
              node={node}
              onAddChild={(parentId) => addFolder(parentId)}
              onDelete={removeFolder}
              onSelect={setFolderId}
            />
          ))}
          {unfiledCount > 0 ? (
            <SimpleRow
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
          <button
            className="rounded-md bg-[color:var(--accent)] px-2.5 py-1 text-2xs text-[color:var(--accent-foreground)] hover:opacity-90"
            onClick={createEntry}
            type="button"
          >
            + New copy
          </button>
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
