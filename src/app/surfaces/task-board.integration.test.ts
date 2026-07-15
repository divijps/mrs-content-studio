/**
 * End-to-end data flow: a real comment (via the store) spawns a comment-task
 * stamped with the author, and two same-day author→target notes bundle on the
 * board. Guards the spawn→scope→bundle pipeline the Tasks screen composes.
 */
import { describe, expect, it } from "vitest";

import {
  addAssetComment,
  getProjectSnapshot,
  moveTask,
  resolveAssetComment,
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
