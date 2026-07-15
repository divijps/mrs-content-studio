/**
 * Task-board lens logic, kept pure so the Tasks screen stays lean and this is
 * unit-testable: who a task is from (`taskAuthor`), who it's for (`taskTarget`),
 * whether it belongs in a person's scoped board (`taskInScope`), how
 * comment-spawned notes bundle into one card per author→target per day
 * (`bundleTasks`), and the per-person asset handoff queues that render as the
 * Review column's handoff cards (`handoffQueues`).
 */

import { findMentions, mentions } from "../library/mentions";
import type { Asset, ProjectSnapshot, Task, TaskStatus } from "../data/types";

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

/** One bundle of same-day notes from one author to one target. */
export interface TaskBundle {
  author: string;
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
  const groups = new Map<string, { author: string; target: string | null; tasks: Task[] }>();
  const singles: Task[] = [];

  for (const task of tasks) {
    const meta = metaOf(task.id);
    // Only auto-spawned notes with a known author bundle; manual tasks and
    // author-less legacy rows stay individual cards.
    if (task.sourceCommentId == null || !meta?.author) {
      singles.push(task);
      continue;
    }
    // JSON key = unambiguous regardless of what characters names contain.
    const key = JSON.stringify([
      meta.author,
      meta.target ?? null,
      task.status,
      localDayKey(task.createdAt),
    ]);
    const group = groups.get(key);
    if (group) group.tasks.push(task);
    else groups.set(key, { author: meta.author, target: meta.target ?? null, tasks: [task] });
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

/** Why an asset sits in someone's handoff queue. */
export type HandoffReason = "assigned" | "mentioned";

export interface HandoffQueue {
  assets: { asset: Asset; reason: HandoffReason }[];
  name: string;
}

/**
 * Per-person asset handoff queues: assets assigned to them, plus assets whose
 * unresolved comments @mention them. Rendered as the Review column's handoff
 * cards; the review lightbox walks `assets` and resolves the person's claims.
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
  return [...byName.entries()]
    .map(([name, ids]) => ({
      assets: [...ids.entries()].flatMap(([id, reason]) => {
        const asset = assetById.get(id);
        return asset ? [{ asset, reason }] : [];
      }),
      name,
    }))
    .filter((queue) => queue.assets.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Convenience: does `person` still have an open claim on this asset? */
export function hasOpenClaim(asset: Asset, person: string): boolean {
  if (asset.assignedTo === person) return true;
  return asset.comments.some((comment) => !comment.resolved && mentions(comment.text, person));
}
