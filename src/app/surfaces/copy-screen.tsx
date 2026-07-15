import * as React from "react";

import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PanelActions,
} from "@/toolcraft/ui";
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
  addJournalComment,
  addJournalEntry,
  consumeCopyEntry,
  consumeCopySnippet,
  COPY_ENTRY_EVENT,
  COPY_SNIPPET_EVENT,
  deleteCopyFolder,
  deleteCopySnippet,
  deleteJournalComment,
  deleteJournalEntry,
  renameCopyFolder,
  updateCopySnippet,
  updateJournalEntry,
  useProject,
} from "../data/project-store";
import type { CopyFolder, CopyRole, CopySnippet, JournalEntry } from "../data/types";
import { renderWithMentions, useTeamRoster } from "../library/mentions";
import {
  Chip,
  Field,
  FilterChips,
  InspectorSection,
  Segmented,
  TagInput,
  TextAreaField,
} from "../ui/inspector-kit";

const ALL = "__all__";
const UNFILED = "__unfiled__";

const ROLE_LABEL: Record<CopyRole, string> = {
  body: "Body",
  headline: "Headline",
  subhead: "Sub-head",
};

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

/** A headline snippet carrying a flourish preset gets a Romie swash preview. */
function snippetPreviewStyle(snippet: CopySnippet): React.CSSProperties | undefined {
  if (snippet.role !== "headline" || !snippet.flourish) {
    return undefined;
  }
  const italic = (snippet.flourish as { style?: string }).style === "italic";
  return {
    fontFamily: "Romie, serif",
    fontFeatureSettings: "'ss01'",
    fontStyle: italic ? "italic" : "normal",
  };
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
        className={`group flex items-center gap-0.5 rounded-md pr-1 transition-colors ${active ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
        style={{ paddingLeft: props.depth * 12 }}
      >
        <button
          aria-label={expanded ? "Collapse" : "Expand"}
          className={`flex h-5 w-4 items-center justify-center text-muted-foreground ${hasChildren ? "" : "invisible"}`}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
        </button>
        <button
          className="min-w-0 flex-1 truncate py-1 text-left text-xs-plus"
          onClick={() => props.onSelect(node.id)}
          onDoubleClick={() => setEditing(true)}
          type="button"
        >
          {node.name}
        </button>
        <button
          className="row-action shrink-0 px-1 text-2xs text-muted-foreground hover:text-foreground"
          onClick={() => props.onAddChild(node.id)}
          title="Add a sub-folder"
          type="button"
        >
          <PlusIcon size={12} />
        </button>
        <button
          className="row-action shrink-0 px-1 text-2xs text-muted-foreground hover:text-[color:var(--destructive)]"
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
  const shell = `flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${
    props.active
      ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_8%,transparent)]"
      : "border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:var(--card)] hover:border-[color:color-mix(in_oklab,var(--border)_34%,transparent)]"
  }`;

  if (item.kind === "snippet") {
    const { snippet } = item;
    return (
      <button className={shell} onClick={props.onSelect} type="button">
        <div className="flex items-center gap-1.5">
          <Chip tone={snippet.flourish ? "accent" : "neutral"}>
            {ROLE_LABEL[snippet.role]}
            {snippet.role === "headline" && snippet.flourish ? " · flourish" : ""}
          </Chip>
        </div>
        <p
          className="line-clamp-3 text-sm leading-snug text-foreground"
          style={snippetPreviewStyle(snippet)}
        >
          {snippet.text}
        </p>
        {snippet.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {snippet.tags.map((tag) => (
              <span
                className="rounded-full border border-[color:color-mix(in_oklab,var(--border)_26%,transparent)] px-2 py-0.5 text-2xs text-muted-foreground"
                key={tag}
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </button>
    );
  }

  const { entry } = item;
  const preview = htmlToPlain(entry.body);
  return (
    <button className={shell} onClick={props.onSelect} type="button">
      <div className="flex items-center gap-1.5">
        <Chip>Note</Chip>
        {entry.comments.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <ChatCircleIcon size={12} />
            {entry.comments.length}
          </span>
        ) : null}
      </div>
      <span className="truncate text-sm font-medium text-foreground">
        {entry.title || "Untitled"}
      </span>
      <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
        {preview || "Empty"}
      </p>
      {entry.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              className="rounded-full border border-[color:color-mix(in_oklab,var(--border)_26%,transparent)] px-2 py-0.5 text-2xs text-muted-foreground"
              key={tag}
            >
              #{tag}
            </span>
          ))}
        </div>
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
  onComment: (quote: string) => void;
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
          <span className="mx-0.5 h-5 w-px bg-[color:color-mix(in_oklab,var(--border)_40%,transparent)]" />
          <ToolbarButton
            label={<ChatCircleIcon size={14} />}
            onClick={() => props.onComment(window.getSelection()?.toString() ?? "")}
            title="Comment on selection"
          />
        </div>
      ) : null}
    </div>
  );
}

function NoteInspector(props: { entry: JournalEntry }): React.JSX.Element {
  const { entry } = props;
  const { copyFolders } = useProject();
  const roster = useTeamRoster();
  const [commentDraft, setCommentDraft] = React.useState("");
  const commentRef = React.useRef<HTMLInputElement>(null);
  const [title, setTitle] = useBuffered(entry.title, (value) =>
    updateJournalEntry(entry.id, { title: value }),
  );
  const plain = htmlToPlain(entry.body);

  const startComment = (quote: string): void => {
    setCommentDraft(quote ? `“${quote}” — ` : "");
    requestAnimationFrame(() => commentRef.current?.focus());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <input
        className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-[color:var(--muted-foreground)]"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Headline"
        value={title}
      />
      <RichBody
        html={entry.body}
        onChange={(html) => updateJournalEntry(entry.id, { body: html })}
        onComment={startComment}
      />

      <div className="-mx-4">
        <InspectorSection title="Details">
          <Field label="Folder">
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
              <SelectTrigger className="w-full justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
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
          </Field>
          <Field label="Tags">
            <TagInput
              onAdd={(tag) => updateJournalEntry(entry.id, { tags: [...entry.tags, tag] })}
              onRemove={(tag) =>
                updateJournalEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) })
              }
              tags={entry.tags}
            />
          </Field>
          <p className="text-2xs text-muted-foreground">
            {wordCount(plain)} words · {plain.length} characters
          </p>
        </InspectorSection>

        <PanelActions
          actions={[
            {
              icon: "copy",
              name: "Copy text",
              onClick: () => {
                void navigator.clipboard?.writeText(plain);
                toast.success("Copied to clipboard");
              },
              variant: "outline",
            },
            {
              name: "Delete",
              onClick: () => deleteJournalEntry(entry.id),
              variant: "outline",
            },
          ]}
        />

        <InspectorSection
          title={`Comments${entry.comments.length > 0 ? ` · ${entry.comments.length}` : ""}`}
        >
          <div className="flex flex-col gap-2">
            {entry.comments.map((comment) => (
              <div className="group flex flex-col gap-0.5" key={comment.id}>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xs font-medium">{comment.author}</span>
                  <span className="text-2xs text-muted-foreground">
                    {shortDate(comment.createdAt)}
                  </span>
                  <button
                    className="ml-auto text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
                    onClick={() => deleteJournalComment(entry.id, comment.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
                <p className="text-xs-plus leading-relaxed text-muted-foreground">
                  {renderWithMentions(comment.body, roster)}
                </p>
              </div>
            ))}
            <input
              className="h-9 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 text-xs-plus outline-none transition-colors placeholder:text-[color:var(--muted-foreground)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]"
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
        </InspectorSection>
      </div>
    </div>
  );
}

/** ---- Snippet inspector -------------------------------------------------- */

function SnippetInspector(props: { snippet: CopySnippet }): React.JSX.Element {
  const { snippet } = props;
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="-mx-4">
        <InspectorSection title={ROLE_LABEL[snippet.role]}>
          <div onBlur={commitText}>
            <TextAreaField
              onChange={setText}
              placeholder="Copy text…"
              value={text}
            />
          </div>
          <Segmented
            name="Role"
            onValueChange={(value) => updateCopySnippet(snippet.id, { role: value as CopyRole })}
            options={[
              { label: "Headline", value: "headline" },
              { label: "Sub-head", value: "subhead" },
              { label: "Body", value: "body" },
            ]}
            value={snippet.role}
          />
          {snippet.role === "headline" && snippet.flourish ? (
            <Field label="Flourish">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-sm text-foreground"
                  style={snippetPreviewStyle(snippet)}
                >
                  {snippet.text || "Preview"}
                </span>
                <button
                  className="shrink-0 text-2xs text-muted-foreground hover:text-[color:var(--destructive)]"
                  onClick={() => updateCopySnippet(snippet.id, { flourish: undefined })}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </Field>
          ) : null}
          <Field label="Tags">
            <TagInput
              onAdd={(tag) => updateCopySnippet(snippet.id, { tags: [...snippet.tags, tag] })}
              onRemove={(tag) =>
                updateCopySnippet(snippet.id, { tags: snippet.tags.filter((t) => t !== tag) })
              }
              tags={snippet.tags}
            />
          </Field>
        </InspectorSection>

        <PanelActions
          actions={[
            {
              icon: "copy",
              name: "Copy text",
              onClick: () => {
                void navigator.clipboard?.writeText(snippet.text);
                toast.success("Copied to clipboard");
              },
              variant: "outline",
            },
            {
              name: "Delete",
              onClick: () => deleteCopySnippet(snippet.id),
              variant: "outline",
            },
          ]}
        />
      </div>
    </div>
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

  const createNote = (): void => {
    const target = folderId === ALL || folderId === UNFILED ? null : folderId;
    const id = addJournalEntry("copy", "Untitled copy", "", target);
    setType("all");
    setSelected({ id, kind: "note" });
  };

  const createSnippet = (role: CopyRole): void => {
    const snippet = addCopySnippet({ role, text: "" });
    setFolderId(ALL);
    setType(role);
    setSelected({ id: snippet.id, kind: "snippet" });
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
      {/* Top bar — search + create */}
      <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-4 py-2.5">
        <span className="text-sm font-medium">Copy</span>
        <span className="text-2xs text-muted-foreground">{totalCount}</span>
        <div className="relative ml-auto hidden items-center sm:flex">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-2.5 text-muted-foreground"
            size={16}
          />
          <input
            className="h-8 w-52 rounded-lg bg-[color:var(--surface-inactive)] pl-8 pr-3 text-sm outline-none focus:bg-[color:var(--surface-active)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search copy…"
            value={query}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--accent)] px-3 text-xs-plus font-medium text-[color:var(--accent-foreground)] transition-opacity hover:opacity-90"
                type="button"
              >
                <PlusIcon size={16} />
                New
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={createNote}>Note</DropdownMenuItem>
            <DropdownMenuItem onClick={() => createSnippet("headline")}>Headline</DropdownMenuItem>
            <DropdownMenuItem onClick={() => createSnippet("subhead")}>Sub-head</DropdownMenuItem>
            <DropdownMenuItem onClick={() => createSnippet("body")}>Body</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail — folders + tags (desktop) */}
        <aside className="hidden w-[200px] shrink-0 flex-col overflow-hidden border-r border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,var(--background))] p-3 md:flex lg:w-[220px]">
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            <button
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs-plus transition-colors ${folderId === ALL ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
              onClick={() => setFolderId(ALL)}
              type="button"
            >
              <span>All copy</span>
              <span className="text-2xs tabular-nums text-muted-foreground">{totalCount}</span>
            </button>

            <div className="mt-3 mb-1 flex items-center justify-between px-2">
              <span className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
                Folders
              </span>
              <button
                className="text-sm leading-none text-muted-foreground hover:text-foreground"
                onClick={() => addFolder(null)}
                title="New folder"
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
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
              <button
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs-plus transition-colors ${folderId === UNFILED ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)]" : "hover:bg-[color:color-mix(in_oklab,var(--foreground)_5%,transparent)]"}`}
                onClick={() => setFolderId(UNFILED)}
                type="button"
              >
                <span>Unfiled</span>
              </button>
            ) : null}

            {allTags.length > 0 ? (
              <>
                <div className="mt-3 mb-1 px-2">
                  <span className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
                    Tags
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 px-1">
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
          </div>
        </aside>

        {/* Main — filter chips + unified grid. Hidden while the inspector fills
         * the space (mobile + md); returns as the middle column at xl. */}
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--background)] ${selectedItem ? "hidden xl:flex" : "flex"}`}
        >
          <div className="flex shrink-0 flex-col gap-2 px-4 py-3">
            <FilterChips onChange={setType} options={TYPE_OPTIONS} value={type} />
            {/* Mobile: folder + search live here since the rail is desktop-only */}
            <div className="flex items-center gap-2 md:hidden">
              <select
                className="h-8 min-w-0 rounded-lg bg-[color:var(--surface-inactive)] px-2 text-xs text-foreground outline-none"
                onChange={(event) => setFolderId(event.target.value)}
                value={folderId}
              >
                <option value={ALL}>All copy</option>
                {project.copyFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
                {unfiledCount > 0 ? <option value={UNFILED}>Unfiled</option> : null}
              </select>
              {/* Search input only below sm — the header search covers ≥640px,
               * so it would otherwise double up in the 640–767 band. The folder
               * <select> stays until md, where the desktop rail takes over. */}
              <input
                className="h-8 min-w-0 flex-1 rounded-lg bg-[color:var(--surface-inactive)] px-3 text-xs outline-none sm:hidden"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search copy…"
                value={query}
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5">
            {items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {totalCount === 0
                  ? "No copy yet — add a note or a snippet with New, or save a headline from the Studio."
                  : "Nothing matches these filters."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3">
              <button
                aria-label="Back"
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-muted-foreground hover:text-foreground md:hidden"
                onClick={() => setSelected(null)}
                type="button"
              >
                <CaretLeftIcon size={16} />
              </button>
              <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {selectedItem.kind === "note" ? "Note" : ROLE_LABEL[selectedItem.snippet.role]}
              </span>
              <button
                aria-label="Close"
                className="ml-auto hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:flex"
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
