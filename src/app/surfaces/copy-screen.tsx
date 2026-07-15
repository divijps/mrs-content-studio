import * as React from "react";

import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleIcon,
  CopySimpleIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Badge, Separator } from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";
import { toast } from "sonner";

import {
  addCopyFolder,
  addCopySnippet,
  addJournalEntry,
  consumeCopyEntry,
  consumeCopySnippet,
  COPY_ENTRY_EVENT,
  COPY_SNIPPET_EVENT,
  deleteCopyFolder,
  deleteCopySnippet,
  deleteJournalEntry,
  renameCopyFolder,
  updateCopySnippet,
  updateJournalEntry,
  useProject,
} from "../data/project-store";
import type { CopyFolder, CopyRole, CopySnippet, JournalEntry } from "../data/types";
import { Chip } from "../ui/inspector-kit";

const ALL = "__all__";
const UNFILED = "__unfiled__";

/** Filled control style cloned from the Library asset panel (asset-detail.tsx)
 * so the inspector dropdowns read as the same design system. */
const FIELD_CLASS =
  "h-auto w-full rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]";

/** Content-level override so a dropdown's options match the trigger's text
 * size (FIELD_CLASS is text-sm; the popup default is smaller). */
const MENU_MATCH_CLASS = "[&_[data-slot=select-item]]:!text-sm";

const ROLE_LABEL: Record<CopyRole, string> = {
  body: "Body",
  headline: "Headline",
  subhead: "Sub-head",
};

/** What the ready-to-go composer can create (replaces the old "+ New" menu). */
const COMPOSER_ROLES: readonly { label: string; value: "note" | CopyRole }[] = [
  { label: "Note", value: "note" },
  { label: "Headline", value: "headline" },
  { label: "Sub-head", value: "subhead" },
  { label: "Body", value: "body" },
];

/** Grid + inspector both walk one union so notes and snippets read as one library. */
type CopyItem =
  | { entry: JournalEntry; kind: "note" }
  | { kind: "snippet"; snippet: CopySnippet };

type Selection = { id: string; kind: "note" | "snippet" };

/** Type filter across the unified grid. */
type TypeFilter = "all" | "notes" | CopyRole;

const TYPE_OPTIONS: readonly { label: string; value: TypeFilter }[] = [
  { label: "All", value: "all" },
  { label: "Headlines", value: "headline" },
  { label: "Sub-heads", value: "subhead" },
  { label: "Body", value: "body" },
  { label: "Notes", value: "notes" },
];

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
  const bulletLines =
    lines.filter((line) => line.trim()).length > 0 &&
    lines.filter((line) => line.trim()).every((line) => line.trimStart().startsWith("• "));
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

/**
 * Local-buffered field so typing never fights the store: the input reads local
 * state (seeded once, since the editor is keyed by item id) and commits on
 * change, so a re-render/refetch can't clobber the caret mid-keystroke.
 */
function useBuffered(
  initial: string,
  commit: (value: string) => void,
): [string, (value: string) => void] {
  const [local, setLocal] = React.useState(initial);
  return [
    local,
    (value: string) => {
      setLocal(value);
      commit(value);
    },
  ];
}

/** ---- Left rail: folders + tags ------------------------------------------ */

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
        className={`group flex items-center gap-1 rounded-md pr-1 ${active ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
        style={{ paddingLeft: props.depth * 12 }}
      >
        <button
          aria-label={expanded ? "Collapse" : "Expand"}
          className={`flex h-5 w-4 items-center justify-center text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] ${hasChildren ? "" : "invisible"}`}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center py-1 text-left text-xs-plus"
          onClick={() => props.onSelect(node.id)}
          onDoubleClick={() => setEditing(true)}
          type="button"
        >
          <span className="truncate">{node.name}</span>
        </button>
        <button
          className="row-action flex h-5 w-4 shrink-0 items-center justify-center rounded text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:text-[color:var(--foreground)]"
          onClick={() => props.onAddChild(node.id)}
          title="Add a sub-folder"
          type="button"
        >
          <PlusIcon size={12} />
        </button>
        <button
          className="row-action flex h-5 w-4 shrink-0 items-center justify-center rounded text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)] hover:text-[color:var(--destructive)]"
          onClick={() => props.onDelete(node)}
          title="Delete folder"
          type="button"
        >
          <XIcon size={12} />
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

/** ---- Grid card (shared shell for notes + snippets) ---------------------- */

function CopyItemCard(props: {
  active: boolean;
  item: CopyItem;
  onSelect: () => void;
}): React.JSX.Element {
  const { item } = props;
  // One quiet raised surface per item — tone divides it from the page, no
  // border. One typeface: an uppercase eyebrow names the shape, the copy
  // itself reads in the UI face. Details (tags, comments) live in the inspector.
  const shell = `flex min-h-[11rem] flex-col gap-2.5 rounded-2xl p-4 text-left transition-colors ${
    props.active
      ? "bg-[color:var(--surface-active)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--accent)_45%,transparent)]"
      : "bg-[color:var(--surface-inactive)] hover:bg-[color:var(--surface-active)]"
  }`;
  const eyebrow = "text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground";

  if (item.kind === "snippet") {
    const { snippet } = item;
    return (
      <button className={shell} onClick={props.onSelect} type="button">
        <span className={eyebrow}>{ROLE_LABEL[snippet.role]}</span>
        {snippet.title ? (
          <span className="line-clamp-2 text-base leading-snug text-foreground">
            {snippet.title}
          </span>
        ) : null}
        <p
          className={
            snippet.title
              ? "line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
              : "line-clamp-4 text-base leading-snug text-foreground"
          }
        >
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
    );
  }

  const { entry } = item;
  const preview = htmlToPlain(entry.body);
  return (
    <button className={shell} onClick={props.onSelect} type="button">
      <span className={eyebrow}>Note</span>
      <span className="line-clamp-2 text-base leading-snug text-foreground">
        {entry.title || "Untitled"}
      </span>
      {preview ? (
        <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {preview}
        </p>
      ) : null}
    </button>
  );
}

/** ---- Note inspector: rich body + floating toolbar ----------------------- */

function ToolbarButton(props: {
  label: React.ReactNode;
  onClick: () => void;
  title: string;
}): React.JSX.Element {
  return (
    <button
      className="flex h-7 w-7 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] hover:text-foreground"
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
  html: string;
  onChange: (html: string) => void;
  onComment?: (quote: string) => void;
}): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = React.useState<{ left: number; top: number } | null>(null);

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
        className="copy-rich h-full min-h-[40vh] w-full whitespace-pre-wrap rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] p-3 text-sm leading-relaxed outline-none transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_34%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]"
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
          <span className="mx-0.5 h-5 w-px bg-[color:color-mix(in_oklab,var(--border)_40%,transparent)]" />
          <ToolbarButton label="•" onClick={() => exec("insertUnorderedList")} title="Bullet list" />
          <ToolbarButton
            label="1."
            onClick={() => exec("insertOrderedList")}
            title="Numbered list"
          />
          <ToolbarButton
            label={<LinkIcon size={14} />}
            onClick={() => {
              const url = window.prompt("Link URL");
              if (url) exec("createLink", /^https?:\/\//.test(url) ? url : `https://${url}`);
            }}
            title="Add link"
          />
          <ToolbarButton label="Tx" onClick={() => exec("removeFormat")} title="Clear formatting" />
          {props.onComment ? (
            <>
              <span className="mx-0.5 h-5 w-px bg-[color:color-mix(in_oklab,var(--border)_40%,transparent)]" />
              <ToolbarButton
                label={<ChatCircleIcon size={14} />}
                onClick={() => props.onComment?.(window.getSelection()?.toString() ?? "")}
                title="Comment on selection"
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shared inspector chrome: a scrolling writing surface with the category +
 * content-type dropdown pair anchored at its foot (mt-auto). Copy/Delete live
 * as icons in the panel header beside the close button.
 */
function InspectorShell(props: {
  category: React.ReactNode;
  children: React.ReactNode;
  contentType: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {props.children}
        <div className="mt-auto grid shrink-0 grid-cols-2 gap-2">
          {props.category}
          {props.contentType}
        </div>
      </div>
    </div>
  );
}

function NoteInspector(props: { entry: JournalEntry }): React.JSX.Element {
  const { entry } = props;
  const { copyFolders } = useProject();
  const [title, setTitle] = useBuffered(entry.title, (value) =>
    updateJournalEntry(entry.id, { title: value }),
  );

  return (
    <InspectorShell
      category={
        <Select
          items={[
            { label: "Unfiled", value: UNFILED },
            ...copyFolders.map((folder) => ({ label: folder.name, value: folder.id })),
          ]}
          onValueChange={(value) =>
            updateJournalEntry(entry.id, {
              folderId: value === UNFILED ? null : String(value),
            })
          }
          value={entry.folderId ?? UNFILED}
        >
          <SelectTrigger className={`${FIELD_CLASS} justify-between`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className={MENU_MATCH_CLASS}>
            <SelectGroup>
              <SelectItem value={UNFILED}>Unfiled</SelectItem>
              {copyFolders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
      contentType={
        <Select disabled items={[{ label: "Note", value: "note" }]} value="note">
          <SelectTrigger className={`${FIELD_CLASS} justify-between`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className={MENU_MATCH_CLASS}>
            <SelectGroup>
              <SelectItem value="note">Note</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    >
      <input
        className="w-full bg-transparent text-2xl font-semibold leading-tight outline-none placeholder:text-[color:var(--muted-foreground)]"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Headline"
        value={title}
      />
      <RichBody
        html={entry.body}
        onChange={(html) => updateJournalEntry(entry.id, { body: html })}
      />
    </InspectorShell>
  );
}

/** ---- Snippet inspector -------------------------------------------------- */

function SnippetInspector(props: { snippet: CopySnippet }): React.JSX.Element {
  const { snippet } = props;
  // Commit on blur (like the text field below): per-keystroke upserts of the
  // full row race each other fire-and-forget, and a stale prefix can land last.
  const [title, setTitle] = React.useState(snippet.title ?? "");
  React.useEffect(() => setTitle(snippet.title ?? ""), [snippet.title]);
  const commitTitle = (): void => {
    const trimmed = title.trim();
    if ((trimmed || null) !== (snippet.title ?? null)) {
      updateCopySnippet(snippet.id, { title: trimmed || null });
    }
  };
  const [text, setText] = React.useState(snippet.text);
  React.useEffect(() => setText(snippet.text), [snippet.text]);

  const commitText = (): void => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== snippet.text) {
      updateCopySnippet(snippet.id, { text: trimmed });
    } else if (!trimmed) {
      setText(snippet.text);
    }
  };

  return (
    <InspectorShell
      category={
        <Select disabled items={[{ label: "Unfiled", value: UNFILED }]} value={UNFILED}>
          <SelectTrigger className={`${FIELD_CLASS} justify-between`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className={MENU_MATCH_CLASS}>
            <SelectGroup>
              <SelectItem value={UNFILED}>Unfiled</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      }
      contentType={
        <Select
          items={[
            { label: "Headline", value: "headline" },
            { label: "Sub-head", value: "subhead" },
            { label: "Body", value: "body" },
          ]}
          onValueChange={(value) => updateCopySnippet(snippet.id, { role: value as CopyRole })}
          value={snippet.role}
        >
          <SelectTrigger className={`${FIELD_CLASS} justify-between`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className={MENU_MATCH_CLASS}>
            <SelectGroup>
              <SelectItem value="headline">Headline</SelectItem>
              <SelectItem value="subhead">Sub-head</SelectItem>
              <SelectItem value="body">Body</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    >
      <input
        className="w-full bg-transparent text-2xl font-semibold leading-tight outline-none placeholder:text-[color:var(--muted-foreground)]"
        onBlur={commitTitle}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Headline"
        value={title}
      />
      <textarea
        className="min-h-[40vh] w-full flex-1 resize-none rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] p-3 text-sm leading-relaxed outline-none transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_34%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]"
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        placeholder="Copy text…"
        value={text}
      />
    </InspectorShell>
  );
}

/** ---- Screen ------------------------------------------------------------- */

export function CopyScreen(): React.JSX.Element {
  const project = useProject();
  const [folderId, setFolderId] = React.useState<string>(ALL);
  const [type, setType] = React.useState<TypeFilter>("all");
  const [tag, setTag] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Selection | null>(null);
  // Two-step delete in the inspector header; re-arms whenever selection moves.
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  React.useEffect(() => setConfirmDelete(false), [selected]);

  // Cross-surface intent (task links, search): open a specific note.
  React.useEffect(() => {
    const check = (): void => {
      const pending = consumeCopyEntry();
      if (pending) {
        setFolderId(ALL);
        setType("all");
        setTag(null);
        setSelected({ id: pending, kind: "note" });
      }
    };
    check();
    window.addEventListener(COPY_ENTRY_EVENT, check);
    return () => window.removeEventListener(COPY_ENTRY_EVENT, check);
  }, []);

  // Cross-surface intent (search): focus a specific copy snippet.
  React.useEffect(() => {
    const check = (): void => {
      const pending = consumeCopySnippet();
      if (pending) {
        setFolderId(ALL);
        setType("all");
        setTag(null);
        setSelected({ id: pending, kind: "snippet" });
      }
    };
    check();
    window.addEventListener(COPY_SNIPPET_EVENT, check);
    return () => window.removeEventListener(COPY_SNIPPET_EVENT, check);
  }, []);

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

  const allTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const snippet of project.copySnippets) {
      for (const t of snippet.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const entry of project.journal) {
      for (const t of entry.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [project.copySnippets, project.journal]);

  // Build the unified, filtered item list. Snippets have no folder, so any
  // folder scope (other than "All copy") naturally hides them.
  const items = React.useMemo<CopyItem[]>(() => {
    const term = query.trim().toLowerCase();
    const noteScope = folderId === ALL ? null : subtreeIds(project.copyFolders, folderId);

    const snippetItems: CopyItem[] =
      folderId === ALL && type !== "notes"
        ? project.copySnippets
            .filter((snippet) => (type === "all" ? true : snippet.role === type))
            .filter((snippet) => (tag ? snippet.tags.includes(tag) : true))
            .filter((snippet) =>
              term
                ? snippet.text.toLowerCase().includes(term) ||
                  (snippet.title ?? "").toLowerCase().includes(term) ||
                  snippet.tags.some((t) => t.includes(term))
                : true,
            )
            .map((snippet) => ({ kind: "snippet", snippet }))
        : [];

    const noteItems: CopyItem[] =
      type === "all" || type === "notes"
        ? project.journal
            .filter((entry) => {
              if (folderId === UNFILED) return entry.folderId === null;
              if (noteScope) return entry.folderId != null && noteScope.has(entry.folderId);
              return true;
            })
            .filter((entry) => (tag ? entry.tags.includes(tag) : true))
            .filter((entry) => {
              if (!term) return true;
              return (
                entry.title.toLowerCase().includes(term) ||
                htmlToPlain(entry.body).toLowerCase().includes(term) ||
                entry.tags.some((t) => t.includes(term))
              );
            })
            .map((entry) => ({ entry, kind: "note" }))
        : [];

    return [...snippetItems, ...noteItems];
  }, [project.copySnippets, project.journal, project.copyFolders, folderId, type, tag, query]);

  const selectedItem: CopyItem | null = React.useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "note") {
      const entry = project.journal.find((candidate) => candidate.id === selected.id);
      return entry ? { entry, kind: "note" } : null;
    }
    const snippet = project.copySnippets.find((candidate) => candidate.id === selected.id);
    return snippet ? { kind: "snippet", snippet } : null;
  }, [selected, project.journal, project.copySnippets]);

  // Ready-to-go composer: type, pick a shape, Enter. Snippets are quick capture
  // (stay in the composer flow); notes open the inspector for long-form writing.
  const [composerDraft, setComposerDraft] = React.useState("");
  const [composerRole, setComposerRole] = React.useState<"note" | CopyRole>("note");

  const submitComposer = (): void => {
    const draft = composerDraft.trim();
    if (!draft) return;
    if (composerRole === "note") {
      const [first = "", ...rest] = draft.split("\n");
      const target = folderId === ALL || folderId === UNFILED ? null : folderId;
      const id = addJournalEntry(
        "copy",
        first.trim() || "Untitled copy",
        plainToHtml(rest.join("\n").trim()),
        target,
      );
      // Keep the new note visible: a role filter would hide it.
      if (type !== "all" && type !== "notes") setType("all");
      setSelected({ id, kind: "note" });
    } else {
      addCopySnippet({ role: composerRole, text: draft });
      // A new snippet is unfiled, untagged, and role-typed — clear every filter
      // that would hide it, or the add reads as a silent no-op (and invites a
      // duplicate re-submit).
      if (folderId !== ALL) setFolderId(ALL);
      if (type !== "all" && type !== composerRole) setType(composerRole);
      if (tag !== null) setTag(null);
      if (query !== "") setQuery("");
    }
    setComposerDraft("");
  };

  const addFolder = (parentId: string | null): void => {
    setFolderId(addCopyFolder("New folder", parentId));
  };

  const removeFolder = (folder: FolderNode): void => {
    deleteCopyFolder(folder.id);
    if (subtreeIds(project.copyFolders, folder.id).has(folderId)) setFolderId(ALL);
  };

  const unfiledCount = project.journal.filter((entry) => entry.folderId === null).length;
  const totalCount = project.copySnippets.length + project.journal.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Left rail — folders + tags (desktop) */}
        <aside className="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] bg-[color:color-mix(in_oklab,var(--card)_55%,transparent)] md:flex">
          <div className="flex flex-col gap-0.5 p-2">
            <button
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs-plus ${folderId === ALL ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
              onClick={() => setFolderId(ALL)}
              type="button"
            >
              <span>All copy</span>
              <Badge variant="outline">{totalCount}</Badge>
            </button>
            {unfiledCount > 0 ? (
              <button
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs-plus ${folderId === UNFILED ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
                onClick={() => setFolderId(UNFILED)}
                type="button"
              >
                <span>Unfiled</span>
              </button>
            ) : null}
          </div>
          <Separator />
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
              Folders
            </span>
            <button
              className="text-[color:color-mix(in_oklab,var(--foreground)_55%,transparent)] hover:text-[color:var(--foreground)]"
              onClick={() => addFolder(null)}
              title="New folder"
              type="button"
            >
              +
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
            {tree.length === 0 ? (
              <p className="px-2 py-4 text-2xs text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                No folders yet.
              </p>
            ) : (
              tree.map((node) => (
                <FolderTreeRow
                  activeId={folderId}
                  depth={0}
                  key={node.id}
                  node={node}
                  onAddChild={(parentId) => addFolder(parentId)}
                  onDelete={removeFolder}
                  onSelect={setFolderId}
                />
              ))
            )}
          </div>
          {allTags.length > 0 ? (
            <>
              <Separator />
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-2xs uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)]">
                  Tags
                </span>
              </div>
              {/* Bounded + scrollable so a tag-heavy project can't crush the
               * folder tree above or clip chips behind the aside's overflow. */}
              <div className="flex max-h-44 shrink-0 flex-wrap gap-1 overflow-y-auto px-2 pb-3">
                <Chip active={tag === null} onClick={() => setTag(null)}>
                  All
                </Chip>
                {allTags.map((t) => (
                  <Chip active={tag === t} key={t} onClick={() => setTag(tag === t ? null : t)}>
                    #{t}
                  </Chip>
                ))}
              </div>
            </>
          ) : null}
        </aside>

        {/* Main — filter chips + unified grid. Hidden while the inspector fills
         * the space (mobile + md); returns as the middle column at xl. */}
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--background)] ${selectedItem ? "hidden xl:flex" : "flex"}`}
        >
          <div className="flex shrink-0 flex-col gap-3 px-4 py-3">
            {/* Ready-to-go composer — a quiet raised surface that invites
             * writing: pick the shape via the eyebrow, write, Save. */}
            <form
              className="flex flex-col gap-2 rounded-2xl bg-[color:var(--surface-inactive)] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                submitComposer();
              }}
            >
              <div className="relative inline-flex items-center self-start text-muted-foreground">
                <select
                  aria-label="What to create"
                  className="appearance-none bg-transparent pr-5 text-2xs font-medium uppercase tracking-[0.14em] outline-none"
                  onChange={(event) => setComposerRole(event.target.value as "note" | CopyRole)}
                  value={composerRole}
                >
                  {COMPOSER_ROLES.map((option) => (
                    <option key={option.value} value={option.value}>
                      New {option.label.toLowerCase()}
                    </option>
                  ))}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-0" size={11} />
              </div>
              <textarea
                className="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-[color:var(--muted-foreground)]"
                onChange={(event) => setComposerDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter writes; ⌘/Ctrl+Enter saves.
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submitComposer();
                  }
                }}
                placeholder="Write some copy"
                rows={4}
                value={composerDraft}
              />
              <div className="flex justify-end">
                <button
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--surface-active)] px-4 text-sm text-foreground transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!composerDraft.trim()}
                  type="submit"
                >
                  Save
                  <CaretRightIcon size={13} />
                </button>
              </div>
            </form>

            {/* One quiet filter line: category (mobile — the rail owns it on
             * desktop), the type tabs as plain text, search on the right. */}
            <div className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b border-[color:color-mix(in_oklab,var(--border)_12%,transparent)] pb-2.5">
              <div className="relative flex shrink-0 items-center text-muted-foreground md:hidden">
                <select
                  aria-label="Category"
                  className="appearance-none bg-transparent pr-5 text-sm outline-none"
                  onChange={(event) => setFolderId(event.target.value)}
                  value={folderId}
                >
                  <option value={ALL}>Category</option>
                  {project.copyFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                  {unfiledCount > 0 ? <option value={UNFILED}>Unfiled</option> : null}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-0" size={12} />
              </div>
              {TYPE_OPTIONS.map((option) => (
                <button
                  className={`shrink-0 text-sm transition-colors ${
                    type === option.value
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  key={option.value}
                  onClick={() => setType(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
              <div className="relative ml-auto hidden shrink-0 items-center sm:flex">
                <MagnifyingGlassIcon
                  className="pointer-events-none absolute left-2.5 text-muted-foreground"
                  size={16}
                />
                <input
                  className="h-8 w-44 rounded-lg bg-[color:var(--surface-inactive)] pl-8 pr-3 text-sm outline-none focus:bg-[color:var(--surface-active)]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search copy…"
                  value={query}
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <p className="text-center text-sm text-muted-foreground">
                  {totalCount === 0
                    ? "No copy yet — start writing above, or save a headline from the Studio."
                    : "Nothing matches these filters."}
                </p>
                {totalCount > 0 ? (
                  <button
                    className="rounded-lg bg-[color:var(--surface-inactive)] px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-[color:var(--surface-active)]"
                    onClick={() => {
                      // The search input hides below sm — this is the escape
                      // hatch so a stale query can't strand an empty grid.
                      setQuery("");
                      setTag(null);
                      setType("all");
                      setFolderId(ALL);
                    }}
                    type="button"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {items.map((item) => {
                  const id = item.kind === "note" ? item.entry.id : item.snippet.id;
                  return (
                    <CopyItemCard
                      active={selected?.kind === item.kind && selected.id === id}
                      item={item}
                      key={`${item.kind}:${id}`}
                      onSelect={() => setSelected({ id, kind: item.kind })}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Inspector — right column (desktop) / full-screen (mobile) */}
        {selectedItem ? (
          <aside className="fixed inset-0 z-40 flex min-h-0 flex-col bg-[color:var(--background)] md:static md:z-auto md:flex-1 md:border-l md:border-[color:var(--border)] xl:w-[420px] xl:flex-none xl:shrink-0">
            <header className="flex h-11 shrink-0 items-center gap-1 border-b border-[color:var(--border)] px-3">
              <button
                aria-label="Back"
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-muted-foreground hover:text-foreground md:hidden"
                onClick={() => setSelected(null)}
                type="button"
              >
                <CaretLeftIcon size={16} />
              </button>
              <button
                aria-label="Copy text"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    selectedItem.kind === "note"
                      ? htmlToPlain(selectedItem.entry.body)
                      : selectedItem.snippet.text,
                  );
                  toast.success("Copied to clipboard");
                }}
                title="Copy text"
                type="button"
              >
                <CopySimpleIcon size={16} />
              </button>
              <button
                aria-label={confirmDelete ? "Confirm delete" : "Delete"}
                className={`flex h-8 items-center justify-center rounded-md ${
                  confirmDelete
                    ? "px-2 text-2xs font-medium text-red-400 hover:text-red-300"
                    : "w-8 text-muted-foreground hover:text-foreground"
                }`}
                onBlur={() => setConfirmDelete(false)}
                onClick={() => {
                  // Two-step: this icon sits one slip away from Close, and
                  // deletion is permanent (no undo).
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  if (selectedItem.kind === "note") deleteJournalEntry(selectedItem.entry.id);
                  else deleteCopySnippet(selectedItem.snippet.id);
                  setConfirmDelete(false);
                }}
                title="Delete"
                type="button"
              >
                {confirmDelete ? "Delete?" : <TrashSimpleIcon size={16} />}
              </button>
              <button
                aria-label="Close"
                className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:flex"
                onClick={() => setSelected(null)}
                type="button"
              >
                <XIcon size={16} />
              </button>
            </header>
            {selectedItem.kind === "note" ? (
              <NoteInspector entry={selectedItem.entry} key={selectedItem.entry.id} />
            ) : (
              <SnippetInspector key={selectedItem.snippet.id} snippet={selectedItem.snippet} />
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
