import * as React from "react";

import {
  addTask,
  deleteTask,
  moveTask,
  updateTask,
  useProject,
} from "../data/project-store";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  type Task,
  type TaskStatus,
} from "../data/types";

const STATUS_DOT: Record<TaskStatus, string> = {
  doing: "#e5b452",
  done: "#4caf7d",
  review: "#0c8ce9",
  todo: "#9a958c",
};

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
            if (event.key === "Tab") {
              event.preventDefault();
              complete(suggestions[active]!);
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

function TaskCard(props: { task: Task }): React.JSX.Element {
  const { task } = props;
  const [editing, setEditing] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  const [title, setTitle] = useBuffered(task.title, (value) =>
    updateTask(task.id, { title: value }),
  );
  const [assignee, setAssignee] = useBuffered(task.assignee ?? "", (value) =>
    updateTask(task.id, { assignee: value.replace(/^@/, "").trim() || null }),
  );

  const hasAttributes = task.tags.length > 0 || task.assignee || editing;

  return (
    <div
      className="group flex flex-col gap-1.5 rounded-md border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] bg-[color:var(--card)] p-2.5"
      draggable={!editing}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      {task.sourceLabel ? (
        <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {task.sourceLabel}
        </span>
      ) : null}

      {editing ? (
        <input
          autoFocus
          className="w-full bg-transparent text-xs-plus outline-none"
          onBlur={() => setEditing(false)}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && setEditing(false)}
          value={title}
        />
      ) : (
        <button
          className="text-left text-xs-plus leading-snug"
          onClick={() => setEditing(true)}
          type="button"
        >
          {task.title}
        </button>
      )}

      {hasAttributes ? (
        <>
          <div className="border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)]" />
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
            {editing ? (
              <input
                className="w-24 bg-transparent text-right text-[10px] outline-none placeholder:text-muted-foreground"
                onChange={(event) => setAssignee(event.target.value)}
                placeholder="@ assignee"
                value={assignee}
              />
            ) : task.assignee ? (
              <Avatar name={task.assignee} />
            ) : null}
          </div>
        </>
      ) : null}

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
          const id = event.dataTransfer.getData("text/task-id");
          setOver(false);
          if (id) {
            event.preventDefault();
            moveTask(id, status);
          }
        }}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        <AddTaskField people={props.people} status={status} tags={props.tags} />
      </div>
    </div>
  );
}

export function TasksScreen(): React.JSX.Element {
  const project = useProject();
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);

  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of project.tasks) {
      for (const tag of task.tags) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks]);

  const allPeople = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of project.tasks) {
      if (task.assignee) set.add(task.assignee);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks]);

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
            people={allPeople}
            status={status}
            tags={allTags}
            tasks={visible
              .filter((task) => task.status === status)
              .sort((a, b) => a.position - b.position)}
          />
        ))}
      </div>
    </div>
  );
}
