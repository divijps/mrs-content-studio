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

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Legacy plain-text bodies → HTML for the editor (newlines and • bullets). */
function plainToHtml(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const bulletLines = lines.filter((line) => line.trim()).length > 0
    && lines.filter((line) => line.trim()).every((line) => line.trimStart().startsWith("• "));
  if (bulletLines) {
    return `<ul>${lines
      .filter((line) => line.trim())
      .map((line) => `<li>${escapeHtml(line.replace(/^\s*•\s?/, ""))}</li>`)
      .join("")}</ul>`;
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/** HTML → plain text for previews, counts, and clipboard (IG-friendly). */
function htmlToPlain(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const preview = htmlToPlain(entry.body);
  return (
    <button
      className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${props.active ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]" : "border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_34%,transparent)]"}`}
      onClick={props.onSelect}
      type="button"
    >
      <span className="truncate text-sm">{entry.title || "Untitled"}</span>
      <p className="line-clamp-3 whitespace-pre-wrap text-2xs leading-relaxed text-muted-foreground">
        {preview || "Empty"}
      </p>
    </button>
  );
}

/** ---- Right: rich-text body + floating toolbar --------------------------- */

function ToolbarButton(props: {
  label: string;
  onClick: () => void;
  title: string;
}): React.JSX.Element {
  return (
    <button
      className="flex h-7 w-7 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] hover:text-foreground"
      // Keep the editor selection alive when clicking a toolbar button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
      title={props.title}
      type="button"
    >
      {props.label}
    </button>
  );
}

function RichBody(props: {
  entryId: string;
  html: string;
  onChange: (html: string) => void;
  onComment: (quote: string) => void;
}): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = React.useState<{ left: number; top: number } | null>(null);

  // Initialize content once (this component is keyed by entry id upstream, so
  // switching entries remounts and re-seeds instead of clobbering the caret).
  React.useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = looksLikeHtml(props.html) ? props.html : plainToHtml(props.html);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (): void => {
    if (ref.current) props.onChange(ref.current.innerHTML);
  };

  const refreshToolbar = (): void => {
    const selection = window.getSelection();
    const container = ref.current;
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !container) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    // Clamp the (center-anchored) toolbar so it never clips past either edge.
    const half = 150;
    const center = rect.left - host.left + rect.width / 2;
    setToolbar({
      left: Math.min(Math.max(center, half), Math.max(half, host.width - half)),
      top: rect.top - host.top,
    });
  };

  const exec = (command: string, value?: string): void => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    save();
    refreshToolbar();
  };

  return (
    <div className="relative flex-1">
      <div
        className="copy-rich h-full min-h-[8rem] w-full whitespace-pre-wrap rounded-md border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_3%,transparent)] p-3 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)]"
        contentEditable
        data-placeholder="Write the copy… select text to format"
        onBlur={save}
        onInput={save}
        onKeyUp={refreshToolbar}
        onMouseUp={refreshToolbar}
        ref={ref}
        suppressContentEditableWarning
      />
      {toolbar ? (
        <div
          className="absolute z-30 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-0.5 rounded-lg border border-border bg-[color:var(--popover)] px-1 py-1 shadow-2xl"
          style={{ left: toolbar.left, top: toolbar.top }}
        >
          <ToolbarButton label="B" onClick={() => exec("bold")} title="Bold" />
          <span className="italic">
            <ToolbarButton label="I" onClick={() => exec("italic")} title="Italic" />
          </span>
          <span className="underline">
            <ToolbarButton label="U" onClick={() => exec("underline")} title="Underline" />
          </span>
          <span className="line-through">
            <ToolbarButton label="S" onClick={() => exec("strikeThrough")} title="Strikethrough" />
          </span>
          <span className="mx-0.5 h-5 w-px bg-[color:color-mix(in_oklab,var(--border)_40%,transparent)]" />
          <ToolbarButton
            label="•"
            onClick={() => exec("insertUnorderedList")}
            title="Bullet list"
          />
          <ToolbarButton
            label="1."
            onClick={() => exec("insertOrderedList")}
            title="Numbered list"
          />
          <ToolbarButton
            label="🔗"
            onClick={() => {
              const url = window.prompt("Link URL");
              if (url) exec("createLink", /^https?:\/\//.test(url) ? url : `https://${url}`);
            }}
            title="Add link"
          />
          <ToolbarButton label="Tx" onClick={() => exec("removeFormat")} title="Clear formatting" />
          <span className="mx-0.5 h-5 w-px bg-[color:color-mix(in_oklab,var(--border)_40%,transparent)]" />
          <ToolbarButton
            label="💬"
            onClick={() => props.onComment(window.getSelection()?.toString() ?? "")}
            title="Comment on selection"
          />
        </div>
      ) : null}
    </div>
  );
}

/** ---- Right: editor (title + body) and a collapsible details column ------ */

/**
 * Local-buffered field so typing never fights the store: the input reads local
 * state (seeded once, since the editor is keyed by entry id) and commits on
 * change, so a re-render/refetch can't clobber the caret mid-keystroke.
 */
function useBuffered(
  initial: string,
  commit: (value: string) => void,
): [string, (value: string) => void] {
  const [local, setLocal] = React.useState(initial);
  return [local, (value: string) => {
    setLocal(value);
    commit(value);
  }];
}

function Editor(props: {
  detailsOpen: boolean;
  entry: JournalEntry;
  onToggleDetails: () => void;
}): React.JSX.Element {
  const { detailsOpen, entry } = props;
  const { copyFolders } = useProject();
  const [tagDraft, setTagDraft] = React.useState("");
  const [commentDraft, setCommentDraft] = React.useState("");
  const commentRef = React.useRef<HTMLInputElement>(null);
  const [title, setTitle] = useBuffered(entry.title, (value) =>
    updateJournalEntry(entry.id, { title: value }),
  );

  const plain = htmlToPlain(entry.body);

  const addTag = (): void => {
    const tag = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (tag && !entry.tags.includes(tag)) {
      updateJournalEntry(entry.id, { tags: [...entry.tags, tag] });
    }
    setTagDraft("");
  };

  const startComment = (quote: string): void => {
    if (!detailsOpen) props.onToggleDetails();
    setCommentDraft(quote ? `“${quote}” — ` : "");
    requestAnimationFrame(() => commentRef.current?.focus());
  };

  return (
    <>
      {/* Column 3 — headline + body only, left-aligned */}
      <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
        <div className="flex items-start gap-2">
          <input
            className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-muted-foreground"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Headline"
            value={title}
          />
          {!detailsOpen ? (
            <button
              className="shrink-0 rounded-md border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2 py-1 text-2xs text-muted-foreground hover:text-foreground"
              onClick={props.onToggleDetails}
              title="Show details"
              type="button"
            >
              Details ‹
            </button>
          ) : null}
        </div>
        <RichBody
          entryId={entry.id}
          html={entry.body}
          onChange={(html) => updateJournalEntry(entry.id, { body: html })}
          onComment={startComment}
        />
      </section>

      {/* Column 4 — collapsible details: folder, tags, actions, comments */}
      {detailsOpen ? (
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              Details
            </span>
            <button
              className="text-2xs text-muted-foreground hover:text-foreground"
              onClick={props.onToggleDetails}
              title="Hide details"
              type="button"
            >
              ›
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Folder
            </span>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Tags
            </span>
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
                className="w-24 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                onBlur={addTag}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addTag()}
                placeholder="# add tag"
                value={tagDraft}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              className="rounded-md border border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] px-2.5 py-1 text-2xs hover:border-[color:var(--accent)]"
              onClick={() => {
                void navigator.clipboard?.writeText(plain);
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
          <span className="text-[10px] text-muted-foreground">
            {wordCount(plain)} words · {plain.length} characters
          </span>

          <div className="flex flex-col gap-2 border-t border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] pt-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Comments {entry.comments.length > 0 ? `· ${entry.comments.length}` : ""}
            </span>
            {entry.comments.map((comment) => (
              <div className="group flex flex-col gap-0.5" key={comment.id}>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xs font-medium">{comment.author}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {shortDate(comment.createdAt)}
                  </span>
                  <button
                    className="ml-auto text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
                    onClick={() => deleteJournalComment(entry.id, comment.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
                <p className="text-xs-plus leading-relaxed text-muted-foreground">
                  {comment.body}
                </p>
              </div>
            ))}
            <input
              className="h-8 w-full rounded-md border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)] bg-transparent px-2 text-xs-plus outline-none placeholder:text-muted-foreground focus:border-[color:var(--accent)]"
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && commentDraft.trim()) {
                  addJournalComment(entry.id, commentDraft);
                  setCommentDraft("");
                }
              }}
              placeholder="Add a comment…"
              ref={commentRef}
              value={commentDraft}
            />
          </div>
        </aside>
      ) : null}
    </>
  );
}

/** ---- Screen ------------------------------------------------------------- */

export function CopyScreen(): React.JSX.Element {
  const project = useProject();
  const [folderId, setFolderId] = React.useState<string>(ALL);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(true);

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

  const selected = project.journal.find((entry) => entry.id === selectedId) ?? null;

  const createEntry = (): void => {
    const target = folderId === ALL || folderId === UNFILED ? null : folderId;
    const id = addJournalEntry("copy", "Untitled copy", "", target);
    setSelectedId(id);
  };

  const addFolder = (parentId: string | null): void => {
    setFolderId(addCopyFolder("New folder", parentId));
  };

  const removeFolder = (folder: FolderNode): void => {
    deleteCopyFolder(folder.id);
    if (subtreeIds(project.copyFolders, folder.id).has(folderId)) setFolderId(ALL);
  };

  const unfiledCount = countFor(UNFILED);
  const showDetailsCol = Boolean(selected) && detailsOpen;
  const addLabel = folderId === ALL || folderId === UNFILED ? "Add board" : "Add sub-board";

  return (
    <div
      className={`grid h-full min-h-0 divide-x divide-[color:color-mix(in_oklab,var(--border)_26%,transparent)] ${
        showDetailsCol
          ? "grid-cols-[190px_minmax(220px,300px)_1fr_320px]"
          : "grid-cols-[190px_minmax(220px,300px)_1fr]"
      }`}
    >
      {/* Column 1 — folders */}
      <aside className="flex min-h-0 flex-col overflow-hidden p-3">
        <div className="mb-1 flex shrink-0 items-center justify-between px-2">
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
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
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
        <button
          className="mt-2 shrink-0 rounded-md border border-[color:color-mix(in_oklab,var(--border)_20%,transparent)] py-1.5 text-2xs text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
          onClick={() => addFolder(folderId === ALL || folderId === UNFILED ? null : folderId)}
          type="button"
        >
          + {addLabel}
        </button>
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

      {/* Columns 3 (+ 4) — editor / details */}
      {selected ? (
        <Editor
          detailsOpen={detailsOpen}
          entry={selected}
          key={selected.id}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
        />
      ) : (
        <section className="min-h-0 overflow-y-auto p-6">
          <p className="text-2xs text-muted-foreground">
            Select a copy block to edit, or add a new one.
          </p>
        </section>
      )}
    </div>
  );
}
