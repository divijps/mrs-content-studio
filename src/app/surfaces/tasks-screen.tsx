import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import {
  addSubtask,
  addTask,
  deleteSubtask,
  deleteTask,
  moveTask,
  reorderTask,
  requestCopyEntry,
  requestLibraryAsset,
  requestPlannerSlot,
  resolveAssetComment,
  setAssetAssignee,
  toggleSubtask,
  updateTask,
  useProject,
} from "../data/project-store";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  type Asset,
  type PlannerChannel,
  type Task,
  type TaskStatus,
} from "../data/types";
import { AssetDetail } from "../library/asset-detail";
import { findMentions, mentions, useTeamRoster } from "../library/mentions";
import { PersonAvatar } from "../ui/avatar";
import { Chip, Field, InspectorSection, TagInput } from "../ui/inspector-kit";

/** Route + intent for a task's "asset:<id>" / "copy:<id>" / "planner:<c>:<id>" ref. */
function resolveSourceRef(ref: string): { fire: () => void; to: string } | null {
  const [kind, a, b] = ref.split(":");
  if (kind === "asset" && a) return { fire: () => requestLibraryAsset(a), to: "/library" };
  if (kind === "copy" && a) return { fire: () => requestCopyEntry(a), to: "/copy" };
  if (kind === "planner" && a && b) {
    return { fire: () => requestPlannerSlot(a as PlannerChannel, b), to: "/planner" };
  }
  return null;
}

/**
 * Where a comment-task should jump. Prefers the stored sourceRef, but falls
 * back to locating whichever asset/copy/planner post still owns the source
 * comment — so the jump works even for older tasks (or before the sourceRef
 * column is migrated in the cloud).
 */
function resolveTaskSource(
  task: Task,
  project: ReturnType<typeof useProject>,
): { fire: () => void; to: string } | null {
  if (task.sourceRef) {
    const direct = resolveSourceRef(task.sourceRef);
    if (direct) return direct;
  }
  const commentId = task.sourceCommentId;
  if (!commentId) return null;
  const asset = project.assets.find((entry) => entry.comments.some((c) => c.id === commentId));
  if (asset) return { fire: () => requestLibraryAsset(asset.id), to: "/library" };
  const entry = project.journal.find((item) => item.comments.some((c) => c.id === commentId));
  if (entry) return { fire: () => requestCopyEntry(entry.id), to: "/copy" };
  const channels: [PlannerChannel, typeof project.planner.gridSlots][] = [
    ["grid", project.planner.gridSlots],
    ["story", project.planner.storySlots],
    ["pinterest", project.planner.pinSlots],
    ["reel", project.planner.reelSlots],
  ];
  for (const [channel, slots] of channels) {
    const slot = slots.find((s) => s.comments.some((c) => c.id === commentId));
    if (slot) return { fire: () => requestPlannerSlot(channel, slot.id), to: "/planner" };
  }
  return null;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  doing: "#e5b452",
  done: "#4caf7d",
  review: "#0c8ce9",
  todo: "#9a958c",
};

// The task currently being dragged (module ref so a hovered card can read it).
let draggingTaskId: string | null = null;

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

/** Avatar (or a dashed "@" affordance) that opens a people picker on click. */
function AssigneeMenu(props: {
  assignee: string | null;
  onAssign: (name: string | null) => void;
  people: string[];
  size?: number;
}): React.JSX.Element {
  const size = props.size ?? 20;
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
              <PersonAvatar name={props.assignee} size={size} />
            </button>
          ) : (
            <button
              aria-label="Assign to…"
              className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-[color:var(--border)] text-muted-foreground transition-colors hover:border-[color:var(--accent)] hover:text-foreground"
              onClick={(event) => event.stopPropagation()}
              style={{ fontSize: size * 0.5, height: size, width: size }}
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
              <PersonAvatar name={person} />
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

/** Task-status dropdown (colored dot + label), on the kit Select. */
function TaskStatusSelect(props: {
  onChange: (status: TaskStatus) => void;
  status: TaskStatus;
}): React.JSX.Element {
  return (
    <Select
      items={TASK_STATUS_ORDER.map((s) => ({ label: TASK_STATUS_LABELS[s], value: s }))}
      onValueChange={(next) => props.onChange(next as TaskStatus)}
      value={props.status}
    >
      <SelectTrigger className="h-9 w-full justify-between">
        <SelectValue>
          {() => (
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: STATUS_DOT[props.status] }}
              />
              {TASK_STATUS_LABELS[props.status]}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {TASK_STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_DOT[s] }}
                />
                {TASK_STATUS_LABELS[s]}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Quick-add parser: "#word" tags, "@word" assigns, the rest is the title. */
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
  const trigger = lastToken.startsWith("#") ? "#" : lastToken.startsWith("@") ? "@" : null;
  const fragment = trigger ? lastToken.slice(1).toLowerCase() : "";
  const pool = trigger === "#" ? props.tags : trigger === "@" ? props.people : [];
  const suggestions = trigger
    ? pool.filter((item) => item.toLowerCase().includes(fragment)).slice(0, 6)
    : [];

  const complete = (item: string): void => {
    const words = value.split(/(\s+)/);
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
        className="h-9 w-full rounded-lg bg-[color:var(--surface-inactive)] px-3 text-xs-plus text-foreground outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:bg-[color:var(--surface-active)]"
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
        <div className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-lg border border-border bg-[color:var(--popover)] py-1 shadow-2xl">
          {suggestions.map((item, index) => (
            <button
              className={`block w-full px-2.5 py-1.5 text-left text-xs-plus ${index === active ? "bg-[color:var(--surface-active)] text-foreground" : "text-muted-foreground"}`}
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

/** ---- Opened task view (Todoist-style modal, kit-styled rail) ------------- */

function TaskDetail(props: {
  onClose: () => void;
  people: string[];
  task: Task;
}): React.JSX.Element {
  const { task } = props;
  const navigate = useNavigate();
  const project = useProject();
  const [title, setTitle] = useBuffered(task.title, (v) => updateTask(task.id, { title: v }));
  const [description, setDescription] = useBuffered(task.description ?? "", (v) =>
    updateTask(task.id, { description: v }),
  );
  const [subDraft, setSubDraft] = React.useState("");
  const source = resolveTaskSource(task, project);
  const subtasks = task.subtasks ?? [];
  const done = subtasks.filter((s) => s.done).length;
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of project.tasks) for (const tag of t.tags) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-8"
      onClick={props.onClose}
    >
      <div
        className="flex w-full max-w-[720px] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-[color:var(--panel)] shadow-2xl md:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            {source ? (
              <button
                className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  source.fire();
                  void navigate({ to: source.to });
                }}
                type="button"
              >
                {task.sourceLabel} ↗
              </button>
            ) : (
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                Task
              </span>
            )}
            <button
              className="ml-auto text-xs text-muted-foreground hover:text-foreground md:hidden"
              onClick={props.onClose}
              type="button"
            >
              Close ✕
            </button>
          </div>

          <textarea
            className="w-full resize-none bg-transparent text-lg leading-snug text-foreground outline-none placeholder:text-[color:var(--text-muted)]"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task name"
            rows={Math.max(1, Math.ceil(title.length / 46))}
            value={title}
          />

          <textarea
            className="min-h-[64px] w-full resize-y bg-transparent text-xs-plus leading-relaxed text-muted-foreground outline-none placeholder:text-[color:var(--text-muted)]"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a description…"
            value={description}
          />

          {/* Sub-tasks */}
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">
              Sub-tasks {subtasks.length > 0 ? `${done}/${subtasks.length}` : ""}
            </span>
            {subtasks.map((sub) => (
              <div className="group flex items-center gap-2" key={sub.id}>
                <button
                  aria-label={sub.done ? "Mark incomplete" : "Mark complete"}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${sub.done ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white" : "border-[color:var(--border)] text-transparent hover:border-[color:var(--accent)]"}`}
                  onClick={() => toggleSubtask(task.id, sub.id)}
                  type="button"
                >
                  ✓
                </button>
                <span
                  className={`min-w-0 flex-1 truncate text-xs-plus ${sub.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {sub.title}
                </span>
                <button
                  className="text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
                  onClick={() => deleteSubtask(task.id, sub.id)}
                  type="button"
                >
                  ✕
                </button>
              </div>
            ))}
            <input
              className="h-9 w-full rounded-lg bg-[color:var(--surface-inactive)] px-3 text-xs-plus text-foreground outline-none placeholder:text-[color:var(--text-muted)] focus:bg-[color:var(--surface-active)]"
              onChange={(event) => setSubDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && subDraft.trim()) {
                  addSubtask(task.id, subDraft);
                  setSubDraft("");
                }
              }}
              placeholder="+ Add sub-task"
              value={subDraft}
            />
          </div>
        </div>

        {/* Metadata rail — kit sections */}
        <div className="flex shrink-0 flex-col border-t border-border bg-[color:color-mix(in_oklab,var(--foreground)_3%,var(--panel))] pt-1 md:w-60 md:border-l md:border-t-0">
          <InspectorSection
            action={
              <button
                aria-label="Close"
                className="hidden text-xs text-muted-foreground hover:text-foreground md:block"
                onClick={props.onClose}
                type="button"
              >
                ✕
              </button>
            }
            title="Details"
          >
            <Field label="Status">
              <TaskStatusSelect onChange={(status) => moveTask(task.id, status)} status={task.status} />
            </Field>
            <Field label="Assignee">
              <div className="flex items-center gap-2">
                <AssigneeMenu
                  assignee={task.assignee}
                  onAssign={(name) => updateTask(task.id, { assignee: name })}
                  people={props.people}
                  size={24}
                />
                <span className="text-xs-plus text-muted-foreground">
                  {task.assignee ?? "Unassigned"}
                </span>
              </div>
            </Field>
            <Field label="Tags">
              <TagInput
                onAdd={(tag) => updateTask(task.id, { tags: [...task.tags, tag] })}
                onRemove={(tag) => updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) })}
                suggestions={allTags}
                tags={task.tags}
              />
            </Field>
          </InspectorSection>
          <button
            className="mx-4 mb-4 mt-1 self-start text-xs text-muted-foreground hover:text-[color:var(--destructive)]"
            onClick={() => {
              deleteTask(task.id);
              props.onClose();
            }}
            type="button"
          >
            Delete task
          </button>
        </div>
      </div>
    </div>
  );
}

/** ---- Board card --------------------------------------------------------- */

function TaskCard(props: {
  onOpen: () => void;
  people: string[];
  task: Task;
}): React.JSX.Element {
  const { task } = props;
  const navigate = useNavigate();
  const project = useProject();
  const source = resolveTaskSource(task, project);
  const [dropBefore, setDropBefore] = React.useState(false);
  const subtasks = task.subtasks ?? [];
  const doneSubs = subtasks.filter((s) => s.done).length;

  return (
    <div
      className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-lg bg-[color:var(--surface-inactive)] p-2.5 transition-colors hover:bg-[color:var(--surface-active)] ${
        dropBefore ? "shadow-[0_-2px_0_0_var(--accent)]" : ""
      }`}
      draggable
      onClick={props.onOpen}
      onDragEnd={() => {
        draggingTaskId = null;
        setDropBefore(false);
      }}
      onDragLeave={() => setDropBefore(false)}
      onDragOver={(event) => {
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
      <button
        aria-label="Delete task"
        className="absolute right-1 top-1 text-[11px] leading-none text-muted-foreground opacity-0 transition-opacity hover:text-[color:var(--destructive)] group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          deleteTask(task.id);
        }}
        type="button"
      >
        ✕
      </button>

      {task.sourceLabel ? (
        source ? (
          <button
            className="flex w-fit items-center gap-1 pr-4 text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-[color:var(--accent)]"
            onClick={(event) => {
              event.stopPropagation();
              source.fire();
              void navigate({ to: source.to });
            }}
            title={`Open ${task.sourceLabel}`}
            type="button"
          >
            {task.sourceLabel} ↗
          </button>
        ) : (
          <span className="pr-4 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {task.sourceLabel}
          </span>
        )
      ) : null}

      <span className="pr-4 text-xs-plus leading-snug text-foreground">{task.title}</span>

      {task.tags.length > 0 || task.assignee || subtasks.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {task.tags.map((tag) => (
              <span
                className="rounded-full bg-[color:var(--surface-active)] px-1.5 py-0.5 text-[10px] text-muted-foreground"
                key={tag}
              >
                #{tag}
              </span>
            ))}
            {subtasks.length > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                ☑ {doneSubs}/{subtasks.length}
              </span>
            ) : null}
          </div>
          {task.assignee ? (
            <span onClick={(event) => event.stopPropagation()}>
              <AssigneeMenu
                assignee={task.assignee}
                onAssign={(name) => updateTask(task.id, { assignee: name })}
                people={props.people}
              />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** ---- Board column ------------------------------------------------------- */

function Column(props: {
  onOpen: (task: Task) => void;
  people: string[];
  status: TaskStatus;
  tags: string[];
  tasks: Task[];
}): React.JSX.Element {
  const { status, tasks } = props;
  const [over, setOver] = React.useState(false);

  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 py-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_DOT[status] }} />
        <span className="text-xs-plus text-foreground">{TASK_STATUS_LABELS[status]}</span>
        <span className="ml-1 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        className={`flex min-h-[3rem] flex-1 flex-col gap-2 rounded-lg p-1 transition-colors ${over ? "bg-[color:var(--surface-inactive)]" : ""}`}
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
          <TaskCard
            key={task.id}
            onOpen={() => props.onOpen(task)}
            people={props.people}
            task={task}
          />
        ))}
        <AddTaskField people={props.people} status={status} tags={props.tags} />
      </div>
    </div>
  );
}

/** ---- Assigned lens: per-person review queues ---------------------------- */

type ReviewReason = "assigned" | "mentioned";

interface PersonQueue {
  assets: { asset: Asset; reason: ReviewReason }[];
  name: string;
  tasks: Task[];
}

function AssignedView(props: {
  isMe: (name: string) => boolean;
  onOpenAsset: (name: string, assetId: string) => void;
  onOpenTask: (task: Task) => void;
  onReview: (name: string) => void;
  people: string[];
  queues: PersonQueue[];
}): React.JSX.Element {
  if (props.queues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Nothing to review yet — hand an asset off from its “Assigned to” field in the Library,
        <br />
        or @mention a teammate in a comment.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {props.queues.map((queue) => (
        <section
          className="flex flex-col gap-3 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:var(--card)] p-4"
          key={queue.name}
        >
          <div className="flex items-center gap-2">
            <PersonAvatar name={queue.name} size={28} />
            <span className="text-sm font-medium">{queue.name}</span>
            {props.isMe(queue.name) ? <Chip tone="accent">You</Chip> : null}
            <span className="text-2xs text-muted-foreground">
              {queue.assets.length + queue.tasks.length} to review
            </span>
            {queue.assets.length > 0 ? (
              <button
                className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--accent)] px-3 text-xs-plus font-medium text-[color:var(--accent-foreground)] transition-opacity hover:opacity-90"
                onClick={() => props.onReview(queue.name)}
                type="button"
              >
                Review {queue.assets.length} →
              </button>
            ) : null}
          </div>

          {queue.assets.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {queue.assets.map(({ asset, reason }) => (
                <button
                  className="group flex flex-col gap-1.5 text-left"
                  key={asset.id}
                  onClick={() => props.onOpenAsset(queue.name, asset.id)}
                  type="button"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-[color:var(--surface-inactive)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--border)_16%,transparent)] transition-transform group-hover:scale-[1.02]">
                    <img
                      alt={asset.name}
                      className="h-full w-full object-cover"
                      decoding="async"
                      loading="lazy"
                      src={asset.thumbUrl}
                    />
                    <span
                      className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${reason === "assigned" ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)]" : "bg-black/55 text-white"}`}
                    >
                      {reason === "assigned" ? "Assigned" : "@ Mention"}
                    </span>
                  </div>
                  <span className="truncate text-2xs text-muted-foreground">{asset.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          {queue.tasks.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {queue.assets.length > 0 ? (
                <span className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
                  Tasks
                </span>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {queue.tasks.map((task) => (
                  <button
                    className="flex items-center gap-1.5 rounded-lg bg-[color:var(--surface-inactive)] px-2.5 py-1.5 text-left text-xs-plus text-foreground transition-colors hover:bg-[color:var(--surface-active)]"
                    key={task.id}
                    onClick={() => props.onOpenTask(task)}
                    type="button"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_DOT[task.status] }}
                    />
                    <span className="max-w-[220px] truncate">{task.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function TasksScreen(): React.JSX.Element {
  const project = useProject();
  const roster = useTeamRoster();
  const me = project.settings.displayName;
  const [view, setView] = React.useState<"assigned" | "board">("assigned");
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [reviewAssignee, setReviewAssignee] = React.useState<string | null>(null);
  const [reviewAssetId, setReviewAssetId] = React.useState<string | null>(null);

  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of project.tasks) for (const tag of task.tags) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks]);

  const suggestTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of project.tasks) for (const tag of task.tags) set.add(tag);
    for (const asset of project.assets) for (const tag of asset.tags) set.add(tag);
    for (const entry of project.journal) for (const tag of entry.tags) set.add(tag);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.tasks, project.assets, project.journal]);

  const suggestPeople = React.useMemo(() => {
    const set = new Set<string>();
    for (const member of project.teamMembers) if (member.name) set.add(member.name);
    for (const task of project.tasks) if (task.assignee) set.add(task.assignee);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project.teamMembers, project.tasks]);

  // Per-person review queues: assets handed to them (assigned) or where they're
  // @mentioned in an open comment, plus any tasks assigned to them. The current
  // user floats to the top so they land on their own queue first.
  const queues = React.useMemo<PersonQueue[]>(() => {
    const map = new Map<string, { assets: Map<string, ReviewReason>; tasks: Task[] }>();
    const ensure = (name: string): { assets: Map<string, ReviewReason>; tasks: Task[] } => {
      let entry = map.get(name);
      if (!entry) {
        entry = { assets: new Map(), tasks: [] };
        map.set(name, entry);
      }
      return entry;
    };
    for (const asset of project.assets) {
      if (asset.assignedTo) ensure(asset.assignedTo).assets.set(asset.id, "assigned");
      for (const comment of asset.comments) {
        if (comment.resolved) continue;
        for (const name of findMentions(comment.text, roster)) {
          const entry = ensure(name);
          if (!entry.assets.has(asset.id)) entry.assets.set(asset.id, "mentioned");
        }
      }
    }
    for (const task of project.tasks) {
      if (task.assignee) ensure(task.assignee).tasks.push(task);
    }
    const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
    return [...map.entries()]
      .map(([name, value]) => ({
        assets: [...value.assets.entries()]
          .map(([id, reason]) => ({ asset: assetById.get(id)!, reason }))
          .filter((entry) => entry.asset),
        name,
        tasks: value.tasks.sort((a, b) => a.position - b.position),
      }))
      .filter((queue) => queue.assets.length + queue.tasks.length > 0)
      .sort((a, b) => {
        if (me) {
          if (a.name === me) return -1;
          if (b.name === me) return 1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [project.assets, project.tasks, roster, me]);

  const reviewIds = reviewAssignee
    ? (queues.find((queue) => queue.name === reviewAssignee)?.assets.map((a) => a.asset.id) ?? [])
    : [];

  const startReview = (name: string): void => {
    const first = queues.find((queue) => queue.name === name)?.assets[0]?.asset.id;
    if (first) {
      setReviewAssignee(name);
      setReviewAssetId(first);
    }
  };

  const openAsset = (name: string, assetId: string): void => {
    setReviewAssignee(name);
    setReviewAssetId(assetId);
  };

  // Resolve = clear this person's claim on the asset (assignment and/or their
  // open @mentions) and advance to the next in their queue.
  const resolveAndNext = (id: string): void => {
    const remaining = reviewIds.filter((x) => x !== id);
    const asset = project.assets.find((entry) => entry.id === id);
    if (asset && reviewAssignee) {
      if (asset.assignedTo === reviewAssignee) setAssetAssignee(id, null);
      for (const comment of asset.comments) {
        if (!comment.resolved && mentions(comment.text, reviewAssignee)) {
          resolveAssetComment(id, comment.id);
        }
      }
    }
    if (remaining.length > 0) {
      setReviewAssetId(remaining[0]!);
    } else {
      setReviewAssignee(null);
      setReviewAssetId(null);
    }
  };

  const visible = tagFilter
    ? project.tasks.filter((task) => task.tags.includes(tagFilter))
    : project.tasks;
  const openTask = project.tasks.find((task) => task.id === openId) ?? null;
  const assignedCount = queues.reduce(
    (sum, queue) => sum + queue.assets.length + queue.tasks.length,
    0,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Lens switch — assignment-first, board second */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
        <button
          className="ds-seg !h-7 !px-3"
          data-active={view === "assigned"}
          onClick={() => setView("assigned")}
          type="button"
        >
          Assigned{assignedCount > 0 ? ` (${assignedCount})` : ""}
        </button>
        <button
          className="ds-seg !h-7 !px-3"
          data-active={view === "board"}
          onClick={() => setView("board")}
          type="button"
        >
          Board
        </button>
      </div>

      {view === "assigned" ? (
        <AssignedView
          isMe={(name) => name === me}
          onOpenAsset={openAsset}
          onOpenTask={(task) => setOpenId(task.id)}
          onReview={startReview}
          people={suggestPeople}
          queues={queues}
        />
      ) : (
        <>
          {allTags.length > 0 ? (
            <div className="no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2">
              <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Filter
              </span>
              <button
                className="ds-seg shrink-0 !h-7 !px-2.5"
                data-active={tagFilter === null}
                onClick={() => setTagFilter(null)}
                type="button"
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  className="ds-seg shrink-0 !h-7 !px-2.5"
                  data-active={tagFilter === tag}
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  type="button"
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto p-4">
            {TASK_STATUS_ORDER.map((status) => (
              <Column
                key={status}
                onOpen={(task) => setOpenId(task.id)}
                people={suggestPeople}
                status={status}
                tags={suggestTags}
                tasks={visible
                  .filter((task) => task.status === status)
                  .sort((a, b) => a.position - b.position)}
              />
            ))}
          </div>
        </>
      )}

      {openTask ? (
        <TaskDetail
          key={openTask.id}
          onClose={() => setOpenId(null)}
          people={suggestPeople}
          task={openTask}
        />
      ) : null}

      {reviewAssetId ? (
        <AssetDetail
          assetId={reviewAssetId}
          assetIds={reviewIds}
          onClose={() => {
            setReviewAssignee(null);
            setReviewAssetId(null);
          }}
          onNavigate={setReviewAssetId}
          onResolve={resolveAndNext}
        />
      ) : null}
    </div>
  );
}
