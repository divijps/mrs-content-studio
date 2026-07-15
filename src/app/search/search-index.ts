/**
 * Build a flat, ranked-searchable index over the whole ProjectSnapshot — one
 * SearchDoc per entity across every array. Each doc carries a lowercased
 * haystack, filter facets, outbound FK refs (for "where is this used?"), and an
 * `open()` that focuses the entity via the existing `requestX + navigate` idiom.
 */

import {
  requestCopyEntry,
  requestCopySnippet,
  requestEmail,
  requestLibraryAsset,
  requestLibraryBoard,
  requestPlannerSlot,
  requestTask,
  setActiveArtboard,
} from "../data/project-store";
import type {
  Collection,
  PlannerChannel,
  PlannerGridSlot,
  ProjectSnapshot,
  ReviewStatus,
} from "../data/types";
import {
  PLANNER_CHANNEL_LABELS,
  REVIEW_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from "../data/types";
import { assetCode } from "../library/asset-code";
import type { EntityRef, SearchContext, SearchDoc } from "./types";

/** Board path ("July drop / BTS") by walking parentId. */
function boardPathName(byId: Map<string, Collection>, id: string | null): string {
  const names: string[] = [];
  let cursor = id;
  while (cursor) {
    const board = byId.get(cursor);
    if (!board) break;
    names.unshift(board.name);
    cursor = board.parentId;
  }
  return names.join(" / ");
}

function plain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Asset ids referenced by a flat StudioValues blob (handles dotted + camel keys). */
function assetRefsFromBlob(blob: Record<string, unknown> | undefined): string[] {
  if (!blob) return [];
  const ids: string[] = [];
  const single = blob["image.assetId"] ?? blob["imageAssetId"];
  if (typeof single === "string" && single) ids.push(single);
  const many = blob["image.assetIds"] ?? blob["imageAssetIds"];
  if (Array.isArray(many)) {
    for (const id of many) if (typeof id === "string" && id) ids.push(id);
  }
  return ids;
}

function assetRefs(ids: string[]): EntityRef[] {
  return [...new Set(ids.filter(Boolean))].map((id) => ({ kind: "asset", id }));
}

const lower = (parts: (string | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ").toLowerCase();

/** How many places reference an asset (artboards, planner posts, emails,
 * templates) — the "if I replace this, what changes?" count. Cheap enough to
 * call per asset-viewer render without building the whole index. */
export function assetUsageCount(project: ProjectSnapshot, assetId: string): number {
  let count = 0;
  for (const comp of project.comps) {
    const ids = new Set([
      ...comp.elements.flatMap((el) => (el.kind === "image" && el.assetId ? [el.assetId] : [])),
      ...assetRefsFromBlob(comp.sourceValues),
    ]);
    if (ids.has(assetId)) count += 1;
  }
  const allSlots = [
    ...project.planner.gridSlots,
    ...project.planner.storySlots,
    ...project.planner.pinSlots,
    ...project.planner.reelSlots,
    ...project.planner.tiktokSlots,
  ];
  for (const slot of allSlots) {
    if (slot.assetId === assetId || slot.frames.some((frame) => frame.assetId === assetId)) {
      count += 1;
    }
  }
  for (const email of project.emails) {
    if (email.sections.some((section) => assetRefsFromBlob(section.values).includes(assetId))) {
      count += 1;
    }
  }
  for (const template of project.templates) {
    if (assetRefsFromBlob(template.values).includes(assetId)) count += 1;
  }
  return count;
}

/** Build the full search index for the current project. */
export function buildSearchIndex(project: ProjectSnapshot, ctx: SearchContext): SearchDoc[] {
  const focus = (fn: () => void, to: string) => (): void => {
    ctx.close();
    fn();
    ctx.navigate({ to });
  };
  const boardsById = new Map(project.collections.map((c) => [c.id, c]));
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const compById = new Map(project.comps.map((c) => [c.id, c]));
  const docs: SearchDoc[] = [];

  // ---- Assets ----
  for (const asset of project.assets) {
    const path = boardPathName(boardsById, asset.collectionId);
    const versionRefs = assetRefs(
      asset.versions.map((v) => v.sourcedFromAssetId ?? "").filter(Boolean),
    );
    docs.push({
      kind: "asset",
      id: asset.id,
      title: asset.name,
      subtitle: `${asset.kind === "video" ? "Video" : "Photo"}${path ? ` · ${path}` : ""}`,
      keywords: lower([
        asset.name,
        asset.filename,
        assetCode(asset, project.collections),
        asset.tags.join(" "),
        REVIEW_STATUS_LABELS[asset.status],
        path,
        asset.comments.map((c) => c.text).join(" "),
      ]),
      facets: {
        status: asset.status,
        assignee: asset.assignedTo,
        author: asset.addedBy,
        tags: asset.tags,
        boardPath: path,
        mediaKind: asset.kind,
        favoritedBy: asset.favoritedBy,
        hasComments: asset.comments.length > 0,
      },
      thumbUrl: asset.thumbUrl,
      status: asset.status,
      createdAt: asset.createdAt,
      open: focus(() => requestLibraryAsset(asset.id), "/library"),
      refs: versionRefs.length ? versionRefs : undefined,
    });
  }

  // ---- Boards ----
  for (const board of project.collections) {
    const path = boardPathName(boardsById, board.id);
    docs.push({
      kind: "board",
      id: board.id,
      title: path || board.name,
      subtitle: "Board",
      keywords: lower([path, board.name]),
      facets: { boardPath: path },
      createdAt: board.createdAt,
      open: focus(() => requestLibraryBoard(board.id), "/library"),
    });
  }

  // ---- Artboards (comps) ----
  for (const comp of project.comps) {
    const refs = assetRefs([
      ...comp.elements.flatMap((el) => (el.kind === "image" && el.assetId ? [el.assetId] : [])),
      ...assetRefsFromBlob(comp.sourceValues),
    ]);
    docs.push({
      kind: "comp",
      id: comp.id,
      title: comp.name,
      subtitle: "Artboard",
      keywords: lower([comp.name, REVIEW_STATUS_LABELS[comp.status], comp.formats.join(" ")]),
      facets: {
        status: comp.status,
        format: comp.formats.join(" "),
        hasComments: comp.comments.length > 0,
      },
      status: comp.status,
      createdAt: comp.createdAt,
      open: focus(() => setActiveArtboard(comp.id), "/"),
      refs: refs.length ? refs : undefined,
    });
  }

  // ---- Tasks ----
  for (const task of project.tasks) {
    const refs: EntityRef[] = [];
    if (task.sourceRef) {
      const [kind, a] = task.sourceRef.split(":");
      if (kind === "asset" && a) refs.push({ kind: "asset", id: a });
      if (kind === "copy" && a) refs.push({ kind: "journal", id: a });
    }
    docs.push({
      kind: "task",
      id: task.id,
      title: task.title,
      subtitle: `Task · ${TASK_STATUS_LABELS[task.status]}${task.assignee ? ` · ${task.assignee}` : ""}`,
      keywords: lower([
        task.title,
        task.description,
        task.tags.join(" "),
        task.assignee,
        task.sourceLabel,
        (task.subtasks ?? []).map((s) => s.title).join(" "),
        TASK_STATUS_LABELS[task.status],
      ]),
      facets: { status: task.status, assignee: task.assignee, tags: task.tags },
      createdAt: task.createdAt,
      open: focus(() => requestTask(task.id), "/tasks"),
      refs: refs.length ? refs : undefined,
    });
  }

  // ---- Copy & journal entries ----
  for (const entry of project.journal) {
    docs.push({
      kind: "journal",
      id: entry.id,
      title: entry.title || truncate(plain(entry.body)),
      subtitle: entry.kind === "copy" ? "Copy" : "Journal",
      keywords: lower([entry.title, plain(entry.body), entry.tags.join(" "), entry.kind]),
      facets: { tags: entry.tags, hasComments: entry.comments.length > 0 },
      createdAt: entry.createdAt,
      open: focus(() => requestCopyEntry(entry.id), "/copy"),
    });
  }

  // ---- Copy snippets ----
  for (const snippet of project.copySnippets) {
    docs.push({
      kind: "snippet",
      id: snippet.id,
      title: truncate(snippet.text),
      subtitle: `Copy snippet · ${snippet.role}`,
      keywords: lower([snippet.text, snippet.role, snippet.tags.join(" ")]),
      facets: { tags: snippet.tags, author: snippet.createdBy },
      createdAt: snippet.createdAt,
      open: focus(() => requestCopySnippet(snippet.id), "/copy"),
    });
  }

  // ---- Copy decks ----
  for (const deck of project.decks) {
    docs.push({
      kind: "deck",
      id: deck.id,
      title: deck.name,
      subtitle: `Copy deck · ${deck.variants.length} lines`,
      keywords: lower([deck.name, deck.variants.join(" ")]),
      facets: {},
      createdAt: deck.createdAt,
      open: focus(() => undefined, "/copy"),
    });
  }

  // ---- Templates ----
  for (const template of project.templates) {
    docs.push({
      kind: "template",
      id: template.id,
      title: template.name,
      subtitle: "Studio template",
      keywords: lower([template.name, template.formatId, template.createdBy]),
      facets: { author: template.createdBy, format: template.formatId },
      createdAt: template.createdAt,
      open: focus(() => undefined, "/"),
      refs: assetRefs(assetRefsFromBlob(template.values)).length
        ? assetRefs(assetRefsFromBlob(template.values))
        : undefined,
    });
  }

  // ---- Emails ----
  for (const email of project.emails) {
    const refs = assetRefs(email.sections.flatMap((s) => assetRefsFromBlob(s.values)));
    docs.push({
      kind: "email",
      id: email.id,
      title: email.name,
      subtitle: `Email · ${email.sections.length} sections`,
      keywords: lower([email.name, email.sections.map((s) => `${s.type} ${s.alt}`).join(" ")]),
      facets: {},
      createdAt: email.createdAt,
      open: focus(() => requestEmail(email.id), "/email"),
      refs: refs.length ? refs : undefined,
    });
  }

  // ---- Brand links ----
  for (const link of project.links) {
    docs.push({
      kind: "link",
      id: link.id,
      title: link.label,
      subtitle: link.url,
      keywords: lower([link.label, link.url]),
      facets: {},
      createdAt: link.createdAt,
      open: focus(() => undefined, "/brand"),
    });
  }

  // ---- Planner posts (all five channels) ----
  const channels: [PlannerChannel, PlannerGridSlot[]][] = [
    ["grid", project.planner.gridSlots],
    ["story", project.planner.storySlots],
    ["pinterest", project.planner.pinSlots],
    ["reel", project.planner.reelSlots],
    ["tiktok", project.planner.tiktokSlots],
  ];
  for (const [channel, slots] of channels) {
    for (const slot of slots) {
      const asset = slot.assetId ? assetById.get(slot.assetId) : undefined;
      const comp = slot.compId ? compById.get(slot.compId) : undefined;
      const name = slot.label || asset?.name || comp?.name || "Planned post";
      const refs: EntityRef[] = [];
      for (const id of [slot.assetId, ...slot.frames.map((f) => f.assetId)]) {
        if (id) refs.push({ kind: "asset", id });
      }
      for (const id of [slot.compId, ...slot.frames.map((f) => f.compId)]) {
        if (id) refs.push({ kind: "comp", id });
      }
      docs.push({
        kind: "planner",
        id: slot.id,
        title: name,
        subtitle: `${PLANNER_CHANNEL_LABELS[channel]}${slot.scheduledDate ? ` · ${slot.scheduledDate}` : ""}`,
        keywords: lower([
          slot.label,
          asset?.name,
          comp?.name,
          PLANNER_CHANNEL_LABELS[channel],
          REVIEW_STATUS_LABELS[slot.status],
          slot.assignedTo,
          slot.owner,
        ]),
        facets: {
          status: slot.status,
          assignee: slot.assignedTo,
          owner: slot.owner,
          channel,
          scheduledDate: slot.scheduledDate,
          hasComments: slot.comments.length > 0,
          mediaKind: asset?.kind,
        },
        thumbUrl: asset?.thumbUrl,
        status: slot.status as ReviewStatus,
        open: focus(() => requestPlannerSlot(channel, slot.id), "/planner"),
        refs: refs.length ? refs : undefined,
      });
    }
  }

  return docs;
}
