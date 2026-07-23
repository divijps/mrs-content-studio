/**
 * End-to-end data flow: a real comment (via the store) spawns a comment-task
 * stamped with the author, and two same-day author→target notes bundle on the
 * board. Guards the spawn→scope→bundle pipeline the Tasks screen composes,
 * plus the planner handoff↔task loop (assign = a real task on their board).
 */
import { describe, expect, it } from "vitest";

import {
  addAssetComment,
  addPlannerSlot,
  completePlannerHandoff,
  getProjectSnapshot,
  moveTask,
  reconcilePlannerHandoffTasks,
  resolveAssetComment,
  updatePlannerSlot,
} from "../data/project-store";
import { bundleTasks, taskAuthor, taskInScope, taskTarget, type TaskMeta } from "./task-lens";

const ROSTER = ["Priya", "Marco", "Lena", "Sam"];

describe("comment → task → bundle", () => {
  it("stamps createdBy from the comment author and bundles same-day notes", () => {
    const project = getProjectSnapshot();
    const assetId = project.assets[0]!.id;
    const before = getProjectSnapshot().tasks.length;

    addAssetComment(assetId, { author: "Marco", text: "headline could be more legible @Lena", x: 0.4, y: 0.5 });
    addAssetComment(assetId, { author: "Marco", text: "lift the contrast a touch @Lena", x: 0.6, y: 0.5 });

    const tasks = getProjectSnapshot().tasks;
    const spawned = tasks.filter((task) => task.sourceCommentId != null && task.createdBy === "Marco");
    expect(tasks.length).toBe(before + 2);
    expect(spawned.length).toBeGreaterThanOrEqual(2);

    const project2 = getProjectSnapshot();
    const meta = new Map<string, TaskMeta>(
      project2.tasks.map((task) => [
        task.id,
        { author: taskAuthor(task, project2), target: taskTarget(task, ROSTER) },
      ]),
    );

    // Both notes resolve to Marco → Lena.
    for (const task of spawned) {
      expect(meta.get(task.id)).toEqual({ author: "Marco", target: "Lena" });
    }

    // They bundle into one card.
    const board = bundleTasks(spawned, (id) => meta.get(id));
    expect(board.filter((item) => item.kind === "bundle")).toHaveLength(1);

    // Scope semantics: visible to author (Marco) and addressee (Lena), not others.
    const sample = spawned[0]!;
    expect(taskInScope(sample, "Marco", meta.get(sample.id)!)).toBe(true);
    expect(taskInScope(sample, "Lena", meta.get(sample.id)!)).toBe(true);
    expect(taskInScope(sample, "Priya", meta.get(sample.id)!)).toBe(false);
  });

  it("keeps comment.resolved and the task's done status in lockstep", () => {
    const project = getProjectSnapshot();
    const assetId = project.assets[0]!.id;
    addAssetComment(assetId, { author: "Marco", text: "swap the crop @Lena", x: 0.3, y: 0.3 });
    const task = getProjectSnapshot()
      .tasks.slice()
      .reverse()
      .find((entry) => entry.sourceCommentId != null && entry.title.includes("swap the crop"))!;
    const commentId = task.sourceCommentId!;
    const comment = () =>
      getProjectSnapshot()
        .assets.find((asset) => asset.id === assetId)!
        .comments.find((entry) => entry.id === commentId)!;
    const taskStatus = () =>
      getProjectSnapshot().tasks.find((entry) => entry.id === task.id)!.status;

    // Task → comment: crossing the done boundary resolves the note…
    moveTask(task.id, "done");
    expect(comment().resolved).toBe(true);
    // …and reopening un-resolves it.
    moveTask(task.id, "todo");
    expect(comment().resolved).toBe(false);

    // Comment → task: resolving in the viewer closes the board card…
    resolveAssetComment(assetId, commentId);
    expect(comment().resolved).toBe(true);
    expect(taskStatus()).toBe("done");
    // …and toggling it open pulls the card back to To do.
    resolveAssetComment(assetId, commentId);
    expect(comment().resolved).toBe(false);
    expect(taskStatus()).toBe("todo");
  });
});

describe("planner handoff → task", () => {
  const slotOf = (id: string) =>
    getProjectSnapshot().planner.storySlots.find((slot) => slot.id === id);
  const handoffOf = (slotId: string) =>
    getProjectSnapshot().tasks.find((task) => task.id === `task-handoff-${slotId}`);

  it("assigning a post materializes ONE task, reassigns in place, withdraws on unassign", () => {
    addPlannerSlot("story", { label: "Launch teaser" });
    const slotId = getProjectSnapshot().planner.storySlots.at(-1)!.id;

    // Assign → a real task lands on Priya's board, jumpable to the post.
    updatePlannerSlot("story", slotId, { assignedTo: "Priya" });
    const task = handoffOf(slotId)!;
    expect(task.assignee).toBe("Priya");
    expect(task.status).toBe("todo");
    expect(task.sourceRef).toBe(`planner:story:${slotId}`);
    expect(task.title.startsWith("Review ")).toBe(true);

    // Reassign → same card (deterministic id), new person. No duplicates.
    updatePlannerSlot("story", slotId, { assignedTo: "Marco" });
    expect(handoffOf(slotId)!.assignee).toBe("Marco");
    expect(
      getProjectSnapshot().tasks.filter((entry) => entry.sourceRef === `planner:story:${slotId}`),
    ).toHaveLength(1);

    // Approve while assigned → the verb flips to Post (publish handoff).
    updatePlannerSlot("story", slotId, { status: "approve" });
    expect(handoffOf(slotId)!.title.startsWith("Post ")).toBe(true);

    // Unassign → the open task is withdrawn (the board mirrors live handoffs).
    updatePlannerSlot("story", slotId, { assignedTo: null });
    expect(handoffOf(slotId)).toBeUndefined();
  });

  it("checking the handoff task done clears the assignment; go-live completes it", () => {
    addPlannerSlot("story", { label: "Drop day" });
    const slotId = getProjectSnapshot().planner.storySlots.at(-1)!.id;
    updatePlannerSlot("story", slotId, { assignedTo: "Lena" });

    // Task board: done ⇒ the post is no longer Lena's.
    moveTask(`task-handoff-${slotId}`, "done");
    expect(slotOf(slotId)!.assignedTo).toBeNull();
    expect(handoffOf(slotId)!.status).toBe("done");

    // Re-assign, then Go live: approve + unassign, task completes as history.
    updatePlannerSlot("story", slotId, { assignedTo: "Lena", status: "approve" });
    completePlannerHandoff("story", slotId);
    expect(slotOf(slotId)!.assignedTo).toBeNull();
    expect(slotOf(slotId)!.status).toBe("approve");
    expect(handoffOf(slotId)!.status).toBe("done");
  });

  it("backfills tasks for posts assigned before the handoff logic existed", () => {
    addPlannerSlot("story", { label: "Legacy assigned" });
    const slotId = getProjectSnapshot().planner.storySlots.at(-1)!.id;
    updatePlannerSlot("story", slotId, { assignedTo: "Priya" });
    // Simulate a pre-logic client: the assignment exists but its task is gone.
    const snapshotTasks = getProjectSnapshot().tasks.filter(
      (task) => task.id !== `task-handoff-${slotId}`,
    );
    getProjectSnapshot().tasks.length = 0;
    getProjectSnapshot().tasks.push(...snapshotTasks);

    reconcilePlannerHandoffTasks();
    expect(handoffOf(slotId)?.assignee).toBe("Priya");
  });

  it("records the workflow in the slot's activity trail", () => {
    addPlannerSlot("story", { label: "Audited" });
    const slotId = getProjectSnapshot().planner.storySlots.at(-1)!.id;
    updatePlannerSlot("story", slotId, { assignedTo: "Marco" });
    updatePlannerSlot("story", slotId, { status: "review" });
    const trail = slotOf(slotId)!.activity ?? [];
    expect(trail.some((event) => event.kind === "assign" && event.to === "Marco")).toBe(true);
    expect(
      trail.some((event) => event.kind === "status" && event.from === "draft" && event.to === "review"),
    ).toBe(true);
  });
});
