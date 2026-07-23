import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CalendarBlankIcon,
  CaretDownIcon,
  ChatCircleIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  EyeIcon,
  ImageIcon,
  PlusIcon,
  TextTIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  consumeTask,
  deleteSubtask,
  deleteTask,
  moveTask,
  reorderTask,
  requestCopyEntry,
  TASK_FOCUS_EVENT,
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
  type PlannerGridSlot,
  type Task,
  type TaskStatus,
} from "../data/types";
import { AssetDetail } from "../library/asset-detail";
import { assetCode } from "../library/asset-code";
import { CHANNEL_FORMAT } from "../planner/planner-calendar";
import { slotCode } from "../planner/slot-code";
import { SlotVisual } from "../planner/slot-visual";
import { mentions, useTeamRoster } from "../library/mentions";
import { PersonAvatar } from "../ui/avatar";
import { Field, InspectorSection, TagChip } from "../ui/inspector-kit";
import {
  handoffQueues,
  taskAuthor,
  taskCategory,
  taskInScope,
  taskTarget,
  type HandoffQueue,
  type TaskCategory,
  type TaskMeta,
} from "./task-lens";

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
    ["tiktok", project.planner.tiktokSlots],
  ];
  for (const [channel, slots] of channels) {
    const slot = slots.find((s) => s.comments.some((c) => c.id === commentId));
    if (slot) return { fire: () => requestPlannerSlot(channel, slot.id), to: "/planner" };
  }
  return null;
}

/** The media behind a task — its sourceRef target (or, for legacy comment
 * tasks with no ref, the asset that owns the source comment). Drives the
 * visual previews on cards and feed rows. */
function taskSourceMedia(
  task: Task,
  project: ReturnType<typeof useProject>,
): { asset: Asset } | { channel: PlannerChannel; slot: PlannerGridSlot } | null {
  const [kind, a, b] = (task.sourceRef ?? "").split(":");
  if (kind === "asset" && a) {
    const asset = project.assets.find((entry) => entry.id === a);
    return asset ? { asset } : null;
  }
  if (kind === "planner" && a && b) {
    const lists: Record<PlannerChannel, PlannerGridSlot[]> = {
      grid: project.planner.gridSlots,
      pinterest: project.planner.pinSlots,
      reel: project.planner.reelSlots,
      story: project.planner.storySlots,
      tiktok: project.planner.tiktokSlots,
    };
    const slot = lists[a as PlannerChannel]?.find((entry) => entry.id === b);
    return slot ? { channel: a as PlannerChannel, slot } : null;
  }
  if (task.sourceCommentId) {
    const asset = project.assets.find((entry) =>
      entry.comments.some((comment) => comment.id === task.sourceCommentId),
    );
    if (asset) return { asset };
  }
  return null;
}

/** Aspect-true thumbnail for a task's source media. */
function TaskMediaThumb(props: {
  className: string;
  media: NonNullable<ReturnType<typeof taskSourceMedia>>;
}): React.JSX.Element {
  if ("asset" in props.media) {
    const { asset } = props.media;
    return (
      <img
        alt=""
        className={`${props.className} object-cover`}
        loading="lazy"
        src={asset.thumbUrl || asset.url}
        style={{ objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%` }}
      />
    );
  }
  const { channel, slot } = props.media;
  return (
    <span className={`relative block overflow-hidden ${props.className}`}>
      <SlotVisual formatId={CHANNEL_FORMAT[channel].formatId} slot={slot} />
    </span>
  );
}

/** What a comment sits on and whose it is — "SOL 106 · Priya's photo". */
function commentOrigin(
  task: Task,
  project: ReturnType<typeof useProject>,
): { code: string; owner: string | null } {
  const media = taskSourceMedia(task, project);
  if (media && "asset" in media) {
    return { code: assetCode(media.asset, project.collections), owner: media.asset.addedBy ?? null };
  }
  if (media) {
    return {
      code: slotCode(media.slot, media.channel, project.assets, project.collections),
      owner: media.slot.owner ?? null,
    };
  }
  const [kind, a] = (task.sourceRef ?? "").split(":");
  if (kind === "copy" && a) {
    const entry = project.journal.find((item) => item.id === a);
    if (entry) return { code: entry.title || "Copy", owner: null };
  }
  return { code: task.sourceLabel ?? "", owner: null };
}

const STATUS_DOT: Record<TaskStatus, string> = {
  doing: "#e5b452",
  done: "#4caf7d",
  review: "#0c8ce9",
  todo: "#9a958c",
};

// Source categories sub-group each status column (Photos / Copy / Planner /
// plain Tasks). Kept neutral so the status dot stays the dominant signal.
const CATEGORY_ORDER: TaskCategory[] = ["asset", "copy", "planner", "task"];
const CATEGORY_META: Record<TaskCategory, { icon: Icon; label: string }> = {
  asset: { icon: ImageIcon, label: "Photos" },
  copy: { icon: TextTIcon, label: "Copy" },
  planner: { icon: CalendarBlankIcon, label: "Planner" },
  task: { icon: CheckSquareIcon, label: "Tasks" },
};

function CategoryHeader(props: { category: TaskCategory; count: number }): React.JSX.Element {
  const meta = CATEGORY_META[props.category];
  const Glyph = meta.icon;
  return (
    <div className="flex items-center gap-1.5 px-1 pt-1.5 pb-0.5">
      <Glyph className="text-muted-foreground" size={13} />
      <span className="text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {meta.label}
      </span>
      <span className="text-[10px] tabular-nums text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
        {props.count}
      </span>
    </div>
  );
}

// The task currently being dragged (module ref so a hovered card can read it).
let draggingTaskId: string | null = null;

/** Short "Jul 6" style date for cards. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

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

/** Assignee dropdown for the task dialog, styled exactly like the Status one. */
function TaskAssignSelect(props: {
  assignee: string | null;
  onAssign: (name: string | null) => void;
  people: string[];
}): React.JSX.Element {
  return (
    <Select
      items={[
        { label: "Unassigned", value: null },
        ...props.people.map((person) => ({ label: person, value: person })),
      ]}
      onValueChange={(next) => props.onAssign(next as string | null)}
      value={props.assignee}
    >
      <SelectTrigger className="h-9 w-full justify-between">
        <SelectValue>
          {() => (
            <span className="flex items-center gap-2">
              {props.assignee ? <PersonAvatar name={props.assignee} size={16} /> : null}
              {props.assignee ?? "Unassigned"}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          <SelectItem value={null}>Unassigned</SelectItem>
          {props.people.map((person) => (
            <SelectItem key={person} value={person}>
              <span className="flex items-center gap-2">
                <PersonAvatar name={person} size={16} />
                {person}
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
  /** When scoped to a teammate, new quick-adds default to them so they stay visible. */
  defaultAssignee?: string | null;
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
    const target = assignee ?? props.defaultAssignee ?? null;
    if (target) updateTask(id, { assignee: target });
    setValue("");
    setActive(0);
  };

  return (
    <div className="relative">
      <input
        className="h-9 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 text-xs-plus text-foreground outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]"
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-8"
      onClick={props.onClose}
    >
      <div
        className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-[color:var(--panel)] shadow-2xl md:flex-row"
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
            ) : null}
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
            className="min-h-[64px] w-full resize-y rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 py-2.5 text-xs-plus leading-relaxed text-foreground outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a description…"
            value={description}
          />

          {/* Sub-tasks */}
          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              Sub-tasks {subtasks.length > 0 ? `${done}/${subtasks.length}` : ""}
            </span>
            {subtasks.map((sub) => (
              <div className="group flex items-center gap-2.5 py-0.5" key={sub.id}>
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
              className="mt-1 h-9 w-full rounded-xl border border-[color:color-mix(in_oklab,var(--border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] px-3 text-xs-plus text-foreground outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:color-mix(in_oklab,var(--border)_36%,transparent)] focus:border-[color:color-mix(in_oklab,var(--border)_48%,transparent)]"
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
            collapsible={false}
            title="Details"
          >
            <Field label="Status">
              <TaskStatusSelect onChange={(status) => moveTask(task.id, status)} status={task.status} />
            </Field>
            <Field label="Assign">
              <TaskAssignSelect
                assignee={task.assignee ?? null}
                onAssign={(name) => updateTask(task.id, { assignee: name })}
                people={props.people}
              />
            </Field>
          </InspectorSection>
          <button
            className="mx-4 mb-4 mt-1 self-start text-2xs text-muted-foreground transition-colors hover:text-[color:var(--destructive)]"
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

  const created = new Date(task.createdAt);
  const createdLabel = Number.isNaN(created.getTime())
    ? null
    : created.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div
      className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-xl border border-[color:color-mix(in_oklab,var(--border)_16%,transparent)] bg-[color:var(--card)] p-3 transition-colors hover:border-[color:color-mix(in_oklab,var(--border)_32%,transparent)] ${
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

      {createdLabel ? (
        <span className="flex items-center gap-1 pr-4 text-[10px] text-muted-foreground">
          <ClockIcon size={11} />
          {createdLabel}
        </span>
      ) : null}

      {/* Source: a real preview of the photo/post when it resolves (tap to
        * open it), else the quiet text origin. */}
      {(() => {
        const media = taskSourceMedia(task, project);
        if (media && source) {
          return (
            <button
              className="relative block h-24 w-full overflow-hidden rounded-lg"
              onClick={(event) => {
                event.stopPropagation();
                source.fire();
                void navigate({ to: source.to });
              }}
              title={`Open ${task.sourceLabel ?? "source"}`}
              type="button"
            >
              <TaskMediaThumb className="absolute inset-0 h-full w-full" media={media} />
              {task.sourceLabel ? (
                <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                  {task.sourceLabel}
                </span>
              ) : null}
            </button>
          );
        }
        if (!task.sourceLabel) return null;
        return source ? (
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
        );
      })()}

      <span className="pr-4 text-sm leading-snug text-foreground">{task.title}</span>

      {task.description ? (
        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </span>
      ) : null}

      {task.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {task.tags.map((tag) => (
            <TagChip key={tag} size="xs" tag={tag} />
          ))}
        </div>
      ) : null}

      {task.assignee || subtasks.length > 0 ? (
        <div className="mt-0.5 flex items-center gap-1.5 border-t border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] pt-2">
          {subtasks.length > 0 ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              ☑ {doneSubs}/{subtasks.length}
            </span>
          ) : null}
          {task.assignee ? (
            <span className="ml-auto" onClick={(event) => event.stopPropagation()}>
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
  /** Quick-add default assignee (person scope) so new tasks stay visible. */
  defaultAssignee?: string | null;
  /** Handoff cards (virtual — assigned/mentioned assets) shown first in Review. */
  handoff?: React.ReactNode;
  items: Task[];
  onAdd: () => void;
  onOpen: (task: Task) => void;
  /** Walk this column's asset-linked tasks in the review lightbox (null = none). */
  onReview: (() => void) | null;
  people: string[];
  status: TaskStatus;
  tags: string[];
}): React.JSX.Element {
  const { items, status } = props;
  const [over, setOver] = React.useState(false);
  const count = items.length;

  // Sub-group the column by source category, preserving position order within
  // each. Headers only show when a column actually spans >1 category, so a
  // single-category column (the common case) stays clean. Sections are ordered
  // by their lowest-position card so a drag that crosses a category boundary
  // still lands somewhere visible — a card can't change its (source-derived)
  // category, but its whole section floats to where the card was dropped.
  const sections = CATEGORY_ORDER.map((category) => ({
    category,
    group: items.filter((item) => taskCategory(item) === category),
  }))
    .filter((section) => section.group.length > 0)
    .sort(
      (a, b) =>
        Math.min(...a.group.map((task) => task.position)) -
        Math.min(...b.group.map((task) => task.position)),
    );
  const showHeaders = sections.length > 1;

  const acceptsDrag = (types: readonly string[]): boolean => types.includes("text/task-id");

  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 py-2">
        <span
          className="h-3.5 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_DOT[status] }}
        />
        <span className="text-xs-plus font-medium text-foreground">
          {TASK_STATUS_LABELS[status]}
        </span>
        <span className="rounded-md bg-[color:var(--surface-inactive)] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {props.onReview ? (
            <button
              aria-label={`Review ${TASK_STATUS_LABELS[status]} items`}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[color:var(--surface-inactive)] hover:text-foreground"
              onClick={props.onReview}
              title="Review linked items"
              type="button"
            >
              <EyeIcon size={14} />
            </button>
          ) : null}
          <button
            aria-label={`Add task to ${TASK_STATUS_LABELS[status]}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[color:var(--surface-inactive)] hover:text-foreground"
            onClick={props.onAdd}
            title="Add task"
            type="button"
          >
            <PlusIcon size={14} />
          </button>
        </div>
      </div>
      <div
        className={`flex min-h-[3rem] flex-1 flex-col gap-2 rounded-lg p-1 transition-colors ${over ? "bg-[color:var(--surface-inactive)]" : ""}`}
        onDragLeave={() => setOver(false)}
        onDragOver={(event) => {
          if (acceptsDrag(event.dataTransfer.types)) {
            event.preventDefault();
            setOver(true);
          }
        }}
        onDrop={(event) => {
          setOver(false);
          const id = event.dataTransfer.getData("text/task-id") || draggingTaskId;
          if (id) {
            event.preventDefault();
            reorderTask(id, status, null);
            draggingTaskId = null;
          }
        }}
      >
        {props.handoff}
        {sections.map(({ category, group }) => (
          <React.Fragment key={category}>
            {showHeaders ? <CategoryHeader category={category} count={group.length} /> : null}
            {group.map((task) => (
              <TaskCard
                key={task.id}
                onOpen={() => props.onOpen(task)}
                people={props.people}
                task={task}
              />
            ))}
          </React.Fragment>
        ))}
        <AddTaskField
          defaultAssignee={props.defaultAssignee}
          people={props.people}
          status={status}
          tags={props.tags}
        />
      </div>
    </div>
  );
}

/** ---- Comment feed: notes are communication, not to-dos ------------------ */

/** One comment-spawned note: preview, who said it, what it sits on, jump. */
function CommentRow(props: {
  meta: TaskMeta | undefined;
  task: Task;
}): React.JSX.Element {
  const { task } = props;
  const navigate = useNavigate();
  const project = useProject();
  const source = resolveTaskSource(task, project);
  const media = taskSourceMedia(task, project);
  const origin = commentOrigin(task, project);
  const done = task.status === "done";
  const author = props.meta?.author ?? task.createdBy ?? "Someone";

  return (
    <div
      className={`group flex cursor-pointer items-start gap-2.5 rounded-xl p-2 transition-colors hover:bg-[color:var(--surface-inactive)] ${done ? "opacity-55" : ""}`}
      onClick={() => {
        if (source) {
          source.fire();
          void navigate({ to: source.to });
        }
      }}
    >
      {media ? (
        <TaskMediaThumb className="h-12 w-12 shrink-0 rounded-lg" media={media} />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--surface-inactive)]">
          <TextTIcon className="text-muted-foreground" size={16} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <PersonAvatar name={author} size={15} />
          <span className="truncate text-2xs font-medium">{author}</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {shortDate(task.createdAt)}
          </span>
        </span>
        <span className={`text-xs-plus leading-snug ${done ? "line-through" : ""}`}>
          {task.title}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {origin.code}
          {origin.owner ? ` · ${origin.owner}` : ""}
        </span>
      </div>
      <button
        aria-label={done ? "Reopen" : "Mark handled"}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors"
        onClick={(event) => {
          event.stopPropagation();
          moveTask(task.id, done ? "todo" : "done");
        }}
        style={{
          backgroundColor: done ? "#4caf7d" : "transparent",
          borderColor: done
            ? "#4caf7d"
            : "color-mix(in oklab, var(--foreground) 30%, transparent)",
        }}
        title={done ? "Reopen" : "Mark handled"}
        type="button"
      >
        {done ? <CheckIcon size={11} weight="bold" /> : null}
      </button>
    </div>
  );
}

/** The comments rail: recent notes across photos, posts, and copy — with the
 * media they sit on. Open notes first (newest on top), handled ones dimmed. */
function CommentFeed(props: {
  metaOf: (taskId: string) => TaskMeta | undefined;
  tasks: Task[];
}): React.JSX.Element {
  const openNotes = props.tasks.filter((task) => task.status !== "done");
  const sorted = [...props.tasks].sort((a, b) => {
    const doneDelta = Number(a.status === "done") - Number(b.status === "done");
    return doneDelta !== 0 ? doneDelta : b.createdAt.localeCompare(a.createdAt);
  });
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <ChatCircleIcon className="text-muted-foreground" size={15} />
        <span className="text-xs-plus font-medium">Comments</span>
        {openNotes.length > 0 ? (
          <span className="rounded-md bg-[color:var(--surface-inactive)] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {openNotes.length}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {sorted.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            No comments yet — notes people leave on photos, posts, and copy land
            here.
          </p>
        ) : (
          sorted.map((task) => (
            <CommentRow key={task.id} meta={props.metaOf(task.id)} task={task} />
          ))
        )}
      </div>
    </>
  );
}

/** ---- Handoff card: a person's assets awaiting their review -------------- */

function HandoffCard(props: { onReview: () => void; queue: HandoffQueue }): React.JSX.Element {
  const { queue } = props;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--accent)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--accent)_6%,transparent)] p-3">
      <div className="flex items-center gap-2">
        <PersonAvatar name={queue.name} size={22} />
        <span className="text-sm font-medium">{queue.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {queue.assets.length} to review
        </span>
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {queue.assets.slice(0, 4).map(({ asset }) => (
          <img
            alt=""
            className="h-11 w-11 shrink-0 rounded-md object-cover"
            key={asset.id}
            loading="lazy"
            src={asset.thumbUrl || asset.url}
            style={{ objectPosition: `${asset.focalPoint.x * 100}% ${asset.focalPoint.y * 100}%` }}
          />
        ))}
      </div>
      <button
        className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--accent)] text-xs-plus font-medium text-[color:var(--accent-foreground)] transition-opacity hover:opacity-90"
        onClick={props.onReview}
        type="button"
      >
        Review {queue.assets.length}
      </button>
    </div>
  );
}

/** ---- Scope dropdown: whose board am I looking at ----------------------- */

/** null = Everyone. */
function ScopeMenu(props: {
  me: string | null;
  onChange: (scope: string | null) => void;
  people: string[];
  scope: string | null;
}): React.JSX.Element {
  const label = props.scope === null ? "Everyone" : props.scope === props.me ? "Your tasks" : props.scope;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Scope tasks"
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--surface-active)] px-2.5 text-sm ds-hairline"
            type="button"
          >
            {props.scope === null ? (
              <UsersThreeIcon size={15} />
            ) : (
              <PersonAvatar name={props.scope} size={18} />
            )}
            <span className="font-medium">{label}</span>
            <CaretDownIcon className="text-[color:var(--text-muted)]" size={12} />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-52">
        {props.me ? (
          <DropdownMenuItem onClick={() => props.onChange(props.me)}>
            <PersonAvatar name={props.me} size={16} /> Your tasks
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => props.onChange(null)}>
          <UsersThreeIcon size={15} /> Everyone
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {props.people
          .filter((name) => name !== props.me)
          .map((name) => (
            <DropdownMenuItem key={name} onClick={() => props.onChange(name)}>
              <PersonAvatar name={name} size={16} /> {name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TasksScreen(): React.JSX.Element {
  const project = useProject();
  const roster = useTeamRoster();
  const me = project.settings.displayName;
  const [openId, setOpenId] = React.useState<string | null>(null);
  // undefined = not chosen yet → default to me (Everyone if no name); null = Everyone.
  const [scopeChoice, setScopeChoice] = React.useState<string | null | undefined>(undefined);
  const scope = scopeChoice === undefined ? (me ?? null) : scopeChoice;
  // Mobile-only: the comments feed sits beside the board on desktop, but on a
  // phone it's a second view behind a plain-text tab.
  const [mobileTab, setMobileTab] = React.useState<"board" | "comments">("board");

  // Cross-surface intent (search): open a specific task.
  React.useEffect(() => {
    const check = (): void => {
      const pending = consumeTask();
      if (pending) setOpenId(pending);
    };
    check();
    window.addEventListener(TASK_FOCUS_EVENT, check);
    return () => window.removeEventListener(TASK_FOCUS_EVENT, check);
  }, []);
  const [reviewAssetId, setReviewAssetId] = React.useState<string | null>(null);

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

  // Pipeline: who-from/who-for per task → scope filter → split into the BOARD
  // (real to-dos: manual tasks + handoffs) and the COMMENT FEED (auto-spawned
  // notes — communication, not to-dos). taskMeta is computed once (the author
  // fallback scan is O(tasks×comments), so it must not run per card).
  const taskMeta = React.useMemo(() => {
    const map = new Map<string, TaskMeta>();
    for (const task of project.tasks) {
      map.set(task.id, { author: taskAuthor(task, project), target: taskTarget(task, roster) });
    }
    return map;
  }, [project, roster]);

  const scoped = React.useMemo(
    () =>
      scope === null
        ? project.tasks
        : project.tasks.filter((task) =>
            taskInScope(task, scope, taskMeta.get(task.id) ?? { author: null, target: null }),
          ),
    [project.tasks, scope, taskMeta],
  );

  const boardTasks = React.useMemo(
    () => scoped.filter((task) => task.sourceCommentId == null),
    [scoped],
  );
  const noteTasks = React.useMemo(
    () => scoped.filter((task) => task.sourceCommentId != null),
    [scoped],
  );

  // Per-person asset handoffs → Review-column cards, filtered to the scope.
  const handoffs = React.useMemo<HandoffQueue[]>(() => {
    const all = handoffQueues(project, roster);
    return scope === null ? all : all.filter((queue) => queue.name === scope);
  }, [project, roster, scope]);

  // Review lightbox: reviewOverride is the only queue now. reviewAssignee is
  // "resolve-as person" (whose claim resolveAndNext clears).
  const [reviewAssignee, setReviewAssignee] = React.useState<string | null>(null);
  const [reviewOverride, setReviewOverride] = React.useState<string[] | null>(null);
  const reviewIds = reviewOverride ?? [];

  const startReview = (assetIds: string[], resolveAs: string | null): void => {
    if (assetIds.length === 0) return;
    setReviewAssignee(resolveAs);
    setReviewOverride(assetIds);
    setReviewAssetId(assetIds[0]!);
  };

  // Resolve = clear this person's claim (assignment + their open @mentions),
  // advance to the next asset in the review queue.
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
      setReviewOverride(remaining);
      setReviewAssetId(remaining[0]!);
    } else {
      setReviewAssignee(null);
      setReviewAssetId(null);
      setReviewOverride(null);
    }
  };

  /** Distinct assets linked (via sourceRef) from a column's board tasks. */
  const columnAssetIds = (status: TaskStatus): string[] => [
    ...new Set(
      boardTasks
        .filter((task) => task.status === status)
        .map((task) => {
          const [kind, id] = (task.sourceRef ?? "").split(":");
          return kind === "asset" && id && project.assets.some((a) => a.id === id) ? id : null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const openTask = project.tasks.find((task) => task.id === openId) ?? null;
  /** New tasks land where the current scope can see them. */
  const addScoped = (status: TaskStatus): string => {
    const id = addTask("New task", status);
    if (scope && scope !== me) updateTask(id, { assignee: scope });
    return id;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Scope: whose board — your tasks (default), everyone, or a teammate.
        * On mobile, plain-text tabs switch between the board and the feed. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <ScopeMenu me={me} onChange={setScopeChoice} people={suggestPeople} scope={scope} />
        <div className="ml-auto flex items-center gap-4 lg:hidden">
          {(["board", "comments"] as const).map((tab) => (
            <button
              className={`text-xs-plus transition-colors ${
                mobileTab === tab
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              key={tab}
              onClick={() => setMobileTab(tab)}
              type="button"
            >
              {tab === "board" ? "Board" : "Comments"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className={`min-h-0 flex-1 items-start gap-4 overflow-x-auto p-4 ${
            mobileTab === "comments" ? "hidden lg:flex" : "flex"
          }`}
        >
          {TASK_STATUS_ORDER.map((status) => {
            const linkedAssets = columnAssetIds(status);
            return (
              <Column
                defaultAssignee={scope && scope !== me ? scope : null}
                handoff={
                  status === "review"
                    ? handoffs.map((queue) => (
                        <HandoffCard
                          key={queue.name}
                          onReview={() =>
                            startReview(
                              queue.assets.map((entry) => entry.asset.id),
                              queue.name,
                            )
                          }
                          queue={queue}
                        />
                      ))
                    : undefined
                }
                items={boardTasks
                  .filter((task) => task.status === status)
                  .sort((a, b) => a.position - b.position)}
                key={status}
                onAdd={() => setOpenId(addScoped(status))}
                onOpen={(task) => setOpenId(task.id)}
                onReview={
                  linkedAssets.length > 0
                    ? () => startReview(linkedAssets, scope)
                    : null
                }
                people={suggestPeople}
                status={status}
                tags={suggestTags}
              />
            );
          })}
        </div>

        {/* Comments rail: communication lives beside the board, not on it. */}
        <aside
          className={`min-h-0 flex-col border-border ${
            mobileTab === "comments" ? "flex w-full" : "hidden"
          } lg:flex lg:w-[320px] lg:shrink-0 lg:border-l`}
        >
          <CommentFeed metaOf={(id) => taskMeta.get(id)} tasks={noteTasks} />
        </aside>
      </div>

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
            setReviewOverride(null);
          }}
          onNavigate={setReviewAssetId}
          onResolve={resolveAndNext}
        />
      ) : null}
    </div>
  );
}
