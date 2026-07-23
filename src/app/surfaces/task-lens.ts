/**
 * Task-board lens logic, kept pure so the Tasks screen stays lean and this is
 * unit-testable: who a task is from (`taskAuthor`), who it's for (`taskTarget`),
 * whether it belongs in a person's scoped board (`taskInScope`), how
 * comment-spawned notes bundle into one card per author→target per day
 * (`bundleTasks`), and the per-person asset handoff queues that render as the
 * Review column's handoff cards (`handoffQueues`).
 */

import { findMentions, mentions } from "../library/mentions";
import type {
  Asset,
  PlannerChannel,
  PlannerGridSlot,
  ProjectSnapshot,
  Task,
  TaskStatus,
} from "../data/types";

/** Who a task is from / who it's for (precomputed once per board render). */
export interface TaskMeta {
  author: string | null;
  target: string | null;
}

/**
 * The task's creator. New tasks carry `createdBy`; legacy comment-spawned tasks
 * recover the comment's author by finding the comment that spawned them —
 * the same walk `resolveTaskSource` does, but returning the author.
 */
export function taskAuthor(task: Task, project: ProjectSnapshot): string | null {
  if (task.createdBy) return task.createdBy;
  const commentId = task.sourceCommentId;
  if (!commentId) return null;
  for (const asset of project.assets) {
    const comment = asset.comments.find((entry) => entry.id === commentId);
    if (comment) return comment.author || null;
  }
  for (const entry of project.journal) {
    const comment = entry.comments.find((item) => item.id === commentId);
    if (comment) return comment.author || null;
  }
  const slots = [
    ...project.planner.gridSlots,
    ...project.planner.storySlots,
    ...project.planner.pinSlots,
    ...project.planner.reelSlots,
    ...project.planner.tiktokSlots,
  ];
  for (const slot of slots) {
    const comment = slot.comments.find((item) => item.id === commentId);
    if (comment) return comment.author || null;
  }
  return null;
}

/** Who the task is for: its assignee, else the first @mention in the title
 * (a comment-task's title IS the comment text, truncated — mentions survive). */
export function taskTarget(task: Task, roster: readonly string[]): string | null {
  return task.assignee ?? findMentions(task.title, [...roster])[0] ?? null;
}

/**
 * A person's scoped board: tasks assigned to them, tasks they created, and
 * notes addressed to them. "Everyone" is expressed by not filtering at all.
 */
export function taskInScope(task: Task, person: string, meta: TaskMeta): boolean {
  return (
    task.assignee === person ||
    meta.author === person ||
    (task.sourceCommentId != null && meta.target === person)
  );
}

/** Where a review task came from: a Library photo, a Copy item, a Planner slot,
 * or a plain (manually-added) task. */
export type TaskCategory = "asset" | "copy" | "planner" | "task";

/**
 * The task's source category, derived from `sourceRef` ("asset:…" | "copy:…" |
 * "planner:<channel>:…"). Legacy rows may predate sourceRef, so fall back to the
 * always-stamped `sourceLabel` prefix ("Photo ·" / "Copy ·" / "Planner ·").
 */
export function taskCategory(task: Task): TaskCategory {
  const prefix = (task.sourceRef ?? "").split(":")[0];
  if (prefix === "asset" || prefix === "copy" || prefix === "planner") return prefix;
  const label = task.sourceLabel ?? "";
  if (label.startsWith("Photo")) return "asset";
  if (label.startsWith("Copy")) return "copy";
  if (label.startsWith("Planner")) return "planner";
  return "task";
}

/** One bundle of same-day notes from one author to one target. */
export interface TaskBundle {
  author: string;
  /** The shared source category — bundles never straddle two categories. */
  category: TaskCategory;
  dayKey: string;
  /** Stable key — also the board item id. */
  id: string;
  /** Column ordering anchor: the earliest member's position. */
  position: number;
  status: TaskStatus;
  /** Null = addressed to no one in particular ("team"). */
  target: string | null;
  /** Members, sorted by position. */
  tasks: Task[];
}

export type BoardItem = { kind: "task"; task: Task } | { bundle: TaskBundle; kind: "bundle" };

/** Local calendar day (not UTC slice) so late-evening notes group by the day
 * the user actually experienced. */
export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Group comment-spawned tasks into bundles by (author, target, status, day);
 * groups of ≥2 become one bundle item, everything else stays a plain task.
 * Items come back position-sorted so columns can render them directly.
 */
export function bundleTasks(
  tasks: readonly Task[],
  metaOf: (taskId: string) => TaskMeta | undefined,
): BoardItem[] {
  const groups = new Map<
    string,
    { author: string; category: TaskCategory; target: string | null; tasks: Task[] }
  >();
  const singles: Task[] = [];

  for (const task of tasks) {
    const meta = metaOf(task.id);
    // Only auto-spawned notes with a known author bundle; manual tasks and
    // author-less legacy rows stay individual cards.
    if (task.sourceCommentId == null || !meta?.author) {
      singles.push(task);
      continue;
    }
    // Category is part of the key so a bundle belongs to exactly one board
    // section (a Photo note and a Copy note to the same person don't merge).
    const category = taskCategory(task);
    // JSON key = unambiguous regardless of what characters names contain.
    const key = JSON.stringify([
      meta.author,
      meta.target ?? null,
      task.status,
      localDayKey(task.createdAt),
      category,
    ]);
    const group = groups.get(key);
    if (group) group.tasks.push(task);
    else groups.set(key, { author: meta.author, category, target: meta.target ?? null, tasks: [task] });
  }

  const items: BoardItem[] = singles.map((task) => ({ kind: "task", task }));
  for (const [key, group] of groups) {
    if (group.tasks.length < 2) {
      for (const task of group.tasks) items.push({ kind: "task", task });
      continue;
    }
    const sorted = [...group.tasks].sort((a, b) => a.position - b.position);
    items.push({
      bundle: {
        author: group.author,
        category: group.category,
        dayKey: localDayKey(sorted[0]!.createdAt),
        id: `bundle:${key}`,
        position: sorted[0]!.position,
        status: sorted[0]!.status,
        target: group.target,
        tasks: sorted,
      },
      kind: "bundle",
    });
  }

  return items;
}

/** Why an item sits in someone's handoff queue. */
export type HandoffReason = "assigned" | "mentioned";

/** One thing waiting on a person: a Library asset or a planned post. */
export type HandoffItem =
  | { asset: Asset; kind: "asset"; reason: HandoffReason }
  | { channel: PlannerChannel; kind: "post"; slot: PlannerGridSlot };

export interface HandoffQueue {
  items: HandoffItem[];
  name: string;
}

/**
 * Per-person handoff queues — everything waiting on them: assets assigned to
 * them, assets whose unresolved comments @mention them, and planner posts
 * assigned to them. Rendered as ONE review card per person atop the Review
 * column; "Review N" walks the items and resolves each claim.
 */
export function handoffQueues(
  project: ProjectSnapshot,
  roster: readonly string[],
): HandoffQueue[] {
  const byName = new Map<string, Map<string, HandoffReason>>();
  const ensure = (name: string): Map<string, HandoffReason> => {
    const existing = byName.get(name);
    if (existing) return existing;
    const created = new Map<string, HandoffReason>();
    byName.set(name, created);
    return created;
  };

  for (const asset of project.assets) {
    if (asset.assignedTo) ensure(asset.assignedTo).set(asset.id, "assigned");
    for (const comment of asset.comments) {
      if (comment.resolved) continue;
      for (const name of findMentions(comment.text, [...roster])) {
        if (!ensure(name).has(asset.id)) ensure(name).set(asset.id, "mentioned");
      }
    }
  }

  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const queues = new Map<string, HandoffItem[]>(
    [...byName.entries()].map(([name, ids]) => [
      name,
      [...ids.entries()].flatMap(([id, reason]): HandoffItem[] => {
        const asset = assetById.get(id);
        return asset ? [{ asset, kind: "asset", reason }] : [];
      }),
    ]),
  );

  const channels: [PlannerChannel, PlannerGridSlot[]][] = [
    ["grid", project.planner.gridSlots],
    ["story", project.planner.storySlots],
    ["pinterest", project.planner.pinSlots],
    ["reel", project.planner.reelSlots],
    ["tiktok", project.planner.tiktokSlots],
  ];
  for (const [channel, slots] of channels) {
    for (const slot of slots) {
      if (!slot.assignedTo) continue;
      const list = queues.get(slot.assignedTo) ?? [];
      list.push({ channel, kind: "post", slot });
      queues.set(slot.assignedTo, list);
    }
  }

  return [...queues.entries()]
    .map(([name, items]) => ({ items, name }))
    .filter((queue) => queue.items.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * True for the LIVE mirror-task of a planner handoff (`task-handoff-<slotId>`,
 * not yet done). These never render as board cards — the person's review card
 * represents them; once done they return as ordinary history cards.
 */
export function isOpenPlannerHandoffTask(task: Task): boolean {
  const [kind, , slotId] = (task.sourceRef ?? "").split(":");
  return (
    kind === "planner" &&
    Boolean(slotId) &&
    task.id === `task-handoff-${slotId}` &&
    task.status !== "done"
  );
}

/** Convenience: does `person` still have an open claim on this asset? */
export function hasOpenClaim(asset: Asset, person: string): boolean {
  if (asset.assignedTo === person) return true;
  return asset.comments.some((comment) => !comment.resolved && mentions(comment.text, person));
}
