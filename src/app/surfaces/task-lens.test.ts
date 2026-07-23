import { describe, expect, it } from "vitest";

import { createDemoProject } from "../data/demo-project";
import type { ProjectSnapshot, Task } from "../data/types";
import {
  bundleTasks,
  handoffQueues,
  localDayKey,
  taskAuthor,
  taskCategory,
  taskInScope,
  taskTarget,
  type TaskMeta,
} from "./task-lens";

const ROSTER = ["Divij", "Priya", "Marco"];

function makeTask(partial: Partial<Task> & Pick<Task, "id">): Task {
  return {
    assignee: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    position: 1,
    status: "todo",
    tags: [],
    title: "A task",
    updatedAt: "2026-07-15T10:00:00.000Z",
    ...partial,
  };
}

function metaOf(map: Record<string, TaskMeta>): (id: string) => TaskMeta | undefined {
  return (id) => map[id];
}

describe("taskAuthor", () => {
  it("prefers createdBy, falls back to the spawning comment's author", () => {
    const project = createDemoProject();
    project.assets[0]!.comments.push({
      author: "Marco",
      createdAt: "2026-07-15T09:00:00.000Z",
      id: "comment-x",
      resolved: false,
      text: "tighten the crop",
      x: 0.5,
      y: 0.5,
    });
    const stamped = makeTask({ createdBy: "Priya", id: "t1", sourceCommentId: "comment-x" });
    const legacy = makeTask({ id: "t2", sourceCommentId: "comment-x" });
    const manual = makeTask({ id: "t3" });
    expect(taskAuthor(stamped, project)).toBe("Priya");
    expect(taskAuthor(legacy, project)).toBe("Marco");
    expect(taskAuthor(manual, project)).toBeNull();
  });
});

describe("taskTarget", () => {
  it("uses assignee, else the first @mention in the title", () => {
    expect(taskTarget(makeTask({ assignee: "Priya", id: "t" }), ROSTER)).toBe("Priya");
    expect(taskTarget(makeTask({ id: "t", title: "could be tighter @Marco" }), ROSTER)).toBe(
      "Marco",
    );
    expect(taskTarget(makeTask({ id: "t" }), ROSTER)).toBeNull();
  });
});

describe("taskInScope", () => {
  const meta = (author: string | null, target: string | null): TaskMeta => ({ author, target });
  it("matches assignee, author, and (for notes) the addressed person", () => {
    expect(taskInScope(makeTask({ assignee: "Divij", id: "t" }), "Divij", meta(null, null))).toBe(
      true,
    );
    expect(taskInScope(makeTask({ id: "t" }), "Divij", meta("Divij", null))).toBe(true);
    expect(
      taskInScope(
        makeTask({ id: "t", sourceCommentId: "c" }),
        "Divij",
        meta("Marco", "Divij"),
      ),
    ).toBe(true);
    // A manual task addressed to no one isn't pulled in by target.
    expect(taskInScope(makeTask({ id: "t" }), "Divij", meta("Marco", "Divij"))).toBe(false);
  });
});

describe("bundleTasks", () => {
  const noteA1 = makeTask({ id: "a1", position: 1, sourceCommentId: "c1", title: "note @Divij" });
  const noteA2 = makeTask({ id: "a2", position: 2, sourceCommentId: "c2", title: "more @Divij" });
  const meta: Record<string, TaskMeta> = {
    a1: { author: "Marco", target: "Divij" },
    a2: { author: "Marco", target: "Divij" },
  };

  it("groups ≥2 same author→target same-day notes into one bundle", () => {
    const items = bundleTasks([noteA1, noteA2], metaOf(meta));
    expect(items).toHaveLength(1);
    const bundle = items[0]!;
    if (bundle.kind !== "bundle") throw new Error("expected bundle");
    expect(bundle.bundle.tasks.map((t) => t.id)).toEqual(["a1", "a2"]);
    expect(bundle.bundle.author).toBe("Marco");
    expect(bundle.bundle.target).toBe("Divij");
  });

  it("splits by day and by status; singles and manual tasks stay cards", () => {
    const nextDay = makeTask({
      createdAt: "2026-07-16T10:00:00.000Z",
      id: "a3",
      position: 3,
      sourceCommentId: "c3",
    });
    const moved = makeTask({ id: "a4", position: 4, sourceCommentId: "c4", status: "doing" });
    const manual = makeTask({ id: "m1", position: 5 });
    const fullMeta: Record<string, TaskMeta> = {
      ...meta,
      a3: { author: "Marco", target: "Divij" },
      a4: { author: "Marco", target: "Divij" },
      m1: { author: "Divij", target: null },
    };
    const items = bundleTasks([noteA1, noteA2, nextDay, moved, manual], metaOf(fullMeta));
    const bundles = items.filter((item) => item.kind === "bundle");
    const tasks = items.filter((item) => item.kind === "task");
    expect(bundles).toHaveLength(1); // only the same-day todo pair
    expect(tasks).toHaveLength(3); // next-day note, moved note, manual task
  });
});

describe("taskCategory", () => {
  it("reads the sourceRef prefix, falling back to the sourceLabel", () => {
    expect(taskCategory(makeTask({ id: "a", sourceRef: "asset:x1" }))).toBe("asset");
    expect(taskCategory(makeTask({ id: "c", sourceRef: "copy:e1" }))).toBe("copy");
    expect(taskCategory(makeTask({ id: "p", sourceRef: "planner:grid:s1" }))).toBe("planner");
    expect(taskCategory(makeTask({ id: "m" }))).toBe("task");
    // Legacy row: no sourceRef, but sourceLabel is always stamped at spawn.
    expect(taskCategory(makeTask({ id: "l", sourceLabel: "Photo · Look 3" }))).toBe("asset");
  });
});

describe("bundleTasks by category", () => {
  const target: TaskMeta = { author: "Marco", target: "Divij" };
  const photoA = makeTask({ id: "p1", position: 1, sourceCommentId: "c1", sourceRef: "asset:x", title: "note @Divij" });
  const photoB = makeTask({ id: "p2", position: 2, sourceCommentId: "c2", sourceRef: "asset:x", title: "more @Divij" });
  const copyA = makeTask({ id: "y1", position: 3, sourceCommentId: "c3", sourceRef: "copy:e", title: "note @Divij" });

  it("does not merge notes of different categories", () => {
    const items = bundleTasks([photoA, copyA], metaOf({ p1: target, y1: target }));
    expect(items.filter((i) => i.kind === "bundle")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "task")).toHaveLength(2);
  });

  it("stamps the shared category on a bundle", () => {
    const items = bundleTasks([photoA, photoB], metaOf({ p1: target, p2: target }));
    const bundle = items[0]!;
    if (bundle.kind !== "bundle") throw new Error("expected bundle");
    expect(bundle.bundle.category).toBe("asset");
  });
});

describe("localDayKey", () => {
  it("keys by local calendar day", () => {
    expect(localDayKey("2026-07-15T10:00:00.000Z")).toMatch(/^2026-7-1[45]$/);
  });
});

describe("handoffQueues", () => {
  it("collects assigned + unresolved-mentioned assets per person", () => {
    const project: ProjectSnapshot = createDemoProject();
    const [first, second] = project.assets;
    first!.assignedTo = "Priya";
    second!.comments.push({
      author: "Divij",
      createdAt: "2026-07-15T09:00:00.000Z",
      id: "hq-1",
      resolved: false,
      text: "please review @Priya",
      x: 0.5,
      y: 0.5,
    });
    second!.comments.push({
      author: "Divij",
      createdAt: "2026-07-15T09:05:00.000Z",
      id: "hq-2",
      resolved: true,
      text: "old note @Marco",
      x: 0.5,
      y: 0.5,
    });
    // A planner post assigned to Priya joins the same queue.
    project.planner.gridSlots.push({
      assetId: first!.id,
      assignedTo: "Priya",
      comments: [],
      compId: null,
      frames: [],
      id: "hq-slot-1",
      label: null,
      status: "review",
    });

    const queues = handoffQueues(project, ROSTER);
    const priya = queues.find((queue) => queue.name === "Priya");
    expect(priya).toBeDefined();
    const priyaAssets = priya!.items.filter((item) => item.kind === "asset");
    // Assert on the two fixture assets specifically — demo seeds add their own.
    expect(
      priyaAssets.find((item) => item.kind === "asset" && item.asset.id === first!.id)?.reason,
    ).toBe("assigned");
    expect(
      priyaAssets.find((item) => item.kind === "asset" && item.asset.id === second!.id)?.reason,
    ).toBe("mentioned");
    expect(
      priya!.items.some((item) => item.kind === "post" && item.slot.id === "hq-slot-1"),
    ).toBe(true);
    // Resolved mentions don't queue Marco (demo seeds assign him one asset though).
    const marco = queues.find((queue) => queue.name === "Marco");
    expect(
      marco?.items.every((item) => item.kind !== "asset" || item.asset.id !== second!.id) ?? true,
    ).toBe(true);
  });
});
