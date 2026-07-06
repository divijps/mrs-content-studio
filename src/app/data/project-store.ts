/**
 * Project store: single source of truth for all four surfaces.
 *
 * Starts in demo mode (in-memory fixture). When the user connects the shared
 * Drive folder, a FileSystemBackend takes over persistence (Phase 2). All
 * mutations go through store actions so persistence stays centralized.
 */

import * as React from "react";

import { createDemoProject } from "./demo-project";
import type {
  Asset,
  BrandLink,
  Comp,
  CopyDeck,
  CopyFolder,
  JournalComment,
  JournalEntry,
  PinnedComment,
  PlannerGridSlot,
  ProjectSnapshot,
  QueueItem,
  ReviewStatus,
  Task,
  TaskStatus,
} from "./types";

type Listener = () => void;

/**
 * Persistence backend (Supabase when configured). Store actions apply locally
 * first (optimistic), then notify the backend fire-and-forget.
 */
export interface ProjectBackend {
  addComment(assetId: string, comment: PinnedComment): void;
  clearQueue(): void;
  deleteAssets(assetIds: string[]): void;
  deleteCollection?(collectionId: string): void;
  deleteComp?(compId: string): void;
  deleteCopyFolder?(folderId: string): void;
  deleteJournalEntry?(entryId: string): void;
  deleteLink?(linkId: string): void;
  deleteTask?(taskId: string): void;
  removeQueueItem(queueItemId: string): void;
  savePlanner(planner: ProjectSnapshot["planner"]): void;
  updateAsset(assetId: string, patch: Partial<Asset>): void;
  updateComment(
    assetId: string,
    commentId: string,
    patch: Partial<PinnedComment>,
  ): void;
  upsertCollection(collection: ProjectSnapshot["collections"][number]): void;
  upsertComp(comp: Comp): void;
  upsertCopyFolder?(folder: CopyFolder): void;
  upsertDeck(deck: CopyDeck): void;
  upsertJournalEntry?(entry: JournalEntry): void;
  upsertLink?(link: BrandLink): void;
  upsertQueueItem(item: QueueItem): void;
  upsertTask?(task: Task): void;
}

let backend: ProjectBackend | null = null;

export function registerBackend(next: ProjectBackend | null): void {
  backend = next;
}

let snapshot: ProjectSnapshot = createDemoProject();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function update(mutator: (draft: ProjectSnapshot) => ProjectSnapshot): void {
  snapshot = mutator(snapshot);
  emit();
  // Folder persistence hook (Phase 2): write dirty entities via the backend.
}

export function getProjectSnapshot(): ProjectSnapshot {
  return snapshot;
}

/** Replace synced entity sets from the backend (login hydrate + realtime refetch). */
export function hydrateSnapshot(
  partial: Partial<
    Pick<
      ProjectSnapshot,
      | "assets"
      | "collections"
      | "comps"
      | "copyFolders"
      | "decks"
      | "journal"
      | "links"
      | "planner"
      | "queue"
      | "tasks"
    >
  > & { folderName?: string | null; source?: ProjectSnapshot["source"] },
): void {
  update((draft) => ({ ...draft, ...partial }));
}

export function subscribeToProject(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProject(): ProjectSnapshot {
  return React.useSyncExternalStore(subscribeToProject, getProjectSnapshot);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** ---- Settings --------------------------------------------------------- */

const DISPLAY_NAME_KEY = "mrs-studio.display-name";

export function loadDisplayName(): string | null {
  try {
    return window.localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

export function setDisplayName(name: string): void {
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // Private mode: keep in memory only.
  }
  update((draft) => ({ ...draft, settings: { ...draft.settings, displayName: name } }));
}

export function initializeSettings(): void {
  const stored = loadDisplayName();
  if (stored && snapshot.settings.displayName !== stored) {
    update((draft) => ({ ...draft, settings: { ...draft.settings, displayName: stored } }));
  }
}

/** ---- Assets ----------------------------------------------------------- */

export function setBrand(brand: ProjectSnapshot["brand"]): void {
  update((draft) => ({ ...draft, brand }));
}

export function updateAsset(assetId: string, patch: Partial<Asset>): void {
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...patch, updatedAt: nowIso() } : asset,
    ),
  }));
  backend?.updateAsset(assetId, patch);
}

export function setAssetStatus(assetId: string, status: ReviewStatus): void {
  updateAsset(assetId, { status });
}

/** Append newly imported assets to the library. */
export function addAssets(assets: Asset[]): void {
  if (assets.length === 0) {
    return;
  }
  update((draft) => ({ ...draft, assets: [...assets, ...draft.assets] }));
}

export function toggleAssetFavorite(assetId: string): void {
  const next = !snapshot.assets.find((asset) => asset.id === assetId)?.favorite;
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId
        ? { ...asset, favorite: next, updatedAt: nowIso() }
        : asset,
    ),
  }));
  backend?.updateAsset(assetId, { favorite: next });
}

export function setAssetTags(assetId: string, tags: string[]): void {
  updateAsset(assetId, { tags });
}

export function setAssetCollection(assetId: string, collectionId: string | null): void {
  updateAsset(assetId, { collectionId });
}

export function setAssetFocalPoint(assetId: string, x: number, y: number): void {
  updateAsset(assetId, { focalPoint: { x, y } });
}

/** ---- Bulk asset operations (single emit each) --------------------------- */

export function deleteAssets(assetIds: string[]): void {
  const ids = new Set(assetIds);
  update((draft) => ({
    ...draft,
    assets: draft.assets.filter((asset) => !ids.has(asset.id)),
    planner: {
      gridSlots: draft.planner.gridSlots.filter(
        (slot) => !(slot.assetId && ids.has(slot.assetId)),
      ),
      storySlots: draft.planner.storySlots.filter(
        (slot) => !(slot.assetId && ids.has(slot.assetId)),
      ),
    },
  }));
  backend?.deleteAssets(assetIds);
  backend?.savePlanner(snapshot.planner);
}

function bulkPatch(assetIds: string[], patch: (asset: Asset) => Partial<Asset>): void {
  const ids = new Set(assetIds);
  const patches = snapshot.assets
    .filter((asset) => ids.has(asset.id))
    .map((asset) => [asset.id, patch(asset)] as const);
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      ids.has(asset.id) ? { ...asset, ...patch(asset), updatedAt: nowIso() } : asset,
    ),
  }));
  for (const [assetId, assetPatch] of patches) {
    backend?.updateAsset(assetId, assetPatch);
  }
}

export function bulkSetAssetStatus(assetIds: string[], status: ReviewStatus): void {
  bulkPatch(assetIds, () => ({ status }));
}

export function bulkSetAssetCollection(
  assetIds: string[],
  collectionId: string | null,
): void {
  bulkPatch(assetIds, () => ({ collectionId }));
}

export function bulkAddAssetTag(assetIds: string[], tag: string): void {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return;
  bulkPatch(assetIds, (asset) => ({
    tags: asset.tags.includes(normalized) ? asset.tags : [...asset.tags, normalized],
  }));
}

export function bulkSetAssetFavorite(assetIds: string[], favorite: boolean): void {
  bulkPatch(assetIds, () => ({ favorite }));
}

/** ---- Cross-surface intents ---------------------------------------------- */

/**
 * "Use in Studio": the Library requests an image; the Studio renderer consumes
 * it on next mount. Transient by design — never persisted.
 */
let pendingStudioImageId: string | null = null;

export function requestStudioImage(assetId: string): void {
  pendingStudioImageId = assetId;
}

export function consumeStudioImage(): string | null {
  const pending = pendingStudioImageId;
  pendingStudioImageId = null;
  return pending;
}

/** Notification click: open this asset's viewer in the Library. */
let pendingLibraryAssetId: string | null = null;

/** Fired so an already-mounted Library reacts too (not just on mount). */
export const LIBRARY_ASSET_EVENT = "mrs:library-asset";

export function requestLibraryAsset(assetId: string): void {
  pendingLibraryAssetId = assetId;
  window.dispatchEvent(new Event(LIBRARY_ASSET_EVENT));
}

export function consumeLibraryAsset(): string | null {
  const pending = pendingLibraryAssetId;
  pendingLibraryAssetId = null;
  return pending;
}

/** Global search / cross-surface: focus the Library on a specific board. */
let pendingLibraryBoardId: string | null | undefined;

/** Fired when a board should become the active Library view. */
export const LIBRARY_BOARD_EVENT = "mrs:library-board";

export function requestLibraryBoard(boardId: string | null): void {
  pendingLibraryBoardId = boardId;
  window.dispatchEvent(new Event(LIBRARY_BOARD_EVENT));
}

export function consumeLibraryBoard(): string | null | undefined {
  const pending = pendingLibraryBoardId;
  pendingLibraryBoardId = undefined;
  return pending;
}

export function resolveAssetComment(assetId: string, commentId: string): void {
  const current = snapshot.assets
    .find((asset) => asset.id === assetId)
    ?.comments.find((comment) => comment.id === commentId);
  backend?.updateComment(assetId, commentId, { resolved: !current?.resolved });
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId
        ? {
            ...asset,
            comments: asset.comments.map((comment) =>
              comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment,
            ),
            updatedAt: nowIso(),
          }
        : asset,
    ),
  }));
}

/** ---- Collections ------------------------------------------------------- */

export function addCollection(name: string, parentId: string | null = null): string {
  const id = createId("col");
  const collection = { createdAt: nowIso(), id, name, parentId };
  update((draft) => ({
    ...draft,
    collections: [...draft.collections, collection],
  }));
  backend?.upsertCollection(collection);
  return id;
}

export function renameCollection(collectionId: string, name: string): void {
  update((draft) => ({
    ...draft,
    collections: draft.collections.map((collection) =>
      collection.id === collectionId ? { ...collection, name } : collection,
    ),
  }));
  const renamed = snapshot.collections.find((c) => c.id === collectionId);
  if (renamed) {
    backend?.upsertCollection(renamed);
  }
}

export function moveCollection(collectionId: string, parentId: string | null): void {
  // Guard against cycles: a board cannot become its own descendant.
  update((draft) => {
    if (parentId) {
      let cursor: string | null = parentId;
      while (cursor) {
        if (cursor === collectionId) {
          return draft;
        }
        cursor = draft.collections.find((c) => c.id === cursor)?.parentId ?? null;
      }
    }
    return {
      ...draft,
      collections: draft.collections.map((collection) =>
        collection.id === collectionId ? { ...collection, parentId } : collection,
      ),
    };
  });
  const moved = snapshot.collections.find((c) => c.id === collectionId);
  if (moved) {
    backend?.upsertCollection(moved);
  }
}

/** Delete a board: reparent its children to its parent, unfile its assets. */
export function deleteCollection(collectionId: string): void {
  update((draft) => {
    const target = draft.collections.find((c) => c.id === collectionId);
    const grandparent = target?.parentId ?? null;
    return {
      ...draft,
      assets: draft.assets.map((asset) =>
        asset.collectionId === collectionId ? { ...asset, collectionId: null } : asset,
      ),
      collections: draft.collections
        .filter((collection) => collection.id !== collectionId)
        .map((collection) =>
          collection.parentId === collectionId
            ? { ...collection, parentId: grandparent }
            : collection,
        ),
    };
  });
  backend?.deleteCollection?.(collectionId);
}

export function addAssetComment(
  assetId: string,
  comment: Omit<PinnedComment, "id" | "createdAt" | "resolved">,
): void {
  const full: PinnedComment = {
    ...comment,
    createdAt: nowIso(),
    id: createId("comment"),
    resolved: false,
  };
  update((draft) => ({
    ...draft,
    assets: draft.assets.map((asset) =>
      asset.id === assetId
        ? { ...asset, comments: [...asset.comments, full], updatedAt: nowIso() }
        : asset,
    ),
  }));
  backend?.addComment(assetId, full);
}

/** ---- Comps ------------------------------------------------------------ */

export function upsertComp(comp: Comp): void {
  const next = { ...comp, updatedAt: nowIso() };
  update((draft) => {
    const exists = draft.comps.some((candidate) => candidate.id === comp.id);
    return {
      ...draft,
      comps: exists
        ? draft.comps.map((candidate) => (candidate.id === comp.id ? next : candidate))
        : [...draft.comps, next],
    };
  });
  backend?.upsertComp(next);
}

/** ---- Artboards (the Studio's editable set of comps) -------------------- */

export function setActiveArtboard(compId: string | null): void {
  if (snapshot.activeArtboardId === compId) {
    return;
  }
  update((draft) => ({ ...draft, activeArtboardId: compId }));
}

export function deleteComp(compId: string): void {
  update((draft) => ({
    ...draft,
    activeArtboardId: draft.activeArtboardId === compId ? null : draft.activeArtboardId,
    comps: draft.comps.filter((comp) => comp.id !== compId),
    planner: {
      gridSlots: draft.planner.gridSlots.filter((slot) => slot.compId !== compId),
      storySlots: draft.planner.storySlots.filter((slot) => slot.compId !== compId),
    },
    queue: draft.queue.filter((item) => item.compId !== compId),
  }));
  backend?.deleteComp?.(compId);
}

export function setCompStatus(compId: string, status: ReviewStatus): void {
  update((draft) => ({
    ...draft,
    comps: draft.comps.map((comp) =>
      comp.id === compId ? { ...comp, status, updatedAt: nowIso() } : comp,
    ),
  }));
  const changed = snapshot.comps.find((comp) => comp.id === compId);
  if (changed) {
    backend?.upsertComp(changed);
  }
}

/** ---- Brand links ------------------------------------------------------- */

export function addLink(label: string, url: string): void {
  const link: BrandLink = { createdAt: nowIso(), id: createId("link"), label, url };
  update((draft) => ({ ...draft, links: [...draft.links, link] }));
  backend?.upsertLink?.(link);
}

export function updateLink(linkId: string, patch: Partial<BrandLink>): void {
  update((draft) => ({
    ...draft,
    links: draft.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)),
  }));
  const changed = snapshot.links.find((link) => link.id === linkId);
  if (changed) backend?.upsertLink?.(changed);
}

export function deleteLink(linkId: string): void {
  update((draft) => ({ ...draft, links: draft.links.filter((link) => link.id !== linkId) }));
  backend?.deleteLink?.(linkId);
}

/** ---- Copy library: folders --------------------------------------------- */

export function addCopyFolder(name: string, parentId: string | null = null): string {
  const folder: CopyFolder = {
    createdAt: nowIso(),
    id: createId("cfolder"),
    name,
    parentId,
  };
  update((draft) => ({ ...draft, copyFolders: [...draft.copyFolders, folder] }));
  backend?.upsertCopyFolder?.(folder);
  return folder.id;
}

export function renameCopyFolder(folderId: string, name: string): void {
  update((draft) => ({
    ...draft,
    copyFolders: draft.copyFolders.map((folder) =>
      folder.id === folderId ? { ...folder, name } : folder,
    ),
  }));
  const changed = snapshot.copyFolders.find((folder) => folder.id === folderId);
  if (changed) backend?.upsertCopyFolder?.(changed);
}

/**
 * Delete a folder: its sub-folders move up to its parent and its entries fall
 * back to unfiled (folderId null). Mirrors Library board deletion.
 */
export function deleteCopyFolder(folderId: string): void {
  const target = snapshot.copyFolders.find((folder) => folder.id === folderId);
  const grandparent = target?.parentId ?? null;
  const orphaned = snapshot.journal.filter((entry) => entry.folderId === folderId);
  const reparented = snapshot.copyFolders.filter((folder) => folder.parentId === folderId);
  update((draft) => ({
    ...draft,
    copyFolders: draft.copyFolders
      .filter((folder) => folder.id !== folderId)
      .map((folder) =>
        folder.parentId === folderId ? { ...folder, parentId: grandparent } : folder,
      ),
    journal: draft.journal.map((entry) =>
      entry.folderId === folderId ? { ...entry, folderId: null } : entry,
    ),
  }));
  backend?.deleteCopyFolder?.(folderId);
  for (const folder of reparented) {
    const next = snapshot.copyFolders.find((item) => item.id === folder.id);
    if (next) backend?.upsertCopyFolder?.(next);
  }
  for (const entry of orphaned) {
    const next = snapshot.journal.find((item) => item.id === entry.id);
    if (next) backend?.upsertJournalEntry?.(next);
  }
}

/** ---- Copy / journal ---------------------------------------------------- */

export function addJournalEntry(
  kind: JournalEntry["kind"],
  title: string,
  body: string,
  folderId: string | null = null,
): string {
  const now = nowIso();
  const entry: JournalEntry = {
    body,
    comments: [],
    createdAt: now,
    folderId,
    id: createId("note"),
    kind,
    tags: [],
    title,
    updatedAt: now,
  };
  update((draft) => ({ ...draft, journal: [entry, ...draft.journal] }));
  backend?.upsertJournalEntry?.(entry);
  return entry.id;
}

export function addJournalComment(entryId: string, text: string): void {
  const body = text.trim();
  if (!body) return;
  const comment: JournalComment = {
    author: snapshot.settings.displayName ?? "You",
    body,
    createdAt: nowIso(),
    id: createId("jc"),
  };
  update((draft) => ({
    ...draft,
    journal: draft.journal.map((entry) =>
      entry.id === entryId
        ? { ...entry, comments: [...entry.comments, comment] }
        : entry,
    ),
  }));
  const changed = snapshot.journal.find((entry) => entry.id === entryId);
  if (changed) backend?.upsertJournalEntry?.(changed);
}

export function deleteJournalComment(entryId: string, commentId: string): void {
  update((draft) => ({
    ...draft,
    journal: draft.journal.map((entry) =>
      entry.id === entryId
        ? { ...entry, comments: entry.comments.filter((c) => c.id !== commentId) }
        : entry,
    ),
  }));
  const changed = snapshot.journal.find((entry) => entry.id === entryId);
  if (changed) backend?.upsertJournalEntry?.(changed);
}

export function updateJournalEntry(entryId: string, patch: Partial<JournalEntry>): void {
  update((draft) => ({
    ...draft,
    journal: draft.journal.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch, updatedAt: nowIso() } : entry,
    ),
  }));
  const changed = snapshot.journal.find((entry) => entry.id === entryId);
  if (changed) backend?.upsertJournalEntry?.(changed);
}

export function deleteJournalEntry(entryId: string): void {
  update((draft) => ({
    ...draft,
    journal: draft.journal.filter((entry) => entry.id !== entryId),
  }));
  backend?.deleteJournalEntry?.(entryId);
}

/** ---- Tasks (Kanban) ---------------------------------------------------- */

export function addTask(title: string, status: TaskStatus, tags: string[] = []): string {
  const now = nowIso();
  const position =
    Math.max(0, ...snapshot.tasks.filter((t) => t.status === status).map((t) => t.position)) + 1;
  const task: Task = {
    assignee: null,
    createdAt: now,
    id: createId("task"),
    position,
    status,
    tags,
    title,
    updatedAt: now,
  };
  update((draft) => ({ ...draft, tasks: [...draft.tasks, task] }));
  backend?.upsertTask?.(task);
  return task.id;
}

export function updateTask(taskId: string, patch: Partial<Task>): void {
  update((draft) => ({
    ...draft,
    tasks: draft.tasks.map((task) =>
      task.id === taskId ? { ...task, ...patch, updatedAt: nowIso() } : task,
    ),
  }));
  const changed = snapshot.tasks.find((task) => task.id === taskId);
  if (changed) backend?.upsertTask?.(changed);
}

/** Move a task to a column, appended to the end of it. */
export function moveTask(taskId: string, status: TaskStatus): void {
  const position =
    Math.max(0, ...snapshot.tasks.filter((t) => t.status === status).map((t) => t.position)) + 1;
  updateTask(taskId, { position, status });
}

export function deleteTask(taskId: string): void {
  update((draft) => ({ ...draft, tasks: draft.tasks.filter((task) => task.id !== taskId) }));
  backend?.deleteTask?.(taskId);
}

/** ---- Planner ----------------------------------------------------------- */

function makeSlot(input: { assetId?: string | null; compId?: string | null; label?: string | null }): PlannerGridSlot {
  return {
    assetId: input.assetId ?? null,
    compId: input.compId ?? null,
    id: createId("slot"),
    label: input.label ?? null,
  };
}

export function addPlannerGridSlot(input: {
  assetId?: string | null;
  compId?: string | null;
  label?: string | null;
}): void {
  const slot = makeSlot(input);
  update((draft) => ({
    ...draft,
    planner: { ...draft.planner, gridSlots: [slot, ...draft.planner.gridSlots] },
  }));
  backend?.savePlanner(snapshot.planner);
}

export function addPlannerStorySlot(input: {
  assetId?: string | null;
  compId?: string | null;
  label?: string | null;
}): void {
  const slot = makeSlot(input);
  update((draft) => ({
    ...draft,
    planner: { ...draft.planner, storySlots: [...draft.planner.storySlots, slot] },
  }));
  backend?.savePlanner(snapshot.planner);
}

export function removePlannerSlot(kind: "grid" | "story", slotId: string): void {
  update((draft) => ({
    ...draft,
    planner: {
      ...draft.planner,
      gridSlots:
        kind === "grid"
          ? draft.planner.gridSlots.filter((slot) => slot.id !== slotId)
          : draft.planner.gridSlots,
      storySlots:
        kind === "story"
          ? draft.planner.storySlots.filter((slot) => slot.id !== slotId)
          : draft.planner.storySlots,
    },
  }));
  backend?.savePlanner(snapshot.planner);
}

export function reorderPlannerSlots(
  kind: "grid" | "story",
  fromId: string,
  toId: string,
): void {
  update((draft) => {
    const list = kind === "grid" ? draft.planner.gridSlots : draft.planner.storySlots;
    const fromIndex = list.findIndex((slot) => slot.id === fromId);
    const toIndex = list.findIndex((slot) => slot.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return draft;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    return {
      ...draft,
      planner: {
        ...draft.planner,
        gridSlots: kind === "grid" ? next : draft.planner.gridSlots,
        storySlots: kind === "story" ? next : draft.planner.storySlots,
      },
    };
  });
  backend?.savePlanner(snapshot.planner);
}

export function addPlannerPlaceholder(kind: "grid" | "story", label: string): void {
  if (kind === "grid") {
    addPlannerGridSlot({ label });
  } else {
    addPlannerStorySlot({ label });
  }
}

/** ---- Copy decks -------------------------------------------------------- */

export function addDeck(name: string, variants: string[]): CopyDeck {
  const deck: CopyDeck = { createdAt: nowIso(), id: createId("deck"), name, variants };
  update((draft) => ({ ...draft, decks: [...draft.decks, deck] }));
  backend?.upsertDeck(deck);
  return deck;
}

/** ---- Queue ------------------------------------------------------------- */

export function addToQueue(compId: string, formatIds: string[]): void {
  const item: QueueItem = { addedAt: nowIso(), compId, formatIds, id: createId("queue") };
  update((draft) => ({ ...draft, queue: [...draft.queue, item] }));
  backend?.upsertQueueItem(item);
}

export function removeFromQueue(queueItemId: string): void {
  update((draft) => ({
    ...draft,
    queue: draft.queue.filter((item) => item.id !== queueItemId),
  }));
  backend?.removeQueueItem(queueItemId);
}

/** Toggle a platform format on/off for a queued comp. */
export function toggleQueueItemFormat(queueItemId: string, formatId: string): void {
  update((draft) => ({
    ...draft,
    queue: draft.queue.map((item) => {
      if (item.id !== queueItemId) {
        return item;
      }
      const has = item.formatIds.includes(formatId);
      const formatIds = has
        ? item.formatIds.filter((id) => id !== formatId)
        : [...item.formatIds, formatId];
      // Never allow an empty selection — keep at least the toggled format.
      return { ...item, formatIds: formatIds.length > 0 ? formatIds : [formatId] };
    }),
  }));
  const changed = snapshot.queue.find((item) => item.id === queueItemId);
  if (changed) {
    backend?.upsertQueueItem(changed);
  }
}

export function clearQueue(): void {
  update((draft) => ({ ...draft, queue: [] }));
  backend?.clearQueue();
}
