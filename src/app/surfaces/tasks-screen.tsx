import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/toolcraft/ui";

import {
  addTask,
  deleteTask,
  reorderTask,
  requestCopyEntry,
  requestLibraryAsset,
  requestPlannerSlot,
  updateTask,
  useProject,
} from "../data/project-store";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  type PlannerChannel,
  type Task,
  type TaskStatus,
} from "../data/types";

/** Route + intent for a task's "asset:<id>" / "copy:<id>" / "planner:<c>:<id>" ref. */
function resolveSourceRef(
  ref: string,
): { fire: () => void; to: string } | null {
  const [kind, a, b] = ref.split(":");
  if (kind === "asset" && a) {
    return { fire: () => requestLibraryAsset(a), to: "/library" };
  }
  if (kind === "copy" && a) {
    return { fire: () => requestCopyEntry(a), to: "/copy" };
  }
  if (kind === "planner" && a && b) {
    return { fire: () => requestPlannerSlot(a as PlannerChannel, b), to: "/planner" };
  }
  return null;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  doing: "#e5b452",
  done: "#4caf7d",
  review: "#0c8ce9",
  todo: "#9a958c",
};

// The task currently being dragged. A module-level ref lets a hovered card know
// what's incoming during dragover (dataTransfer.getData is empty until drop).
let draggingTaskId: string | null = null;

/**
 * Local-buffered text state so live typing never fights the store: the field
 * reads from local state (seeded once from the prop) and commits on change, so
 * a realtime refetch or re-render can't clobber the caret mid-keystroke.
 */
function useBuffered(
  initial: string,
  commit: (value: string) => void,
): [string, (value: string) => void] {
  const [local, setLocal] = React.useState(initial);
  const onChange = (value: string): void => {
    setLocal(value);
    commit(value);
  };
  return [local, onChange];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic muted color for an assignee avatar. */
function avatarHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

function Avatar(props: { name: string }): React.JSX.Element {
  const hue = avatarHue(props.name);
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium text-white"
      style={{ backgroundColor: `hsl(${hue} 32% 42%)` }}
      title={props.name}
    >
      {initials(props.name)}
    </span>
  );
}

/** Avatar (or a subtle "@" affordance) that opens a people picker on click. */
function AssigneeMenu(props: {
  onAssign: (name: string | null) => void;
  assignee: string | null;
  people: string[];
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          props.assignee ? (
            <button
              aria-label={`Assigned to ${props.assignee} — change`}
              className="shrink-0 rounded-full transition-transform hover:scale-110"
              onClick={(event) => event.stopPropagation()}
              type="button"
            >
              <Avatar name={props.assignee} />
            </button>
          ) : (
            <button
              aria-label="Assign to…"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)] text-[10px] text-muted-foreground opacity-0 transition-opacity hover:border-[color:var(--accent)] hover:text-foreground group-hover:opacity-100 data-[popup-open]:opacity-100"
              onClick={(event) => event.stopPropagation()}
              type="button"
            >
              @
            </button>
          )
        }
      />
      <DropdownMenuContent align="end">
        {props.people.map((person) => (
          <DropdownMenuItem key={person} onClick={() => props.onAssign(person)}>
            <span className="flex items-center gap-2">
              <Avatar name={person} />
              {person}
            </span>
          </DropdownMenuItem>
        ))}
        {props.assignee ? (
          <DropdownMenuItem onClick={() => props.onAssign(null)}>Unassign</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Quick-add parser (Todoist-style): "#word" tags the content type, "@word"
 * assigns a person, everything else is the title.
 */
function parseTaskInput(raw: string): {
  assignee: string | null;
  tags: string[];
  title: string;
} {
  const tags: string[] = [];
  let assignee: string | null = null;
  const titleWords: string[] = [];
  for (const word of raw.split(/\s+/)) {
    if (word.length > 1 && word.startsWith("#")) {
      const tag = word.slice(1).toLowerCase();
      if (tag && !tags.includes(tag)) tags.push(tag);
    } else if (word.length > 1 && word.startsWith("@")) {
      assignee = word.slice(1);
    } else if (word) {
      titleWords.push(word);
    }
  }
  return { assignee, tags, title: titleWords.join(" ").trim() };
}

/** Add-task field with live #tag / @person suggestions on the current token. */
function AddTaskField(props: {
  people: string[];
  status: TaskStatus;
  tags: string[];
}): React.JSX.Element {
  const [value, setValue] = React.useState("");
  const [active, setActive] = React.useState(0);

  const lastToken = value.split(/\s+/).pop() ?? "";
  const trigger =
    lastToken.startsWith("#") ? "#" : lastToken.startsWith("@") ? "@" : null;
  const fragment = trigger ? lastToken.slice(1).toLowerCase() : "";
  const pool = trigger === "#" ? props.tags : trigger === "@" ? props.people : [];
  const suggestions = trigger
    ? pool.filter((item) => item.toLowerCase().includes(fragment)).slice(0, 6)
    : [];

  const complete = (item: string): void => {
    const words = value.split(/(\s+)/); // keep separators
    // Replace the final non-space token.
    for (let i = words.length - 1; i >= 0; i -= 1) {
      if (words[i]!.trim()) {
        words[i] = `${trigger}${item}`;
        break;
      }
    }
    setValue(`${words.join("")} `);
    setActive(0);
  };

  const submit = (): void => {
    const { assignee, tags, title } = parseTaskInput(value);
    if (!title) return;
    const id = addTask(title, props.status, tags);
    if (assignee) updateTask(id, { assignee });
    setValue("");
    setActive(0);
  };

  return (
    <div className="relative">
      <input
        className="h-7 w-full rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--border)_30%,transparent)] bg-transparent px-2 text-xs-plus outline-none placeholder:text-muted-foreground focus:border-[color:var(--accent)]"
        onChange={(event) => {
          setValue(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (suggestions.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % suggestions.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
              return;
            }
            const activeItem = suggestions[active];
            const isExact = activeItem?.toLowerCase() === fragment;
            // Tab always completes; Enter completes a partial match (so "@Mar"
            // becomes "@Marco"), otherwise Enter falls through to submit.
            if (event.key === "Tab" || (event.key === "Enter" && activeItem && !isExact)) {
              event.preventDefault();
              complete(activeItem!);
              return;
            }
          }
          if (event.key === "Enter") submit();
        }}
        placeholder="+ Add task  ·  #type  @person"
        value={value}
      />
      {suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-8 z-20 overflow-hidden rounded-md border border-border bg-[color:var(--popover)] py-1 shadow-xl">
          {suggestions.map((item, index) => (
            <button
              className={`block w-full px-2 py-1 text-left text-2xs ${index === active ? "bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] text-foreground" : "text-muted-foreground"}`}
              key={item}
              onMouseDown={(event) => {
                event.preventDefault();
                complete(item);
              }}
              type="button"
            >
              {trigger}
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskCard(props: { people: string[]; task: Task }): React.JSX.Element {
  const { task } = props;
  const navigate = useNavigate();
  const [editing, setEditing] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  const [dropBefore, setDropBefore] = React.useState(false);
  const [title, setTitle] = useBuffered(task.title, (value) =>
    updateTask(task.id, { title: value }),
  );

  /** Commit a title edit, extracting any "#tag" / "@person" tokens typed inline. */
  const finishEdit = (): void => {
    const parsed = parseTaskInput(title);
    if (parsed.title && (parsed.tags.length > 0 || parsed.assignee)) {
      updateTask(task.id, {
        ...(parsed.assignee ? { assignee: parsed.assignee } : {}),
        tags: [...new Set([...task.tags, ...parsed.tags])],
        title: parsed.title,
      });
      setTitle(parsed.title);
    }
    setEditing(false);
  };

  const hasAttributes = task.tags.length > 0 || task.assignee || editing;

  return (
    <div
      className={`group relative flex flex-col gap-1.5 rounded-md border bg-[color:var(--card)] p-2.5 ${
        dropBefore
          ? "border-[color:var(--accent)] shadow-[0_-2px_0_0_var(--accent)]"
          : "border-[color:color-mix(in_oklab,var(--border)_14%,transparent)]"
      }`}
      draggable={!editing}
      onDragEnd={() => {
        draggingTaskId = null;
        setDropBefore(false);
      }}
      onDragLeave={() => setDropBefore(false)}
      onDragOver={(event) => {
        // Read the live module ref, not a render-time value — dragging starts
        // without re-rendering this card.
        if (draggingTaskId && draggingTaskId !== task.id) {
          event.preventDefault();
          setDropBefore(true);
        }
      }}
      onDragStart={(event) => {
        draggingTaskId = task.id;
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDrop={(event) => {
        if (!draggingTaskId || draggingTaskId === task.id) return;
        event.preventDefault();
        event.stopPropagation();
        reorderTask(draggingTaskId, task.status, task.id);
        draggingTaskId = null;
        setDropBefore(false);
      }}
    >
      {!editing ? (
        <button
          aria-label="Delete task"
          className="absolute right-1 top-1 text-[11px] leading-none text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
          onClick={() => deleteTask(task.id)}
          type="button"
        >
          ✕
        </button>
      ) : null}

      {task.sourceLabel ? (
        (() => {
          const source = task.sourceRef ? resolveSourceRef(task.sourceRef) : null;
          return source ? (
            <button
              className="self-start pr-4 text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                source.fire();
                void navigate({ to: source.to });
              }}
              title="Open what this comment was on"
              type="button"
            >
              {task.sourceLabel} ↗
            </button>
          ) : (
            <span className="pr-4 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {task.sourceLabel}
            </span>
          );
        })()
      ) : null}

      {editing ? (
        <input
          autoFocus
          className="w-full bg-transparent text-xs-plus outline-none"
          onBlur={finishEdit}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && finishEdit()}
          value={title}
        />
      ) : (
        <button
          className="pr-4 text-left text-xs-plus leading-snug"
          onClick={() => setEditing(true)}
          type="button"
        >
          {task.title}
        </button>
      )}

      {hasAttributes ? (
        <div className="border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)]" />
      ) : null}
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {task.tags.map((tag) => (
            <button
              className="rounded-full bg-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              key={tag}
              onClick={() =>
                updateTask(task.id, { tags: task.tags.filter((entry) => entry !== tag) })
              }
              title="Remove tag"
              type="button"
            >
              #{tag}
              {editing ? " ✕" : ""}
            </button>
          ))}
          {editing ? (
            <input
              className="w-20 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground"
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && tagDraft.trim()) {
                  const next = tagDraft.trim().replace(/^#/, "").toLowerCase();
                  if (next && !task.tags.includes(next)) {
                    updateTask(task.id, { tags: [...task.tags, next] });
                  }
                  setTagDraft("");
                }
              }}
              placeholder="# tag"
              value={tagDraft}
            />
          ) : null}
        </div>
        <AssigneeMenu
          assignee={task.assignee}
          onAssign={(name) => updateTask(task.id, { assignee: name })}
          people={props.people}
        />
      </div>

      {editing ? (
        <button
          className="self-start text-[10px] text-muted-foreground hover:text-[color:var(--destructive)]"
          onClick={() => deleteTask(task.id)}
          type="button"
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}

function Column(props: {
  people: string[];
  status: TaskStatus;
  tags: string[];
  tasks: Task[];
}): React.JSX.Element {
  const { status, tasks } = props;
  const [over, setOver] = React.useState(false);

  return (
    <div className="flex w-64 shrink-0 flex-col rounded-lg bg-[color:color-mix(in_oklab,var(--foreground)_4%,var(--background))]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_DOT[status] }} />
        <span className="text-xs-plus font-medium">{TASK_STATUS_LABELS[status]}</span>
        <span className="ml-auto text-2xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        className={`flex min-h-[3rem] flex-1 flex-col gap-2 px-2 pb-2 ${over ? "rounded-b-lg bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)]" : ""}`}
        onDragLeave={() => setOver(false)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/task-id")) {
            event.preventDefault();
            setOver(true);
          }
        }}
        onDrop={(event) => {
          const id = event.dataTransfer.getData("text/task-id") || draggingTaskId;
          setOver(false);
          if (id) {
            event.preventDefault();
            reorderTask(id, status, null);
            draggingTaskId = null;
          }
        }}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} people={props.people} task={task} />
        ))}
        <AddTaskField people={props.people} status={status} tags={props.tags} />
      </div>
    </div>
  );
}

export function TasksScreen(): React.JSX.Element {
  const project = useProject();
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);

  // Tags actually used on tasks — drives the filter bar and column filtering.
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of project.tasks) {
      for (const tag of task.tags) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks]);

  // Broader vocabulary for the "#" autocomplete: tags from tasks, assets, and
  // copy — so # is useful even on a brand-new board with no task tags yet.
  const suggestTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of project.tasks) for (const tag of task.tags) set.add(tag);
    for (const asset of project.assets) for (const tag of asset.tags) set.add(tag);
    for (const entry of project.journal) for (const tag of entry.tags) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks, project.assets, project.journal]);

  // People for the "@" autocomplete: the whole team roster plus anyone already
  // assigned — so @ shows real teammates immediately, not just prior assignees.
  const suggestPeople = React.useMemo(() => {
    const set = new Set<string>();
    for (const member of project.teamMembers) if (member.name) set.add(member.name);
    for (const task of project.tasks) if (task.assignee) set.add(task.assignee);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.teamMembers, project.tasks]);

  const visible = tagFilter
    ? project.tasks.filter((task) => task.tags.includes(tagFilter))
    : project.tasks;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {allTags.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] px-4 py-2">
          <span className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
            Filter
          </span>
          <button
            className={`rounded-full border px-2 py-0.5 text-2xs transition-colors ${tagFilter === null ? "border-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTagFilter(null)}
            type="button"
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              className={`rounded-full border px-2 py-0.5 text-2xs transition-colors ${tagFilter === tag ? "border-accent bg-[color:color-mix(in_oklab,var(--accent)_16%,transparent)] text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              key={tag}
              onClick={() => setTagFilter(tag)}
              type="button"
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
        {TASK_STATUS_ORDER.map((status) => (
          <Column
            key={status}
            people={suggestPeople}
            status={status}
            tags={suggestTags}
            tasks={visible
              .filter((task) => task.status === status)
              .sort((a, b) => a.position - b.position)}
          />
        ))}
      </div>
    </div>
  );
}
