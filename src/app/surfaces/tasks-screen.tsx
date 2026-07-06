import * as React from "react";

import { Input } from "@/toolcraft/ui";

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

function TaskCard(props: { task: Task }): React.JSX.Element {
  const { task } = props;
  const [editing, setEditing] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");

  return (
    <div
      className="group flex flex-col gap-1.5 rounded-md border border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] bg-[color:var(--card)] p-2.5"
      draggable={!editing}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      {editing ? (
        <input
          autoFocus
          className="w-full bg-transparent text-xs-plus outline-none"
          onBlur={() => setEditing(false)}
          onChange={(event) => updateTask(task.id, { title: event.target.value })}
          onKeyDown={(event) => event.key === "Enter" && setEditing(false)}
          value={task.title}
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

      {task.tags.length > 0 || editing ? (
        <div className="flex flex-wrap items-center gap-1">
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
              {tag} ✕
            </button>
          ))}
          {editing ? (
            <input
              className="w-20 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground"
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && tagDraft.trim()) {
                  const next = tagDraft.trim().toLowerCase();
                  if (!task.tags.includes(next)) {
                    updateTask(task.id, { tags: [...task.tags, next] });
                  }
                  setTagDraft("");
                }
              }}
              placeholder="+ tag"
              value={tagDraft}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {task.assignee ? `@${task.assignee}` : "Unassigned"}
        </span>
        <button
          className="text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
          onClick={() => deleteTask(task.id)}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Column(props: {
  status: TaskStatus;
  tasks: Task[];
}): React.JSX.Element {
  const { status, tasks } = props;
  const [over, setOver] = React.useState(false);
  const [adding, setAdding] = React.useState("");

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
        <Input
          className="h-7 border-dashed text-xs-plus"
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && adding.trim()) {
              addTask(adding.trim(), status);
              setAdding("");
            }
          }}
          placeholder="+ Add task"
          value={adding}
        />
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
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
        {TASK_STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={visible
              .filter((task) => task.status === status)
              .sort((a, b) => a.position - b.position)}
          />
        ))}
      </div>
    </div>
  );
}
