import * as React from "react";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";

import {
  addCopySnippet,
  deleteCopySnippet,
  updateCopySnippet,
  useProject,
} from "../data/project-store";
import type { CopyRole, CopySnippet } from "../data/types";

const ROLE_LABEL: Record<CopyRole, string> = {
  body: "Body",
  headline: "Headline",
  subhead: "Sub-head",
};

const ROLE_ORDER: CopyRole[] = ["headline", "subhead", "body"];

/** A headline snippet carrying a flourish preset gets a Romie swash preview. */
function snippetPreviewStyle(snippet: CopySnippet): React.CSSProperties | undefined {
  if (snippet.role !== "headline" || !snippet.flourish) {
    return undefined;
  }
  const italic = snippet.flourish.style === "italic";
  return {
    fontFamily: "Romie, serif",
    fontFeatureSettings: "'ss01'",
    fontStyle: italic ? "italic" : "normal",
  };
}

function SnippetCard(props: { snippet: CopySnippet }): React.JSX.Element {
  const { snippet } = props;
  const [text, setText] = React.useState(snippet.text);
  const [tagDraft, setTagDraft] = React.useState("");

  // Keep local text in sync if the record changes underneath (realtime).
  React.useEffect(() => {
    setText(snippet.text);
  }, [snippet.text]);

  const commitText = (): void => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== snippet.text) {
      updateCopySnippet(snippet.id, { text: trimmed });
    } else if (!trimmed) {
      setText(snippet.text);
    }
  };

  const addTag = (): void => {
    const tag = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (tag && !snippet.tags.includes(tag)) {
      updateCopySnippet(snippet.id, { tags: [...snippet.tags, tag] });
    }
    setTagDraft("");
  };

  const removeTag = (tag: string): void => {
    updateCopySnippet(snippet.id, { tags: snippet.tags.filter((entry) => entry !== tag) });
  };

  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:var(--card)] p-3">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {ROLE_LABEL[snippet.role]}
          {snippet.role === "headline" && snippet.flourish ? " · flourish" : ""}
        </span>
        <button
          aria-label="Delete copy"
          className="text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
          onClick={() => deleteCopySnippet(snippet.id)}
          type="button"
        >
          <TrashIcon />
        </button>
      </div>
      <textarea
        className="min-h-[2.5rem] resize-none rounded-md bg-transparent text-sm leading-snug outline-none focus:bg-[color:var(--surface-inactive)]"
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        style={snippetPreviewStyle(snippet)}
        value={text}
      />
      <div className="flex flex-wrap items-center gap-1">
        {snippet.tags.map((tag) => (
          <button
            className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            key={tag}
            onClick={() => removeTag(tag)}
            title="Remove tag"
            type="button"
          >
            #{tag} ✕
          </button>
        ))}
        <input
          className="w-16 bg-transparent text-[10px] text-muted-foreground outline-none placeholder:text-muted-foreground"
          onBlur={addTag}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="+ tag"
          value={tagDraft}
        />
      </div>
    </div>
  );
}

/**
 * Copy Snippets library — the "content library for copy". Reusable text pieces
 * (headline / sub-head / body) filtered by role + tag, searchable. Headlines
 * carry a flourish preset (captured from the Studio). Feeds the Variations
 * matrix. Sits behind the Notes/Snippets toggle in the Copy surface.
 */
export function CopySnippetsView(): React.JSX.Element {
  const project = useProject();
  const [role, setRole] = React.useState<CopyRole | "all">("all");
  const [tag, setTag] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [newRole, setNewRole] = React.useState<CopyRole>("headline");
  const [newText, setNewText] = React.useState("");

  const allTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const snippet of project.copySnippets) {
      for (const t of snippet.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [project.copySnippets]);

  const filtered = project.copySnippets
    .filter((snippet) => (role === "all" ? true : snippet.role === role))
    .filter((snippet) => (tag ? snippet.tags.includes(tag) : true))
    .filter((snippet) => {
      const term = query.trim().toLowerCase();
      return term
        ? snippet.text.toLowerCase().includes(term) ||
            snippet.tags.some((t) => t.includes(term))
        : true;
    });

  const create = (): void => {
    const trimmed = newText.trim();
    if (!trimmed) {
      return;
    }
    addCopySnippet({ role: newRole, text: trimmed });
    setNewText("");
  };

  const roleTab = (value: CopyRole | "all", label: string): React.JSX.Element => (
    <button
      className={`rounded-full px-3 py-1 text-xs-plus transition-colors ${
        role === value
          ? "bg-[color:color-mix(in_oklab,var(--foreground)_14%,transparent)] text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={() => setRole(value)}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      {/* Composer */}
      <div className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)] p-3">
        <div className="flex gap-1">
          {ROLE_ORDER.map((value) => (
            <button
              className={`rounded-md px-2 py-1 text-xs-plus transition-colors ${
                newRole === value
                  ? "bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              key={value}
              onClick={() => setNewRole(value)}
              type="button"
            >
              {ROLE_LABEL[value]}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-[2.25rem] flex-1 resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            onChange={(event) => setNewText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                create();
              }
            }}
            placeholder={`New ${ROLE_LABEL[newRole].toLowerCase()} copy…`}
            rows={1}
            value={newText}
          />
          <button
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--accent)] px-3 text-xs-plus font-medium text-[color:var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={!newText.trim()}
            onClick={create}
            type="button"
          >
            <PlusIcon />
            Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {roleTab("all", "All")}
          {roleTab("headline", "Headlines")}
          {roleTab("subhead", "Sub-heads")}
          {roleTab("body", "Body")}
        </div>
        <input
          className="ml-auto h-8 w-48 rounded-lg bg-[color:var(--surface-inactive)] px-3 text-sm outline-none focus:bg-[color:var(--surface-active)]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search copy…"
          value={query}
        />
      </div>
      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          <button
            className={`rounded-full px-2 py-0.5 text-2xs uppercase tracking-[0.08em] transition-colors ${
              tag === null
                ? "bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTag(null)}
            type="button"
          >
            All tags
          </button>
          {allTags.map((t) => (
            <button
              className={`rounded-full px-2 py-0.5 text-2xs transition-colors ${
                tag === t
                  ? "bg-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              type="button"
            >
              #{t}
            </button>
          ))}
        </div>
      ) : null}

      {/* Cards */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {project.copySnippets.length === 0
            ? "No saved copy yet — add some above, or save a headline from the Studio."
            : "No copy matches these filters."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((snippet) => (
            <SnippetCard key={snippet.id} snippet={snippet} />
          ))}
        </div>
      )}
    </div>
  );
}
